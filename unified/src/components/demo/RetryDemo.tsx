'use client'

/**
 * Failed payment routine. Press Run and watch it work through the list one
 * step at a time: read the failure, decide, submit the retry, and show the
 * bank's answer (paid or failed). Anything that needs a person becomes a task
 * on the staff board (shared store). Never hammers a card.
 */
import { useEffect, useRef, useState } from 'react'
import { useDemoStore } from './DemoStore'

interface F { name: string; amount: number; method: 'card' | 'dd' | 'flexible' | 'cash'; reason: string; attempts: number; lastAttemptDaysAgo: number; monthsFailed: number; lastVisitDays: number; bankSays: 'paid' | 'failed' }

const FAILED: F[] = [
  { name: 'Mercedes W', amount: 36.99, method: 'dd', reason: 'Insufficient funds', attempts: 1, lastAttemptDaysAgo: 1, monthsFailed: 1, lastVisitDays: 6, bankSays: 'paid' },
  { name: 'Callum B', amount: 31.99, method: 'card', reason: 'Card declined', attempts: 2, lastAttemptDaysAgo: 4, monthsFailed: 1, lastVisitDays: 5, bankSays: 'failed' },
  { name: 'Tanya B', amount: 36.99, method: 'dd', reason: 'Insufficient funds', attempts: 2, lastAttemptDaysAgo: 3, monthsFailed: 1, lastVisitDays: 8, bankSays: 'paid' },
  { name: 'Yomi W', amount: 36.99, method: 'dd', reason: 'Mandate cancelled at bank', attempts: 3, lastAttemptDaysAgo: 9, monthsFailed: 4, lastVisitDays: 120, bankSays: 'failed' },
  { name: 'Geetha G', amount: 36.99, method: 'flexible', reason: 'No payment method', attempts: 0, lastAttemptDaysAgo: 30, monthsFailed: 2, lastVisitDays: 40, bankSays: 'failed' },
  { name: 'Sam A', amount: 31.99, method: 'card', reason: 'Card replaced 2 days ago, last failure was on the old card', attempts: 5, lastAttemptDaysAgo: 6, monthsFailed: 2, lastVisitDays: 3, bankSays: 'paid' },
  { name: 'Ade O', amount: 31.99, method: 'dd', reason: 'Insufficient funds', attempts: 3, lastAttemptDaysAgo: 4, monthsFailed: 2, lastVisitDays: 2, bankSays: 'failed' },
  { name: 'Lou M', amount: 22.99, method: 'cash', reason: 'Not paid at desk', attempts: 0, lastAttemptDaysAgo: 0, monthsFailed: 1, lastVisitDays: 4, bankSays: 'failed' },
]

type Action = 'Retry once' | 'Desk collects' | 'Cancel for review' | 'Contact: new card' | 'Contact: set up DD' | 'Stop retrying, chase' | 'Leave today' | 'Contact'

function decide(f: F, friday: boolean): { action: Action; tone: string; why: string; task?: string } {
  if (f.method === 'cash') return { action: 'Desk collects', tone: 'bg-paper-2 text-slate', why: 'Cash payers are never messaged. Flagged for the front desk at next visit.', task: `Desk: collect £${f.amount} from ${f.name} at next visit` }
  if (/replaced/.test(f.reason)) return { action: 'Retry once', tone: 'bg-moss-soft text-moss', why: 'New card on file since the last failure; the old reason no longer applies.' }
  if (/mandate/i.test(f.reason) && f.monthsFailed >= 3) return { action: 'Cancel for review', tone: 'bg-signal/10 text-signal', why: `${f.monthsFailed} months failed, mandate dead, last visit ${f.lastVisitDays} days ago. Listed for a human decision, never auto cancelled.`, task: `Decide: cancel ${f.name}? ${f.monthsFailed} months unpaid, mandate cancelled` }
  if (/declined|incorrect/i.test(f.reason)) return { action: 'Contact: new card', tone: 'bg-amber-soft text-amber-ink', why: 'A declined card never fixes itself. SMS with a payment link and an ask to update the card in the app.', task: `Send card update link: ${f.name} (£${f.amount})` }
  if (/no payment method/i.test(f.reason)) return { action: 'Contact: set up DD', tone: 'bg-amber-soft text-amber-ink', why: 'Payment link for the arrears plus how to set up a Direct Debit at the club.', task: `Set up Direct Debit: ${f.name}, £${f.amount} arrears` }
  if (f.attempts >= 5) return { action: 'Stop retrying, chase', tone: 'bg-amber-soft text-amber-ink', why: `${f.attempts} attempts already. Hammering a card gets it blocked. Chase with a link instead.`, task: `Chase by message: ${f.name}, ${f.attempts} failed attempts` }
  if (f.lastAttemptDaysAgo === 0 || (f.lastAttemptDaysAgo === 1 && !friday)) return { action: 'Leave today', tone: 'bg-paper-2 text-slate', why: 'Attempted in the last two days. Next run.' }
  if (/insufficient/i.test(f.reason)) return { action: 'Retry once', tone: 'bg-moss-soft text-moss', why: `Temporary shortfall, ${f.lastAttemptDaysAgo} days since the last attempt${friday && f.lastAttemptDaysAgo === 1 ? ', and Friday is payday' : ''}.` }
  return { action: 'Contact', tone: 'bg-amber-soft text-amber-ink', why: 'Routed to a named action.', task: `Contact ${f.name} about £${f.amount}` }
}

