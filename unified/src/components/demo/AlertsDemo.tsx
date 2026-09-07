'use client'

/**
 * Where it reaches you, and who sees what. Pick a role and a channel and see
 * the exact message that person gets. Owners see money; managers see
 * performance and the board; the desk sees today's names, nothing else.
 */
import { useState } from 'react'

type Role = 'owner' | 'manager' | 'desk'
type Channel = 'whatsapp' | 'telegram' | 'email' | 'sms'

const ROLES: Array<{ key: Role; label: string; sees: string }> = [
  { key: 'owner', label: 'Owner', sees: 'Everything: collected, banked, Friday forecast, failure rate, joins against target, the board by name, the monthly review pack.' },
  { key: 'manager', label: 'Manager', sees: 'Performance and operations: joins, leavers, overdue count, the board and who cleared it, the drifting list. No bank balances, no franchise fees.' },
  { key: 'desk', label: 'Front desk', sees: 'Today only: who to call, who is ending, tours to confirm, leads to ring. No revenue, no forecasts.' },
]

const MESSAGES: Record<Role, Record<'morning' | 'alert' | 'evening', string>> = {
  owner: {
    morning: `Riverside 06:00: £26,414 collected MTD, 1,472 active paying. Failure rate 6.77%. Friday forecast £20,471. Joins project 77 v 100. Board: 12 calls, 6 fixes, 46 queued. TOP: £1,884 of arrears clears onto Friday if worked by Wed.`,
    alert: `13:10 Riverside: weekday joins at 1 against 4.2 expected by now, third day under half of pace. Check the join zone and the website price before evening footfall.`,
    evening: `Riverside 22:00: £27,120 MTD. 3 joins, 1 leaver, £706 in. Board 9 of 25: Dan 7, Rachel 2, Israel 0. Overdue 56. Friday £20,650. Nothing needs you tonight.`,
  },
  manager: {
    morning: `Riverside 06:00: 20 joins MTD against 100 target, 7 leavers. Overdue 58, 12 on today's board plus 6 billing fixes and 2 ending this week. 5 drifting members to call. Leads unlogged since 19 Aug: please log them.`,
    alert: `13:10 Riverside: joins are 1 against 4.2 expected today. Please do a test join on the website and check the desk is confirming tours.`,
    evening: `Riverside 22:00: board 9 of 25 cleared, Dan 7, Rachel 2, Israel 0. 3 joins, 1 leaver. 16 money hour tasks roll to tomorrow. Billy B ends Wednesday, not yet called.`,
  },
  desk: {
    morning: `Riverside, Mon 7 Sep. Money hour before 10:30: Mercedes W, Callum B, Tanya B, Yomi W + 8 more on the board. Ending Wed: Billy B, ring today. 2 tours to confirm. Open the board with your PIN.`,
    alert: `13:10 Riverside: new lead Alex from the website, ring within the hour. Trial reserved tomorrow evening.`,
    evening: `Riverside 18:00 reminder: send the six line end of day report. Sales, money calls, billing fixes, leads, retention, club.`,
  },
}

const CHANNELS: Array<{ key: Channel; label: string; note: string }> = [
  { key: 'whatsapp', label: 'WhatsApp', note: 'One to one to named staff. Group posting is not offered by the official API, so groups use Telegram.' },
  { key: 'telegram', label: 'Telegram', note: 'Owner and staff group. Reply to any message and get an answer. Where Hoddesdon runs.' },
  { key: 'email', label: 'Email', note: 'The full brief with the workings, and the monthly review pack.' },
  { key: 'sms', label: 'SMS', note: 'Alerts only, no full briefs. For a manager who does not use messaging apps.' },
]

export default function AlertsDemo() {
  const [role, setRole] = useState<Role>('owner')
  const [channel, setChannel] = useState<Channel>('whatsapp')
  const [which, setWhich] = useState<'morning' | 'alert' | 'evening'>('morning')
  const r = ROLES.find((x) => x.key === role)!
  const c = CHANNELS.find((x) => x.key === channel)!
  const text = MESSAGES[role][which]

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="rounded-2xl border border-mist bg-white p-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate">Who</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ROLES.map((x) => (
              <button key={x.key} onClick={() => setRole(x.key)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${role === x.key ? 'bg-ink text-paper' : 'border border-mist text-ink'}`}>{x.label}</button>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate">{r.sees}</p>
        </div>
        <div className="rounded-2xl border border-mist bg-white p-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate">Where</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CHANNELS.map((x) => (
              <button key={x.key} onClick={() => setChannel(x.key)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${channel === x.key ? 'bg-ink text-paper' : 'border border-mist text-ink'}`}>{x.label}</button>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate">{c.note}</p>
        </div>
        <div className="rounded-2xl border border-mist bg-white p-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate">When</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['morning', 'alert', 'evening'] as const).map((k) => (
              <button key={k} onClick={() => setWhich(k)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${which === k ? 'bg-ink text-paper' : 'border border-mist text-ink'}`}>{k === 'morning' ? '06:00 brief' : k === 'alert' ? 'Mid day alert' : '22:00 close'}</button>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate">Every message is the same underlying read of the club, cut to what that person is responsible for. Nobody has to go looking; nobody sees what is not theirs.</p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[360px]">
        <div className={`rounded-[30px] p-3 ${channel === 'whatsapp' ? 'bg-[#0b141a]' : channel === 'telegram' ? 'bg-[#17212b]' : channel === 'email' ? 'bg-ink' : 'bg-[#1c1c1e]'}`}>
          <div className="px-2 pb-2 pt-1 font-mono text-[11px] text-paper/50">{c.label} · {r.label}</div>
          <div className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${channel === 'whatsapp' ? 'bg-[#1f2c34] text-paper' : channel === 'telegram' ? 'bg-[#182533] text-paper' : channel === 'email' ? 'bg-paper text-ink' : 'bg-[#2c2c2e] text-paper'}`}>
            {channel === 'email' && <p className="mb-2 border-b border-mist pb-2 font-semibold">gymIQ: Riverside, {which === 'morning' ? 'morning brief' : which === 'alert' ? 'alert' : 'evening close'}</p>}
            <p className="whitespace-pre-wrap font-mono text-[12px]">{text}</p>
            <p className={`mt-2 text-right text-[10px] ${channel === 'email' ? 'text-slate' : 'text-paper/40'}`}>{which === 'morning' ? '06:00' : which === 'alert' ? '13:10' : '22:00'}</p>
          </div>
          {channel !== 'email' && channel !== 'sms' && (
            <div className="mt-2 rounded-full bg-black/30 px-4 py-2 font-mono text-[11px] text-paper/50">Reply here and it answers</div>
          )}
        </div>
      </div>
    </div>
  )
}
