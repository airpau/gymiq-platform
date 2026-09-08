/**
 * The audit report, rendered from AuditInsights.
 *
 * Reads top to bottom like the morning brief: the verdict, the money, then the
 * evidence section by section, then what to do. Sections the export could not
 * support are shown as a plain sentence, never as invented numbers.
 */
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { AuditInsights, Sense } from '@/lib/services/audit-insights'
import NamedRowList from './NamedRowList'

interface Props {
  insights: AuditInsights
  gymName: string
  firstName: string
  createdAt: Date
  isPreview?: boolean
  auditId?: string
}

const CONTACT = 'paul@gymiq.ai'
const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`
const pct = (n: number, dp = 0) => `${(n * 100).toFixed(dp)}%`
const walkthrough = (gym: string) =>
  `mailto:${CONTACT}?subject=${encodeURIComponent(`gymIQ walkthrough for ${gym}`)}`

export default function AuditInsightsView({ insights: i, gymName, firstName, createdAt, isPreview, auditId }: Props) {
  return (
    <div className="min-h-screen bg-white text-ink antialiased">
      <Nav gymName={gymName} />
      {isPreview && (
        <div className="border-b border-amber-200 bg-amber-50/80 px-5 py-2.5 text-center text-xs text-amber-900">
          Preview: this report lives in your browser only. Close the tab and it is gone.
        </div>
      )}

      <main className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <Header i={i} gymName={gymName} firstName={firstName} createdAt={createdAt} />
        <Verdict i={i} />
        <Money i={i} />
        <Membership i={i} />
        <Payments i={i} />
        <Endings i={i} />
        <Pricing i={i} />
        <Age i={i} />
        <Engagement i={i} />
        <Joiners i={i} />
        <TenureAndLeavers i={i} />
        <Benchmarks i={i} />
        <Actions i={i} />
        <Cta i={i} gymName={gymName} auditId={auditId} />
        <Basis i={i} />
      </main>
    </div>
  )
}

/* ── chrome ─────────────────────────────────────────────────────────────── */

function Nav({ gymName }: { gymName: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-mist bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight text-ink">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-moss to-moss-deep text-[11px] font-bold text-white shadow-sm">IQ</span>
          gymIQ
        </Link>
        <a
          href={walkthrough(gymName)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-ink-2"
        >
          Get this every morning
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </header>
  )
}

function Header({ i, gymName, firstName, createdAt }: { i: AuditInsights; gymName: string; firstName: string; createdAt: Date }) {
  return (
    <section className="pt-12 sm:pt-16">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-moss">Membership file audit</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{gymName}</h1>
      <p className="mt-2 text-sm text-slate">
        For {firstName}, {createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. {i.basis.rows.toLocaleString('en-GB')} rows read,{' '}
        {i.membership.roster.toLocaleString('en-GB')} live members. Private link.
      </p>
    </section>
  )
}

function H2({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mt-16 max-w-3xl">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-moss">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h2>
      {sub && <p className="mt-3 text-base leading-relaxed text-slate">{sub}</p>}
    </div>
  )
}

function NotComputed({ what, needs }: { what: string; needs: string }) {
  return (
    <p className="mt-6 max-w-3xl rounded-xl border border-dashed border-mist bg-paper-2 px-5 py-4 text-sm text-slate">
      {what} was not computed because the export has no {needs} column. Export the memberships report with every column selected (in Glofox that is Reports, Memberships) and it will appear.
    </p>
  )
}

function Tiles({ items }: { items: Array<{ label: string; value: string; hint?: string; sense?: Sense }> }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-mist bg-mist md:grid-cols-4">
      {items.map((t) => (
        <div key={t.label} className="bg-white px-5 py-5">
          <p className={`text-2xl font-semibold tracking-tight ${t.sense === 'good' ? 'text-moss' : t.sense === 'bad' ? 'text-signal' : 'text-ink'}`}>{t.value}</p>
          <p className="mt-1 text-sm font-medium text-ink-3">{t.label}</p>
          {t.hint && <p className="mt-1 text-xs leading-relaxed text-slate">{t.hint}</p>}
        </div>
      ))}
    </div>
  )
}

function Table({ head, rows, align = [] }: { head: string[]; rows: Array<Array<string | number>>; align?: Array<'l' | 'r'> }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-mist">
      <table className="min-w-full divide-y divide-mist text-sm">
        <thead className="bg-paper-2 text-left text-xs uppercase tracking-wide text-slate">
          <tr>
            {head.map((h, idx) => (
              <th key={h} className={`px-5 py-2.5 font-medium ${align[idx] === 'r' ? 'text-right' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-mist bg-white">
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => (
                <td key={ci} className={`px-5 py-2.5 ${align[ci] === 'r' ? 'text-right font-mono tabular-nums text-ink' : 'text-ink-3'}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Bars({ rows, max }: { rows: Array<{ label: string; value: number; sub?: string; tone?: string }>; max?: number }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="mt-6 space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[1fr_auto] items-center gap-3 sm:grid-cols-[220px_1fr_auto]">
          <div className="text-sm text-ink-3">{r.label}</div>
          <div className="col-span-2 h-2.5 overflow-hidden rounded-full bg-paper-2 sm:col-span-1">
            <div className={`h-full rounded-full ${r.tone ?? 'bg-emerald-600'}`} style={{ width: `${Math.max(2, (r.value / m) * 100)}%` }} />
          </div>
          <div className="text-right font-mono text-sm tabular-nums text-ink">
            {r.value.toLocaleString('en-GB')}
            {r.sub && <span className="ml-2 text-xs text-slate">{r.sub}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── sections ───────────────────────────────────────────────────────────── */

function Verdict({ i }: { i: AuditInsights }) {
  const m = i.membership
  const top = i.money.items[0]
  const lines: string[] = []
  lines.push(`${m.roster.toLocaleString('en-GB')} live members billing ${gbp(m.mrr)} a month, ${gbp(m.arpu)} a head.`)
  if (i.money.totalMonthly > 0) lines.push(`About ${gbp(i.money.totalMonthly)} a month, ${gbp(i.money.totalAnnual)} a year, is sitting in this file waiting to be collected, renewed or repriced. Nothing below needs a new member.`)
  if (top) lines.push(`The biggest single item: ${top.label.toLowerCase()}, worth about ${gbp(top.monthly)} a month.`)
  if (i.engagement.available) {
    const dormant = i.engagement.bands.filter((b) => ['dormant', 'sleeper'].includes(b.key)).reduce((t, b) => t + b.count, 0)
    lines.push(`${dormant.toLocaleString('en-GB')} paying members have not visited in 30 days or more. They are not lost, but they are how attrition starts.`)
  }
  return (
    <section className="mt-10 rounded-2xl bg-ink p-7 text-white sm:p-9">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-lime">Verdict</p>
      <div className="mt-3 space-y-3 text-lg leading-relaxed">
        {lines.map((l, idx) => (
          <p key={idx} className={idx === 0 ? 'font-semibold text-white' : 'text-paper/85'}>{l}</p>
        ))}
      </div>
      <p className="mt-5 text-xs text-slate">
        Data confidence {i.basis.confidence}. {i.basis.columnsMissing.length ? `Missing: ${i.basis.columnsMissing.join(', ')}.` : 'Every column gymIQ looks for was present.'}
      </p>
    </section>
  )
}

function Money({ i }: { i: AuditInsights }) {
  if (!i.money.items.length) return null
  return (
    <section>
      <H2 eyebrow="Money on the table" title={`${gbp(i.money.totalMonthly)} a month, without selling a membership.`} sub="Each line is a specific list of named members further down this page. Measured means it is in the file; estimated applies the recovery rates seen at a live club." />
      <Table
        head={['What', 'A month', 'A year', 'How', 'Basis']}
        align={['l', 'r', 'r', 'l', 'l']}
        rows={i.money.items.map((it) => [it.label, gbp(it.monthly), gbp(it.annual), it.how, it.confidence])}
      />
    </section>
  )
}

function Membership({ i }: { i: AuditInsights }) {
  const m = i.membership
  return (
    <section>
      <H2 eyebrow="The membership picture" title="Who is on the books and what they pay." />
      <Tiles
        items={[
          { label: 'Live members', value: m.roster.toLocaleString('en-GB'), hint: `${m.active} active, ${m.paused} paused, ${m.overdue} overdue` },
          { label: 'Monthly run rate', value: gbp(m.mrr), hint: `${gbp(m.arr)} a year. Annual plans spread over 12.` },
          { label: 'Per paying member', value: `£${m.arpu.toFixed(2)}`, hint: m.medianFee !== null ? `Median fee £${m.medianFee.toFixed(2)}` : undefined },
          { label: 'Active share', value: pct(m.activeShare, 1), hint: 'Active as a share of live. 93% is the target.', sense: m.activeShare >= 0.93 ? 'good' : m.activeShare >= 0.9 ? 'mid' : 'bad' },
        ]}
      />
      <p className="mt-5 max-w-3xl text-sm leading-relaxed text-slate">
        One point of monthly attrition on this roster is {gbp(m.valueOfOnePoint)} a month of billing that has to be re-sold. {m.concessionCount > 0 && `${m.concessionCount} members (${gbp(m.concessionMonthly)} a month) are on a concession: student, corporate, staff or similar.`} {m.annualUpfront > 0 && `${m.annualUpfront} paid annually up front, counted here at ${gbp(m.annualUpfrontMonthly)} a month.`}
      </p>
      <Table
        head={['Plan', 'Members', 'Share', 'Avg a month', 'Monthly']}
        align={['l', 'r', 'r', 'r', 'r']}
        rows={i.plans.map((p) => [p.name + (p.concession ? ' (concession)' : '') + (p.annualUpfront ? ' (annual)' : ''), p.count, pct(p.share), `£${p.avgMonthly.toFixed(2)}`, gbp(p.monthly)])}
      />
    </section>
  )
}

function Payments({ i }: { i: AuditInsights }) {
  const p = i.payments
  return (
    <section>
      <H2 eyebrow="Collection" title="Where the failed payments live." sub="Overdue is money already sold. The payment method decides how often it bounces." />
      {!p.available ? (
        <NotComputed what="The payment method split" needs="payment type" />
      ) : (
        <>
          <Tiles
            items={[
              { label: 'Overdue members', value: p.overdueCount.toLocaleString('en-GB'), hint: `${gbp(p.overdueMonthly)} a month outstanding`, sense: p.overdueCount / Math.max(1, i.membership.roster) <= 0.04 ? 'good' : 'bad' },
              { label: 'Card against Direct Debit', value: p.cardVsDirectDebit !== null ? `${p.cardVsDirectDebit}x` : 'n/a', hint: 'How much more often card payers fail' },
              { label: 'Overdue at the DD rate', value: p.overdueIfAllDirectDebit !== null ? p.overdueIfAllDirectDebit.toLocaleString('en-GB') : 'n/a', hint: 'If every member failed as rarely as Direct Debit' },
              { label: 'Training unbilled', value: p.unbilledCount.toLocaleString('en-GB'), hint: `${gbp(p.unbilledMonthly)} a month with no next payment`, sense: p.unbilledCount === 0 ? 'good' : 'bad' },
            ]}
          />
          <Table
            head={['Method', 'Members', 'Overdue', 'Failure rate', 'Monthly']}
            align={['l', 'r', 'r', 'r', 'r']}
            rows={p.byMethod.map((b) => [b.label, b.members, b.overdue, pct(b.overdueRate, 1), gbp(b.monthly)])}
          />
          <div className="mt-6 grid grid-cols-1 gap-6">
            <NamedRowList title="Overdue, most recoverable first" subtitle="Recent attenders with a broken payment are worth a call today. Cash payers settle at the desk." rows={p.overdueList} />
            <NamedRowList title="Active with no next payment scheduled" subtitle="Training, on a priced plan, and nothing is due. Restart billing." rows={p.unbilledList} emptyText="Every active member has a next payment date. Clean." />
          </div>
        </>
      )}
    </section>
  )
}

function Endings({ i }: { i: AuditInsights }) {
  const e = i.endings
  return (
    <section>
      <H2 eyebrow="Term endings" title="Memberships running out with nobody asking them to stay." sub="An end date with no renewal is a renewals list, not a billing fault. Ask, and about four in ten stay." />
      {!e.available ? (
        <NotComputed what="The endings list" needs="end date" />
      ) : (
        <>
          <Tiles
            items={[
              { label: 'Ending in 30 days', value: e.next30.count.toLocaleString('en-GB'), hint: `${gbp(e.next30.monthly)} a month` },
              { label: 'Ending in 60 days', value: e.next60.count.toLocaleString('en-GB'), hint: `${gbp(e.next60.monthly)} a month` },
              { label: 'Ending in 90 days', value: e.next90.count.toLocaleString('en-GB'), hint: `${gbp(e.next90.monthly)} a month` },
              { label: 'Still training', value: e.stillTraining30.toLocaleString('en-GB'), hint: 'Of the 30 day group, visited in the last fortnight' },
            ]}
          />
          <div className="mt-6">
            <NamedRowList title="Ending in the next 90 days" subtitle="Earliest first. Call the ones still visiting before the ones who have gone quiet." rows={e.list} emptyText="No memberships end in the next 90 days." />
          </div>
        </>
      )}
    </section>
  )
}

function Pricing({ i }: { i: AuditInsights }) {
  const p = i.pricing
  return (
    <section>
      <H2 eyebrow="Pricing" title="What members pay against what a joiner pays today." sub={p.note} />
      {!p.available ? (
        <NotComputed what="The pricing gap" needs="price paid" />
      ) : (
        <>
          <Tiles
            items={[
              { label: 'Below current price', value: p.belowCurrentTotal.toLocaleString('en-GB'), hint: 'Standard rate members paying less than today’s joiner' },
              { label: 'Gap a month', value: gbp(p.gapMonthlyTotal), hint: `${gbp(p.gapMonthlyTotal * 12)} a year at list` },
              { label: 'Legacy plans', value: p.legacyPlanMembers.toLocaleString('en-GB'), hint: 'On an imported or private plan name' },
              { label: 'Price points in use', value: p.distinctPricePoints.toLocaleString('en-GB'), hint: 'Distinct monthly amounts across paying members' },
            ]}
          />
          <Table
            head={['Tier', 'Members', 'Current price', 'Below it', 'Lowest paid', 'Gap a month']}
            align={['l', 'r', 'r', 'r', 'r', 'r']}
            rows={p.tiers.map((t) => [t.tier, t.members, t.currentPrice !== null ? `£${t.currentPrice.toFixed(2)}` : 'n/a', t.belowCurrent, t.lowestPaid !== null ? `£${t.lowestPaid.toFixed(2)}` : 'n/a', gbp(t.gapMonthly)])}
          />
        </>
      )}
    </section>
  )
}

function Age({ i }: { i: AuditInsights }) {
  const a = i.age
  return (
    <section>
      <H2 eyebrow="Age and eligibility" title="Who has outgrown the rate they are on." sub="Student and junior rates leak as members have birthdays. It refills every month unless someone checks." />
      {!a.available ? (
        <NotComputed what="The age check" needs="date of birth" />
      ) : (
        <>
          <Tiles
            items={[
              { label: 'Students past the age for their rate', value: a.studentsAgedOut.toLocaleString('en-GB'), hint: `${gbp(a.studentsAgedOutMonthly)} a month short of the next rate`, sense: a.studentsAgedOut === 0 ? 'good' : 'bad' },
              { label: 'Turn 19 within 90 days', value: a.studentsTurning19In90.toLocaleString('en-GB'), hint: 'On an under 19 rate now' },
              { label: 'Students aged 25 or over', value: a.studentsOver25.toLocaleString('en-GB'), hint: 'Worth asking for proof of study' },
              { label: 'Median member age', value: a.medianAge !== null ? `${a.medianAge}` : 'n/a', hint: `Date of birth on ${pct(a.dobCoverage)} of the roster` },
            ]}
          />
          <Bars rows={a.ageBands.map((b) => ({ label: b.label, value: b.count, sub: pct(b.share) }))} />
          {a.list.length > 0 && (
            <div className="mt-6">
              <NamedRowList title="Student rates to review" subtitle="Aged out of an under 19 rate, or 25 and over on a student plan." rows={a.list} />
            </div>
          )}
        </>
      )}
    </section>
  )
}

function Engagement({ i }: { i: AuditInsights }) {
  const e = i.engagement
  const tone: Record<string, string> = { healthy: 'bg-emerald-600', drifting: 'bg-amber-500', atRisk: 'bg-orange-500', dormant: 'bg-red-500', sleeper: 'bg-red-700', never: 'bg-paper-20', noData: 'bg-zinc-300' }
  return (
    <section>
      <H2 eyebrow="Engagement" title="Who is drifting, measured against their own habit." sub="A flat 30 day rule calls a twice a year member dormant and a daily member healthy after three weeks away. gymIQ measures each member against their own pattern." />
      {!e.available ? (
        <NotComputed what="The engagement picture" needs="last visit" />
      ) : (
        <>
          <Tiles
            items={[
              { label: 'Habit broken', value: e.habitBroken.toLocaleString('en-GB'), hint: `${gbp(e.habitBrokenMonthly)} a month. Away at least twice their usual gap.` },
              { label: 'Leave alone', value: e.leaveAlone.toLocaleString('en-GB'), hint: `${gbp(e.leaveAloneMonthly)} a month. Long tenured, low use, happy paying.` },
              { label: 'Median days since visit', value: e.medianDaysSinceVisit !== null ? `${e.medianDaysSinceVisit}` : 'n/a', hint: e.medianVisitsPerMonth !== null ? `Median ${e.medianVisitsPerMonth} visits a month` : undefined },
              { label: 'Never visited', value: e.neverVisited.toLocaleString('en-GB'), hint: `${e.powerUsers} members visit 12 or more times a month` },
            ]}
          />
          <Bars rows={e.bands.map((b) => ({ label: b.label, value: b.count, sub: gbp(b.monthly), tone: tone[b.key] }))} />
          <div className="mt-6">
            <NamedRowList title="Drifting, 14 to 29 days" subtitle="The window where a check in still works. Book them in; do not mention price or billing." rows={e.driftingList} emptyText="Nobody in the drifting window right now." />
          </div>
        </>
      )}
    </section>
  )
}

function Joiners({ i }: { i: AuditInsights }) {
  const j = i.joiners
  return (
    <section>
      <H2 eyebrow="Joiners" title="How the last twelve months sold, and who joined and never came." />
      {!j.available ? (
        <NotComputed what="The joiner history" needs="join or commenced date" />
      ) : (
        <>
          <Tiles
            items={[
              { label: 'Joined in the last 30 days', value: j.last30.toLocaleString('en-GB'), hint: `${j.last90} in the last 90` },
              { label: 'Average a month', value: j.avgPerMonth !== null ? `${j.avgPerMonth}` : 'n/a', hint: j.bestMonth ? `Best ${j.bestMonth}, weakest ${j.worstMonth}` : undefined },
              { label: 'New, no visit yet', value: j.newNoVisit.toLocaleString('en-GB'), hint: `${gbp(j.newNoVisitMonthly)} a month at month two risk`, sense: j.newNoVisit === 0 ? 'good' : 'bad' },
              { label: 'New, one visit', value: j.newOneVisit.toLocaleString('en-GB'), hint: 'Came once. Needs a second reason.' },
            ]}
          />
          <JoinChart rows={j.byMonth} />
          <div className="mt-6">
            <NamedRowList title="Joined in the last 30 days, no visit" subtitle="Onboarding is where tenure is made. A call, an induction, a named trainer." rows={j.newList} emptyText="Every recent joiner has been in. Good onboarding." />
          </div>
        </>
      )}
    </section>
  )
}

function JoinChart({ rows }: { rows: Array<{ label: string; joins: number }> }) {
  const w = 720, h = 220, pad = 36
  const max = Math.max(1, ...rows.map((r) => r.joins))
  const bw = (w - pad * 2) / rows.length
  return (
    <figure className="mt-6 overflow-x-auto rounded-2xl border border-mist bg-white p-4">
      <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full min-w-[520px]" role="img" aria-label="Joiners by month, last twelve months">
        {rows.map((r, idx) => {
          const bh = (r.joins / max) * (h - pad * 2)
          const x = pad + idx * bw + bw * 0.15
          const last = idx === rows.length - 1
          return (
            <g key={r.label}>
              <rect x={x} y={h - pad - bh} width={bw * 0.7} height={bh} fill={last ? '#A1A1AA' : '#047857'} opacity={last ? 0.6 : 0.85} />
              <text x={x + bw * 0.35} y={h - pad - bh - 6} textAnchor="middle" fontSize="11" fill="#18181B" fontFamily="ui-monospace, Menlo, monospace">{r.joins}</text>
              <text x={x + bw * 0.35} y={h - pad + 16} textAnchor="middle" fontSize="11" fill="#52525B">{r.label}</text>
            </g>
          )
        })}
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#D4D4D8" />
      </svg>
      <figcaption className="mt-2 text-xs text-slate">The current month is partial and shown in grey.</figcaption>
    </figure>
  )
}

function TenureAndLeavers({ i }: { i: AuditInsights }) {
  const t = i.tenure
  const l = i.leavers
  return (
    <section>
      <H2 eyebrow="Tenure and leavers" title="How long members stay, and how fast they go." />
      {!t.available ? (
        <NotComputed what="Tenure" needs="join date" />
      ) : (
        <>
          <Tiles
            items={[
              { label: 'Median tenure', value: t.medianMonths !== null ? `${t.medianMonths} mo` : 'n/a', hint: t.p25Months !== null ? `Quarter under ${t.p25Months} months, quarter over ${t.p75Months}` : undefined },
              { label: 'Under six months', value: t.underSixMonthsShare !== null ? pct(t.underSixMonthsShare) : 'n/a', hint: 'The cohort that churns' },
              { label: 'Over two years', value: t.overTwoYearsShare !== null ? pct(t.overTwoYearsShare) : 'n/a', hint: 'The loyal core' },
              { label: 'Monthly attrition', value: l.impliedMonthlyAttrition !== null ? `${l.impliedMonthlyAttrition}%` : 'n/a', hint: l.impliedMonthlyAttrition !== null ? `About ${gbp(l.monthlyValueLost ?? 0)} a month lost` : 'Needs cancelled members with end dates in the export' },
            ]}
          />
          <Bars rows={t.bands.map((b) => ({ label: b.label, value: b.count, sub: gbp(b.monthly) }))} />
          {l.twelveMonthSurvival !== null && (
            <p className="mt-4 max-w-3xl text-sm text-slate">Of members who joined 12 to 15 months ago, {l.twelveMonthSurvival}% are still on the books.</p>
          )}
        </>
      )}
      {i.paused.count > 0 && (
        <p className="mt-6 max-w-3xl rounded-xl bg-paper-2 px-5 py-4 text-sm text-ink-3">
          <strong>Paused.</strong> {i.paused.count} memberships on hold, {gbp(i.paused.monthly)} a month. {i.paused.resumingNext30} resume within 30 days; {i.paused.noEndDate} have no end date on the pause, which is usually a cancellation nobody processed.
        </p>
      )}
    </section>
  )
}

function Benchmarks({ i }: { i: AuditInsights }) {
  const senseClass: Record<Sense, string> = { good: 'text-moss', mid: 'text-amber', bad: 'text-signal', na: 'text-slate' }
  return (
    <section>
      <H2 eyebrow="Benchmarks" title="Against a live club and the industry." sub="The live club is an énergie Fitness franchise in Hertfordshire with 1,600 members, running gymIQ since July 2026. Every figure is from its own data." />
      <div className="mt-6 overflow-x-auto rounded-2xl border border-mist">
        <table className="min-w-full divide-y divide-mist text-sm">
          <thead className="bg-paper-2 text-left text-xs uppercase tracking-wide text-slate">
            <tr>
              <th className="px-5 py-2.5 font-medium">Metric</th>
              <th className="px-5 py-2.5 font-medium">You</th>
              <th className="px-5 py-2.5 font-medium">Live club</th>
              <th className="px-5 py-2.5 font-medium">Industry</th>
              <th className="px-5 py-2.5 font-medium">Read</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mist bg-white">
            {i.benchmarks.map((b) => (
              <tr key={b.metric}>
                <td className="px-5 py-3 font-medium text-ink">{b.metric}</td>
                <td className={`px-5 py-3 font-mono tabular-nums ${senseClass[b.sense]}`}>{b.yours}</td>
                <td className="px-5 py-3 text-slate">{b.hoddesdon}</td>
                <td className="px-5 py-3 text-slate">{b.industry}</td>
                <td className="px-5 py-3 text-slate">{b.hint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Actions({ i }: { i: AuditInsights }) {
  return (
    <section>
      <H2 eyebrow="What to do" title="This week, in order." sub="Each of these is a named list on this page. Money hour first, every day, before 10:30." />
      <ol className="mt-6 space-y-3">
        {i.actions.map((a, idx) => (
          <li key={a.title} className="grid grid-cols-[auto_1fr] gap-4 rounded-2xl border border-mist bg-white p-5">
            <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">{idx + 1}</span>
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold tracking-tight text-ink">{a.title}</h3>
                {a.monthly !== null && a.monthly > 0 && <span className="font-mono text-sm tabular-nums text-moss">about {gbp(a.monthly)} a month</span>}
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate">{a.body}</p>
              <p className="mt-2 text-xs text-slate">{a.who} · {a.when}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Cta({ i, gymName, auditId }: { i: AuditInsights; gymName: string; auditId?: string }) {
  return (
    <section className="mt-16 rounded-3xl border border-mist bg-gradient-to-br from-zinc-50 via-white to-emerald-50/60 p-8 sm:p-12">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-moss">This was one morning</p>
      <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        gymIQ does this every day at 06:00, puts the calls on a board your desk can clear, and tells you what Friday will pay.
      </h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate">
        {i.money.totalMonthly > 0 ? `About ${gbp(i.money.totalMonthly)} a month is on this page. ` : ''}One set fee per club, £495 a month including a monthly business review, no setup fee and no usage charges. Each club connects its own Glofox login, read only. Live within a week.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <a href={walkthrough(gymName)} className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-2">
          Book a 20 minute walkthrough
          <ArrowRight className="h-4 w-4" />
        </a>
        {auditId && (
          <Link href={`/auth/signup?audit=${auditId}`} className="inline-flex items-center gap-2 rounded-xl border border-mist bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-paper-2">
            Have gymIQ work these lists
          </Link>
        )}
        <Link href="/case-study" className="text-sm font-medium text-moss hover:text-moss">See the live club&apos;s numbers</Link>
      </div>
    </section>
  )
}

function Basis({ i }: { i: AuditInsights }) {
  return (
    <section className="mt-12 text-xs text-slate">
      <p>
        Read from {i.basis.rows.toLocaleString('en-GB')} rows on {new Date(i.basis.asOf).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Columns found: {i.basis.columnsFound.join(', ') || 'none'}.
        {i.basis.columnsMissing.length > 0 && ` Not found: ${i.basis.columnsMissing.join(', ')}.`}
      </p>
      {i.basis.notes.map((n) => (
        <p key={n} className="mt-1">{n}</p>
      ))}
      <p className="mt-1">Names and contact details are shown to you only and masked in this view. The file itself is not kept.</p>
    </section>
  )
}
