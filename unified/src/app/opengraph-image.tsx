import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'gymIQ. AI gym management software for gym owners.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 64,
          background: '#0F1614',
          color: '#F6F6F2',
          fontFamily: 'Helvetica, Arial, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 40, fontWeight: 800, letterSpacing: -1.5 }}>
          <svg width="56" height="56" viewBox="0 0 40 40">
            <rect width="40" height="40" rx="10" fill="#C9F27A" />
            <path d="M8 28h6l4-8 4 5 5-11" fill="none" stroke="#0F1614" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="31" cy="11" r="3.2" fill="#0F6E63" />
          </svg>
          <div style={{ display: 'flex' }}>gym<span style={{ color: '#C9F27A' }}>IQ</span></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2.5, maxWidth: 1000 }}>Your gym&apos;s numbers on your phone by 06:00, and a board your staff can clear.</div>
          <div style={{ fontSize: 28, color: '#C9F27A' }}>AI gym management software for gym owners. Reads the software you already use.</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, color: '#F6F6F2', opacity: 0.85 }}>
          <span>Built by a gym owner. Live at an énergie Fitness club in Hertfordshire.</span>
          <span>www.gymiq.ai</span>
        </div>
      </div>
    ),
    { ...size },
  )
}
