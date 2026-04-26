import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Last path segment of an ESCO URI is often a UUID — do not title-case those. */
export function looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s.trim(),
  );
}

/**
 * ESCO / labour-market labels often arrive all-lowercase from APIs.
 * Title-case words for display (hyphenated segments handled per chunk).
 */
export function formatEscoDisplayLabel(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  return s
    .split(/\s+/)
    .map((word) =>
      word
        .split("-")
        .map((part) =>
          part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part,
        )
        .join("-"),
    )
    .join(" ");
}
