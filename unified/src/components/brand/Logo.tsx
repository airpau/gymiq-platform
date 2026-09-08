import Link from 'next/link'

/**
 * The gymIQ mark ("signal"): a line that rises, and the point it found.
 * Wordmark set in the display face with "IQ" in moss on paper, lime on ink.
 * One source for every header, the favicon, the share image and the social
 * profile assets (scripts/brand-assets).
 */
export function LogoMark({ size = 28, onDark = false, className = '' }: { size?: number; onDark?: boolean; className?: string }) {
  const tile = onDark ? '#C9F27A' : '#0F6E63'
  const line = onDark ? '#0F1614' : '#C9F27A'
  const dot = onDark ? '#0F6E63' : '#F6F6F2'
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className={className}>
      <rect width="40" height="40" rx="10" fill={tile} />
      <path d="M8 28h6l4-8 4 5 5-11" fill="none" stroke={line} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="31" cy="11" r="3.2" fill={dot} />
    </svg>
  )
}

export function Wordmark({ onDark = false, size = 'md' }: { onDark?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const text = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-[22px]'
  const mark = size === 'lg' ? 40 : size === 'sm' ? 26 : 30
  return (
    <span className={`inline-flex items-center gap-2 font-display font-extrabold tracking-[-0.03em] ${text} ${onDark ? 'text-paper' : 'text-ink'}`}>
      <LogoMark size={mark} onDark={onDark} />
      <span>gym<span className={onDark ? 'text-lime' : 'text-moss'}>IQ</span></span>
    </span>
  )
}

export function LogoLink({ onDark = false, size = 'md' }: { onDark?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <Link href="/" aria-label="gymIQ home" className="inline-flex items-center">
      <Wordmark onDark={onDark} size={size} />
    </Link>
  )
}
