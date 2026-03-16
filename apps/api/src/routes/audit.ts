/**
 * POST /audit/analyze
 *
 * Accepts CSV file upload and returns churn analysis WITHOUT storing any data.
 * This is used for the marketing website's free revenue audit feature.
 * All processing is done in-memory and no member data is persisted.
 *
 * Response includes:
 *   - Risk distribution breakdown
 *   - Revenue at risk calculations
 *   - Intervention opportunities
 *   - ROI projections
 */

import { Router, Request, Response } from 'express'
import multer from 'multer'
import { parseMemberCSV, calculateInitialRiskScore } from '../lib/csv-parser'

export const auditRouter = Router()

// ─── Multer Configuration ────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' ||
        file.originalname.match(/\.(csv|xlsx|xls)$/i)) {
      cb(null, true)
    } else {
      cb(new Error('Only CSV and Excel files are allowed'))
    }
  },
})

// ─── Analysis Types ──────────────────────────────────────────────────────────

interface AuditResult {
  totalMembers: number
  activeMembers: number
  riskDistribution: { low: number; medium: number; high: number }
  sleeperBreakdown: { light: number; deep: number; critical: number; doNotContact: number }
  revenueAtRisk: number
  avgMembershipFee: number
  interventionOpportunities: number
  potentialSavings: number
  monthlySubscriptionCost: number
  roi: number
  topRisks: Array<{
    category: string
    count: number
    revenue: number
    action: string
  }>
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function categorizeRisk(score: number): 'low' | 'medium' | 'high' {
  if (score >= 70) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

function categorizeSleeper(lastVisit: Date | undefined): 'light' | 'deep' | 'critical' | 'doNotContact' {
  if (!lastVisit) return 'doNotContact'

  const daysSince = Math.floor((Date.now() - lastVisit.getTime()) / 86_400_000)

  if (daysSince >= 60) return 'doNotContact'
  if (daysSince >= 45) return 'critical'
  if (daysSince >= 21) return 'deep'
  if (daysSince >= 14) return 'light'
  return 'light' // Active members don't count as sleepers, but for completeness
}

function estimateMembershipFee(members: any[]): number {
  // Try to extract fee from membership tier or estimate based on UK gym averages
  const fees: number[] = []

  members.forEach(member => {
    const tier = (member.membershipTier || '').toLowerCase()

    if (tier.includes('basic') || tier.includes('standard')) fees.push(25)
    else if (tier.includes('premium') || tier.includes('unlimited')) fees.push(45)
    else if (tier.includes('student')) fees.push(20)
    else fees.push(32) // UK average
  })

  return Math.round(fees.reduce((sum, fee) => sum + fee, 0) / fees.length)
}

// ─── POST /audit/analyze ─────────────────────────────────────────────────────

auditRouter.post('/analyze', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded. Please upload a CSV or Excel file.',
      })
    }

    // Convert buffer to string for CSV parsing
    const csvText = req.file.buffer.toString('utf-8')

    if (csvText.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'File appears to be empty or invalid.',
      })
    }

    // ── Parse CSV ──────────────────────────────────────────────────────────────

    const { members, errors } = parseMemberCSV(csvText)

    if (members.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid member records found in the uploaded file.',
        parseErrors: errors.slice(0, 5), // Show first 5 errors for debugging
      })
    }

    // ── Analyze Members ────────────────────────────────────────────────────────

    const activeMembers = members.filter(m => m.status === 'active' || !m.status)
    const avgMembershipFee = estimateMembershipFee(members)

    // Risk scoring
    const memberAnalysis = activeMembers.map(member => {
      const riskScore = calculateInitialRiskScore(member.lastVisit, member.visitCount30d)
      const riskCategory = categorizeRisk(riskScore)
      const sleeperCategory = categorizeSleeper(member.lastVisit)

      return {
        ...member,
        riskScore,
        riskCategory,
        sleeperCategory,
        monthlyRevenue: avgMembershipFee
      }
    })

    // ── Calculate Distributions ────────────────────────────────────────────────

    const riskDistribution = {
      low: memberAnalysis.filter(m => m.riskCategory === 'low').length,
      medium: memberAnalysis.filter(m => m.riskCategory === 'medium').length,
      high: memberAnalysis.filter(m => m.riskCategory === 'high').length,
    }

    const sleeperBreakdown = {
      light: memberAnalysis.filter(m => m.sleeperCategory === 'light').length,
      deep: memberAnalysis.filter(m => m.sleeperCategory === 'deep').length,
      critical: memberAnalysis.filter(m => m.sleeperCategory === 'critical').length,
      doNotContact: memberAnalysis.filter(m => m.sleeperCategory === 'doNotContact').length,
    }

    // ── Revenue Calculations ───────────────────────────────────────────────────

    const atRiskMembers = memberAnalysis.filter(m => m.riskCategory === 'medium' || m.riskCategory === 'high')
    const revenueAtRisk = atRiskMembers.length * avgMembershipFee

    const interventionOpportunities = sleeperBreakdown.light + sleeperBreakdown.deep + sleeperBreakdown.critical
    const potentialSavings = Math.round(revenueAtRisk * 0.7) // 70% save rate

    const monthlySubscriptionCost = 149 // GymIQ pricing
    const roi = potentialSavings > 0 ? Number((potentialSavings / monthlySubscriptionCost).toFixed(1)) : 0

    // ── Top Risk Categories ────────────────────────────────────────────────────

    const topRisks = [
      {
        category: 'Deep Sleepers (21-45 days)',
        count: sleeperBreakdown.deep,
        revenue: sleeperBreakdown.deep * avgMembershipFee,
        action: 'Critical window — act now or lose them'
      },
      {
        category: 'Light Sleepers (14-21 days)',
        count: sleeperBreakdown.light,
        revenue: sleeperBreakdown.light * avgMembershipFee,
        action: 'Easy wins with a friendly check-in'
      },
      {
        category: 'Critical (45-60 days)',
        count: sleeperBreakdown.critical,
        revenue: sleeperBreakdown.critical * avgMembershipFee,
        action: 'Last chance — needs personal outreach'
      },
    ].filter(risk => risk.count > 0)

    // ── Build Response ─────────────────────────────────────────────────────────

    const result: AuditResult = {
      totalMembers: members.length,
      activeMembers: activeMembers.length,
      riskDistribution,
      sleeperBreakdown,
      revenueAtRisk,
      avgMembershipFee,
      interventionOpportunities,
      potentialSavings,
      monthlySubscriptionCost,
      roi,
      topRisks,
    }

    res.status(200).json(result)

  } catch (error) {
    console.error('[Audit] Analysis error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to analyze membership data. Please ensure your file is a valid CSV with member information.'
    })
  }
})

// ─── GET /audit/status ───────────────────────────────────────────────────────

auditRouter.get('/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'audit-analyzer',
    status: 'operational',
    message: 'Ready to analyze membership data',
  })
})