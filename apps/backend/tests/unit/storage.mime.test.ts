import {
  assertAllowedMimeType,
  assertMagicBytesMatchMimeType,
  detectMimeTypeFromMagicBytes,
  defaultAllowedMimeTypes,
  parseMimeAllowlist,
  StorageError,
} from "#core/storage";

describe("storage mime validation", () => {
  it("includes audio and video defaults", () => {
    expect(defaultAllowedMimeTypes).toEqual(
      expect.arrayContaining([
        "audio/mpeg",
        "audio/wav",
        "audio/ogg",
        "video/mp4",
        "video/webm",
      ]),
    );
  });

  it("parses and normalizes allowlist values", () => {
    const allowlist = parseMimeAllowlist(" audio/mpeg; charset=utf-8 , video/mp4 ");

    expect(allowlist.has("audio/mpeg")).toBe(true);
    expect(allowlist.has("video/mp4")).toBe(true);
  });

  it("detects mp3 and validates declared audio type", () => {
    const mp3Header = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]);

    expect(detectMimeTypeFromMagicBytes(mp3Header)).toBe("audio/mpeg");
    expect(
      assertMagicBytesMatchMimeType({
        declaredMimeType: "audio/mpeg",
        bytes: mp3Header,
      }),
    ).toBe("audio/mpeg");
  });

  it("detects mp4 and validates declared video type", () => {
    const mp4Header = Buffer.from([
      0x00, 0x00, 0x00, 0x20,
      0x66, 0x74, 0x79, 0x70,
      0x69, 0x73, 0x6f, 0x6d,
    ]);

    expect(detectMimeTypeFromMagicBytes(mp4Header)).toBe("video/mp4");
    expect(
      assertMagicBytesMatchMimeType({
        declaredMimeType: "video/mp4",
        bytes: mp4Header,
      }),
    ).toBe("video/mp4");
  });

  it("rejects content-type mismatches for audio/video", () => {
    const mp3Header = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]);

    expect(() =>
      assertMagicBytesMatchMimeType({
        declaredMimeType: "video/mp4",
        bytes: mp3Header,
      }),
    ).toThrow(
      expect.objectContaining<Partial<StorageError>>({
        code: "CONTENT_TYPE_MISMATCH",
      }),
    );
  });

  it("rejects required binary type when magic bytes are missing", () => {
    const invalidPayload = Buffer.from("not-a-video", "utf8");

    expect(() =>
      assertMagicBytesMatchMimeType({
        declaredMimeType: "video/mp4",
        bytes: invalidPayload,
      }),
    ).toThrow(
      expect.objectContaining<Partial<StorageError>>({
        code: "INVALID_MAGIC_BYTES",
      }),
    );
  });

  it("enforces allowlist for declared mime types", () => {
    const allowlist = new Set(["video/mp4"]);

    expect(() => assertAllowedMimeType("audio/mpeg", allowlist)).toThrow(
      expect.objectContaining<Partial<StorageError>>({
        code: "UNSUPPORTED_CONTENT_TYPE",
      }),
    );
  });
});
