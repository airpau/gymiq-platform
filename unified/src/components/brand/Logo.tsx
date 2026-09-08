import Link from 'next/link'

/**
 * The gymIQ mark: a speech bubble (the brief, on your phone) holding three
 * rising bars (the numbers). Wordmark set in the display face with "IQ" in
 * moss on paper, lime on ink. One source for every header, the favicon and
 * the share image.
 */
export function LogoMark({ size = 28, onDark = false, className = '' }: { size?: number; onDark?: boolean; className?: string }) {
  const bubble = onDark ? '#C9F27A' : '#0F6E63'
  const bar = onDark ? '#0F1614' : '#C9F27A'
  const tall = onDark ? '#0F6E63' : '#F6F6F2'
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className={className}>
      <path d="M8 6h24a5 5 0 0 1 5 5v15a5 5 0 0 1-5 5H18l-7 6v-6H8a5 5 0 0 1-5-5V11a5 5 0 0 1 5-5z" fill={bubble} />
      <rect x="11" y="18" width="4" height="8" rx="1.5" fill={bar} />
      <rect x="18" y="14" width="4" height="12" rx="1.5" fill={bar} />
      <rect x="25" y="9" width="4" height="17" rx="1.5" fill={tall} />
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
