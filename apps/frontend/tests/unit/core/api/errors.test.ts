import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { API_ERROR_CODES, ApiError, errorMessageKey, toApiError } from "@/core/api/errors";

const BACKEND = join(import.meta.dirname, "../../../../../backend/src");

/** Codes of a backend declaration: a union type or a const array (`export const x = [ … ]`). */
function backendCodes(file: string, declaration: RegExp): string[] {
  const source = readFileSync(join(BACKEND, file), "utf8");
  const body = declaration.exec(source)?.[1] ?? "";
  return [...body.matchAll(/"([A-Z_]+)"/g)].map((match) => match[1]!);
}

const envelope = (code: string) => ({ error: { code, message: "server text", requestId: "r1" } });

describe("API error messages", () => {
  it("knows every code the backend sends", () => {
    const sent = [
      ...backendCodes("core/error/http/codes.ts", /domainErrorCodes = \[([^\]]+)\]/),
      ...backendCodes("core/storage/errors.ts", /type StorageErrorCode =([^;]+);/),
    ];
    expect(sent.length).toBeGreaterThan(10);
    expect(sent.filter((code) => !(API_ERROR_CODES as readonly string[]).includes(code))).toEqual([]);
  });

  it("has a text for every code in every language", () => {
    const LOCALES = join(import.meta.dirname, "../../../../src/locales");
    const codes = [...API_ERROR_CODES, "NETWORK_ERROR", "UNKNOWN_ERROR"];

    for (const language of ["de", "en"]) {
      const messages = JSON.parse(readFileSync(join(LOCALES, language, "errors.json"), "utf8")) as Record<string, unknown>;
      expect(codes.filter((code) => typeof messages[code] !== "string")).toEqual([]);
    }
  });

  it("names the domain reason: a file type that isn't allowed, a full campaign storage", () => {
    const error = toApiError(new Response(null, { status: 415 }), envelope("INVALID_MAGIC_BYTES"));
    expect(errorMessageKey(error)).toBe("errors.INVALID_MAGIC_BYTES");
    const full = toApiError(new Response(null, { status: 413 }), envelope("STORAGE_QUOTA_EXCEEDED"));
    expect(errorMessageKey(full)).toBe("errors.STORAGE_QUOTA_EXCEEDED");
  });

  it("falls back to the general text of the status for codes it doesn't know yet", () => {
    const unknown = (status: number) => errorMessageKey(toApiError(new Response(null, { status }), envelope("SOMETHING_NEW")));
    expect(unknown(401)).toBe("errors.UNAUTHENTICATED");
    expect(unknown(409)).toBe("errors.CONFLICT");
    expect(unknown(502)).toBe("errors.INTERNAL_ERROR");
    expect(unknown(413)).toBe("errors.MAX_UPLOAD_SIZE_EXCEEDED");
    expect(unknown(418)).toBe("errors.UNKNOWN_ERROR");
    expect(errorMessageKey(new ApiError({ status: 0, code: "NETWORK_ERROR", message: "offline" }))).toBe("errors.NETWORK_ERROR");
    expect(errorMessageKey(new Error("x"))).toBe("errors.UNKNOWN_ERROR");
  });
});
