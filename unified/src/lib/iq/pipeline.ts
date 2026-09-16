/**
 * GymIQ AI Layer — canonical pipeline (CRM-agnostic, pure, LLM-free).
 *
 * Consumes an ordered series of CanonicalBatch full snapshots for one site and
 * derives: member movements (join / disappear≈cancel / freeze / unfreeze /
 * reappear / rejoin, with tenure-at-leaving and join cohort) and daily site
 * metrics. The same functions serve backfill and the live daily ingest, so a
 * metric is only ever computed one way.
 *
 * Robustness rules (why they exist):
 *  - TRUNCATED-FILE GUARD: a snapshot whose member count drops >7% vs the
 *    previous accepted snapshot is quarantined (no diffs, no metrics) — one
 *    bad export must never fabricate a mass cancellation.
 *  - ABSENCE CONFIRMATION: a member counts as gone only after being absent
 *    from CONFIRM_ABSENT_SNAPSHOTS consecutive accepted snapshots (export
 *    glitches drop the odd row). Absences still unconfirmed at the end of the
 *    series are reported as `pending`, not emitted.
 *  - Trailing unconfirmed absences are the live system's job to confirm on
 *    later syncs; backfill and daily ingest share this exact behaviour.
 */

import type { CanonicalBatch, CanonicalMember, IsoDate } from './contract'

export const CONFIRM_ABSENT_SNAPSHOTS = 3
export const TRUNCATION_DROP_PCT = 7
export const REJOIN_MIN_GAP_DAYS = 60

export type MovementKind =
  | 'join'
  | 'cancel'
  | 'freeze'
  | 'unfreeze'
  | 'rejoin'
  | 'disappear'
  | 'reappear'

export interface Movement {
  sourceMemberId: string
  movement: MovementKind
  occurredOn: IsoDate
  tenureDays: number | null
  joinCohort: IsoDate | null // first of joining month
  planRaw: string | null
  monthlyFee: number | null
  detectedBy: 'crm_event' | 'snapshot_diff' | 'csv_import' | 'backfill'
  dataQuality: 'normal' | 'coarse' | 'estimated'
}

export interface DailyMetrics {
  metricDate: IsoDate
  totalMembers: number
  activeMembers: number
  overdueMembers: number
  pausedMembers: number
  activePaying: number
  /** Canonical MRR: ACTIVE members' monthly fees only (bankable). */
  mrr: number
  overdueMrr: number
  /** Book value sitting in paused/suspended memberships. mrr+overdue+paused = blended "book MRR". */
  pausedMrr: number
  arpu: number | null
}

export interface PipelineResult {
  movements: Movement[]
  metrics: DailyMetrics[]
  /** Members last-known state after the final accepted snapshot. */
  finalMembers: Map<string, CanonicalMember>
  /** sourceMemberId → last date seen, for members absent but not yet confirmed gone. */
  pendingAbsences: Map<string, IsoDate>
  /** Snapshot dates rejected by the truncation guard. */
  quarantinedDates: IsoDate[]
  firstSeen: Map<string, IsoDate>
  lastSeen: Map<string, IsoDate>
}

function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
}

function cohortOf(joined: IsoDate | null): IsoDate | null {
  return joined ? `${joined.slice(0, 7)}-01` : null
}

