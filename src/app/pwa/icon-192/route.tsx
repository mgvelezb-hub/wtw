import { ImageResponse } from 'next/og'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0A7C82',
          fontSize: 96,
          fontWeight: 700,
          color: 'white',
        }}
      >
        W
      </div>
    ),
    { width: 192, height: 192 }
  )
}
