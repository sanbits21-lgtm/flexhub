import { useId } from 'react';

// The FitzyClub mark: a runner leaping out of a sweep, with a spark. It is the same drawing the icon
// generators use (frontend/scripts/generateIcons.js and mobile/scripts/generate-icons.mjs), so the
// favicon, the app icons and this stay one logo.
export function LogoMark({ size = 40, className = '' }) {
  const gradient = `fc-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const paint = `url(#${gradient})`;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#D9FF4A" />
          <stop offset="1" stopColor="#3FDB80" />
        </linearGradient>
      </defs>
      <path d="M70 9 C 34 10 8 38 10 70 C 12 96 38 112 72 104 C 90 100 102 92 108 84 C 92 94 70 98 50 90 C 28 80 22 56 34 36 C 44 22 56 14 70 9 Z" fill={paint} />
      <g fill="none" stroke={paint} strokeLinecap="round" strokeLinejoin="round">
        <path d="M74 42 C 70 52 66 60 60 70" strokeWidth="9" />
        <path d="M73 44 C 80 40 88 36 96 28" strokeWidth="7" />
        <path d="M71 48 C 64 50 58 52 52 58" strokeWidth="7" />
        <path d="M60 70 C 68 74 76 78 80 86 C 82 92 80 98 78 102" strokeWidth="8" />
        <path d="M60 70 C 52 74 46 80 40 86" strokeWidth="8" />
      </g>
      <circle cx="82" cy="27" r="9" fill={paint} />
      <circle cx="101" cy="17" r="4.5" fill={paint} />
    </svg>
  );
}

// Mark and wordmark: "Fitzy" in the page's ink, "Club" in the accent. `tagline` adds the line under it.
export default function Logo({ size = 40, tagline = false, onDark = false, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <LogoMark size={size} />
      <span className="flex min-w-0 flex-col leading-none">
        <span className="font-extrabold italic tracking-tight" style={{ fontSize: size * 0.62 }}>
          <span className={onDark ? 'text-white' : 'text-gray-900 dark:text-white'}>Fitzy</span>
          <span className={onDark ? 'text-accent' : 'text-green-700 dark:text-accent'}>Club</span>
        </span>
        {tagline && (
          <span className={`mt-1 truncate italic ${onDark ? 'text-gray-300' : 'text-gray-500 dark:text-gray-300'}`} style={{ fontSize: Math.max(10, size * 0.27) }}>
            One Platform. Every Sport.
          </span>
        )}
      </span>
    </span>
  );
}
