/**
 * CRM export artifacts (Members_*.xlsx and friends) live in a private Supabase
 * Storage bucket, keyed `<site_id>/<filename>`. Three things put files there:
 *   - POST /artifacts/:siteId on this worker (openclaw today, a customer's
 *     upload or the hosted collector tomorrow),
 *   - inbound email (later),
 *   - the hosted browser collector (later).
 * The ingest never reads a laptop directory: it reads a temp dir this module
 * fills from the bucket, so it behaves identically for every tenant.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config } from './config.js'

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false } })

export async function uploadArtifact(siteId: string, filename: string, bytes: Buffer, contentType = 'application/octet-stream'): Promise<string> {
  const safe = path.basename(filename).replace(/[^A-Za-z0-9._-]/g, '_')
  const key = `${siteId}/${safe}`
  const { error } = await supabase.storage.from(config.artifactBucket).upload(key, bytes, { contentType, upsert: true })
  if (error) throw new Error(`artifact upload failed: ${error.message}`)
  return key
}

export interface ArtifactInfo { name: string; updatedAt: string | null; size: number | null }

export async function listArtifacts(siteId: string, prefixFilter?: RegExp): Promise<ArtifactInfo[]> {
  const { data, error } = await supabase.storage.from(config.artifactBucket).list(siteId, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
  if (error) throw new Error(`artifact list failed: ${error.message}`)
  return (data ?? [])
    .filter((o) => o.name && (!prefixFilter || prefixFilter.test(o.name)))
    .map((o) => ({ name: o.name, updatedAt: o.updated_at ?? null, size: (o.metadata as { size?: number } | null)?.size ?? null }))
}

/**
 * Downloads the newest N matching artifacts into a fresh temp directory and
 * returns its path. The ingest only needs the newest file, but a small window
 * keeps re-runs cheap and lets the sales-log merge find its JSON.
 */
export async function materialiseArtifacts(siteId: string, pattern: RegExp, keep = 3): Promise<{ dir: string; files: string[] }> {
  const all = (await listArtifacts(siteId, pattern)).sort((a, b) => a.name.localeCompare(b.name))
  const chosen = all.slice(-keep)
  const dir = path.join(config.scratchDir, siteId, String(Date.now()))
  fs.mkdirSync(dir, { recursive: true })
  const files: string[] = []
  for (const a of chosen) {
    const { data, error } = await supabase.storage.from(config.artifactBucket).download(`${siteId}/${a.name}`)
    if (error || !data) throw new Error(`artifact download failed for ${a.name}: ${error?.message ?? 'no data'}`)
    const target = path.join(dir, a.name)
    fs.writeFileSync(target, Buffer.from(await data.arrayBuffer()))
    files.push(target)
  }
  return { dir, files }
}

export function cleanupDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* best effort */ }
}
