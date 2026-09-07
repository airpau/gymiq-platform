'use client'

import { useState } from 'react'
import type { NamedRow } from '@/lib/services/audit-insights'
import { maskEmail, maskPhone } from '@/lib/services/audit-analysis'

const INITIAL = 15
const PAGE = 50

interface Props {
  title: string
  subtitle: string
  rows: NamedRow[]
  /** Label for the right hand column. */
  valueLabel?: string
  emptyText?: string
}

export default function NamedRowList({ title, subtitle, rows, valueLabel = 'a month', emptyText }: Props) {
  const [visible, setVisible] = useState(INITIAL)
  const total = rows.length
  const shown = rows.slice(0, visible)

  return (
    <div className="overflow-hidden rounded-2xl border border-mist bg-white">
      <div className="border-b border-mist p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          {title}
          <span className="rounded-full bg-paper-2 px-1.5 py-0.5 text-xs font-medium text-slate">
            {total.toLocaleString('en-GB')}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-slate">{subtitle}</p>
      </div>
      {total === 0 ? (
        <p className="p-5 text-sm text-moss">{emptyText ?? 'Nothing to flag here.'}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-mist text-sm">
              <thead className="bg-paper-2 text-left text-xs uppercase tracking-wide text-slate">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Member</th>
                  <th className="px-5 py-2.5 font-medium">Plan</th>
                  <th className="px-5 py-2.5 font-medium">Detail</th>
                  <th className="px-5 py-2.5 text-right font-medium">£ {valueLabel}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mist">
                {shown.map((r, i) => (
                  <tr key={`${r.name ?? ''}-${r.email ?? ''}-${i}`}>
                    <td className="px-5 py-2.5">
                      <div className="font-medium text-ink">{r.name ?? 'Unnamed'}</div>
                      <div className="text-xs text-slate">
                        {r.email ? maskEmail(r.email) : r.phone ? maskPhone(r.phone) : ''}
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-slate">{r.plan ?? ''}</td>
                    <td className="px-5 py-2.5 text-slate whitespace-nowrap">{r.detail}</td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums text-ink">
                      {r.monthly.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visible < total && (
            <div className="border-t border-mist p-3 text-center">
              <button
                type="button"
                onClick={() => setVisible((v) => Math.min(total, v + PAGE))}
                className="rounded-lg border border-mist px-3 py-1.5 text-xs font-medium text-ink-3 hover:bg-paper-2"
              >
                Show {Math.min(PAGE, total - visible)} more of {total}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
