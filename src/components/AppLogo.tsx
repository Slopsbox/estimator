interface AppLogoProps {
  size?: number; // width/height i px
  className?: string;
}

export function AppLogo({ size = 64, className }: AppLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Palm fill behind cards */}
      <path d="M6 44 C6 35, 13 24, 24 24 C35 24, 42 35, 42 44 L42 52 L6 52 Z" fill="rgba(255,255,255,0.08)" />
      {/* Far left card (−18°) */}
      <g transform="rotate(-18, 24, 52)">
        <rect x="18" y="7" width="12" height="19" rx="2.2" fill="rgba(255,255,255,0.18)" />
      </g>
      {/* Far right card (+18°) */}
      <g transform="rotate(18, 24, 52)">
        <rect x="18" y="7" width="12" height="19" rx="2.2" fill="rgba(255,255,255,0.18)" />
      </g>
      {/* Mid left card (−9°) */}
      <g transform="rotate(-9, 24, 52)">
        <rect x="18" y="7" width="12" height="19" rx="2.2" fill="rgba(255,255,255,0.50)" />
      </g>
      {/* Mid right card (+9°) */}
      <g transform="rotate(9, 24, 52)">
        <rect x="18" y="7" width="12" height="19" rx="2.2" fill="rgba(255,255,255,0.50)" />
      </g>
      {/* Center card */}
      <rect x="18" y="7" width="12" height="19" rx="2.2" fill="white" />
      {/* Card face details */}
      <rect x="20.5" y="10" width="7" height="1.3" rx="0.65" fill="rgba(9,25,93,0.25)" />
      <circle cx="24" cy="16.5" r="2.2" fill="rgba(9,25,93,0.22)" />
      <rect x="20.5" y="22.5" width="7" height="1.3" rx="0.65" fill="rgba(9,25,93,0.25)" />
      {/* Palm arc */}
      <path d="M6 44 C6 35, 13 25, 24 25 C35 25, 42 35, 42 44" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.36)" strokeWidth="2.5" strokeLinecap="round" />
      {/* Left thumb */}
      <path d="M6 44 C4 40.5, 4 36, 8 32" stroke="rgba(255,255,255,0.28)" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* Right thumb */}
      <path d="M42 44 C44 40.5, 44 36, 40 32" stroke="rgba(255,255,255,0.28)" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export default AppLogo;
