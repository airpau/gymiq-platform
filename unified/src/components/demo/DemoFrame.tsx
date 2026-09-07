/**
 * Shared chrome for every tool demo on /demo: the eyebrow, the one line of
 * what it does, the try hints, and the phone or panel surface.
 */
export function DemoFrame({
  id,
  eyebrow,
  title,
  blurb,
  tries,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  blurb: string
  tries?: string[]
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-mist py-16 first:border-t-0 sm:py-20">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-4">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-moss">{eyebrow}</p>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{title}</h2>
          <p className="mt-4 text-base leading-relaxed text-slate">{blurb}</p>
          {tries && tries.length > 0 && (
            <div className="mt-5 rounded-2xl bg-paper-2 p-4">
              <p className="font-mono text-[11px] uppercase tracking-wider text-slate">Try</p>
              <ul className="mt-2 space-y-1.5 text-sm text-ink-3">
                {tries.map((t) => (
                  <li key={t} className="flex gap-2">
                    <span className="text-moss">·</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="lg:col-span-8">{children}</div>
      </div>
    </section>
  )
}

export function Phone({ header, sub, children, footer }: { header: string; sub?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[400px] rounded-[34px] border border-ink-3 bg-ink p-3 shadow-[0_30px_60px_-30px_rgba(15,22,20,0.5)]">
      <div className="flex h-[640px] flex-col overflow-hidden rounded-[24px] bg-ink-2">
        <div className="border-b border-ink-3 px-4 py-3">
          <p className="font-display text-sm font-bold text-paper">{header}</p>
          {sub && <p className="font-mono text-[11px] text-paper/50">{sub}</p>}
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">{children}</div>
        {footer && <div className="border-t border-ink-3 px-3 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Bubble({ from, children, time }: { from: 'club' | 'lead' | 'system'; children: React.ReactNode; time?: string }) {
  if (from === 'system') {
    return <p className="my-2 text-center font-mono text-[10px] uppercase tracking-wider text-paper/40">{children}</p>
  }
  const mine = from === 'lead'
  return (
    <div className={`my-1.5 flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug ${mine ? 'rounded-br-sm bg-moss text-paper' : 'rounded-bl-sm bg-ink text-paper/90'}`}>
        <div className="whitespace-pre-wrap">{children}</div>
        {time && <div className={`mt-1 text-[10px] ${mine ? 'text-paper/70' : 'text-paper/40'}`}>{time}</div>}
      </div>
    </div>
  )
}

export const now = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
