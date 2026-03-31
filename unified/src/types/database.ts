/**
 * Database types matching the Supabase schema.
 * These mirror the tables created in migrations.
 */

export type UserRole = 'SUPER_ADMIN' | 'GYM_OWNER' | 'GYM_STAFF'

export interface Gym {
  id: string
  name: string
  slug: string
  email: string | null
  phone: string | null
  address: string | null
  timezone: string
  connector_type: string | null
  connector_config: Record<string, unknown> | null
  knowledge_base: Record<string, unknown> | null
  settings: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  email: string
  name: string | null
  role: UserRole
  gym_id: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type MemberStatus = 'active' | 'frozen' | 'cancelled' | 'sleeper' | 'past_due'

export interface Member {
  id: string
  gym_id: string
  external_id: string | null
  name: string
  email: string | null
  phone: string | null
  status: MemberStatus
  membership_type: string | null
  join_date: string | null
  last_visit: string | null
  visit_count_30d: number
  next_payment: string | null
  monthly_amount: number | null
  risk_score: number
  risk_factors: string[]
  tags: string[]
  notes: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

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

export interface Lead {
  id: string
  gym_id: string
  name: string
  email: string | null
  phone: string | null
  source: string | null
  current_stage: LeadStage
  score: number
  contact_attempts: number
  last_contact_at: string | null
  last_contact_channel: string | null
  converted_at: string | null
  notes: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface LeadJourney {
  id: string
  lead_id: string
  stage: string
  from_stage: string | null
  channel: string | null
  action: string
  message: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export type ConversationType = 'whatsapp' | 'sms' | 'email' | 'voice' | 'webchat'
export type ConversationStatus = 'active' | 'resolved' | 'escalated' | 'archived'

export interface Conversation {
  id: string
  gym_id: string
  member_id: string | null
  lead_id: string | null
  type: ConversationType
  status: ConversationStatus
  subject: string | null
  external_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type MessageDirection = 'inbound' | 'outbound'

export interface Message {
  id: string
  conversation_id: string
  direction: MessageDirection
  content: string
  sender_type: string | null
  ai_model: string | null
  ai_cost: number | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export type CancelSaveOutcome = 'in_progress' | 'saved' | 'cancelled' | 'escalated'

export interface CancelSaveAttempt {
  id: string
  gym_id: string
  member_id: string
  conversation_id: string | null
  reason: string | null
  reason_category: string | null
  outcome: CancelSaveOutcome
  offer_made: string | null
  offer_accepted: boolean
  conversation_log: Record<string, unknown>[]
  ai_cost_total: number
  created_at: string
  updated_at: string
}

export type StaffTaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type StaffTaskStatus = 'pending' | 'in_progress' | 'completed' | 'dismissed'

export interface StaffTask {
  id: string
  gym_id: string
  assigned_to: string | null
  title: string
  description: string | null
  type: string
  priority: StaffTaskPriority
  status: StaffTaskStatus
  related_member_id: string | null
  related_lead_id: string | null
  due_at: string | null
  completed_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}
