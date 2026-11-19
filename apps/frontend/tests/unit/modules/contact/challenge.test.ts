import { afterEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => {
  const state = { paths: [] as string[] };
  globalThis.fetch = (async (request: Request) => {
    state.paths.push(`${request.method} ${new URL(request.url).pathname}`);
    return new Response(
      JSON.stringify({
        parameters: { algorithm: "SHA-256", nonce: "ab", salt: "cd", cost: 1, keyLength: 32, keyPrefix: "00" },
        signature: "sig",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  return state;
});

const altcha = vi.hoisted(() => ({ solution: { counter: 7, derivedKey: "00ff" } as { counter: number; derivedKey: string } | null }));
vi.mock("altcha-lib", () => ({ solveChallenge: vi.fn(async () => altcha.solution) }));

import { solveChallenge } from "altcha-lib";

import { CHALLENGE_MIN_AGE_MS, ContactChallengeError, solveContactChallenge } from "@/modules/contact/challenge";

afterEach(() => {
  calls.paths.length = 0;
  altcha.solution = { counter: 7, derivedKey: "00ff" };
});

describe("contact JS challenge", () => {
  it("fetches a task, solves it with Web Crypto and returns task and solution", async () => {
    const wait = vi.fn(async () => undefined);
    const solved = await solveContactChallenge(wait);
    expect(calls.paths).toEqual(["GET /api/v1/contact/challenge"]);
    expect(vi.mocked(solveChallenge).mock.calls[0]![0]).toMatchObject({
      challenge: { signature: "sig" },
      deriveKey: expect.any(Function),
    });
    expect(solved).toEqual({
      challenge: expect.objectContaining({ signature: "sig" }),
      solution: { counter: 7, derivedKey: "00ff" },
    });
  });

  it("waits until the task is old enough to count", async () => {
    const wait = vi.fn(async () => undefined);
    await solveContactChallenge(wait);
    expect(wait).toHaveBeenCalledOnce();
    const left = (wait.mock.calls[0] as unknown as [number])[0];
    expect(left).toBeGreaterThan(CHALLENGE_MIN_AGE_MS - 1_000);
    expect(left).toBeLessThanOrEqual(CHALLENGE_MIN_AGE_MS);
  });

  it("fails when the task can't be solved in time", async () => {
    altcha.solution = null;
    await expect(solveContactChallenge(async () => undefined)).rejects.toBeInstanceOf(ContactChallengeError);
  });
});
