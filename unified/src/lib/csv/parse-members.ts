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
 *   5. Sniffs unmapped columns by *content*: e.g. a column whose values are
 *      mostly "£12.99" is the price column even if its header is "Amount".
 *   6. Extracts a price from membership-plan names like "Premium £39/month".
 *   7. Returns rows that can be fed directly to scoreChurnRisk() plus extra
 *      member metadata (tenure, plan, price) used by the audit analysis.
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
  tenureDays: number | null
}

export interface ParseSummary {
  rowsParsed: number
  rowsSkipped: number
  detectedColumns: Record<keyof ColumnMap, string | null>
  pricingSource: 'column' | 'plan-name' | 'estimate'
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
  externalId: [/^(member[_\s-]?id|customer[_\s-]?id|client[_\s-]?id|user[_\s-]?id|id|ref(erence)?|account[_\s-]?(number|no))$/i],
  firstName: [/^(first[_\s-]?name|given[_\s-]?name|forename|firstname|fname)$/i],
  lastName: [/^(last[_\s-]?name|surname|family[_\s-]?name|lastname|lname)$/i],
  fullName: [/^(full[_\s-]?name|name|member[_\s-]?name|client[_\s-]?name|customer[_\s-]?name|customer|display[_\s-]?name)$/i],
  email: [/^(e[-_\s]?mail|email[_\s-]?address|primary[_\s-]?email|contact[_\s-]?email)$/i, /\bemail\b/i],
  phone: [/^(phone|mobile|cell|telephone|tel|contact[_\s-]?(number|no)|mobile[_\s-]?number)$/i, /\b(phone|mobile)\b/i],
  status: [
    /^(status|member[_\s-]?status|membership[_\s-]?status|state|active|account[_\s-]?status|sub(scription)?[_\s-]?status)$/i,
    /\b(status|active|cancelled)\b/i,
  ],
  lastVisit: [
    /^(last[_\s-]?visit|last[_\s-]?seen|last[_\s-]?check[_\s-]?in|last[_\s-]?attended|last[_\s-]?activity|last[_\s-]?attendance|most[_\s-]?recent[_\s-]?visit|last[_\s-]?visit[_\s-]?date|last[_\s-]?used)$/i,
    /\b(last[_\s-]?visit|last[_\s-]?seen|last[_\s-]?attended|last[_\s-]?check[_\s-]?in)\b/i,
  ],
  visitCount30d: [
    /^(visits[_\s-]?30d?|visits[_\s-]?last[_\s-]?30|visit[_\s-]?count[_\s-]?30|visits[_\s-]?month|monthly[_\s-]?visits|attendance[_\s-]?30)$/i,
    /\bvisits.*30\b/i,
  ],
  nextPayment: [
    /^(next[_\s-]?payment|next[_\s-]?bill|next[_\s-]?charge|next[_\s-]?due|payment[_\s-]?due|next[_\s-]?payment[_\s-]?at|next[_\s-]?billing[_\s-]?date|due[_\s-]?date)$/i,
    /\b(next[_\s-]?payment|payment[_\s-]?due|next[_\s-]?bill|next[_\s-]?billing)\b/i,
  ],
  joinDate: [
    /^(join[_\s-]?date|joined|joined[_\s-]?on|start[_\s-]?date|member[_\s-]?since|sign[_\s-]?up[_\s-]?date|signup[_\s-]?date|date[_\s-]?joined|enrolled|enrolled[_\s-]?on|registered|registration[_\s-]?date|created[_\s-]?at|created[_\s-]?on|member[_\s-]?from)$/i,
    /\b(join|enrolled|signup|sign[_\s-]?up|registered)[_\s-]?date\b/i,
    /\bmember[_\s-]?since\b/i,
  ],
  membershipType: [
    /^(membership|membership[_\s-]?(type|name|plan)|plan|plan[_\s-]?name|tier|product|package|subscription|subscription[_\s-]?name|category)$/i,
    /\b(membership|plan|subscription)\b/i,
  ],
  monthlyValue: [
    /^(monthly|monthly[_\s-]?(fee|value|price|amount|cost|charge|payment|due|rate|subscription)|recurring[_\s-]?(fee|amount|charge|price)|price|cost|amount|rate|fee|charge|membership[_\s-]?(price|cost|fee)|plan[_\s-]?price|subscription[_\s-]?(fee|price|cost)|total[_\s-]?price|standing[_\s-]?order)$/i,
    /\b(price|amount|fee|cost|recurring|monthly)\b/i,
  ],
}

const ACTIVE_STATUS_WORDS = ['active', 'current', 'open', 'paying', 'live', 'enrolled']
const CANCELLED_STATUS_WORDS = ['cancelled', 'canceled', 'terminated', 'expired', 'lapsed', 'churned', 'left', 'ended']
const FROZEN_STATUS_WORDS = ['frozen', 'freeze', 'on hold', 'paused', 'suspended', 'hold']
const SLEEPER_STATUS_WORDS = ['sleeper', 'inactive', 'dormant', 'lapsing']

