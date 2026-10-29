import { useState } from "react";
import { apiBaseUrl } from "../services/api/knoxitApi";
import { crestInitials, crestSource } from "./crestSource";

/**
 * A team crest or competition emblem, loaded through our API's crest cache.
 * Falls back to the name's initials when there's no crest or it fails to load.
 */
export function Crest({ src, name, size = 24, className = "" }: { src: string | null | undefined; name: string; size?: number; className?: string }) {
  const source = crestSource(src, apiBaseUrl);
  const [failed, setFailed] = useState<string | null>(null);
  const style = { width: size, height: size };

  if (!source || failed === source) {
    return (
      <span
        style={{ ...style, fontSize: Math.max(12, Math.round(size * 0.4)) }}
        className={`flex shrink-0 items-center justify-center rounded-full bg-white/10 font-bold leading-none text-zinc-300 ${className}`}
        aria-hidden="true"
      >
        {crestInitials(name)}
      </span>
    );
  }
  return (
    <img
      src={source}
      alt=""
      loading="lazy"
      decoding="async"
      style={style}
      className={`shrink-0 object-contain ${className}`}
      onError={() => setFailed(source)}
    />
  );
}
