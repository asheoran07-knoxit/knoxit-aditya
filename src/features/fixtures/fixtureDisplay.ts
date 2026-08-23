export function fixtureDisplay(status: string) {
  if (status === "FINISHED") return { showScore: true, label: "FT", live: false };
  if (status === "AWARDED") return { showScore: true, label: "AWARDED", live: false };
  if (status === "IN_PLAY" || status === "LIVE") return { showScore: true, label: "LIVE", live: true };
  if (status === "PAUSED") return { showScore: true, label: "HALF-TIME", live: true };
  if (status === "POSTPONED") return { showScore: false, label: "POSTPONED", live: false };
  if (status === "SUSPENDED") return { showScore: false, label: "SUSPENDED", live: false };
  if (status === "CANCELLED") return { showScore: false, label: "CANCELLED", live: false };
  return { showScore: false, label: status.replaceAll("_", " "), live: false };
}
