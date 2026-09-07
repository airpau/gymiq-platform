import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'gymIQ. The morning brief that runs your gym.'
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
          background: 'linear-gradient(135deg, #0f172a 0%, #18181b 60%, #064e3b 100%)',
          color: '#fff',
          fontFamily: 'Inter, Helvetica, Arial, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 28, fontWeight: 700 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>IQ</div>
          gymIQ
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>The intelligence layer for your gym.</div>
          <div style={{ fontSize: 28, color: '#a7f3d0' }}>Reads your gym software and your bank feed. Morning brief, staff board, payment retries, Friday forecast.</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, color: '#d4d4d8' }}>
          <span>Built by a gym owner. Live at énergie Fitness Hoddesdon.</span>
          <span>£495 a month per club, review included</span>
        </div>
      </div>
    ),
    { ...size },
  )
}
