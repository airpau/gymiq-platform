/**
 * CSV Parser for GloFox exports.
 *
 * Handles both member exports and lead/abandoned-cart exports.
 * Column names are normalised (lower-cased, spaces → underscores) so the
 * parser is robust to minor header variations between GloFox versions.
 */

// ─── Output types ─────────────────────────────────────────────────────────────

export interface ParsedMember {
  crmId?: string;
  name: string;
  email?: string;
  phone?: string;
  status?: string;
  membershipTier?: string;
  joinDate?: Date;
  lastVisit?: Date;
  visitCount30d?: number;
  lifetimeValue?: number;
  totalVisits?: number;
}

export interface ParsedLead {
  crmId?: string;
  name?: string;
  email?: string;
  phone?: string;
  source: string;
  enquiryDate?: Date;
}

export interface ParseError {
  row: number;
  reason: string;
  raw: Record<string, string>;
}

export interface MemberParseResult {
  members: ParsedMember[];
  errors: ParseError[];
}

export interface LeadParseResult {
  leads: ParsedLead[];
  errors: ParseError[];
}

// ─── Core CSV tokeniser ───────────────────────────────────────────────────────

/**
 * Split one line of CSV into tokens, respecting double-quoted fields.
 */
function tokenise(line: string, delimiter = ','): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote inside quoted field
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      tokens.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  tokens.push(current.trim());
  return tokens;
}

/**
 * Detect delimiter from the header line (comma or semicolon).
 */
function detectDelimiter(headerLine: string): ',' | ';' {
  const commas = (headerLine.match(/,/g) || []).length;
  const semis = (headerLine.match(/;/g) || []).length;
  return semis > commas ? ';' : ',';
}

/**
 * Normalise a header string → snake_case key.
 * "First Name" → "first_name", "Email Address" → "email_address"
 */
function normalise(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Parse CSV text into an array of row objects keyed by normalised header.
 */
export function parseCSV(csvText: string): Array<Record<string, string>> {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Skip empty leading lines
  while (lines.length && lines[0].trim() === '') lines.shift();

  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines[0]);
  const rawHeaders = tokenise(lines[0], delimiter);
  const headers = rawHeaders.map(normalise);

  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = tokenise(line, delimiter);
    const row: Record<string, string> = {};

    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? '').trim();
    });

    rows.push(row);
  }

  return rows;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const DATE_PATTERNS = [
  // ISO: 2024-01-31
  /^(\d{4})-(\d{2})-(\d{2})/,
  // UK: 31/01/2024 or 31-01-2024
  /^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/,
  // US: 01/31/2024
  /^(\d{2})\/(\d{2})\/(\d{4})$/,
];

export function parseDate(raw: string): Date | undefined {
  if (!raw || raw === '-' || raw.toLowerCase() === 'n/a') return undefined;

  // Strip time component for date extraction (e.g., "13/03/2026 05:45pm" → "13/03/2026")
  const dateOnly = raw.trim().split(/\s+/)[0];

  // Try native parse first (handles ISO and many locales)
  const native = new Date(raw);
  if (!isNaN(native.getTime())) return native;

  // Try UK format dd/mm/yyyy (with or without time stripped)
  const ukMatch = dateOnly.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ukMatch) {
    const d = new Date(`${ukMatch[3]}-${ukMatch[2].padStart(2, '0')}-${ukMatch[1].padStart(2, '0')}`);
    if (!isNaN(d.getTime())) return d;
  }

  return undefined;
}

// ─── Phone normalisation ──────────────────────────────────────────────────────

export function normalisePhone(raw: string): string | undefined {
  if (!raw) return undefined;
  // Strip everything except digits and leading +
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.length < 7) return undefined;
  // Convert UK 07xxx → +447xxx
  if (digits.startsWith('07') && digits.length === 11) {
    return `+44${digits.slice(1)}`;
  }
  return digits.startsWith('+') ? digits : `+${digits}`;
}

// ─── Status normalisation ─────────────────────────────────────────────────────

export function normaliseMemberStatus(raw: string): string {
  const s = (raw || '').toLowerCase().trim();
  if (s === 'active' || s === 'active member') return 'active';
  if (s === 'overdue') return 'overdue'; // NEW status - payment overdue, high churn risk
  if (s === 'paused' || s === 'frozen' || s === 'suspended' || s === 'on hold') return 'paused';
  if (s === 'cancelled' || s === 'canceled' || s === 'terminated') return 'cancelled';
  return s || 'active'; // Don't default unknown to "active" - return raw value or default to "active"
}

// ─── Membership tier normalisation ────────────────────────────────────────────