// Plan-name → monthly price patterns we look for inside membership-type values
// when there is no dedicated price column. Examples we want to catch:
//   "Premium - £39.99/mo"
//   "Off-Peak £24"
//   "12 Month £29.99 per month"
//   "29.99 GBP"
const PRICE_IN_TEXT = /(?:£|GBP\s?)?\s?(\d{1,4}(?:[.,]\d{1,2})?)(?:\s?(?:GBP|gbp|pounds?))?(?:\s?(?:\/|per)\s?(?:mo|month|monthly|m))?/

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

  // Heuristic: if monthlyValue column wasn't matched by header, sniff the rows
  // for a column that *looks* like money values.
  if (!columnMap.monthlyValue) {
    const moneyCol = sniffMoneyColumn(headers, rows.slice(1))
    if (moneyCol) {
      columnMap.monthlyValue = moneyCol
    }
  }

  // Heuristic: if join date column wasn't matched, look for a date column
  // that's older than the lastVisit column on average — that's the join date.
  if (!columnMap.joinDate) {
    const joinCol = sniffJoinDateColumn(headers, rows.slice(1), columnMap)
    if (joinCol) {
      columnMap.joinDate = joinCol
    }
  }

  const warnings: string[] = []
  if (!columnMap.lastVisit) warnings.push('No "last visit" column detected — visit-based risk scoring is unavailable.')
  if (!columnMap.email && !columnMap.fullName && !columnMap.firstName) {
    warnings.push('No member name or email columns detected — make sure the right sheet was exported.')
  }

  const now = new Date()
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
    const member = rowToMember(cells, columnMap, now)
    if (!member) {
      skipped++
      continue
    }
    members.push(member)
  }

  // Pricing source diagnostics
  let pricingSource: 'column' | 'plan-name' | 'estimate' = 'estimate'
  if (columnMap.monthlyValue) {
    const withColumnPrice = members.filter((m) => m.monthlyValue !== null).length
    if (withColumnPrice / Math.max(1, members.length) > 0.5) pricingSource = 'column'
  }
  if (pricingSource === 'estimate' && columnMap.membershipType) {
    const withPlanPrice = members.filter((m) => m.monthlyValue !== null).length
    if (withPlanPrice / Math.max(1, members.length) > 0.4) pricingSource = 'plan-name'
  }

  if (pricingSource === 'estimate') {
    warnings.push('Monthly-fee column not detected — used a £40/member estimate. Add a price column for accurate revenue numbers.')
  }

  return {
    members,
    summary: {
      rowsParsed: members.length,
      rowsSkipped: skipped,
      detectedColumns: columnMap,
      pricingSource,
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

/**
 * Look for a column whose values are mostly money-shaped — useful when the
 * gym export has a price column named something we don't pattern-match (e.g.
 * "Recurring" or "Subscription Total").
 */
function sniffMoneyColumn(headers: string[], dataRows: unknown[][]): string | null {
  const sampleSize = Math.min(50, dataRows.length)
  let bestHeader: string | null = null
  let bestScore = 0
  for (let c = 0; c < headers.length; c++) {
    const header = headers[c]
    if (!header) continue
    // Don't pick a date column accidentally
    if (/date|visit|payment[_\s-]?at|joined|since/i.test(header)) continue
    let moneyHits = 0
    let nonEmpty = 0
    for (let r = 0; r < sampleSize; r++) {
      const raw = dataRows[r]?.[c]
      if (raw === null || raw === undefined || raw === '') continue
      nonEmpty++
      const s = String(raw).trim()
      if (looksLikeMoney(s)) moneyHits++
    }
    if (nonEmpty < 3) continue
    const score = moneyHits / nonEmpty
    if (score > 0.5 && score > bestScore) {
      bestScore = score
      bestHeader = header
    }
  }
  return bestHeader
}

function looksLikeMoney(s: string): boolean {
  // Reject obvious dates first
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return false
  if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(s)) return false
  // Plain number 0–1000 with optional decimals, optional £ or GBP
  return /^[£$€]?\s?\d{1,4}(?:[.,]\d{1,2})?(?:\s?(?:gbp|usd|eur))?$/i.test(s)
}

/**
 * Find an unmapped date column whose dates are systematically *earlier* than
 * lastVisit dates — those are member-join dates.
 */
function sniffJoinDateColumn(
  headers: string[],
  dataRows: unknown[][],
  map: ColumnMap,
): string | null {
  if (!map.lastVisit) return null
  const lastVisitIdx = headers.indexOf(map.lastVisit)
  if (lastVisitIdx < 0) return null

  const sampleSize = Math.min(60, dataRows.length)
  let bestHeader: string | null = null
  let bestDelta = 0
  for (let c = 0; c < headers.length; c++) {
    const header = headers[c]
    if (!header) continue
    if (c === lastVisitIdx) continue
    if (Object.values(map).includes(header)) continue
    if (!/date|joined|since|registered|start|signup|enrolled|created/i.test(header)) continue
    let dateHits = 0
    let earlierThanLastVisit = 0
    let totalDeltaDays = 0
    for (let r = 0; r < sampleSize; r++) {
      const raw = dataRows[r]?.[c]
      const lv = dataRows[r]?.[lastVisitIdx]
      const d = parseFlexibleDate(raw)
      const lvd = parseFlexibleDate(lv)
      if (!d) continue
      dateHits++
      if (lvd && d.getTime() < lvd.getTime()) {
        earlierThanLastVisit++
        totalDeltaDays += Math.floor((lvd.getTime() - d.getTime()) / 86_400_000)
      }
    }
    if (dateHits < 5) continue
    const earlierShare = earlierThanLastVisit / dateHits
    if (earlierShare < 0.6) continue
    const avgDelta = totalDeltaDays / Math.max(1, earlierThanLastVisit)
    if (avgDelta > bestDelta) {
      bestDelta = avgDelta
      bestHeader = header
    }
  }
  return bestHeader
}

function rowToMember(
  cells: Record<string, unknown>,
  map: ColumnMap,
  now: Date,
): ParsedMember | null {
  const firstName = pickString(cells, map.firstName)
  const lastName = pickString(cells, map.lastName)
  const fullName = pickString(cells, map.fullName) ?? joinName(firstName, lastName)
  const email = pickString(cells, map.email)?.toLowerCase() ?? null

  const externalId = pickString(cells, map.externalId)
  if (!fullName && !email && !externalId) return null

  const status = normaliseStatus(pickString(cells, map.status))
  const lastVisit = parseFlexibleDate(cells[map.lastVisit ?? ''])
  const nextPayment = parseFlexibleDate(cells[map.nextPayment ?? ''])
  const joinDate = parseFlexibleDate(cells[map.joinDate ?? ''])
  const visitCount30d = parseInt30d(cells[map.visitCount30d ?? ''])
  const phone = pickString(cells, map.phone)

  // Membership type and monthly value — try the dedicated price column first,
  // then fall back to extracting a price from the plan-name text.
  const membershipType = pickString(cells, map.membershipType)
  let monthlyValue = parseMonthly(cells[map.monthlyValue ?? ''])
  if (monthlyValue === null && membershipType) {
    monthlyValue = extractPriceFromText(membershipType)
  }

  const tenureDays = joinDate
    ? Math.floor((now.getTime() - joinDate.getTime()) / 86_400_000)
    : null

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
    tenureDays,
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
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).replace(/[^0-9.\-]/g, '')
  if (!s) return null
  const n = parseFloat(s)
  if (!Number.isFinite(n)) return null
  // Reasonability check: ignore values way outside any real gym membership range
  if (n < 0 || n > 5000) return null
  return n
}

