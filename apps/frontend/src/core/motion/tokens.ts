/**
 * The motion tokens of `main.css` (`--motion-duration-*`, `--motion-ease-*`) for scripts, so GSAP
 * moves at the same tempo as the CSS transitions. Read once from `<html>` on first use; where a
 * token is missing (tests without CSS) the fallback applies.
 */
export type MotionDuration = "fast" | "base" | "slow" | "reveal";
export type MotionEase = "standard" | "out" | "in-out" | "spring";

const FALLBACK_SECONDS: Record<MotionDuration, number> = { fast: 0.15, base: 0.22, slow: 0.4, reveal: 0.8 };

let style: CSSStyleDeclaration | undefined;

function token(name: string): string {
  style ??= getComputedStyle(document.documentElement);
  return style.getPropertyValue(name).trim();
}

/** Seconds, as GSAP takes them. */
export function motionDuration(name: MotionDuration): number {
  const value = token(`--motion-duration-${name}`);
  const match = /^([\d.]+)(ms|s)$/.exec(value);
  if (!match) return FALLBACK_SECONDS[name];
  return match[2] === "ms" ? Number(match[1]) / 1000 : Number(match[1]);
}

/** The four control points of a `cubic-bezier(…)` token; `ease` is CSS's own curve. */
export function motionBezier(name: MotionEase): [number, number, number, number] | null {
  const value = token(`--motion-ease-${name}`);
  if (value === "ease") return [0.25, 0.1, 0.25, 1];
  const match = /^cubic-bezier\(([^)]+)\)$/.exec(value);
  const points = match?.[1]!.split(",").map(Number);
  return points?.length === 4 && points.every(Number.isFinite) ? (points as [number, number, number, number]) : null;
}
