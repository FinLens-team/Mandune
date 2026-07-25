import { useEffect, useState, type KeyboardEvent, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export type OverlayKeyAction = "close" | number | null;
export type OverlayPhase = "closed" | "opening" | "open" | "closing";

export function useOverlayPresence(open: boolean, exitDuration: number): {
  phase: OverlayPhase;
  present: boolean;
} {
  const [present, setPresent] = useState(open);
  const [phase, setPhase] = useState<OverlayPhase>(open ? "opening" : "closed");

  useEffect(() => {
    let frame: number | undefined;
    let timer: number | undefined;

    if (open) {
      setPresent(true);
      setPhase("opening");
      frame = window.requestAnimationFrame(() => setPhase("open"));
    } else if (present) {
      setPhase("closing");
      timer = window.setTimeout(() => {
        setPresent(false);
        setPhase("closed");
      }, exitDuration);
    }

    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [exitDuration, open, present]);

  return { phase, present };
}

export function resolveReturnFocus<T>(explicit: T | null, fallback: T | null): T | null {
  return explicit ?? fallback;
}

export function resolveOverlayKeyAction(input: {
  key: string;
  shiftKey: boolean;
  currentIndex: number;
  focusableCount: number;
}): OverlayKeyAction {
  if (input.key === "Escape") return "close";
  if (input.key !== "Tab" || input.focusableCount === 0) return null;
  if (input.shiftKey && input.currentIndex <= 0) return input.focusableCount - 1;
  if (!input.shiftKey && input.currentIndex >= input.focusableCount - 1) return 0;
  if (input.currentIndex < 0) return input.shiftKey ? input.focusableCount - 1 : 0;
  return null;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.getAttribute("aria-disabled") !== "true" &&
      element.getAttribute("aria-hidden") !== "true" &&
      !element.hidden,
  );
}

export function handleOverlayKeyDown(
  event: KeyboardEvent<HTMLElement>,
  container: HTMLElement,
  onClose: () => void,
): void {
  const focusable = focusableElements(container);
  const activeElement = container.ownerDocument.activeElement;
  const action = resolveOverlayKeyAction({
    key: event.key,
    shiftKey: event.shiftKey,
    currentIndex: focusable.findIndex((element) => element === activeElement),
    focusableCount: focusable.length,
  });

  if (action === "close") {
    event.preventDefault();
    onClose();
    return;
  }

  if (typeof action === "number") {
    event.preventDefault();
    focusable[action]?.focus();
  }
}

export function useOverlayFocus(input: {
  open: boolean;
  focusScopeRef: RefObject<HTMLElement | null>;
  returnFocus: HTMLElement | null;
}): void {
  const { focusScopeRef, open, returnFocus } = input;

  useEffect(() => {
    if (!open) return;
    const fallback = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    focusScopeRef.current
      ?.querySelector<HTMLElement>('[data-initial-focus="true"]')
      ?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      resolveReturnFocus(returnFocus, fallback)?.focus();
    };
  }, [focusScopeRef, open, returnFocus]);
}
