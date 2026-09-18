import { createHash } from "node:crypto";

export type TestClock = {
  now: () => Date;
};

export function createFixedClock(isoTimestamp: string): TestClock {
  const fixedDate = new Date(isoTimestamp);

  return {
    now: () => new Date(fixedDate.toISOString()),
  };
}

export function createDeterministicUuidGenerator(sequence: readonly string[]) {
  const values = [...sequence];
  let index = 0;

  return () => {
    const value = values[index];

    if (!value) {
      throw new Error("Deterministic UUID sequence exhausted");
    }

    index += 1;
    return value;
  };
}

export function deterministicSha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
