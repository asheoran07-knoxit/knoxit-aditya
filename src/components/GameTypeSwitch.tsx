import type { GameType } from "../services/api/knoxitApi";

const OPTIONS: Array<{ value: GameType; label: string }> = [
  { value: "survivor", label: "Survivor" },
  { value: "predictor", label: "Predictor" },
];

/** Survivor | Predictor segmented switch above the competition cards. */
export function GameTypeSwitch({ value, onChange, className = "" }: { value: GameType; onChange: (value: GameType) => void; className?: string }) {
  return (
    <div role="tablist" aria-label="Game type" className={`inline-flex rounded-full border border-white/10 bg-white/[0.03] p-0.5 ${className}`}>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-11 rounded-full px-4 text-[12px] font-semibold ${
            value !== option.value
              ? "text-zinc-400"
              : option.value === "predictor" ? "bg-sky-500 text-black" : "bg-[var(--theme-primary)] text-[var(--theme-primary-text)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function gameLabel(gameType: GameType) {
  return gameType === "predictor" ? "Predictor" : "Survivor";
}
