import {
  applyGroups,
  decideMerge,
  sameValue,
  toStoredValue,
  type MergeDecision,
} from "#src/modules/history/service/HistoryMerge";

describe("history three-way comparison", () => {
  const known = (value: unknown) => ({ known: true as const, value });

  it.each<[string, Parameters<typeof decideMerge>[0], MergeDecision]>([
    ["same value on both sides", { mine: "a", theirs: "a", changedSinceBase: true, base: known("x") }, "noop"],
    ["nothing changed since the base", { mine: "b", theirs: "a", changedSinceBase: false, base: { known: false } }, "apply"],
    ["field changed back to the base", { mine: "b", theirs: "a", changedSinceBase: true, base: known("a") }, "apply"],
    ["client did not touch the field", { mine: "a", theirs: "b", changedSinceBase: true, base: known("a") }, "keepTheirs"],
    ["both changed it differently", { mine: "b", theirs: "c", changedSinceBase: true, base: known("a") }, "conflict"],
    ["base value was trimmed", { mine: "b", theirs: "c", changedSinceBase: true, base: { known: false } }, "conflict"],
    ["untouched but base unknown", { mine: "a", theirs: "c", changedSinceBase: true, base: { known: false } }, "conflict"],
  ])("%s", (_name, input, expected) => {
    expect(decideMerge(input)).toBe(expected);
  });

  it("compares objects independent of key order and dates by value", () => {
    expect(sameValue({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(sameValue(new Date("2026-01-01T00:00:00.000Z"), "2026-01-01T00:00:00.000Z")).toBe(true);
    expect(sameValue(null, undefined)).toBe(true);
    expect(sameValue(0, null)).toBe(false);
    expect(toStoredValue(undefined)).toBeNull();
  });

  describe("field groups", () => {
    const groups = [["policy", "scope"]];

    it("turns a half-merged group into a conflict", () => {
      const result = applyGroups(
        new Map<string, MergeDecision>([
          ["policy", "apply"],
          ["scope", "keepTheirs"],
          ["name", "keepTheirs"],
        ]),
        groups,
      );

      expect(result.get("policy")).toBe("conflict");
      expect(result.get("scope")).toBe("conflict");
      expect(result.get("name")).toBe("keepTheirs");
    });

    it("spreads a conflict but leaves unchanged fields alone", () => {
      const result = applyGroups(
        new Map<string, MergeDecision>([
          ["policy", "conflict"],
          ["scope", "noop"],
        ]),
        groups,
      );

      expect(result.get("policy")).toBe("conflict");
      expect(result.get("scope")).toBe("noop");
    });

    it("keeps a group that merges cleanly", () => {
      const result = applyGroups(
        new Map<string, MergeDecision>([
          ["policy", "apply"],
          ["scope", "apply"],
        ]),
        groups,
      );

      expect(result.get("policy")).toBe("apply");
      expect(result.get("scope")).toBe("apply");
    });
  });
});
