/**
 * CRM export artifacts (Members_*.xlsx, members_*.csv, sales-log JSON) live in
 * the database table iq.artifacts, keyed (site_id, name). A day's export is a
 * megabyte or two, so bytea is simpler than object storage and needs no extra
 * credential. Three things put files there:
 *   - POST /artifacts/:siteId/:filename on this worker (openclaw today, a
 *     customer's upload or script tomorrow),
 *   - inbound email (later),
 *   - the hosted browser collector (later).
 * The ingest never reads a laptop directory: it reads a temp dir this module
 * fills from the table, so it behaves identically for every tenant.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { config } from './config.js'
import { sql } from './db.js'

export function safeName(filename: string): string {
  return path.basename(filename).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200)
}

export async function uploadArtifact(siteId: string, filename: string, bytes: Buffer, contentType = 'application/octet-stream'): Promise<string> {
  const name = safeName(filename)
  await sql(
    `insert into iq.artifacts (site_id, tenant_id, name, content_type, bytes, size_bytes)
     select s.id, s.tenant_id, $2, $3, $4, $5 from iq.sites s where s.id = $1
     on conflict (site_id, name) do update set bytes = excluded.bytes, size_bytes = excluded.size_bytes,
       content_type = excluded.content_type, uploaded_at = now()`,
    [siteId, name, contentType, bytes, bytes.length])
  // Keep the newest N per site; the ingest only ever needs the last few.
  await sql(
    `delete from iq.artifacts where site_id = $1 and id in (
       select id from iq.artifacts where site_id = $1 order by uploaded_at desc offset $2)`,
    [siteId, config.artifactsKeepPerSite])
  return `${siteId}/${name}`
}

export interface ArtifactInfo { name: string; uploadedAt: string; size: number }

export async function listArtifacts(siteId: string, pattern?: RegExp): Promise<ArtifactInfo[]> {
  const rows = await sql<{ name: string; uploaded_at: string; size_bytes: number }>(
    `select name, uploaded_at::text, size_bytes from iq.artifacts where site_id = $1 order by name`, [siteId])
  return rows
    .filter((r) => !pattern || pattern.test(r.name))
    .map((r) => ({ name: r.name, uploadedAt: r.uploaded_at, size: Number(r.size_bytes) }))
}

/**
 * Writes the newest `keep` matching artifacts into a fresh temp directory and
 * returns its path. File mtimes are set to the upload time so a connector that
 * has no date in the filename still gets a sensible as-of date.
 */
export async function materialiseArtifacts(siteId: string, pattern: RegExp, keep = 3): Promise<{ dir: string; files: string[] }> {
  const chosen = (await listArtifacts(siteId, pattern))
    .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt) || a.name.localeCompare(b.name))
    .slice(-keep)
  const dir = path.join(config.scratchDir, siteId, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  fs.mkdirSync(dir, { recursive: true })
  const files: string[] = []
  for (const a of chosen) {
    const rows = await sql<{ bytes: Buffer }>(`select bytes from iq.artifacts where site_id = $1 and name = $2`, [siteId, a.name])
    if (!rows[0]) continue
    const target = path.join(dir, a.name)
    fs.writeFileSync(target, rows[0].bytes)
    const t = new Date(a.uploadedAt)
    fs.utimesSync(target, t, t)
    files.push(target)
  }
  return { dir, files }
}

export function cleanupDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* best effort */ }
}
