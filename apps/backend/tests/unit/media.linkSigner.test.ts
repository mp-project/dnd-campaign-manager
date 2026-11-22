import { downloadUrlWindow } from "#core/storage/downloadWindow";
import { MediaLinkSigner } from "#src/modules/media/service/MediaLinkSigner";

const content = {
  mediaId: "f0000000-0000-4000-8000-00000000000a",
  kind: "THUMBNAIL" as const,
  expiresAt: 2_000_000,
};

describe("MediaLinkSigner", () => {
  const signer = new MediaLinkSigner();

  it("verifies its own links until they expire", () => {
    const token = signer.sign(content);
    const original = signer.sign({ ...content, kind: null });

    expect(signer.verify(token, 1_000_000)).toEqual(content);
    expect(signer.verify(original, 1_000_000)).toEqual({ ...content, kind: null });
    expect(signer.verify(token, 2_000_000)).toBeNull();
  });

  it("stays short enough for a path parameter", () => {
    expect(signer.sign(content).length).toBeLessThanOrEqual(100);
  });

  it("refuses links of another key and changed or damaged tokens", () => {
    const token = signer.sign(content);
    const bytes = Buffer.from(token, "base64url");

    bytes[0] = bytes[0]! ^ 1;

    expect(new MediaLinkSigner().verify(token, 0)).toBeNull();
    expect(signer.verify(bytes.toString("base64url"), 0)).toBeNull();
    expect(signer.verify(token.slice(0, -2), 0)).toBeNull();
    expect(signer.verify(`${token}AA`, 0)).toBeNull();
    expect(signer.verify("", 0)).toBeNull();
  });

  it("gives the same link within a time window", () => {
    expect(signer.sign(content)).toBe(signer.sign(content));
  });
});

describe("downloadUrlWindow", () => {
  it("starts at the window and lasts two of them, so at least the TTL from now", () => {
    expect(downloadUrlWindow(300, 1_000_000)).toEqual({
      signedAt: new Date(900_000),
      expiresAt: new Date(1_500_000),
    });
    expect(downloadUrlWindow(300, 1_199_999).expiresAt.getTime()).toBeGreaterThanOrEqual(
      1_199_999 + 300_000,
    );
  });
});
