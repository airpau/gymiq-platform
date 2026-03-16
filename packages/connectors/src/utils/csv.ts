/**
 * Shared CSV parsing utilities.
 * Extracted here so browser connectors can reuse them without depending on apps/api.
 */

// ─── Tokeniser ────────────────────────────────────────────────────────────────

function tokenise(line: string, delimiter = ','): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
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

function detectDelimiter(header: string): ',' | ';' {
  return (header.match(/;/g) || []).length > (header.match(/,/g) || []).length ? ';' : ',';
}

function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Parse CSV text into an array of row objects with normalised header keys. */
export function parseCSV(csvText: string): Array<Record<string, string>> {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  if (!lines.length) return [];

  const delimiter = detectDelimiter(lines[0]);
  const headers = tokenise(lines[0], delimiter).map(normaliseHeader);
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = tokenise(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? '').trim(); });
    rows.push(row);
  }

  return rows;
}

// ─── Date parsing ─────────────────────────────────────────────────────────────

export function parseDate(raw: string): Date | undefined {
  if (!raw || raw === '-' || /^n\/?a$/i.test(raw)) return undefined;
  const native = new Date(raw);
  if (!isNaN(native.getTime())) return native;
  // UK dd/mm/yyyy
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const d = new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
    if (!isNaN(d.getTime())) return d;
  }
  return undefined;
}

// ─── Phone normalisation ──────────────────────────────────────────────────────

export function normalisePhone(raw: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.length < 7) return undefined;
  if (digits.startsWith('07') && digits.length === 11) return `+44${digits.slice(1)}`;
  return digits.startsWith('+') ? digits : `+${digits}`;
}

// ─── Status normalisation ─────────────────────────────────────────────────────

export function normaliseMemberStatus(raw: string): string {
  const s = (raw || '').toLowerCase().trim();
  if (s === 'active' || s === 'active member') return 'active';
  if (s === 'frozen' || s === 'suspended' || s === 'paused') return 'frozen';
  if (s === 'cancelled' || s === 'canceled' || s === 'terminated' || s === 'lapsed') return 'cancelled';
  return 'active';
}
