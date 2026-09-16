/**
 * gymIQ worker: HTTP surface.
 *
 *   GET  /health                      liveness
 *   POST /run                         { playbook, site_id, dry_run? }   bearer WORKER_SECRET
 *   POST /artifacts/:siteId/:filename raw file body                     bearer WORKER_SECRET or the site's ingest_token
 *   GET  /playbooks                   list available playbooks          bearer WORKER_SECRET
 *
 * The scheduler (pg_cron in Supabase) calls POST /run. The Mac mini openclaw
 * job, a customer's script, or the hosted collector calls POST /artifacts.
 */
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { config } from './config.js'
import { runPlaybook } from './runner.js'
import { listPlaybooks } from './playbook.js'
import { uploadArtifact } from './artifacts.js'
import { loadSite, loadSiteSecrets } from './tenant.js'

const app = new Hono()

const bearer = (h: string | undefined) => (h ?? '').replace(/^Bearer\s+/i, '').trim()
const timingSafeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

app.get('/health', (c) => c.json({ ok: true, playbooks: listPlaybooks() }))

app.get('/playbooks', (c) => {
  if (!timingSafeEqual(bearer(c.req.header('authorization')), config.workerSecret)) return c.json({ error: 'unauthorised' }, 401)
  return c.json({ playbooks: listPlaybooks() })
})

/**
 * POST /run
 *   default:     202 immediately, the run finishes in the background (the scheduler never waits;
 *                the outcome lands in iq.agent_runs and iq.playbooks.last_status).
 *   wait: true:  200 with the result JSON once the run finishes. Fly's proxy drops connections idle
 *                for 60s, so the response streams a space every 10s until the JSON is ready
 *                (leading whitespace is valid JSON; curl and fetch().json() both accept it).
 */
app.post('/run', async (c) => {
  if (!timingSafeEqual(bearer(c.req.header('authorization')), config.workerSecret)) return c.json({ error: 'unauthorised' }, 401)
  const body = await c.req.json().catch(() => ({})) as { playbook?: string; site_id?: string; dry_run?: boolean; wait?: boolean }
  if (!body.playbook || !body.site_id) return c.json({ error: 'playbook and site_id are required' }, 400)
  const started = Date.now()
  const run = runPlaybook({ playbook: body.playbook, siteId: body.site_id, dryRun: !!body.dry_run })
    .then((r) => ({ ...r, duration_ms: Date.now() - started }))
    .catch((e: any) => ({ status: 'error' as const, error: String(e?.message ?? e), duration_ms: Date.now() - started }))

  if (!body.wait) {
    void run.then((r) => console.log(`[run] ${body.playbook} ${body.site_id} ${r.status} ${r.duration_ms}ms${'error' in r && r.error ? ' ' + r.error : ''}`))
    return c.json({ accepted: true, playbook: body.playbook, site_id: body.site_id, dry_run: !!body.dry_run }, 202)
  }

  const enc = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const tick = setInterval(() => controller.enqueue(enc.encode(' ')), 10_000)
      const r = await run
      clearInterval(tick)
      controller.enqueue(enc.encode(JSON.stringify(r)))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } })
})

app.post('/artifacts/:siteId/:filename', async (c) => {
  const siteId = c.req.param('siteId')
  const filename = c.req.param('filename')
  const token = bearer(c.req.header('authorization'))
  let ok = timingSafeEqual(token, config.workerSecret)
  if (!ok) {
    try {
      const site = await loadSite(siteId)
      const s = await loadSiteSecrets(site, ['ingest_token'])
      ok = !!s.ingest_token && timingSafeEqual(token, s.ingest_token)
    } catch { ok = false }
  }
  if (!ok) return c.json({ error: 'unauthorised' }, 401)
  const bytes = Buffer.from(await c.req.arrayBuffer())
  if (!bytes.length) return c.json({ error: 'empty body' }, 400)
  if (bytes.length > 50 * 1024 * 1024) return c.json({ error: 'file too large' }, 413)
  const key = await uploadArtifact(siteId, filename, bytes, c.req.header('content-type') ?? 'application/octet-stream')
  return c.json({ ok: true, key, bytes: bytes.length })
})

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`gymiq worker listening on :${info.port}; playbooks: ${listPlaybooks().join(', ')}`)
})
