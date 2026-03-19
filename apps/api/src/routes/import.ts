/**
 * POST /import/csv
 *
 * Accepts GloFox (or any CRM) CSV exports and bulk-upserts members or leads.
 * All DB writes and workflow triggers are delegated to the DataPipeline from
 * @gymiq/connectors — this route now just parses the CSV and hands off.
 *
 * Request formats:
 *   Content-Type: text/csv
 *     Query params: type (members | leads | abandoned_cart)
 *
 *   Content-Type: application/json
 *     Body: { type, csvData }
 *
 * Response:
 *   { success: true, summary: { created, updated, skipped, errors, total, parseErrors? } }
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { followupQueue } from '../lib/queue';
import { parseMemberCSV, parseLeadCSV } from '../lib/csv-parser';
import { dataPipeline } from '@gymiq/connectors';
import type { NormalizedMember, NormalizedLead } from '@gymiq/connectors';
import { authenticate, requireGymAccess } from '../middleware/authentication';

export const importRouter = Router();

// Apply authentication to all routes
importRouter.use(authenticate);
importRouter.use(requireGymAccess);

// ─── Validation ───────────────────────────────────────────────────────────────

const ImportQuerySchema = z.object({
  type: z.enum(['members', 'leads', 'abandoned_cart']),
  sync: z.enum(['true', 'false']).optional().default('false'),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractCSV(req: Request): string | null {
  const contentType = (req.headers['content-type'] ?? '').toLowerCase();
  if (contentType.startsWith('text/csv') || contentType.startsWith('text/plain')) {
    return typeof req.body === 'string' ? req.body : null;
  }
  if (contentType.startsWith('application/json') && req.body?.csvData) {
    return String(req.body.csvData);
  }
  return null;
}

function extractParams(req: Request): { type?: string; sync?: string } {
  const contentType = (req.headers['content-type'] ?? '').toLowerCase();
  if (contentType.startsWith('application/json') && req.body) {
    return { type: req.body.type, sync: req.body.sync };
  }
  return { type: req.query.type as string, sync: req.query.sync as string };
}

// ─── POST /import/csv ─────────────────────────────────────────────────────────

importRouter.post('/csv', async (req: Request, res: Response) => {
  try {
    const raw = extractParams(req);
    const parsed = ImportQuerySchema.safeParse(raw);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid parameters',
        details: parsed.error.flatten(),
      });
    }

    const { type, sync } = parsed.data;
    const gymId = req.user!.gymId;
    const isSync = sync === 'true';

    const gym = await prisma.gym.findUnique({ where: { id: gymId } });
    if (!gym) return res.status(404).json({ success: false, error: 'Gym not found' });

    const csvText = extractCSV(req);
    if (!csvText || csvText.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'No CSV data provided. Send CSV as text/csv body or JSON { csvData, gymId, type }',
      });
    }

    // ── Parse CSV into normalised format ──────────────────────────────────────

    if (type === 'members') {
      const { members, errors: parseErrors } = parseMemberCSV(csvText);

      // Convert ParsedMember → NormalizedMember
      const normalised: NormalizedMember[] = members.map((m) => ({
        crmId: m.crmId,
        name: m.name,
        email: m.email,
        phone: m.phone,
        status: m.status,
        membershipTier: m.membershipTier,
        joinDate: m.joinDate,
        lastVisit: m.lastVisit,
        visitCount30d: m.visitCount30d,
      }));

      // Delegate all DB writes to DataPipeline
      const result = await dataPipeline.run(gymId, 'upload', normalised, []);

      // ── Sync mode: mark members NOT in this upload as 'removed' ──────────
      let removedCount = 0;
      if (isSync && normalised.length > 0) {
        // Build set of identifiers from the uploaded CSV
        const uploadedEmails = new Set(
          normalised.filter((m) => m.email).map((m) => m.email!.toLowerCase())
        );
        const uploadedCrmIds = new Set(
          normalised.filter((m) => m.crmId).map((m) => m.crmId!)
        );

        // Find all existing active members for this gym
        const existingMembers = await prisma.member.findMany({
          where: {
            gymId,
            status: { notIn: ['removed', 'cancelled'] },
          },
          select: { id: true, email: true, crmId: true, name: true },
        });

        // Members NOT in the upload are considered removed
        const toRemove = existingMembers.filter((m) => {
          // Match by crmId first, then email
          if (m.crmId && uploadedCrmIds.has(m.crmId)) return false;
          if (m.email && uploadedEmails.has(m.email.toLowerCase())) return false;
          return true;
        });

        if (toRemove.length > 0) {
          const removeIds = toRemove.map((m) => m.id);
          await prisma.member.updateMany({
            where: { id: { in: removeIds } },
            data: { status: 'removed', updatedAt: new Date() },
          });
          removedCount = toRemove.length;
          console.log(`[Import:Sync] Marked ${removedCount} members as removed for gym ${gymId}`);
        }
      }

      return res.status(200).json({
        success: true,
        summary: {
          ...result.members,
          removed: removedCount,
          syncMode: isSync,
          parseErrors,
        },
      });
    }

    if (type === 'leads' || type === 'abandoned_cart') {
      const defaultSource = type === 'abandoned_cart' ? 'abandoned_cart' : 'web_form';
      const { leads, errors: parseErrors } = parseLeadCSV(csvText, defaultSource);

      // Convert ParsedLead → NormalizedLead
      const normalised: NormalizedLead[] = leads.map((l) => ({
        crmId: l.crmId,
        name: l.name,
        email: l.email,
        phone: l.phone,
        source: l.source,
        enquiryDate: l.enquiryDate,
      }));

      // Delegate all DB writes + follow-up queuing to DataPipeline
      const result = await dataPipeline.run(gymId, 'upload', [], normalised);

      return res.status(200).json({
        success: true,
        summary: {
          ...result.leads,
          parseErrors,
        },
      });
    }

    return res.status(400).json({ success: false, error: 'Unrecognised import type' });
  } catch (error) {
    console.error('[Import] Unexpected error:', error);
    res.status(500).json({ success: false, error: 'Import failed' });
  }
});

// ─── GET /import/status ───────────────────────────────────────────────────────

importRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const [waiting, active, delayed, failed] = await Promise.all([
      followupQueue.getWaitingCount(),
      followupQueue.getActiveCount(),
      followupQueue.getDelayedCount(),
      followupQueue.getFailedCount(),
    ]);

    res.json({
      success: true,
      queue: 'lead-followup',
      counts: { waiting, active, delayed, failed },
    });
  } catch (error) {
    console.error('[Import] Status check error:', error);
    res.status(500).json({ success: false, error: 'Failed to get queue status' });
  }
});
