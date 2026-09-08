'use client'

/**
 * One shared state for every demo on /demo, so the tools visibly work
 * together: a member marked "called" on the retention radar ticks the matching
 * task on the staff board, a tick on the board shows as called on the radar,
 * and the 22:00 report counts both. Tasks can be assigned to a named member
 * of staff. Everything is in memory; reload and it resets.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export type Section = 'money-hour' | 'sales' | 'retention' | 'club'
export interface Task {
  id: string
  section: Section
  title: string
  detail: string
  /** Who ticked it. Undefined means still open. */
  done?: string
  /** Who it is assigned to. Undefined means anyone on shift. */
  assignee?: string
  /** For retention tasks: the member's name on the radar. */
  member?: string
  /** Where the tick was made, so the board can say so. */
  via?: 'board' | 'radar' | 'routine'
}

export const STAFF = ['Dan', 'Rachel', 'Israel'] as const
export type Staff = (typeof STAFF)[number]
export const QUEUE = { overdue: 58, unbilled: 22 }

/** The retention radar's members. One source, used by the radar and the board. */
export interface Member { name: string; plan: string; fee: number; visitsPerMonth: number; daysSince: number; tenureMonths: number }
export const MEMBERS: Member[] = [
  { name: 'Aisha K', plan: 'WOW', fee: 36.99, visitsPerMonth: 16, daysSince: 9, tenureMonths: 14 },
  { name: 'Ben O', plan: 'Classic', fee: 31.99, visitsPerMonth: 12, daysSince: 11, tenureMonths: 7 },
  { name: 'Carla M', plan: 'EPIC', fee: 49.99, visitsPerMonth: 8, daysSince: 17, tenureMonths: 22 },
  { name: 'Dev P', plan: 'Classic', fee: 31.99, visitsPerMonth: 1, daysSince: 26, tenureMonths: 31 },
  { name: 'Emma T', plan: 'WOW', fee: 36.99, visitsPerMonth: 10, daysSince: 21, tenureMonths: 3 },
  { name: 'Femi A', plan: 'Classic', fee: 31.99, visitsPerMonth: 4, daysSince: 33, tenureMonths: 18 },
  { name: 'Grace L', plan: 'Student', fee: 19.99, visitsPerMonth: 14, daysSince: 5, tenureMonths: 2 },
  { name: 'Harry W', plan: 'Classic', fee: 31.99, visitsPerMonth: 0.5, daysSince: 71, tenureMonths: 40 },
  { name: 'Isla R', plan: 'WOW', fee: 36.99, visitsPerMonth: 6, daysSince: 12, tenureMonths: 9 },
  { name: 'Jack D', plan: 'Classic', fee: 31.99, visitsPerMonth: 9, daysSince: 27, tenureMonths: 5 },
]

/** Days a member usually leaves between visits, from their own visits a month. */
export const usualGap = (m: Member) => 30.44 / Math.max(0.25, m.visitsPerMonth)

export function verdict(m: Member) {
  const gap = usualGap(m)
  const ratio = m.daysSince / gap
  if (m.tenureMonths >= 12 && m.visitsPerMonth < 1 && m.daysSince >= 30) return { key: 'leave' as const, label: 'Leave alone', why: 'Long tenured, low use, happy paying. A call only reminds them.', tone: 'bg-paper-2 text-slate' }
  if (ratio >= 2 && m.daysSince >= 14) return { key: 'call' as const, label: 'Call today', why: `Away ${m.daysSince} days against a usual gap of ${gap.toFixed(0)}. Habit broken.`, tone: 'bg-signal/10 text-signal' }
  if (ratio >= 1.3 && m.daysSince >= 10) return { key: 'watch' as const, label: 'Drifting', why: `Slipping from ${m.visitsPerMonth} visits a month. Book them into a class.`, tone: 'bg-amber-soft text-amber' }
  return { key: 'ok' as const, label: 'Healthy', why: 'On their own pattern.', tone: 'bg-moss-soft text-moss' }
}

