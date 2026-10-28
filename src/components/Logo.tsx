import { Football } from "./Football";

// KNOXIT wordmark (option B): "KN", a football as the "O", the "X" in the
// theme's accent colour, then "IT" — set in Montserrat 900 (loaded in index.html).
export function Logo({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label="KNOXIT"
      className={`inline-flex items-center leading-none text-white ${className}`}
      style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 900, fontSize: size, letterSpacing: "0.02em" }}
    >
      <span aria-hidden="true">KN</span>
      <Football size={size * 0.86} className="mx-[0.06em] shrink-0" />
      <span aria-hidden="true" className="text-[var(--theme-primary)]">X</span>
      <span aria-hidden="true">IT</span>
    </span>
  );
}

export function BetaBadge() {
  return (
    <span className="text-[9px] font-bold text-amber-400 border border-amber-400/40 rounded-full px-1.5 py-0.5 leading-none">
      BETA
    </span>
  );
}
