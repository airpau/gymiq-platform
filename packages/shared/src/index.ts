// Shared types and constants used across apps and packages

export type MemberStatus = 'active' | 'frozen' | 'cancelled' | 'sleeper';
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost' | 'nurturing';
export type LeadSource = 'abandoned_cart' | 'web_form' | 'walk_in' | 'call' | 'referral';
export type ConversationChannel = 'whatsapp' | 'sms' | 'voice';
export type ConversationStatus = 'active' | 'closed' | 'waiting_human';
export type MessageDirection = 'inbound' | 'outbound';
export type WorkflowType = 'lead_followup' | 'retention' | 'payment_recovery' | 'win_back';
export type CrmTier = 'A' | 'B' | 'C';

export type MessageIntent =
  | 'book_class'
  | 'check_hours'
  | 'pricing_inquiry'
  | 'freeze_membership'
  | 'cancel_membership'
  | 'complaint'
  | 'general_question'
  | 'greeting'
  | 'unknown';

export interface GymKnowledgeBase {
  gym_name: string;
  location?: string;
  hours?: {
    monday_friday?: string;
    saturday?: string;
    sunday?: string;
    [key: string]: string | undefined;
  };
  pricing?: {
    monthly?: string;
    annual?: string;
    day_pass?: string;
    [key: string]: string | undefined;
  };
  amenities?: string[];
  classes?: string[];
  faq?: Array<{ question: string; answer: string }>;
  booking_link?: string;
}

export interface TwilioWebhookBody {
  MessageSid: string;
  SmsSid?: string;
  AccountSid: string;
  MessagingServiceSid?: string;
  From: string;
  To: string;
  Body: string;
  NumMedia?: string;
  NumSegments?: string;
  SmsStatus?: string;
  ApiVersion?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    page?: number;
    perPage?: number;
    total?: number;
  };
}
