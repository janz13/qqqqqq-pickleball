import React from 'react';

interface BrandMarkProps {
  size?: number;
  className?: string;
}

/**
 * Custom geometric pickleball court + ball emblem in emerald/teal palette.
 */
export function BrandMark({ size = 48, className = '' }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="qqBrandBg" x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#qqBrandBg)" />
      <rect
        x="11"
        y="16"
        width="42"
        height="32"
        rx="5"
        stroke="white"
        strokeOpacity="0.92"
        strokeWidth="2.5"
      />
      {/* Net center line + non-volley kitchen lines */}
      <line x1="32" y1="16" x2="32" y2="48" stroke="white" strokeWidth="2.5" strokeDasharray="3 2.5" />
      <line x1="23" y1="16" x2="23" y2="48" stroke="white" strokeOpacity="0.55" strokeWidth="2" />
      <line x1="41" y1="16" x2="41" y2="48" stroke="white" strokeOpacity="0.55" strokeWidth="2" />
      <line x1="11" y1="32" x2="23" y2="32" stroke="white" strokeOpacity="0.55" strokeWidth="2" />
      <line x1="41" y1="32" x2="53" y2="32" stroke="white" strokeOpacity="0.55" strokeWidth="2" />
      {/* Pickleball accent */}
      <circle cx="44" cy="23" r="5" fill="#fde047" stroke="#065f46" strokeWidth="1.5" />
      <circle cx="42.7" cy="22" r="0.8" fill="#065f46" />
      <circle cx="45.3" cy="22" r="0.8" fill="#065f46" />
      <circle cx="44" cy="24.5" r="0.8" fill="#065f46" />
    </svg>
  );
}

export default BrandMark;
