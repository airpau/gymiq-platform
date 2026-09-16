import { sql, vaultSecrets } from './db.js'

export interface SiteContext {
  tenantId: string
  tenantName: string
  siteId: string
  siteName: string
  slug: string | null
  timezone: string
  crmType: string
  crmConfig: Record<string, unknown>
  financeConfig: Record<string, unknown>
  vaultPrefix: string
  active: boolean
}

/** Loads the site + tenant a playbook runs for. Throws when the site does not exist or is inactive. */
export async function loadSite(siteId: string): Promise<SiteContext> {
  const rows = await sql<{
    id: string; tenant_id: string; tenant_name: string; name: string; slug: string | null; timezone: string | null
    crm_type: string | null; crm_config: Record<string, unknown> | null; finance_config: Record<string, unknown> | null
    vault_prefix: string | null; active: boolean | null
  }>(
    `select s.id, s.tenant_id, t.name as tenant_name, s.name, s.slug, s.timezone, s.crm_type, s.crm_config, s.finance_config, s.vault_prefix, s.active
     from iq.sites s join iq.tenants t on t.id = s.tenant_id where s.id = $1`, [siteId])
  const r = rows[0]
  if (!r) throw new Error(`site ${siteId} not found`)
  if (r.active === false) throw new Error(`site ${siteId} is inactive`)
  return {
    tenantId: r.tenant_id,
    tenantName: r.tenant_name,
    siteId: r.id,
    siteName: r.name,
    slug: r.slug,
    timezone: r.timezone ?? 'Europe/London',
    crmType: r.crm_type ?? 'csv',
    crmConfig: r.crm_config ?? {},
    financeConfig: r.finance_config ?? {},
    vaultPrefix: r.vault_prefix ?? '',
    active: r.active ?? true,
  }
}

/**
 * Resolves the secrets a site is allowed to see. A site secret is looked up as
 * `${vault_prefix}${key}` first, then as the bare key for shared secrets
 * (e.g. the Telegram bot token). The bag is only ever handed to tools, never to
 * the model.
 */
export async function loadSiteSecrets(site: SiteContext, keys: string[]): Promise<Record<string, string>> {
  const names = keys.flatMap((k) => (site.vaultPrefix ? [`${site.vaultPrefix}${k}`, k] : [k]))
  const found = await vaultSecrets(names)
  const bag: Record<string, string> = {}
  for (const k of keys) {
    const scoped = site.vaultPrefix ? found[`${site.vaultPrefix}${k}`] : undefined
    const v = scoped ?? found[k]
    if (v) bag[k] = v
  }
  return bag
}
