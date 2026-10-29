// Lets a screen hide the bottom navigation while the on-screen keyboard is up
// (e.g. typing in league chat), so the message box isn't squeezed above it.

import { useSyncExternalStore } from "react";

let typing = false;
const listeners = new Set<() => void>();

/** Only touch devices get an on-screen keyboard; desktop keeps the nav. */
function hasOnScreenKeyboard() {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;
}

export function setKeyboardOpen(open: boolean) {
  const next = open && hasOnScreenKeyboard();
  if (next === typing) return;
  typing = next;
  for (const listener of listeners) listener();
}

export function useKeyboardOpen() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => typing,
    () => false,
  );
}
