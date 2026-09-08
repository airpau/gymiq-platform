/**
 * GET /api/social/render
 *
 * Renders a branded social post image: a photograph (usually from Higgsfield)
 * under a dark gradient, the day's hook in the display face, a kicker, a sub
 * line and the gymIQ mark. One template, so every post looks like the same
 * company made it. Used by the daily posting task; Meta fetches the PNG by URL.
 *
 * Query: hook (required), kicker, sub, photo (absolute URL), ratio (4x5 | 1x1 | 9x16),
 *        theme (photo | ink | paper), accent (lime | paper)
 */
import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'

export const runtime = 'edge'

const SIZES = { '4x5': [1080, 1350], '1x1': [1080, 1080], '9x16': [1080, 1920] } as const

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const hook = (q.get('hook') ?? '').trim()
  if (!hook) return new Response('hook required', { status: 400 })
  const kicker = q.get('kicker') ?? 'gymIQ · AI for gym owners'
  const sub = q.get('sub') ?? ''
  const photo = q.get('photo') ?? ''
  const ratio = (q.get('ratio') ?? '4x5') as keyof typeof SIZES
  const theme = q.get('theme') ?? (photo ? 'photo' : 'ink')
  const [width, height] = SIZES[ratio] ?? SIZES['4x5']
  const origin = req.nextUrl.origin
  const [display, body] = await Promise.all([
    fetch(new URL('/brand/BricolageGrotesque-800.ttf', origin)).then((r) => r.arrayBuffer()),
    fetch(new URL('/brand/SourceSans3-600.ttf', origin)).then((r) => r.arrayBuffer()),
  ])

  const long = hook.length > 70
  const hookSize = ratio === '9x16' ? (long ? 74 : 92) : long ? 60 : 76
  const pad = 72
  const dark = theme !== 'paper'
  const fg = dark ? '#F6F6F2' : '#0F1614'
  const accent = dark ? '#C9F27A' : '#0F6E63'
  const bg = theme === 'paper' ? '#F6F6F2' : '#0F1614'

  return new ImageResponse(
    (
      <div style={{ width, height, display: 'flex', position: 'relative', background: bg, fontFamily: 'Source Sans 3', color: fg }}>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, width, height, objectFit: 'cover' }} />
        )}
        {photo && (
          <div style={{ position: 'absolute', top: 0, left: 0, width, height, display: 'flex', background: 'linear-gradient(180deg, rgba(15,22,20,0.15) 0%, rgba(15,22,20,0.35) 45%, rgba(15,22,20,0.92) 78%, rgba(15,22,20,0.97) 100%)' }} />
        )}
        {!photo && theme === 'ink' && (
          <div style={{ position: 'absolute', right: -220, top: -220, width: 640, height: 640, borderRadius: 640, background: 'rgba(15,110,99,0.55)', display: 'flex' }} />
        )}
        <div style={{ position: 'absolute', top: pad, left: pad, display: 'flex', alignItems: 'center', gap: 14, fontSize: 26, letterSpacing: 3, textTransform: 'uppercase', color: photo || dark ? '#C9F27A' : '#0F6E63' }}>
          {kicker}
        </div>
        <div style={{ position: 'absolute', left: pad, right: pad, bottom: pad + 96, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ fontFamily: 'Bricolage Grotesque', fontSize: hookSize, lineHeight: 1.02, letterSpacing: -2, color: photo ? '#F6F6F2' : fg, display: 'flex' }}>{hook}</div>
          {sub && <div style={{ fontSize: 32, lineHeight: 1.3, color: photo ? 'rgba(246,246,242,0.9)' : dark ? 'rgba(246,246,242,0.85)' : '#5E6B66', display: 'flex' }}>{sub}</div>}
        </div>
        <div style={{ position: 'absolute', left: pad, right: pad, bottom: pad, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontFamily: 'Bricolage Grotesque', fontSize: 44, letterSpacing: -1.5, color: photo ? '#F6F6F2' : fg }}>
            <svg width="56" height="56" viewBox="0 0 40 40">
              <rect width="40" height="40" rx="10" fill={photo || dark ? '#C9F27A' : '#0F6E63'} />
              <path d="M8 28h6l4-8 4 5 5-11" fill="none" stroke={photo || dark ? '#0F1614' : '#C9F27A'} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="31" cy="11" r="3.2" fill={photo || dark ? '#0F6E63' : '#F6F6F2'} />
            </svg>
            <div style={{ display: 'flex' }}>gym<span style={{ color: accent }}>IQ</span></div>
          </div>
          <div style={{ fontSize: 26, color: photo ? 'rgba(246,246,242,0.8)' : dark ? 'rgba(246,246,242,0.75)' : '#5E6B66', display: 'flex' }}>www.gymiq.ai</div>
        </div>
      </div>
    ),
    {
      width,
      height,
      fonts: [
        { name: 'Bricolage Grotesque', data: display, weight: 800, style: 'normal' },
        { name: 'Source Sans 3', data: body, weight: 600, style: 'normal' },
      ],
      headers: { 'cache-control': 'public, max-age=3600' },
    },
  )
}
