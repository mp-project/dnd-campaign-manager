import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function encodeSignedJson<TPayload>(
  payload: TPayload,
  secret: string,
): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signPayload(body, secret);

  return `${body}.${signature}`;
}

export function decodeSignedJson<TPayload>(
  value: string,
  secret: string,
): TPayload | null {
  const separatorIndex = value.lastIndexOf(".");

  if (separatorIndex <= 0 || separatorIndex >= value.length - 1) {
    return null;
  }

  const body = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);
  const expectedSignature = signPayload(body, secret);

  if (!constantTimeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const decoded = Buffer.from(body, "base64url").toString("utf8");
    return JSON.parse(decoded) as TPayload;
  } catch {
    return null;
  }
}
