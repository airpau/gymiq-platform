import pg from 'pg'
import { config } from './config.js'

/** One shared pool for the worker process. Every query is service-role; scoping to a tenant is the caller's job. */
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 5,
})

export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query<T>(text, params)
  return r.rows
}

/** Reads one secret from Supabase Vault by name. Returns null when absent. */
export async function vaultSecret(name: string): Promise<string | null> {
  const rows = await sql<{ decrypted_secret: string }>(
    `select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1`, [name])
  return rows[0]?.decrypted_secret ?? null
}

/** Reads several secrets in one round trip. Missing names are simply absent from the map. */
export async function vaultSecrets(names: string[]): Promise<Record<string, string>> {
  if (!names.length) return {}
  const rows = await sql<{ name: string; decrypted_secret: string }>(
    `select name, decrypted_secret from vault.decrypted_secrets where name = any($1::text[])`, [names])
  return Object.fromEntries(rows.map((r) => [r.name, r.decrypted_secret]))
}
