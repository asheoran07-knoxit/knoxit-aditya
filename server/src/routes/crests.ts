// GET /api/crests/:file — team crests and competition emblems served from our
// own origin with long cache headers, so the app doesn't hit
// football-data.org's image host on every screen. Only that host's plain
// image filenames are accepted; this is not a general-purpose proxy.

import { Router } from "express";

export const crestsRouter = Router();

const CREST_HOST = "https://crests.football-data.org";
const CACHE_SECONDS = 30 * 24 * 60 * 60;
const MAX_CACHED = 600;
const MAX_BYTES = 512 * 1024;
const CONTENT_TYPES: Record<string, string> = { png: "image/png", svg: "image/svg+xml" };

/** "57.png" or "PL.svg" style names only; null for anything else. */
export function crestFileType(file: string): string | null {
  const match = /^[A-Za-z0-9_-]{1,40}\.(png|svg)$/.exec(file);
  return match ? CONTENT_TYPES[match[1]] : null;
}

// Small in-process cache: crests never change for a given filename.
const cache = new Map<string, Buffer>();
const pending = new Map<string, Promise<Buffer | null>>();

async function fetchCrest(file: string) {
  const response = await fetch(`${CREST_HOST}/${file}`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return null;
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length === 0 || body.length > MAX_BYTES) return null;
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value as string);
  cache.set(file, body);
  return body;
}

crestsRouter.get("/:file", async (req, res) => {
  const file = req.params.file;
  const contentType = crestFileType(file);
  if (!contentType) return res.status(404).end();

  let body = cache.get(file) ?? null;
  if (!body) {
    let request = pending.get(file);
    if (!request) {
      request = fetchCrest(file).catch(() => null).finally(() => pending.delete(file));
      pending.set(file, request);
    }
    body = await request;
  }
  if (!body) {
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(404).end();
  }

  res.setHeader("Content-Type", contentType);
  // s-maxage lets Vercel's edge cache keep it too, so most requests never
  // reach the proxy function or Render at all.
  res.setHeader("Cache-Control", `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}, immutable`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  // SVGs are shown as images only; never let one run script if opened directly.
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.end(body);
});
