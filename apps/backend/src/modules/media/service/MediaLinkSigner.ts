import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { MediaVariantRow } from "#src/modules/media/domain/repository/MediaRepository";

type VariantKind = MediaVariantRow["kind"];

/** What a signed link names; the rights were checked when it was handed out. */
export type SignedMediaLink = {
  mediaId: string;
  kind: VariantKind | null;
  /** Epoch milliseconds, whole seconds. */
  expiresAt: number;
};

const KINDS: readonly (VariantKind | null)[] = [null, "THUMBNAIL", "DISPLAY"];
const PAYLOAD_BYTES = 16 + 1 + 6;
const MAC_BYTES = 32;

/**
 * Links to the API's own content route for storages a browser can't fetch from itself (local and
 * in-memory storage, i.e. development and tests). The token names file, variant and expiry with an
 * HMAC over them, so the route needs no session, like a signed S3 link. It is binary and short,
 * because Fastify limits path parameters to 100 characters. The key is random per process: links
 * die with a restart, and several API instances would need a shared key, but production always
 * uses S3.
 */
export class MediaLinkSigner {
  constructor(private readonly key: Buffer = randomBytes(32)) {}

  sign(link: SignedMediaLink): string {
    const payload = Buffer.alloc(PAYLOAD_BYTES);

    Buffer.from(link.mediaId.replaceAll("-", ""), "hex").copy(payload, 0);
    payload.writeUInt8(KINDS.indexOf(link.kind), 16);
    payload.writeUIntBE(Math.floor(link.expiresAt / 1000), 17, 6);

    return Buffer.concat([payload, this.mac(payload)]).toString("base64url");
  }

  /** Null for a token that is damaged, foreign or expired. */
  verify(token: string, now: number = Date.now()): SignedMediaLink | null {
    const bytes = Buffer.from(token, "base64url");

    if (bytes.length !== PAYLOAD_BYTES + MAC_BYTES || bytes.toString("base64url") !== token) {
      return null;
    }

    const payload = bytes.subarray(0, PAYLOAD_BYTES);

    if (!timingSafeEqual(bytes.subarray(PAYLOAD_BYTES), this.mac(payload))) {
      return null;
    }

    const kind = KINDS[payload.readUInt8(16)];
    const expiresAt = payload.readUIntBE(17, 6) * 1000;

    if (kind === undefined || expiresAt <= now) {
      return null;
    }

    const hex = payload.subarray(0, 16).toString("hex");

    return {
      mediaId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
      kind,
      expiresAt,
    };
  }

  private mac(payload: Buffer): Buffer {
    return createHmac("sha256", this.key).update(payload).digest();
  }
}
