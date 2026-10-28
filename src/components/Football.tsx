import { useId } from "react";

// Football mark used inside the KNOXIT wordmark (as the "O") and, as a
// static copy in public/favicon.svg, for the browser tab icon.
export function Football({ size = 16, className }: { size?: number | string; className?: string }) {
  // Each instance needs its own clipPath id so several logos on one page
  // don't share (and break) one definition. useId's punctuation isn't safe
  // inside url(#...), so keep only id-safe characters.
  const clipId = `kx-ball-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r="47" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="47" fill="#f4f4f5" />
      <g clipPath={`url(#${clipId})`} fill="#111114">
        <polygon points="50,32 67.1,44.4 60.6,64.6 39.4,64.6 32.9,44.4" />
        <polygon points="50,-6 61,2 57,15 43,15 39,2" />
        <polygon points="97,34 103,46 93,55 83,49 85,36" />
        <polygon points="80,96 69,101 61,90 68,79 81,82" />
        <polygon points="20,96 19,82 32,79 39,90 31,101" />
        <polygon points="3,34 15,36 17,49 7,55 -3,46" />
      </g>
      <g stroke="#111114" strokeWidth="2.6" strokeLinecap="round">
        <line x1="50" y1="32" x2="50" y2="15" />
        <line x1="67.1" y1="44.4" x2="84" y2="42" />
        <line x1="60.6" y1="64.6" x2="68" y2="79" />
        <line x1="39.4" y1="64.6" x2="32" y2="79" />
        <line x1="32.9" y1="44.4" x2="16" y2="42" />
      </g>
      <circle cx="50" cy="50" r="47" fill="none" stroke="#111114" strokeWidth="2" />
    </svg>
  );
}
