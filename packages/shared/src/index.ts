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

// ─── Authentication Types ─────────────────────────────────────────────────

export type UserRole = 'SUPER_ADMIN' | 'GYM_OWNER' | 'GYM_STAFF';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  gymId: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Gym {
  id: string;
  name: string;
  slug: string;
  settings?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface AuthToken {
  token: string;
  expiresAt: Date;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  gymName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role: UserRole;
  };
  gym: {
    id: string;
    name: string;
    slug: string;
  };
  token: string;
}

export interface UserProfile {
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role: UserRole;
    phone?: string;
    lastLoginAt?: Date;
  };
  gym: {
    id: string;
    name: string;
    slug: string;
    settings?: Record<string, any>;
  };
  session: {
    id: string;
    expiresAt: Date;
  };
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface AuthError {
  success: false;
  error: string;
  code?: string;
}
