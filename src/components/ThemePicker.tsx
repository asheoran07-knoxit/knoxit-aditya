import { useEffect, useState } from "react";
import { Check, Palette } from "lucide-react";
import { useTheme } from "../features/theme/theme";

export function ThemePicker() {
  const { customColour, selectedColour, selectedId, setCustomColour, setSelectedId, themeOptions } = useTheme();
  const [draftColour, setDraftColour] = useState(customColour);

  useEffect(() => {
    setDraftColour(customColour);
  }, [customColour]);

  const updateDraftColour = (value: string) => {
    const nextValue = value.startsWith("#") ? value : `#${value}`;
    setDraftColour(nextValue);
    if (/^#[0-9a-fA-F]{6}$/.test(nextValue)) {
      setCustomColour(nextValue);
    }
  };

  return (
    <section className="mx-4 my-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette size={14} className="text-[var(--theme-primary)]" />
          <span className="text-[12px] font-bold tracking-wide text-zinc-300">COLOUR CODE</span>
        </div>
        <span className="rounded-md border border-[var(--theme-primary-border)] bg-[var(--theme-primary-soft)] px-2 py-1 text-[12px] font-bold uppercase text-[var(--theme-primary)]">
          {selectedColour}
        </span>
      </div>

      <div className="grid grid-cols-6 gap-2">
        {themeOptions.map((option) => {
          const active = selectedId === option.id;
          return (
            <button
              key={option.id}
              aria-label={`Use ${option.name} colour code`}
              onClick={() => setSelectedId(option.id)}
              className="flex h-8 w-full items-center justify-center rounded-lg border border-white/10"
              style={{ backgroundColor: option.value }}
              title={option.name}
            >
              {active && <Check size={15} className="text-black drop-shadow" />}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          aria-label="Custom colour picker"
          type="color"
          value={customColour}
          onChange={(event) => setCustomColour(event.target.value)}
          className="h-9 w-12 rounded-lg border border-white/10 bg-transparent p-1"
        />
        <input
          aria-label="Custom colour code"
          value={draftColour}
          onChange={(event) => updateDraftColour(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-[12px] font-bold uppercase text-zinc-200 focus:border-[var(--theme-primary-ring)] focus:outline-none"
          maxLength={7}
          placeholder="#38BDF8"
        />
      </div>
    </section>
  );
}
