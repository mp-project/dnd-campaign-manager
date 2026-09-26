const UNIT_TO_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

const DURATION_PATTERN = /^(\d+)(ms|s|m|h|d|w)$/i;

export function durationToMilliseconds(value: string): number {
  const normalized = value.trim().toLowerCase();
  const match = DURATION_PATTERN.exec(normalized);

  if (!match) {
    throw new Error(`Unsupported duration value '${value}'`);
  }

  const amount = Number.parseInt(match[1] ?? "0", 10);
  const unit = (match[2] ?? "").toLowerCase();
  const factor = UNIT_TO_MS[unit];

  if (!Number.isFinite(amount) || amount <= 0 || !factor) {
    throw new Error(`Unsupported duration value '${value}'`);
  }

  return amount * factor;
}