type Stage = 'waiting' | 'reading' | 'decided' | 'submitting' | 'paid' | 'failed' | 'board' | 'skipped'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function RetryDemo() {
  const { addTask } = useDemoStore()
  const [friday, setFriday] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle')
  const [stage, setStage] = useState<Record<string, Stage>>({})
  const [log, setLog] = useState<string[]>([])
  const runId = useRef(0)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }) }, [log])

  const say = (s: string) => setLog((l) => [...l, s])
  const set = (name: string, s: Stage) => setStage((x) => ({ ...x, [name]: s }))

  async function run() {
    const id = ++runId.current
    const alive = () => runId.current === id
    setPhase('running'); setStage({}); setLog([])
    say(`Step 1  Reading ${FAILED.length} failed payments from the roster${friday ? ' (Friday: payday rule on)' : ''}.`)
    await sleep(700); if (!alive()) return
    say('Step 2  Reading each one: reason, attempts, days since the last try, months failed, whether they still train.')
    let paid = 0, paidValue = 0, failed = 0, board = 0, retried = 0
    for (const f of FAILED) {
      set(f.name, 'reading'); await sleep(450); if (!alive()) return
      const d = decide(f, friday)
      set(f.name, 'decided')
      say(`${f.name}: ${f.reason.toLowerCase()}, ${f.attempts} attempt${f.attempts === 1 ? '' : 's'}, last ${f.lastAttemptDaysAgo}d ago. Decision: ${d.action}.`)
      await sleep(500); if (!alive()) return
      if (d.action === 'Retry once') {
        retried++
        set(f.name, 'submitting'); say(`   Submitting one retry of £${f.amount} for ${f.name} to the bank.`)
        await sleep(900); if (!alive()) return
        if (f.bankSays === 'paid') { paid++; paidValue += f.amount; set(f.name, 'paid'); say(`   Bank: PAID £${f.amount}. ${f.name} is clear, noted on the profile.`) }
        else { failed++; set(f.name, 'failed'); say(`   Bank: FAILED again. No second attempt today; chase task added to the board under Contact members.`); addTask({ id: `p-${f.name}`, section: 'contact', title: `Chase by message: ${f.name}`, detail: `Retry of £${f.amount} failed again in the routine. Send a payment link, do not retry the card.`, via: 'routine' }) }
      } else if (d.action === 'Leave today') {
        set(f.name, 'skipped'); say(`   Left alone: tried in the last two days. Picked up at the next run.`)
      } else {
        board++
        set(f.name, 'board'); say(`   On the staff board, Contact members: ${d.task}.`)
        addTask({ id: `p-${f.name}`, section: 'contact', title: d.task!, detail: d.why, via: 'routine' })
      }
      await sleep(250); if (!alive()) return
    }
    say(`Done  ${retried} retried: ${paid} paid (£${paidValue.toFixed(2)} recovered), ${failed} failed and not retried again. ${board} handed to a person on the staff board. Next run in two days.`)
    setPhase('done')
  }

  const retried = FAILED.filter((f) => decide(f, friday).action === 'Retry once')
  const value = retried.reduce((t, f) => t + f.amount, 0)
  const paidValue = FAILED.filter((f) => stage[f.name] === 'paid').reduce((t, f) => t + f.amount, 0)

  const Result = ({ f }: { f: F }) => {
    const s = stage[f.name] ?? 'waiting'
    const d = decide(f, friday)
    if (s === 'waiting') return <span className="text-slate">{phase === 'idle' ? 'press Run' : 'queued'}</span>
    if (s === 'reading') return <span className="animate-pulse text-slate">reading</span>
    if (s === 'decided') return <span className="text-ink">decided</span>
    if (s === 'submitting') return <span className="animate-pulse text-moss">retry sent, awaiting the bank</span>
    if (s === 'paid') return <span className="inline-flex items-center gap-1 rounded-full bg-moss px-2 py-0.5 font-semibold text-paper">PAID £{f.amount}</span>
    if (s === 'failed') return <span className="inline-flex items-center gap-1 rounded-full bg-signal px-2 py-0.5 font-semibold text-paper">FAILED, not retried</span>
    if (s === 'skipped') return <span className="text-slate">left for the next run</span>
    return <span className="text-amber-ink">on the staff board</span>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-mist bg-white p-4">
        <button onClick={run} disabled={phase === 'running'} className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-paper disabled:opacity-60">{phase === 'running' ? 'Running' : phase === 'done' ? 'Run again' : 'Run the routine'}</button>
        <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={friday} onChange={(e) => { setFriday(e.target.checked); runId.current++; setPhase('idle'); setStage({}); setLog([]) }} className="accent-moss" />It is Friday (payday rule)</label>
        <span className="ml-auto font-mono text-sm text-ink">{phase === 'done' ? `£${paidValue.toFixed(2)} recovered` : `${retried.length} will be retried, worth £${value.toFixed(2)}`} · {FAILED.length - retried.length} to a person</span>
      </div>

      {log.length > 0 && (
        <div ref={logRef} className="max-h-56 overflow-y-auto rounded-2xl bg-ink p-4 font-mono text-[13px] leading-relaxed text-paper/92">
          {log.map((l, i) => (
            <p key={i} className={l.startsWith('Step') || l.startsWith('Done') ? 'text-lime' : l.includes('PAID') ? 'text-lime' : l.includes('FAILED') ? 'text-[#f0a89f]' : l.startsWith('   ') ? 'pl-4 text-paper/85' : ''}>{l}</p>
          ))}
          {phase === 'running' && <p className="animate-pulse text-paper/75">working</p>}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-mist bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-paper-2 text-left font-mono text-[11px] uppercase tracking-wider text-slate">
            <tr><th className="px-4 py-2.5 font-medium">Member</th><th className="px-4 py-2.5 font-medium">Failure</th><th className="px-4 py-2.5 font-medium">Decision</th><th className="px-4 py-2.5 font-medium">Result</th></tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {FAILED.map((f) => {
              const d = decide(f, friday)
              const s = stage[f.name] ?? 'waiting'
              const showDecision = s !== 'waiting' && s !== 'reading'
              return (
                <tr key={f.name} className={s === 'paid' ? 'bg-moss-soft/40' : s === 'failed' ? 'bg-signal/5' : s === 'reading' || s === 'submitting' ? 'bg-paper-2/60' : ''}>
                  <td className="px-4 py-2.5"><span className="font-semibold text-ink">{f.name}</span><span className="block text-xs text-slate">£{f.amount} · {f.method === 'dd' ? 'Direct Debit' : f.method} · last visit {f.lastVisitDays}d</span></td>
                  <td className="px-4 py-2.5 text-slate"><span className="block text-ink">{f.reason}</span><span className="text-xs">{f.attempts} attempts, last {f.lastAttemptDaysAgo}d ago, {f.monthsFailed} month{f.monthsFailed === 1 ? '' : 's'}</span></td>
                  <td className="px-4 py-2.5">{showDecision ? <><span className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${d.tone}`}>{d.action}</span><span className="block text-xs text-slate">{d.why}</span></> : <span className="text-xs text-slate">{s === 'reading' ? 'reading' : 'waiting'}</span>}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs"><Result f={f} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-slate">Retries run unattended Monday, Wednesday and Friday. One retry, never within two days of the last, never a sixth attempt. Anything that needs a message or a cancellation is drafted and put on the staff board above for a person, never sent on its own. This routine took the Hertfordshire club&apos;s failed book from about 10% to 3.6%.</p>
    </div>
  )
}
