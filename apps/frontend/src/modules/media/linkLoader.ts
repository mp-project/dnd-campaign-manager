import { ApiError } from "@/core/api/errors";

import { getMediaLink, listMediaLinks, MEDIA_LINKS_MAX_IDS, type MediaLink, type MediaVariant } from "./api";

type Waiting = { resolve: (link: MediaLink) => void; reject: (error: unknown) => void };
type Batch = { campaignId: string; variant: MediaVariant | undefined; waiting: Map<string, Waiting[]> };

/**
 * How long requests are collected. Images of one page mount in the same render, but their queries
 * start a moment apart; a few milliseconds catch them without being noticeable.
 */
const COLLECT_MS = 10;

const batches = new Map<string, Batch>();

/**
 * One link, asked for together with the others a page wants at the same moment: a gallery sends one
 * request instead of one per image. A file the answer leaves out (hidden, deleted, not ready)
 * fails with 404 like the single request would.
 */
export function loadMediaLink(campaignId: string, mediaId: string, variant?: MediaVariant): Promise<MediaLink> {
  const key = `${campaignId}:${variant ?? ""}`;
  let batch = batches.get(key);

  if (!batch) {
    batch = { campaignId, variant, waiting: new Map() };
    batches.set(key, batch);
    setTimeout(() => {
      batches.delete(key);
      void send(batch!);
    }, COLLECT_MS);
  }

  const waiting = batch.waiting;

  return new Promise((resolve, reject) => {
    waiting.set(mediaId, [...(waiting.get(mediaId) ?? []), { resolve, reject }]);
  });
}

async function send(batch: Batch): Promise<void> {
  const ids = [...batch.waiting.keys()];
  const chunks: string[][] = [];

  for (let start = 0; start < ids.length; start += MEDIA_LINKS_MAX_IDS) {
    chunks.push(ids.slice(start, start + MEDIA_LINKS_MAX_IDS));
  }

  await Promise.all(chunks.map((chunk) => sendChunk(batch, chunk)));
}

async function sendChunk(batch: Batch, chunk: string[]): Promise<void> {
  try {
    const links =
      chunk.length === 1
        ? [await getMediaLink(batch.campaignId, chunk[0]!, batch.variant)]
        : (await listMediaLinks(batch.campaignId, chunk, batch.variant)).data;
    const byId = new Map(links.map((link) => [link.mediaId, link]));

    for (const id of chunk) {
      const link = byId.get(id);

      for (const waiting of batch.waiting.get(id) ?? []) {
        if (link) {
          waiting.resolve(link);
        } else {
          waiting.reject(new ApiError({ status: 404, code: "NOT_FOUND", message: "Media not found" }));
        }
      }
    }
  } catch (error) {
    // Each query reports its own failure; the request failed for all of them alike.
    for (const id of chunk) {
      for (const waiting of batch.waiting.get(id) ?? []) {
        waiting.reject(error);
      }
    }
  }
}