/** Point-in-time site metrics from one full snapshot (reference-impl formulas, ported once). */
export function metricsFromSnapshot(asOf: IsoDate, members: CanonicalMember[]): DailyMetrics {
  let active = 0
  let overdue = 0
  let paused = 0
  let activePaying = 0
  let mrr = 0
  let overdueMrr = 0
  let pausedMrr = 0
  for (const m of members) {
    const fee = m.monthlyFee ?? 0
    if (m.status === 'active') {
      active++
      mrr += fee
      if (fee > 0) activePaying++
    } else if (m.status === 'overdue') {
      overdue++
      overdueMrr += fee
    } else if (m.status === 'paused' || m.status === 'suspended') {
      paused++
      pausedMrr += fee
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100
  return {
    metricDate: asOf,
    totalMembers: members.length,
    activeMembers: active,
    overdueMembers: overdue,
    pausedMembers: paused,
    activePaying,
    mrr: r2(mrr),
    overdueMrr: r2(overdueMrr),
    pausedMrr: r2(pausedMrr),
    arpu: activePaying > 0 ? r2(mrr / activePaying) : null,
  }
}

interface AbsenceTrack {
  firstAbsentDate: IsoDate
  absentCount: number
  lastRow: CanonicalMember
  lastSeenDate: IsoDate
}

/**
 * Fold an ordered series of FULL snapshots into movements + metrics.
 * Batches must be same-site, ascending by asOf, one per date (caller dedupes).
 */
export function runPipeline(batches: CanonicalBatch[], detectedBy: Movement['detectedBy'] = 'snapshot_diff'): PipelineResult {
  const movements: Movement[] = []
  const metrics: DailyMetrics[] = []
  const quarantined: IsoDate[] = []
  const firstSeen = new Map<string, IsoDate>()
  const lastSeen = new Map<string, IsoDate>()
  const lastState = new Map<string, CanonicalMember>()
  const absent = new Map<string, AbsenceTrack>()
  /** joined-at values already credited with a join/rejoin per member. */
  const joinsEmitted = new Map<string, IsoDate[]>()
  let prevAccepted: CanonicalBatch | null = null

  /**
   * Join accounting. Glofox (and other CRMs) RESET the commencement date when a
   * member changes plan, so a changed joined-at on a continuously-present member
   * is a plan change, NOT a join — verified against Hoddesdon data (40 spurious
   * rejoins / 75 forward-shifted joins before this rule). Therefore:
   *  - 'join' is emitted once, at a member's FIRST sighting, for their joined-at;
   *  - 'rejoin' only when a member returns from a CONFIRMED absence with a newer
   *    joined-at (≥ REJOIN_MIN_GAP_DAYS after the previous one);
   *  - any other joined-at drift is ignored.
   */
  const emitJoinIfNew = (m: CanonicalMember, returningFromAbsence: boolean, quality: Movement['dataQuality']) => {
    if (!m.joinedAt) return
    const prior = joinsEmitted.get(m.sourceMemberId) ?? []
    const isFirstSighting = prior.length === 0
    if (!isFirstSighting) {
      if (!returningFromAbsence) return // plan change / commencement reset — not a movement
      if (!prior.every((d) => daysBetween(d, m.joinedAt!) >= REJOIN_MIN_GAP_DAYS)) return
    }
    movements.push({
      sourceMemberId: m.sourceMemberId,
      movement: isFirstSighting ? 'join' : 'rejoin',
      occurredOn: m.joinedAt,
      tenureDays: null,
      joinCohort: cohortOf(m.joinedAt),
      planRaw: m.planRaw,
      monthlyFee: m.monthlyFee,
      detectedBy: 'crm_event', // joined-at is a CRM-recorded fact
      dataQuality: quality,
    })
    prior.push(m.joinedAt)
    joinsEmitted.set(m.sourceMemberId, prior)
  }

  for (const batch of batches) {
    if (!batch.isFullSnapshot) throw new Error(`batch ${batch.asOf} is not a full snapshot`)
    const date = batch.asOf

    // Truncation guard.
    if (prevAccepted && batch.members.length < prevAccepted.members.length * (1 - TRUNCATION_DROP_PCT / 100)) {
      quarantined.push(date)
      continue
    }

    const current = new Map(batch.members.map((m) => [m.sourceMemberId, m]))

    // Presence, joins, freezes, returns.
    for (const [id, m] of current) {
      if (!firstSeen.has(id)) firstSeen.set(id, date)
      lastSeen.set(id, date)
      const returning = (absent.get(id)?.absentCount ?? 0) >= CONFIRM_ABSENT_SNAPSHOTS
      emitJoinIfNew(m, returning, 'normal')

      const track = absent.get(id)
      if (track) {
        absent.delete(id)
        if (track.absentCount >= CONFIRM_ABSENT_SNAPSHOTS) {
          // Confirmed gone earlier, now back: emit the disappearance + the return.
          movements.push(disappearance(track, 'normal', detectedBy))
          movements.push({
            sourceMemberId: id,
            movement: 'reappear',
            occurredOn: date,
            tenureDays: null,
            joinCohort: cohortOf(m.joinedAt),
            planRaw: m.planRaw,
            monthlyFee: m.monthlyFee,
            detectedBy,
            dataQuality: 'normal',
          })
        }
        // Short flap: treat as continuous membership, no movements.
      }

      const prev = lastState.get(id)
      if (prev) {
        const wasPaused = prev.status === 'paused' || prev.status === 'suspended'
        const isPaused = m.status === 'paused' || m.status === 'suspended'
        if (!wasPaused && isPaused) movements.push(statusMove(id, m, 'freeze', date, detectedBy))
        if (wasPaused && !isPaused) movements.push(statusMove(id, m, 'unfreeze', date, detectedBy))
      }
      lastState.set(id, m)
    }

    // Absences.
    for (const [id, prev] of lastState) {
      if (current.has(id)) continue
      const track = absent.get(id)
      if (track) track.absentCount++
      else absent.set(id, { firstAbsentDate: date, absentCount: 1, lastRow: prev, lastSeenDate: lastSeen.get(id) ?? date })
    }

    metrics.push(metricsFromSnapshot(date, batch.members))
    prevAccepted = batch
  }

  // Close out confirmed trailing absences; leave the rest pending.
  const pendingAbsences = new Map<string, IsoDate>()
  for (const [id, track] of absent) {
    if (track.absentCount >= CONFIRM_ABSENT_SNAPSHOTS) {
      movements.push(disappearance(track, 'normal', detectedBy))
      lastState.delete(id)
    } else {
      pendingAbsences.set(id, track.lastSeenDate)
    }
  }

  return {
    movements,
    metrics,
    finalMembers: lastState,
    pendingAbsences,
    quarantinedDates: quarantined,
    firstSeen,
    lastSeen,
  }
}

function disappearance(track: AbsenceTrack, quality: Movement['dataQuality'], detectedBy: Movement['detectedBy']): Movement {
  const m = track.lastRow
  // End Date in the last-seen row refines a disappearance into a dated cancellation.
  const endDated = m.endDate && m.endDate <= track.firstAbsentDate
  const occurredOn = endDated ? m.endDate! : track.firstAbsentDate
  return {
    sourceMemberId: m.sourceMemberId,
    movement: endDated ? 'cancel' : 'disappear',
    occurredOn,
    tenureDays: m.joinedAt ? Math.max(0, daysBetween(m.joinedAt, occurredOn)) : null,
    joinCohort: cohortOf(m.joinedAt),
    planRaw: m.planRaw,
    monthlyFee: m.monthlyFee,
    detectedBy,
    dataQuality: quality,
  }
}

function statusMove(id: string, m: CanonicalMember, movement: 'freeze' | 'unfreeze', date: IsoDate, detectedBy: Movement['detectedBy']): Movement {
  return {
    sourceMemberId: id,
    movement,
    occurredOn: date,
    tenureDays: null,
    joinCohort: cohortOf(m.joinedAt),
    planRaw: m.planRaw,
    monthlyFee: m.monthlyFee,
    detectedBy,
    dataQuality: 'normal',
  }
}
