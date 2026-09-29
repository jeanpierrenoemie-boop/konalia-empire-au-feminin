/**
 * Formes 3D décoratives de la landing.
 */

type ShapeProps = { size?: number; className?: string; style?: React.CSSProperties };

export function ShapeSphere({ size = 140, className, style }: ShapeProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={style} aria-hidden>
      <defs>
        <radialGradient id="sph-b" cx="34%" cy="26%" r="85%">
          <stop offset="0%" stopColor="#F3E6FF" />
          <stop offset="28%" stopColor="#CFA1FA" />
          <stop offset="60%" stopColor="#A264EC" />
          <stop offset="88%" stopColor="#7434C8" />
          <stop offset="100%" stopColor="#5F259F" />
        </radialGradient>
        <filter id="sph-blur" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <clipPath id="sph-clip"><circle cx="50" cy="50" r="46" /></clipPath>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#sph-b)" />
      <g clipPath="url(#sph-clip)">
        <ellipse cx="72" cy="66" rx="34" ry="38" fill="#4A1B80" opacity="0.35" filter="url(#sph-blur)" />
      </g>
      <ellipse cx="35" cy="27" rx="15" ry="9.5" fill="#FFFFFF" opacity="0.85" transform="rotate(-28 35 27)" filter="url(#sph-blur)" />
    </svg>
  );
}

export function ShapePyramid({ size = 150, className, style }: ShapeProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={style} aria-hidden>
      <defs>
        <linearGradient id="pyr-l" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#FFCE9E" />
          <stop offset="42%" stopColor="#FF9A4D" />
          <stop offset="100%" stopColor="#F0670F" />
        </linearGradient>
      </defs>
      <path d="M52 5 L13 79 L52 93 Z" fill="url(#pyr-l)" />
      <path d="M52 5 L91 71 L52 93 Z" fill="#B84205" />
    </svg>
  );
}

export function ShapeStar({ size = 150, className, style }: ShapeProps) {
  const starPath = "M50 7 L60.5 35.5 L92 37.5 L67.5 57.5 L76 88 L50 71 L24 88 L32.5 57.5 L8 37.5 L39.5 35.5 Z";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={style} aria-hidden>
      <defs>
        <radialGradient id="star-b" cx="36%" cy="28%" r="90%">
          <stop offset="0%" stopColor="#E4FBF6" />
          <stop offset="100%" stopColor="#2A9C8C" />
        </radialGradient>
      </defs>
      <path d={starPath} fill="url(#star-b)" stroke="url(#star-b)" strokeWidth="14" strokeLinejoin="round" />
    </svg>
  );
}

export function ShapeBlob({ size = 130, className, style }: ShapeProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={style} aria-hidden>
      <defs>
        <radialGradient id="blob-b" cx="33%" cy="24%" r="95%">
          <stop offset="0%" stopColor="#F2FCB8" />
          <stop offset="100%" stopColor="#6E9410" />
        </radialGradient>
      </defs>
      <rect x="9" y="9" width="82" height="82" rx="34" fill="url(#blob-b)" transform="rotate(12 50 50)" />
    </svg>
  );
}

export function ShapeCylinder({ size = 150, className, style }: ShapeProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={style} aria-hidden>
      <defs>
        <linearGradient id="cyl-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1A55A6" />
          <stop offset="40%" stopColor="#9DCCF9" />
          <stop offset="100%" stopColor="#123F80" />
        </linearGradient>
      </defs>
      <g transform="rotate(-16 50 50)">
        <path d="M23 27 L23 73 A27 13.5 0 0 0 77 73 L77 27 Z" fill="url(#cyl-body)" />
        <ellipse cx="50" cy="27" rx="27" ry="13.5" fill="#D8EDFD" />
      </g>
    </svg>
  );
}

export function ShapeCube({ size = 140, className, style }: ShapeProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={style} aria-hidden>
      <defs>
        <linearGradient id="cube-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFEFC2" />
          <stop offset="100%" stopColor="#F5AE38" />
        </linearGradient>
      </defs>
      <g strokeLinejoin="round">
        <path d="M50 9 L87 28.5 L50 48 L13 28.5 Z" fill="url(#cube-top)" stroke="url(#cube-top)" strokeWidth="6" />
        <path d="M13 28.5 L50 48 L50 89 L13 69.5 Z" fill="#DE8712" stroke="#DE8712" strokeWidth="6" />
        <path d="M87 28.5 L87 69.5 L50 89 L50 48 Z" fill="#B36A06" stroke="#B36A06" strokeWidth="6" />
      </g>
    </svg>
  );
}

export function ShapeCubeBlue({ size = 110, className, style }: ShapeProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={style} aria-hidden>
      <defs>
        <linearGradient id="cubeb-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#EAF6FE" />
          <stop offset="100%" stopColor="#7FC0EE" />
        </linearGradient>
      </defs>
      <g strokeLinejoin="round">
        <path d="M50 9 L87 28.5 L50 48 L13 28.5 Z" fill="url(#cubeb-top)" stroke="url(#cubeb-top)" strokeWidth="6" />
        <path d="M13 28.5 L50 48 L50 89 L13 69.5 Z" fill="#8FC9EF" stroke="#8FC9EF" strokeWidth="6" />
        <path d="M87 28.5 L87 69.5 L50 89 L50 48 Z" fill="#6FB2E0" stroke="#6FB2E0" strokeWidth="6" />
      </g>
    </svg>
  );
}
