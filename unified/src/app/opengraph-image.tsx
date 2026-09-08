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
            <path d="M8 6h24a5 5 0 0 1 5 5v15a5 5 0 0 1-5 5H18l-7 6v-6H8a5 5 0 0 1-5-5V11a5 5 0 0 1 5-5z" fill="#C9F27A" />
            <rect x="11" y="18" width="4" height="8" rx="1.5" fill="#0F1614" />
            <rect x="18" y="14" width="4" height="12" rx="1.5" fill="#0F1614" />
            <rect x="25" y="9" width="4" height="17" rx="1.5" fill="#0F6E63" />
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
