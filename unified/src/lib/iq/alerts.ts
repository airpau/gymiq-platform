/**
 * GymIQ AI Layer — exception alert engine (pure, config-driven, LLM-free).
 *
 * Evaluators consume metric history + connector state and return alert
 * candidates. Thresholds/sigmas/windows come from iq.alert_config rows — tuning
 * a rule for any tenant/site is a config change, never code. Dedupe is by
 * `dedupe_key` (rule:site:date), so re-running an ingest never duplicates.
 * Purge-flagged movements are already excluded upstream from leaver metrics.
 */

export interface AlertConfigRow {
  rule: string
  enabled: boolean
  threshold: number | null
  sigma: number | null
  consecutive_days: number | null
  window_days: number | null
  params: Record<string, unknown>
}

export interface MetricDay {
  metric_date: string // ISO date
  joiners: number | null
  leavers: number | null
  net_change: number | null
  overdue_members: number | null
  active_members: number | null
}

export interface EarlyQuitWindows {
  /** tenure<=cutoff leavers in the current window vs the prior window. */
  currentQuits: number
  priorQuits: number
  currentJoiners: number
}

export interface AlertCandidate {
  rule: string
  severity: 'info' | 'warning' | 'critical'
  triggeredOn: string
  metricValue: number
  thresholdValue: number | null
  message: string
  dedupeKey: string
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const stddev = (xs: number[]) => {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1))
}
const r1 = (n: number) => Math.round(n * 10) / 10

/**
 * Evaluate all enabled rules for `asOf` (the just-completed day).
 * `history` must be ascending by date and include `asOf` as its last row.
 * `hoursSinceLastSync` drives feed_silent; pass null when sync just succeeded.
 */
export function evaluateAlerts(opts: {
  siteName: string
  asOf: string
  history: MetricDay[]
  config: AlertConfigRow[]
  earlyQuit?: EarlyQuitWindows
  hoursSinceLastSync?: number | null
}): AlertCandidate[] {
  const { siteName, asOf, history, config } = opts
  const out: AlertCandidate[] = []
  const today = history[history.length - 1]
  const cfg = (rule: string) => config.find((c) => c.rule === rule && c.enabled)
  const key = (rule: string) => `${rule}:${siteName}:${asOf}`
  const trailing = (n: number, pick: (d: MetricDay) => number | null): number[] =>
    history.slice(-(n + 1), -1).map(pick).filter((v): v is number => v != null)

  // 1. leavers_spike — today's leavers above rolling mean + kσ
  const ls = cfg('leavers_spike')
  if (ls && today?.metric_date === asOf && today.leavers != null) {
    const window = trailing(ls.window_days ?? 28, (d) => d.leavers)
    const mu = mean(window)
    const limit = mu + (ls.sigma ?? 2) * stddev(window)
    const minAbs = Number(ls.params?.min_leavers ?? 3)
    if (window.length >= 7 && today.leavers > limit && today.leavers >= minAbs) {
      out.push({
        rule: 'leavers_spike', severity: 'warning', triggeredOn: asOf,
        metricValue: today.leavers, thresholdValue: r1(limit),
        message: `${siteName}: ${today.leavers} leavers yesterday vs ~${r1(mu)}/day norm (>${ls.sigma ?? 2}σ).`,
        dedupeKey: key('leavers_spike'),
      })
    }
  }

  // 2. net_loss_streak — net negative N consecutive days
  const nl = cfg('net_loss_streak')
  if (nl) {
    const n = nl.consecutive_days ?? 3
    const lastN = history.slice(-n)
    if (lastN.length === n && lastN.every((d) => d.net_change != null && d.net_change < 0)) {
      const total = lastN.reduce((a, d) => a + (d.net_change ?? 0), 0)
      out.push({
        rule: 'net_loss_streak', severity: 'warning', triggeredOn: asOf,
        metricValue: total, thresholdValue: -1,
        message: `${siteName}: net member loss ${n} days running (${total} total).`,
        dedupeKey: key('net_loss_streak'),
      })
    }
  }

  // 3. early_quit_rate_rising — <cutoff-tenure quits, window vs prior window
  const eq = cfg('early_quit_rate_rising')
  if (eq && opts.earlyQuit) {
    const { currentQuits, priorQuits, currentJoiners } = opts.earlyQuit
    const minCohort = Number(eq.params?.min_cohort_size ?? 20)
    const riseFactor = Number(eq.params?.rise_factor ?? 1.5)
    const minQuits = Number(eq.params?.min_quits ?? 5)
    if (currentJoiners >= minCohort && currentQuits >= minQuits && currentQuits > priorQuits * riseFactor) {
      out.push({
        rule: 'early_quit_rate_rising', severity: 'warning', triggeredOn: asOf,
        metricValue: currentQuits, thresholdValue: r1(priorQuits * riseFactor),
        message: `${siteName}: ${currentQuits} new-member quits (<${eq.params?.tenure_days_max ?? 30}d tenure) in the last ${eq.window_days ?? 30}d vs ${priorQuits} the period before — onboarding leak.`,
        dedupeKey: key('early_quit_rate_rising'),
      })
    }
  }

  // 4. failed_dd_spike — overdue count above rolling mean + kσ
  const fd = cfg('failed_dd_spike')
  if (fd && today?.metric_date === asOf && today.overdue_members != null) {
    const window = trailing(fd.window_days ?? 28, (d) => d.overdue_members)
    const mu = mean(window)
    const limit = mu + (fd.sigma ?? 2) * stddev(window)
    const minAbs = Number(fd.params?.min_overdue ?? 10)
    if (window.length >= 7 && today.overdue_members > limit && today.overdue_members >= minAbs) {
      out.push({
        rule: 'failed_dd_spike', severity: 'critical', triggeredOn: asOf,
        metricValue: today.overdue_members, thresholdValue: r1(limit),
        message: `${siteName}: ${today.overdue_members} members overdue vs ~${r1(mu)} norm — failed-DD spike, chase early.`,
        dedupeKey: key('failed_dd_spike'),
      })
    }
  }

  // 5. feed_silent — no successful sync for > threshold hours
  const fs = cfg('feed_silent')
  if (fs && opts.hoursSinceLastSync != null) {
    const limit = fs.threshold ?? 30
    if (opts.hoursSinceLastSync > limit) {
      out.push({
        rule: 'feed_silent', severity: 'critical', triggeredOn: asOf,
        metricValue: r1(opts.hoursSinceLastSync), thresholdValue: limit,
        message: `${siteName}: no fresh CRM data for ${Math.round(opts.hoursSinceLastSync)}h (limit ${limit}h). Numbers below may be stale — check the Glofox automation.`,
        dedupeKey: key('feed_silent'),
      })
    }
  }

  return out
}