export function normaliseMembershipTier(raw: string): string {
  if (!raw) return '';

  const s = raw.toLowerCase().trim();

  // Energie Fitness Hoddesdon specific tiers
  if (s.includes('classic') || s === 'import classic' || s === '1. energie fitness classic' || s === 'i-classic - open ended') {
    return 'Classic';
  }
  if (s.includes('wow') || s === 'import wow' || s === '2. energie fitness wow' || s === 'i-wow - open ended') {
    return 'WOW';
  }
  if (s.includes('epic') || s === 'import epic' || s === '3. energie fitness epic' || s === 'i-epic - open ended') {
    return 'Epic';
  }

  // Student variants
  if (s.includes('student')) {
    if (s.includes('classic')) return 'Student Classic';
    if (s.includes('wow')) return 'Student WOW';
    if (s.includes('epic')) return 'Student Epic';
    return 'Student';
  }

  // Corporate variants
  if (s.includes('corporate') || s.includes('corp')) {
    return 'Corporate';
  }

  // Return original with proper case for the first letter
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

// ─── Member CSV parser ────────────────────────────────────────────────────────

/**
 * Column aliases — maps possible GloFox column names to canonical keys.
 */
const MEMBER_COL_ALIASES: Record<string, string> = {
  id: 'crm_id',
  member_id: 'crm_id',
  client_id: 'crm_id',
  first_name: 'first_name',
  last_name: 'last_name',
  full_name: 'full_name',
  name: 'full_name',
  email: 'email',
  email_address: 'email',
  phone: 'phone',
  mobile: 'phone',
  phone_number: 'phone',
  mobile_number: 'phone',
  membership: 'membership_tier',
  membership_type: 'membership_tier',
  membership_plan: 'membership_tier',
  membership_name: 'membership_tier', // GloFox uses "Membership Name" column
  plan: 'membership_tier',
  plan_name: 'plan_name', // Keep as metadata
  status: 'status',
  member_status: 'status',
  join_date: 'join_date',
  joined: 'join_date',
  start_date: 'join_date',
  commenced_at: 'join_date', // GloFox uses "Commenced at" for join date
  last_check_in: 'last_visit',
  last_check_in_date: 'last_visit',
  last_visit: 'last_visit',
  last_attendance: 'last_visit',
  local_last_visit_at_all_branches: 'last_visit', // GloFox specific column
  visits_30_days: 'visit_count_30d',
  visits_last_30_days: 'visit_count_30d',
  check_ins_30d: 'visit_count_30d',
  total_visits_30: 'visit_count_30d',
  total_visits: 'total_visits', // NOT visit_count_30d - it's lifetime total
  total_visits_all_time: 'total_visits', // GloFox specific column
  price_paid: 'price_paid', // For lifetime value calculation
  payment_type: 'payment_type',
  next_payment_at: 'next_payment_at',
  paused_from: 'paused_from',
  paused_to: 'paused_to',
};

function resolveCol(row: Record<string, string>, canonical: string): string {
  return row[canonical] ?? '';
}

function mapMemberRow(raw: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const alias = MEMBER_COL_ALIASES[key];
    if (alias) mapped[alias] = value;
    else mapped[key] = value; // keep unmapped cols as-is
  }
  return mapped;
}

/**
 * Parse GloFox member CSV into structured ParsedMember objects.
 */
export function parseMemberCSV(csvText: string): MemberParseResult {
  const rows = parseCSV(csvText);
  const members: ParsedMember[] = [];
  const errors: ParseError[] = [];

  rows.forEach((rawRow, idx) => {
    const row = mapMemberRow(rawRow);

    // Build full name
    const firstName = resolveCol(row, 'first_name');
    const lastName = resolveCol(row, 'last_name');
    const fullName = resolveCol(row, 'full_name') || `${firstName} ${lastName}`.trim();

    if (!fullName) {
      errors.push({ row: idx + 2, reason: 'Missing name', raw: rawRow });
      return;
    }

    const email = resolveCol(row, 'email').toLowerCase() || undefined;
    const phone = normalisePhone(resolveCol(row, 'phone'));
    const joinDate = parseDate(resolveCol(row, 'join_date'));
    const lastVisit = parseDate(resolveCol(row, 'last_visit'));

    const visitRaw = resolveCol(row, 'visit_count_30d');
    const visitCount30d = visitRaw ? parseInt(visitRaw, 10) : undefined;

    // Handle price_paid for lifetime value calculation
    const pricePaidRaw = resolveCol(row, 'price_paid');
    const pricePaid = pricePaidRaw ? parseFloat(pricePaidRaw.replace(/[£$,]/g, '')) : undefined;

    // Handle total visits (lifetime) - different from visit_count_30d
    const totalVisitsRaw = resolveCol(row, 'total_visits');
    const totalVisits = totalVisitsRaw ? parseInt(totalVisitsRaw, 10) : undefined;

    members.push({
      crmId: resolveCol(row, 'crm_id') || undefined,
      name: fullName,
      email: email || undefined,
      phone,
      status: normaliseMemberStatus(resolveCol(row, 'status')),
      membershipTier: normaliseMembershipTier(resolveCol(row, 'membership_tier')) || undefined,
      joinDate,
      lastVisit,
      visitCount30d: isNaN(visitCount30d as number) ? undefined : visitCount30d,
      lifetimeValue: isNaN(pricePaid as number) ? undefined : pricePaid,
      totalVisits: isNaN(totalVisits as number) ? undefined : totalVisits,
    });
  });

  return { members, errors };
}