function extractPriceFromText(text: string): number | null {
  // Look at every numeric run in the string, pick the most plausible
  // monthly-fee value (between £5 and £500 — covers low-cost to premium).
  const matches = text.match(/\d{1,4}(?:[.,]\d{1,2})?/g)
  if (!matches) return null
  let best: number | null = null
  for (const m of matches) {
    const n = parseFloat(m.replace(',', '.'))
    if (!Number.isFinite(n)) continue
    if (n < 5 || n > 500) continue
    // Prefer values that look like monthly fees (often .99 / .95 / .50 endings)
    const cents = Math.round((n - Math.floor(n)) * 100)
    const isPricey = cents === 99 || cents === 95 || cents === 50 || cents === 0
    if (best === null) {
      best = n
    } else if (isPricey && Math.abs(best - n) < 100) {
      best = n
    }
  }
  return best
}

function parseFlexibleDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null

  // Excel serial date numbers (e.g. 45000)
  if (typeof v === 'number' && v > 25569 && v < 80000) {
    const ms = (v - 25569) * 86_400 * 1000
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime())) return d
  }

  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v

  const s = String(v).trim()
  if (!s) return null

  // ISO YYYY-MM-DD (optionally with time)
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    if (!Number.isNaN(d.getTime())) return d
  }

  // DD/MM/YYYY or MM/DD/YYYY — assume DD/MM (UK gym audience), fall back if implausible.
  const slash = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/)
  if (slash) {
    let dd = Number(slash[1])
    let mm = Number(slash[2])
    let yyyy = Number(slash[3])
    if (yyyy < 100) yyyy += 2000
    if (mm > 12 && dd <= 12) {
      const t = dd; dd = mm; mm = t
    }
    const d = new Date(yyyy, mm - 1, dd)
    if (!Number.isNaN(d.getTime())) return d
  }

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
      pricingSource: 'estimate',
      warnings,
    },
  }
}
