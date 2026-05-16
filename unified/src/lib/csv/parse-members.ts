/**
 * Smart member-export parser.
 *
 * Independent gyms send us a wild range of file formats: Glofox-exported CSVs,
 * Mindbody Excel sheets, ClubRight TSVs, hand-edited spreadsheets, etc. The
 * column names vary wildly ("Last Visit Date" vs "Last_Check_In" vs "LastSeen").
 *
 * This parser:
 *   1. Detects the delimiter for CSV/TSV variants.
 *   2. Reads Excel files via SheetJS (xlsx) — picks the largest sheet.
 *   3. Maps a wide variety of column header spellings to canonical fields.
 *   4. Normalises dates (DD/MM/YYYY, MM/DD/YYYY, ISO, Excel serials).
 *   5. Returns rows that can be fed directly to scoreChurnRisk().
 */
import * as XLSX from 'xlsx'
import type { MemberInput } from '@/lib/services/churn-engine'

export interface ParsedMember extends MemberInput {
  externalId: string | null
  name: string | null
  email: string | null
  phone: string | null
  membershipType: string | null
  monthlyValue: number | null
}

export interface ParseSummary {
  rowsParsed: number
  rowsSkipped: number
  detectedColumns: Record<keyof ColumnMap, string | null>
  warnings: string[]
}

export interface ParseResult {
  members: ParsedMember[]
  summary: ParseSummary
}

interface ColumnMap {
  externalId: string | null
  firstName: string | null
  lastName: string | null
  fullName: string | null
  email: string | null
  phone: string | null
  status: string | null
  lastVisit: string | null
  visitCount30d: string | null
  nextPayment: string | null
  joinDate: string | null
  membershipType: string | null
  monthlyValue: string | null
}

const HEADER_PATTERNS: Record<keyof ColumnMap, RegExp[]> = {
  externalId: [/^(member[_\s-]?id|customer[_\s-]?id|client[_\s-]?id|id|ref)$/i],
  firstName: [/^(first[_\s-]?name|given[_\s-]?name|forename|firstname)$/i],
  lastName: [/^(last[_\s-]?name|surname|family[_\s-]?name|lastname)$/i],
  fullName: [/^(full[_\s-]?name|name|member[_\s-]?name|client[_\s-]?name|customer)$/i],
  email: [/^(e[-_\s]?mail|email[_\s-]?address|primary[_\s-]?email)$/i, /\bemail\b/i],
  phone: [/^(phone|mobile|cell|telephone|tel|contact[_\s-]?number)$/i, /\b(phone|mobile)\b/i],
  status: [
    /^(status|member[_\s-]?status|membership[_\s-]?status|state|active)$/i,
    /\b(status|active|cancelled)\b/i,
  ],
  lastVisit: [
    /^(last[_\s-]?visit|last[_\s-]?seen|last[_\s-]?check[_\s-]?in|last[_\s-]?attended|last[_\s-]?activity|most[_\s-]?recent[_\s-]?visit)$/i,
    /\b(last[_\s-]?visit|last[_\s-]?seen|last[_\s-]?attended)\b/i,
  ],
  visitCount30d: [
    /^(visits[_\s-]?30d?|visits[_\s-]?last[_\s-]?30|visit[_\s-]?count[_\s-]?30|visits[_\s-]?month)$/i,
    /\bvisits.*30\b/i,
  ],
  nextPayment: [
    /^(next[_\s-]?payment|next[_\s-]?bill|next[_\s-]?charge|next[_\s-]?due|payment[_\s-]?due)$/i,
    /\b(next[_\s-]?payment|payment[_\s-]?due|next[_\s-]?bill)\b/i,
  ],
  joinDate: [
    /^(join[_\s-]?date|start[_\s-]?date|member[_\s-]?since|signup[_\s-]?date|date[_\s-]?joined|enrolled)$/i,
    /\b(join|enrolled|signup|start)[_\s-]?date\b/i,
  ],
  membershipType: [/^(membership|plan|tier|product|package)$/i],
  monthlyValue: [/^(monthly|monthly[_\s-]?fee|monthly[_\s-]?value|price|amount|rate)$/i],
}

const ACTIVE_STATUS_WORDS = ['active', 'current', 'open', 'paying', 'live', 'enrolled']
const CANCELLED_STATUS_WORDS = ['cancelled', 'canceled', 'terminated', 'expired', 'lapsed', 'churned', 'left']
const FROZEN_STATUS_WORDS = ['frozen', 'freeze', 'on hold', 'paused', 'suspended']
const SLEEPER_STATUS_WORDS = ['sleeper', 'inactive', 'dormant']

// ─────────────────────────────────────────────────────────────────────────────

export async function parseMemberFile(file: File): Promise<ParseResult> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const workbook = readWorkbook(file.name, buf)
  const rows = extractRows(workbook)
  if (rows.length < 2) {
    return emptyResult(['Spreadsheet appears empty or has no data rows.'])
  }
  const headers = rows[0].map((h) => String(h ?? '').trim())
  const columnMap = mapColumns(headers)

  const warnings: string[] = []
  if (!columnMap.lastVisit) warnings.push('No "last visit" column detected — risk scores will be best-effort.')
  if (!columnMap.email && !columnMap.fullName && !columnMap.firstName) {
    warnings.push('No member name or email columns detected — make sure the right sheet was exported.')
  }

  const members: ParsedMember[] = []
  let skipped = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0 || row.every((c) => c === null || c === undefined || c === '')) {
      skipped++
      continue
    }
    const cells: Record<string, unknown> = {}
    headers.forEach((h, idx) => {
      cells[h] = row[idx]
    })
    const member = rowToMember(cells, columnMap)
    if (!member) {
      skipped++
      continue
    }
    members.push(member)
  }

  return {
    members,
    summary: {
      rowsParsed: members.length,
      rowsSkipped: skipped,
      detectedColumns: columnMap,
      warnings,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function readWorkbook(filename: string, buf: Uint8Array): XLSX.WorkBook {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
    const text = new TextDecoder().decode(buf)
    return XLSX.read(text, { type: 'string' })
  }
  return XLSX.read(buf, { type: 'array' })
}

function extractRows(workbook: XLSX.WorkBook): unknown[][] {
  // Pick the sheet with the most rows — gym exports often have a tiny "Summary" sheet first.
  let best: { rows: unknown[][]; size: number } = { rows: [], size: 0 }
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' })
    if (rows.length > best.size) best = { rows, size: rows.length }
  }
  return best.rows
}

function mapColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {
    externalId: null,
    firstName: null,
    lastName: null,
    fullName: null,
    email: null,
    phone: null,
    status: null,
    lastVisit: null,
    visitCount30d: null,
    nextPayment: null,
    joinDate: null,
    membershipType: null,
    monthlyValue: null,
  }
  for (const header of headers) {
    if (!header) continue
    for (const key of Object.keys(HEADER_PATTERNS) as (keyof ColumnMap)[]) {
      if (map[key]) continue
      if (HEADER_PATTERNS[key].some((re) => re.test(header))) {
        map[key] = header
        break
      }
    }
  }
  return map
}

function rowToMember(cells: Record<string, unknown>, map: ColumnMap): ParsedMember | null {
  const firstName = pickString(cells, map.firstName)
  const lastName = pickString(cells, map.lastName)
  const fullName = pickString(cells, map.fullName) ?? joinName(firstName, lastName)
  const email = pickString(cells, map.email)?.toLowerCase() ?? null

  // Skip totally empty rows: must have at least name or email or external id.
  const externalId = pickString(cells, map.externalId)
  if (!fullName && !email && !externalId) return null

  const status = normaliseStatus(pickString(cells, map.status))
  const lastVisit = parseFlexibleDate(cells[map.lastVisit ?? ''])
  const nextPayment = parseFlexibleDate(cells[map.nextPayment ?? ''])
  const joinDate = parseFlexibleDate(cells[map.joinDate ?? ''])
  const visitCount30d = parseInt30d(cells[map.visitCount30d ?? ''])
  const monthlyValue = parseMonthly(cells[map.monthlyValue ?? ''])
  const phone = pickString(cells, map.phone)
  const membershipType = pickString(cells, map.membershipType)

  return {
    externalId,
    name: fullName,
    email,
    phone,
    status,
    lastVisit,
    visitCount30d,
    nextPayment,
    joinDate,
    membershipType,
    monthlyValue,
  }
}

function pickString(cells: Record<string, unknown>, key: string | null): string | null {
  if (!key) return null
  const v = cells[key]
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

function joinName(first: string | null, last: string | null): string | null {
  const joined = [first, last].filter(Boolean).join(' ').trim()
  return joined || null
}

function normaliseStatus(raw: string | null): string {
  if (!raw) return 'active'
  const lower = raw.toLowerCase()
  if (CANCELLED_STATUS_WORDS.some((w) => lower.includes(w))) return 'cancelled'
  if (FROZEN_STATUS_WORDS.some((w) => lower.includes(w))) return 'frozen'
  if (SLEEPER_STATUS_WORDS.some((w) => lower.includes(w))) return 'sleeper'
  if (ACTIVE_STATUS_WORDS.some((w) => lower.includes(w))) return 'active'
  return 'active'
}

function parseInt30d(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.]/g, ''))
  if (Number.isFinite(n)) return Math.max(0, Math.round(n))
  return 0
}

function parseMonthly(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const s = String(v).replace(/[^0-9.\-]/g, '')
  if (!s) return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function parseFlexibleDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null

  // Excel serial date numbers (e.g. 45000)
  if (typeof v === 'number' && v > 25569 && v < 80000) {
    const ms = (v - 25569) * 86_400 * 1000
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime())) return d
  }

  // Date instance from xlsx with cellDates option
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v

  const s = String(v).trim()
  if (!s) return null

  // ISO YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    if (!Number.isNaN(d.getTime())) return d
  }

  // DD/MM/YYYY or MM/DD/YYYY — assume DD/MM/YYYY (UK gym audience), fall back if implausible.
  const slash = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/)
  if (slash) {
    let dd = Number(slash[1])
    let mm = Number(slash[2])
    let yyyy = Number(slash[3])
    if (yyyy < 100) yyyy += 2000
    // If month > 12, this must be MM/DD/YYYY (US) reversed
    if (mm > 12 && dd <= 12) {
      const t = dd; dd = mm; mm = t
    }
    const d = new Date(yyyy, mm - 1, dd)
    if (!Number.isNaN(d.getTime())) return d
  }

  // Fallback: let Date constructor try (handles "Jan 5 2024" etc.)
  const fallback = new Date(s)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

function emptyResult(warnings: string[] = []): ParseResult {
  return {
    members: [],
    summary: {
      rowsParsed: 0,
      rowsSkipped: 0,
      detectedColumns: {
        externalId: null,
        firstName: null,
        lastName: null,
        fullName: null,
        email: null,
        phone: null,
        status: null,
        lastVisit: null,
        visitCount30d: null,
        nextPayment: null,
        joinDate: null,
        membershipType: null,
        monthlyValue: null,
      },
      warnings,
    },
  }
}
