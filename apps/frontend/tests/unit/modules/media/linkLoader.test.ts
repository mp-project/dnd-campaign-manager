import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getMediaLink: vi.fn(),
  listMediaLinks: vi.fn(),
}));
vi.mock("@/modules/media/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/media/api")>()),
  ...api,
}));

import { ApiError } from "@/core/api/errors";
import { loadMediaLink } from "@/modules/media/linkLoader";

const CAMPAIGN = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const ID = (n: number) => `f0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const linkOf = (mediaId: string) => ({
  mediaId,
  url: `https://storage.example/${mediaId}`,
  expiresAt: new Date(Date.now() + 300_000).toISOString(),
  expiresInSeconds: 300,
  mimeType: "image/png",
});

/** Answers every id it is asked for, except those in `missing`. */
function answerAll(missing: string[] = []) {
  api.listMediaLinks.mockImplementation(async (_campaign: string, ids: string[]) => ({
    data: ids.filter((id) => !missing.includes(id)).map(linkOf),
  }));
  api.getMediaLink.mockImplementation(async (_campaign: string, id: string) => linkOf(id));
}

describe("loadMediaLink", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("asks for one link alone", async () => {
    answerAll();

    await expect(loadMediaLink(CAMPAIGN, ID(1), "thumbnail")).resolves.toMatchObject({ mediaId: ID(1) });
    expect(api.getMediaLink).toHaveBeenCalledWith(CAMPAIGN, ID(1), "thumbnail");
    expect(api.listMediaLinks).not.toHaveBeenCalled();
  });

  it("asks for the links of one moment together and answers callers of the same id alike", async () => {
    answerAll();

    const links = await Promise.all([
      loadMediaLink(CAMPAIGN, ID(1)),
      loadMediaLink(CAMPAIGN, ID(2)),
      loadMediaLink(CAMPAIGN, ID(1)),
    ]);

    expect(links.map((link) => link.mediaId)).toEqual([ID(1), ID(2), ID(1)]);
    expect(api.listMediaLinks).toHaveBeenCalledTimes(1);
    expect(api.listMediaLinks).toHaveBeenCalledWith(CAMPAIGN, [ID(1), ID(2)], undefined);
  });

  it("asks separately per variant", async () => {
    answerAll();

    await Promise.all([
      loadMediaLink(CAMPAIGN, ID(1), "thumbnail"),
      loadMediaLink(CAMPAIGN, ID(2), "thumbnail"),
      loadMediaLink(CAMPAIGN, ID(1), "display"),
      loadMediaLink(CAMPAIGN, ID(2), "display"),
    ]);

    expect(api.listMediaLinks).toHaveBeenCalledTimes(2);
    expect(api.listMediaLinks).toHaveBeenCalledWith(CAMPAIGN, [ID(1), ID(2)], "thumbnail");
    expect(api.listMediaLinks).toHaveBeenCalledWith(CAMPAIGN, [ID(1), ID(2)], "display");
  });

  it("splits more than 100 ids into requests sent at the same time", async () => {
    const waiting: Array<() => void> = [];
    api.listMediaLinks.mockImplementation(
      (_campaign: string, ids: string[]) =>
        new Promise((resolve) => waiting.push(() => resolve({ data: ids.map(linkOf) }))),
    );

    const all = Promise.all(Array.from({ length: 250 }, (_, n) => loadMediaLink(CAMPAIGN, ID(n))));

    await vi.waitFor(() => expect(api.listMediaLinks).toHaveBeenCalledTimes(3));
    expect(api.listMediaLinks.mock.calls.map(([, ids]) => (ids as string[]).length)).toEqual([100, 100, 50]);

    waiting.forEach((resolve) => resolve());
    await expect(all).resolves.toHaveLength(250);
  });

  it("fails what the answer leaves out with 404", async () => {
    answerAll([ID(2)]);

    const [shown, hidden] = await Promise.allSettled([loadMediaLink(CAMPAIGN, ID(1)), loadMediaLink(CAMPAIGN, ID(2))]);

    expect(shown.status).toBe("fulfilled");
    expect(hidden).toMatchObject({ status: "rejected", reason: { status: 404, code: "NOT_FOUND" } });
  });

  it("fails every caller of a request that failed", async () => {
    const failure = new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "-" });
    api.listMediaLinks.mockRejectedValue(failure);

    const results = await Promise.allSettled([loadMediaLink(CAMPAIGN, ID(1)), loadMediaLink(CAMPAIGN, ID(2))]);

    expect(results).toEqual([
      { status: "rejected", reason: failure },
      { status: "rejected", reason: failure },
    ]);
  });
});
