import { StorageError } from "#core/storage/errors";

export const defaultAllowedMimeTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "video/mp4",
  "video/webm",
] as const;

type Signature = {
  mimeTypes: readonly string[];
  matches: (bytes: Uint8Array) => boolean;
};

const signatures: Signature[] = [
  {
    mimeTypes: ["image/png"],
    matches: (bytes) =>
      hasSignature(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    mimeTypes: ["image/jpeg"],
    matches: (bytes) => hasSignature(bytes, [0xff, 0xd8, 0xff]),
  },
  {
    mimeTypes: ["image/gif"],
    matches: (bytes) => hasSignature(bytes, [0x47, 0x49, 0x46, 0x38]),
  },
  {
    mimeTypes: ["image/webp"],
    matches: (bytes) =>
      hasSignature(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      hasSignature(bytes, [0x57, 0x45, 0x42, 0x50], 8),
  },
  {
    mimeTypes: ["application/pdf"],
    matches: (bytes) => hasSignature(bytes, [0x25, 0x50, 0x44, 0x46]),
  },
  {
    mimeTypes: ["audio/mpeg"],
    matches: (bytes) =>
      hasSignature(bytes, [0x49, 0x44, 0x33]) ||
      startsWithMpegFrameHeader(bytes),
  },
  {
    mimeTypes: ["audio/wav"],
    matches: (bytes) =>
      hasSignature(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      hasSignature(bytes, [0x57, 0x41, 0x56, 0x45], 8),
  },
  {
    mimeTypes: ["audio/ogg"],
    matches: (bytes) => hasSignature(bytes, [0x4f, 0x67, 0x67, 0x53]),
  },
  {
    mimeTypes: ["video/mp4"],
    matches: (bytes) => hasSignature(bytes, [0x66, 0x74, 0x79, 0x70], 4),
  },
  {
    mimeTypes: ["video/webm"],
    matches: (bytes) => hasSignature(bytes, [0x1a, 0x45, 0xdf, 0xa3]),
  },
];

const signatureRequiredMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "video/mp4",
  "video/webm",
]);

/**
 * Normalizes a MIME value by removing parameters and lowercasing.
 *
 * @param value Raw MIME value, potentially including charset parameters.
 * @returns Canonical MIME type string.
 */
export function normalizeMimeType(value: string): string {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

/**
 * Parses a comma-separated MIME allowlist into normalized values.
 *
 * @param value Comma-separated MIME string from configuration.
 * @returns Set of normalized MIME types.
 */
export function parseMimeAllowlist(value: string): ReadonlySet<string> {
  const entries = value
    .split(",")
    .map((entry) => normalizeMimeType(entry))
    .filter((entry) => entry.length > 0);

  return new Set(entries);
}

function hasSignature(
  bytes: Uint8Array,
  signature: readonly number[],
  offset = 0,
): boolean {

  if (bytes.length < offset + signature.length) {
    return false;
  }

  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[offset + index] !== signature[index]) {
      return false;
    }
  }

  return true;
}

function startsWithMpegFrameHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 2) {
    return false;
  }

  const first = bytes[0] ?? 0;
  const second = bytes[1] ?? 0;

  return first === 0xff && (second & 0xe0) === 0xe0;
}

function detectMimeTypesFromMagicBytes(bytes: Uint8Array): ReadonlySet<string> {
  const detected = new Set<string>();

  for (const signature of signatures) {
    if (signature.matches(bytes)) {
      for (const mimeType of signature.mimeTypes) {
        detected.add(mimeType);
      }
    }
  }

  return detected;
}

/**
 * Detects the first matching MIME type from binary magic bytes.
 *
 * @param bytes Leading bytes of the uploaded file.
 * @returns Matching MIME type or null when no signature is recognized.
 */
export function detectMimeTypeFromMagicBytes(bytes: Uint8Array): string | null {
  const detectedMimeTypes = detectMimeTypesFromMagicBytes(bytes);

  for (const mimeType of detectedMimeTypes) {
    return mimeType;
  }

  return null;
}

/**
 * Ensures a declared MIME type is part of the configured allowlist.
 *
 * @param declaredMimeType MIME type reported by the client upload.
 * @param allowlist Set of accepted MIME types.
 * @returns Normalized declared MIME type.
 */
export function assertAllowedMimeType(
  declaredMimeType: string,
  allowlist: ReadonlySet<string>,
): string {
  const normalizedMimeType = normalizeMimeType(declaredMimeType);

  if (!normalizedMimeType || !allowlist.has(normalizedMimeType)) {
    throw new StorageError(
      "UNSUPPORTED_CONTENT_TYPE",
      `Unsupported content type: ${declaredMimeType}`,
      {
        statusCode: 415,
        details: { declaredMimeType },
      },
    );
  }

  return normalizedMimeType;
}

/**
 * Validates that payload magic bytes are compatible with the declared MIME type.
 *
 * @param input Declared MIME type and leading payload bytes.
 * @returns Detected MIME type when available, otherwise null.
 */
export function assertMagicBytesMatchMimeType(input: {
  declaredMimeType: string;
  bytes: Uint8Array;
}): string | null {
  const normalizedDeclared = normalizeMimeType(input.declaredMimeType);
  const detectedMimeTypes = detectMimeTypesFromMagicBytes(input.bytes);
  let detectedMimeType: string | null = null;

  for (const mimeType of detectedMimeTypes) {
    detectedMimeType = mimeType;
    break;
  }

  if (
    detectedMimeTypes.size > 0 &&
    !detectedMimeTypes.has(normalizedDeclared)
  ) {
    throw new StorageError(
      "CONTENT_TYPE_MISMATCH",
      `Declared content type ${normalizedDeclared} does not match payload ${detectedMimeType}`,
      {
        statusCode: 415,
        details: {
          declaredMimeType: normalizedDeclared,
          detectedMimeType,
          detectedMimeTypes: [...detectedMimeTypes],
        },
      },
    );
  }

  if (!detectedMimeType && signatureRequiredMimeTypes.has(normalizedDeclared)) {
    throw new StorageError(
      "INVALID_MAGIC_BYTES",
      `Could not validate magic bytes for ${normalizedDeclared}`,
      {
        statusCode: 415,
        details: { declaredMimeType: normalizedDeclared },
      },
    );
  }

  return detectedMimeType;
}
