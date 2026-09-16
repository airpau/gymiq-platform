/**
 * A playbook is a markdown file in ./playbooks: frontmatter with run limits and
 * the tool allowlist, then the prompt the agent runs. This is the same shape
 * as a Cowork skill, so moving a skill into the product is a file copy.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface Playbook {
  name: string
  description: string
  model?: string
  maxTurns: number
  maxBudgetUsd?: number
  /** Tool names (without the mcp__gymiq__ prefix) the agent may call. */
  tools: string[]
  /** The prompt body. */
  prompt: string
}

const PLAYBOOK_DIR = process.env.PLAYBOOK_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'playbooks')

export function listPlaybooks(): string[] {
  return fs.readdirSync(PLAYBOOK_DIR).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort()
}

export function loadPlaybook(name: string): Playbook {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`invalid playbook name ${name}`)
  const file = path.join(PLAYBOOK_DIR, `${name}.md`)
  if (!fs.existsSync(file)) throw new Error(`playbook ${name} not found`)
  const raw = fs.readFileSync(file, 'utf8')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) throw new Error(`playbook ${name} has no frontmatter`)
  const meta: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/)
    if (kv) meta[kv[1]] = kv[2].trim()
  }
  const tools = (meta.tools ?? '').replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean)
  return {
    name,
    description: meta.description ?? '',
    model: meta.model || undefined,
    maxTurns: Number(meta.max_turns ?? 12),
    maxBudgetUsd: meta.max_budget_usd ? Number(meta.max_budget_usd) : undefined,
    tools,
    prompt: m[2].trim(),
  }
}
