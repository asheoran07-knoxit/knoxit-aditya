// Crest helpers shared by the Crest component (kept separate so they can be
// tested without rendering).

const CREST_HOST = "https://crests.football-data.org/";

/**
 * football-data.org crests are served through our own API (cached, one
 * origin); anything else is used as given. Null when there is no crest.
 */
export function crestSource(url: string | null | undefined, apiBaseUrl = ""): string | null {
  if (!url) return null;
  if (!url.startsWith(CREST_HOST)) return url;
  const file = url.slice(CREST_HOST.length);
  return /^[A-Za-z0-9_-]{1,40}\.(png|svg)$/.test(file) ? `${apiBaseUrl}/api/crests/${file}` : url;
}

const FILLER_WORDS = new Set(["fc", "afc", "cf", "sc", "ac", "as", "ssc", "the", "de", "club"]);

/** "Manchester United FC" → "MU", "Arsenal" → "AR", "UEFA Champions League" → "UC". */
export function crestInitials(name: string) {
  const words = name.split(/[\s.-]+/).filter((word) => word && !FILLER_WORDS.has(word.toLowerCase()));
  if (words.length === 0) return name.slice(0, 2).toUpperCase() || "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
