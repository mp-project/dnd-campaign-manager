const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

export type MediaCategory = "image" | "document" | "audio" | "video" | "text";

export type MediaLimits = {
  /** Largest single file per category. */
  maxFileBytes: Record<MediaCategory, number>;
  /** Per campaign: its files, including uploads still running. Generated variants don't count. */
  totalBytes: number;
};

/** Only what differs from the defaults. */
export type MediaLimitOverrides = {
  maxFileBytes?: Partial<MediaLimits["maxFileBytes"]>;
  totalBytes?: number;
};

/**
 * Lets another module replace limits per campaign, without this module having to know why.
 * Register it with `MediaQuotaService.registerLimitsProvider`.
 */
export type MediaLimitsProvider = {
  /** Called outside of transactions. Null keeps the defaults. */
  findOverrides(campaignId: string): Promise<MediaLimitOverrides | null>;
};

export const MEDIA_DEFAULT_LIMITS: MediaLimits = {
  maxFileBytes: {
    image: 50 * MIB,
    document: 50 * MIB,
    audio: 100 * MIB,
    video: 100 * MIB,
    text: 5 * MIB,
  },
  totalBytes: 5 * GIB,
};

export function applyMediaLimitOverrides(overrides: MediaLimitOverrides | null): MediaLimits {
  return {
    maxFileBytes: { ...MEDIA_DEFAULT_LIMITS.maxFileBytes, ...overrides?.maxFileBytes },
    totalBytes: overrides?.totalBytes ?? MEDIA_DEFAULT_LIMITS.totalBytes,
  };
}

/** Anything else that gets allowed by configuration falls under the smallest limit. */
export function toMediaCategory(mimeType: string): MediaCategory {
  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  return mimeType === "application/pdf" ? "document" : "text";
}