/** The radar's calls, as board tasks. Same names, same reasons. */
const RETENTION_TASKS: Task[] = MEMBERS.flatMap((m) => {
  const v = verdict(m)
  if (v.key !== 'call' && v.key !== 'watch') return []
  return [{
    id: `r-${m.name}`,
    section: 'retention' as const,
    member: m.name,
    title: `${v.key === 'call' ? 'Call today' : 'Drifting, check in'}: ${m.name}`,
    detail: `${m.plan}, usually ${m.visitsPerMonth} visits a month, last visit ${m.daysSince} days ago. ${v.why} Friendly, never mention price or billing. Note on the profile.`,
    assignee: v.key === 'call' ? ('Rachel' as Staff) : undefined,
  }]
})

const SEED: Task[] = [
  { id: 'm1', section: 'money-hour', title: 'Call overdue: Mercedes W', detail: 'WOW, £36.99 a month, pays by card, last visit 31 Aug. 1 Ring and agree payment today. 2 Fix the card. 3 Retry. 4 Note on the profile.', assignee: 'Dan' },
  { id: 'm2', section: 'money-hour', title: 'Call overdue: Callum B', detail: 'Classic, £31.99, card, last visit 31 Aug.', assignee: 'Dan' },
  { id: 'm3', section: 'money-hour', title: 'Call overdue: Tanya B', detail: 'WOW, £36.99, card, last visit 30 Aug.', assignee: 'Rachel' },
  { id: 'm4', section: 'money-hour', title: 'Call overdue: Yomi W', detail: 'WOW, £36.99, direct debit, no visit on record.' },
  { id: 'm5', section: 'money-hour', title: 'Fix billing: Drew B', detail: 'ACTIVE at £49.99 with no next payment scheduled. Training unbilled. Restart billing, confirm a date shows.', assignee: 'Rachel' },
  { id: 'm6', section: 'money-hour', title: 'Fix billing: Zoe H', detail: 'ACTIVE at £36.99, no next payment scheduled.' },
  { id: 'm7', section: 'money-hour', title: 'Ending 10 Sep, call: Billy B', detail: '£31.99 a month, membership ends Wednesday. Ring before it lapses; if staying restart billing, if leaving ask why.', assignee: 'Israel' },
  { id: 'm8', section: 'money-hour', title: 'Cash payers to settle at the desk (2)', detail: 'Do not ring them. Collect when they next come in.' },
  { id: 's1', section: 'sales', title: 'Check new leads, call within the hour', detail: 'Every enquiry gets a call within 60 minutes.', assignee: 'Israel' },
  { id: 's2', section: 'sales', title: "Confirm today's and tomorrow's tours by text", detail: "Chase yesterday's no shows too." },
  ...RETENTION_TASKS,
  { id: 'c1', section: 'club', title: 'Send the six line end of day report by 18:00', detail: 'Sales, money calls, billing fixes, leads, retention, club.', assignee: 'Dan' },
]

interface Store {
  me: Staff
  setMe: (s: Staff) => void
  tasks: Task[]
  /** Toggle done. `by` defaults to the signed in person. */
  tick: (id: string, via: Task['via'], by?: string) => void
  assign: (id: string, who?: Staff) => void
  addTask: (t: Omit<Task, 'id'> & { id?: string }) => void
  /** Retention radar helpers. */
  calledMember: (member: string) => Task | undefined
  markCalled: (member: string) => void
}

const Ctx = createContext<Store | null>(null)

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Staff>('Dan')
  const [tasks, setTasks] = useState<Task[]>(SEED)

  const store = useMemo<Store>(() => ({
    me,
    setMe,
    tasks,
    tick: (id, via, by) => setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: t.done ? undefined : (by ?? me), via: t.done ? undefined : via } : t))),
    assign: (id, who) => setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, assignee: who } : t))),
    addTask: (t) => setTasks((ts) => (ts.some((x) => x.id === t.id) ? ts : [...ts, { ...t, id: t.id ?? `t${ts.length + 1}` }])),
    calledMember: (member) => tasks.find((t) => t.member === member),
    markCalled: (member) => {
      setTasks((ts) => {
        const existing = ts.find((t) => t.member === member)
        if (existing) return ts.map((t) => (t.member === member ? { ...t, done: t.done ? undefined : me, via: t.done ? undefined : 'radar' } : t))
        return [...ts, { id: `r-${member}`, section: 'retention', member, title: `Called: ${member}`, detail: 'Marked on the retention radar.', done: me, via: 'radar' }]
      })
    },
  }), [me, tasks])

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useDemoStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useDemoStore must be used inside DemoStoreProvider')
  return s
}
