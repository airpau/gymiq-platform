/**
 * Lead Pipeline Service
 *
 * 9-stage state machine with enforced valid transitions.
 * Ported from Express/Prisma to Supabase.
 */

import { SupabaseClient } from '@supabase/supabase-js'

export type LeadStage =
  | 'new'
  | 'contacted'
  | 'engaged'
  | 'booked'
  | 'visited'
  | 'converting'
  | 'converted'
  | 'lost'
  | 'nurturing'

export type ActionType =
  | 'outreach'
  | 'response'
  | 'booking'
  | 'visit'
  | 'follow_up'
  | 'stage_change'
  | 'manual_update'

export type Channel =
  | 'whatsapp'
  | 'email'
  | 'sms'
  | 'call'
  | 'manual'
  | 'system'

interface StageTransitionData {
  leadId: string
  toStage: LeadStage
  channel?: Channel
  action: ActionType
  message?: string
  metadata?: Record<string, unknown>
  userId?: string
}

/** Valid stage transitions to prevent invalid state changes */
const VALID_TRANSITIONS: Record<LeadStage, LeadStage[]> = {
  new: ['contacted', 'lost', 'nurturing'],
  contacted: ['engaged', 'lost', 'nurturing', 'booked'],
  engaged: ['booked', 'converting', 'lost', 'nurturing'],
  booked: ['visited', 'lost', 'nurturing'],
  visited: ['converting', 'converted', 'lost', 'nurturing'],
  converting: ['converted', 'lost', 'nurturing'],
  converted: [], // Terminal state
  lost: ['nurturing'], // Can re-engage lost leads
  nurturing: ['contacted', 'engaged', 'booked', 'lost'], // Re-engagement
}

/** Stage descriptions for UI display */
export const STAGE_DESCRIPTIONS: Record<LeadStage, { title: string; description: string; color: string }> = {
  new: { title: 'New', description: 'Fresh lead, not yet contacted', color: '#3B82F6' },
  contacted: { title: 'Contacted', description: 'Initial outreach sent, awaiting response', color: '#8B5CF6' },
  engaged: { title: 'Engaged', description: 'Lead has responded, active conversation', color: '#F59E0B' },
  booked: { title: 'Booked', description: 'Visit/trial scheduled', color: '#10B981' },
  visited: { title: 'Visited', description: 'Attended visit/trial', color: '#06B6D4' },
  converting: { title: 'Converting', description: 'Showing strong interest, ready to join', color: '#8B5CF6' },
  converted: { title: 'Converted', description: 'Signed up and became member', color: '#10B981' },
  lost: { title: 'Lost', description: 'Uninterested or unresponsive', color: '#EF4444' },
  nurturing: { title: 'Nurturing', description: 'Long-term follow-up sequence', color: '#6B7280' },
}

function isValidTransition(from: LeadStage, to: LeadStage): boolean {
  if (from === to) return false
  return VALID_TRANSITIONS[from]?.includes(to) || false
}

export function getNextStages(currentStage: LeadStage): LeadStage[] {
  return VALID_TRANSITIONS[currentStage] || []
}

/**
 * Advance a lead to the next stage with full audit trail
 */
export async function advanceStage(
  supabase: SupabaseClient,
  data: StageTransitionData
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get current lead state
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('current_stage, gym_id')
      .eq('id', data.leadId)
      .single()

    if (fetchError || !lead) {
      return { success: false, error: 'Lead not found' }
    }

    const fromStage = lead.current_stage as LeadStage
    const toStage = data.toStage

    // Validate transition
    if (!isValidTransition(fromStage, toStage)) {
      return { success: false, error: `Invalid transition from ${fromStage} to ${toStage}` }
    }

    // Update lead stage
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        current_stage: toStage,
        last_contact_at: new Date().toISOString(),
        last_contact_channel: data.channel || null,
        ...(toStage === 'converted' ? { converted_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.leadId)

    if (updateError) {
      return { success: false, error: 'Failed to update lead' }
    }

    // Log the journey step
    const { error: journeyError } = await supabase
      .from('lead_journey')
      .insert({
        lead_id: data.leadId,
        stage: toStage,
        from_stage: fromStage,
        channel: data.channel || null,
        action: data.action,
        message: data.message || null,
        metadata: {
          userId: data.userId,
          timestamp: new Date().toISOString(),
          ...data.metadata,
        },
      })

    if (journeyError) {
      console.error('[Lead Pipeline] Failed to log journey:', journeyError)
    }

    console.log(`[Lead Pipeline] ${data.leadId}: ${fromStage} → ${toStage} via ${data.channel || 'system'}`)
    return { success: true }
  } catch (error) {
    console.error(`[Lead Pipeline] Failed to advance ${data.leadId}:`, error)
    return { success: false, error: 'Database error' }
  }
}

/**
 * Get pipeline stats for a gym (count per stage)
 */
export async function getPipelineStats(
  supabase: SupabaseClient,
  gymId: string
): Promise<Record<string, number>> {
  const { data: leads, error } = await supabase
    .from('leads')
    .select('current_stage')
    .eq('gym_id', gymId)

  if (error) {
    console.error('[Lead Pipeline] Stats error:', error)
    return {}
  }

  const result: Record<string, number> = {}
  Object.keys(STAGE_DESCRIPTIONS).forEach(stage => { result[stage] = 0 })

  for (const lead of leads || []) {
    result[lead.current_stage] = (result[lead.current_stage] || 0) + 1
  }

  return result
}

/**
 * Get leads by stage for Kanban view
 */
export async function getLeadsByStage(
  supabase: SupabaseClient,
  gymId: string,
  stage?: LeadStage
) {
  let query = supabase
    .from('leads')
    .select('id, name, email, phone, current_stage, score, source, last_contact_at, last_contact_channel, contact_attempts, created_at, updated_at')
    .eq('gym_id', gymId)
    .order('score', { ascending: false })

  if (stage) {
    query = query.eq('current_stage', stage)
  }

  const { data, error } = await query

  if (error) {
    console.error('[Lead Pipeline] Fetch error:', error)
    return []
  }

  return (data || []).map(lead => ({
    ...lead,
    stageInfo: STAGE_DESCRIPTIONS[lead.current_stage as LeadStage],
  }))
}

// ─── Quick stage advance helpers ─────────────────────────────────────────────

export async function markContacted(supabase: SupabaseClient, leadId: string, channel: Channel, message?: string, userId?: string) {
  return advanceStage(supabase, { leadId, toStage: 'contacted', channel, action: 'outreach', message, userId })
}

export async function markEngaged(supabase: SupabaseClient, leadId: string, channel: Channel, message?: string, userId?: string) {
  return advanceStage(supabase, { leadId, toStage: 'engaged', channel, action: 'response', message, userId })
}

export async function markBooked(supabase: SupabaseClient, leadId: string, channel: Channel = 'system', userId?: string) {
  return advanceStage(supabase, { leadId, toStage: 'booked', channel, action: 'booking', message: 'Visit scheduled', userId })
}

export async function markConverted(supabase: SupabaseClient, leadId: string, userId?: string) {
  return advanceStage(supabase, { leadId, toStage: 'converted', channel: 'system', action: 'stage_change', message: 'Lead converted to member', userId })
}

export async function markLost(supabase: SupabaseClient, leadId: string, reason: string, userId?: string) {
  return advanceStage(supabase, { leadId, toStage: 'lost', channel: 'manual', action: 'stage_change', message: `Marked as lost: ${reason}`, metadata: { lostReason: reason }, userId })
}
