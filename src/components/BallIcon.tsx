import { useId } from 'react'

function BallIcon() {
  const uid = useId()
  const shadeId = `ball-shade-${uid}`
  const clipId = `ball-clip-${uid}`

  return (
    <svg viewBox="0 0 32 32" width="1.5em" height="1.5em" aria-hidden="true">
      <defs>
        <radialGradient id={shadeId} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.18" />
        </radialGradient>
        <clipPath id={clipId}>
          <circle cx="16" cy="16" r="14.5" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`} stroke="#0E1A33" strokeWidth="0.6" strokeLinejoin="round">
        <path
          d="M16,16 C20.6,19.86 20.1,27.28 16,30.5 A14.5,14.5 0 0,1 3.44,8.75 C4.18,13.92 10.36,18.05 16,16 Z"
          fill="#F6F3EC"
        />
        <path
          d="M16,16 C10.36,18.05 4.18,13.92 3.44,8.75 A14.5,14.5 0 0,1 28.56,8.75 C23.72,6.81 17.04,10.09 16,16 Z"
          fill="#FF5A36"
        />
        <path
          d="M16,16 C17.04,10.09 23.72,6.81 28.56,8.75 A14.5,14.5 0 0,1 16,30.5 C20.1,27.28 20.6,19.86 16,16 Z"
          fill="#16264A"
        />
      </g>

      <circle cx="16" cy="16" r="14.5" fill={`url(#${shadeId})`} />
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="#0E1A33" strokeWidth="0.8" />
    </svg>
  )
}

export default BallIcon
