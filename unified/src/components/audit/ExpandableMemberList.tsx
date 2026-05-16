'use client'

import { useState } from 'react'
import type { ScoredMember } from '@/lib/services/audit-analysis'
import { maskEmail } from '@/lib/services/audit-analysis'

const INITIAL_VISIBLE = 25
const PAGE = 50

interface Props {
  title: string
  subtitle: string
  Icon: React.ComponentType<{ className?: string }>
  members: ScoredMember[]
  column: 'daysSinceLastVisit' | 'daysOverdue' | 'riskScore'
  columnLabel: string
}

export default function ExpandableList({
  title,
  subtitle,
  Icon,
  members,
  column,
  columnLabel,
}: Props) {
  const [visible, setVisible] = useState(INITIAL_VISIBLE)
  const total = members.length
  const showAll = visible >= total

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Icon className="h-4 w-4 text-zinc-400" />
          {title}
        </div>
        <p className="mt-1.5 text-sm text-zinc-500">{subtitle}</p>
        <p className="mt-4 text-sm text-emerald-700">Nothing to flag in this category. Nice.</p>
      </div>
    )
  }

  const rows = members.slice(0, visible)

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-100 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Icon className="h-4 w-4 text-zinc-400" />
          {title}
          <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600">
            {total.toLocaleString('en-GB')}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-zinc-500">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-100">
          <thead className="bg-zinc-50/60">
            <tr>
              <Th>Member</Th>
              <Th>Email</Th>
              <Th className="hidden sm:table-cell">Status</Th>
              <Th className="hidden md:table-cell">Plan</Th>
              <Th className="text-right">{columnLabel}</Th>
              <Th className="text-right">Risk</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((m, i) => (
              <tr key={i} className="hover:bg-zinc-50/60">
                <Td className="font-medium text-zinc-900">{m.name ?? '—'}</Td>
                <Td className="text-zinc-500">{m.email ? maskEmail(m.email) : '—'}</Td>
                <Td className="hidden capitalize text-zinc-600 sm:table-cell">{m.status}</Td>
                <Td className="hidden text-zinc-600 md:table-cell">{m.membershipType ?? '—'}</Td>
                <Td className="text-right tabular-nums text-zinc-700">
                  {column === 'daysSinceLastVisit'
                    ? m.daysSinceLastVisit ?? '—'
                    : column === 'daysOverdue'
                    ? (m.daysOverdue ?? (m.paymentFailed ? 'failed' : '—'))
                    : m.riskScore}
                </Td>
                <Td className="text-right">
                  <RiskBadge band={m.riskBand} score={m.riskScore} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!showAll && (
        <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/60 px-5 py-3">
          <p className="text-xs text-zinc-500">
            Showing <span className="font-medium text-zinc-700">{visible}</span> of {total.toLocaleString('en-GB')}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVisible((v) => Math.min(v + PAGE, total))}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              Show next {Math.min(PAGE, total - visible)}
            </button>
            <button
              type="button"
              onClick={() => setVisible(total)}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800"
            >
              Show all {total.toLocaleString('en-GB')}
            </button>
          </div>
        </div>
      )}
      {showAll && total > INITIAL_VISIBLE && (
        <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/60 px-5 py-3">
          <p className="text-xs text-zinc-500">
            Showing all <span className="font-medium text-zinc-700">{total.toLocaleString('en-GB')}</span>
          </p>
          <button
            type="button"
            onClick={() => setVisible(INITIAL_VISIBLE)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100"
          >
            Collapse
          </button>
        </div>
      )}
    </div>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 ${className}`}
    >
      {children}
    </th>
  )
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-5 py-3 text-sm ${className}`}>{children}</td>
}

function RiskBadge({ band, score }: { band: 'low' | 'medium' | 'high'; score: number }) {
  const cls =
    band === 'high'
      ? 'bg-red-50 text-red-700 ring-red-100'
      : band === 'medium'
      ? 'bg-amber-50 text-amber-800 ring-amber-100'
      : 'bg-emerald-50 text-emerald-700 ring-emerald-100'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${cls}`}
    >
      <span className="font-semibold tabular-nums">{score}</span>
    </span>
  )
}
