import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#A81612',
          borderRadius: 96,
          fontSize: 320,
        }}
      >
        🌯
      </div>
    ),
    { ...size }
  )
}