// ─── Lead CSV parser ──────────────────────────────────────────────────────────

const LEAD_COL_ALIASES: Record<string, string> = {
  id: 'crm_id',
  lead_id: 'crm_id',
  prospect_id: 'crm_id',
  first_name: 'first_name',
  last_name: 'last_name',
  full_name: 'full_name',
  name: 'full_name',
  email: 'email',
  email_address: 'email',
  phone: 'phone',
  mobile: 'phone',
  phone_number: 'phone',
  source: 'source',
  lead_source: 'source',
  referral_source: 'source',
  date: 'enquiry_date',
  enquiry_date: 'enquiry_date',
  created_date: 'enquiry_date',
  created_at: 'enquiry_date',
  signup_date: 'enquiry_date',
};

function mapLeadRow(raw: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const alias = LEAD_COL_ALIASES[key];
    if (alias) mapped[alias] = value;
    else mapped[key] = value;
  }
  return mapped;
}

/**
 * Parse GloFox abandoned-cart / lead CSV into structured ParsedLead objects.
 */
export function parseLeadCSV(csvText: string, defaultSource = 'abandoned_cart'): LeadParseResult {
  const rows = parseCSV(csvText);
  const leads: ParsedLead[] = [];
  const errors: ParseError[] = [];

  rows.forEach((rawRow, idx) => {
    const row = mapLeadRow(rawRow);

    const firstName = resolveCol(row, 'first_name');
    const lastName = resolveCol(row, 'last_name');
    const fullName = resolveCol(row, 'full_name') || `${firstName} ${lastName}`.trim() || undefined;

    const email = resolveCol(row, 'email').toLowerCase() || undefined;
    const phone = normalisePhone(resolveCol(row, 'phone'));

    if (!email && !phone) {
      errors.push({ row: idx + 2, reason: 'No email or phone — cannot contact lead', raw: rawRow });
      return;
    }

    const rawSource = resolveCol(row, 'source').toLowerCase();
    let source = defaultSource;
    if (rawSource.includes('abandon') || rawSource.includes('cart')) source = 'abandoned_cart';
    else if (rawSource.includes('web') || rawSource.includes('form') || rawSource.includes('online')) source = 'web_form';
    else if (rawSource.includes('walk') || rawSource.includes('in_person')) source = 'walk_in';
    else if (rawSource.includes('call') || rawSource.includes('phone')) source = 'call';
    else if (rawSource.includes('refer')) source = 'referral';
    else if (rawSource) source = rawSource;

    leads.push({
      crmId: resolveCol(row, 'crm_id') || undefined,
      name: fullName,
      email: email || undefined,
      phone,
      source,
      enquiryDate: parseDate(resolveCol(row, 'enquiry_date')),
    });
  });

  return { leads, errors };
}

// ─── Risk scoring helper (used during member import) ─────────────────────────

/**
 * Calculate an initial churn risk score from visit cadence alone.
 * A full Claude Sonnet analysis can be run later via the /analyze-risk endpoint.
 */
export function calculateInitialRiskScore(lastVisit: Date | undefined, visitCount30d = 0): number {
  if (!lastVisit) return 60; // No visit data = elevated risk

  const daysSince = Math.floor((Date.now() - lastVisit.getTime()) / 86_400_000);

  if (daysSince >= 60) return 85;
  if (daysSince >= 30) return 70;
  if (daysSince >= 14) return 50;
  if (daysSince >= 7) return 30;

  // Also consider recent visit frequency
  if (visitCount30d === 0) return Math.max(50, 30);
  if (visitCount30d <= 2) return 35;
  if (visitCount30d <= 6) return 20;
  return 10; // Very active
}
