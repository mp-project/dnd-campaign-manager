import http from "node:http";
import type { AddressInfo } from "node:net";

import { eq } from "drizzle-orm";
import jsonwebtoken from "jsonwebtoken";
import sharp from "sharp";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import {
  campaignMemberships,
  campaigns,
  mediaFiles,
  mediaUploads,
  mediaVariants,
  rulesets,
  users,
} from "#core/db/schema";
import {
  ensureS3BucketAndCors,
  type S3BootstrapOptions,
  S3CompatibleStorage,
} from "#core/storage/s3Storage";
import { MediaRepository } from "#src/modules/media/domain/repository/MediaRepository";
import { MediaVariantService } from "#src/modules/media/service/MediaVariantService";
import { buildTestApp, type TestActor } from "#test/helpers/buildTestApp";
import { sendMediaUpload } from "#test/helpers/mediaUpload";
import {
  createTestS3Storage,
  deleteTestBucket,
  testS3Options,
} from "#test/helpers/s3TestStorage";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

const RULESET_ID = "10000000-0000-4000-8000-000000002024";
const GM_ID = "a0000000-0000-4000-8000-000000000001";
const CAMPAIGN_ID = "c0000000-0000-4000-8000-00000000000a";
const GM: TestActor = { actorId: GM_ID, systemRole: "USER" };
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const pngOf = (size: number) =>
  Buffer.concat([PNG_HEADER, Buffer.alloc(size - PNG_HEADER.length, 7)]);

describe("media on S3 (RustFS)", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const mediaUrl = `/api/v1/campaigns/${CAMPAIGN_ID}/media`;
  let options: S3BootstrapOptions;
  let storage: S3CompatibleStorage;
  let session: ReturnType<typeof buildTestApp>;

  const upload = (bytes: Buffer, mimeType = "image/png", originalName = "map.png") =>
    sendMediaUpload((request) => session.injectAs(GM, request), mediaUrl, {
      originalName,
      mimeType,
      content: bytes,
    });

  const content = (id: string) =>
    session.injectAs(GM, { method: "GET", url: `${mediaUrl}/${id}/content` });

  /** Everything except the marker of the bucket bootstrap. */
  const listObjects = async () =>
    (await storage.listKeys()).filter((key) => !key.startsWith("_system/"));

  beforeEach(async () => {
    options = testS3Options();
    await ensureS3BucketAndCors(options);
    storage = createTestS3Storage(options);
    session = buildTestApp({
      env: { STORAGE_DOWNLOAD_URL_TTL_SECONDS: 300 },
      publicPorts: { storagePort: storage },
    });

    await db.insert(users).values({
      id: GM_ID,
      email: "gm@example.test",
      passwordHash: "hash",
      displayName: "GM",
      systemRole: "USER",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    });
    await db.insert(rulesets).values({
      id: RULESET_ID,
      code: "MEDIA_S3",
      name: "Ruleset",
      status: "ACTIVE",
      editionYear: 2024,
      sourceReference: {},
      licenseCode: "TEST",
    });
    await db.insert(campaigns).values({
      id: CAMPAIGN_ID,
      ownerUserId: GM_ID,
      slug: "own",
      rulesetId: RULESET_ID,
      name: "Campaign",
      status: "ACTIVE",
      createdBy: GM_ID,
    });
    await db.insert(campaignMemberships).values({
      campaignId: CAMPAIGN_ID,
      userId: GM_ID,
      role: "EDITOR",
      createdBy: GM_ID,
    });
  });

  afterEach(async () => {
    await session.app.close();
    storage.close();
    await deleteTestBucket(options);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("uploads several parts, redirects to the file and deletes it", async () => {
    const bytes = pngOf(9 * 1024 * 1024);
    const created = await upload(bytes);

    expect(created.statusCode).toBe(201);

    const { id } = created.json() as { id: string };
    const [row] = await db.select().from(mediaFiles).where(eq(mediaFiles.id, id));

    expect(row).toMatchObject({ status: "READY", sizeBytes: bytes.length });
    await expect(listObjects()).resolves.toEqual([row!.storageKey]);

    const served = await content(id);

    expect(served.statusCode).toBe(302);
    expect(served.headers["cache-control"]).toBe("private, max-age=300");

    const file = await fetch(served.headers.location as string);

    expect(file.status).toBe(200);
    expect(Buffer.from(await file.arrayBuffer()).equals(bytes)).toBe(true);
    expect(file.headers.get("content-type")).toBe("image/png");
    expect(file.headers.get("content-disposition")).toContain("inline");
    expect(file.headers.get("cache-control")).toBe("private, max-age=300");

    const removed = await session.injectAs(GM, { method: "DELETE", url: `${mediaUrl}/${id}` });

    expect(removed.statusCode).toBe(200);
    await expect(listObjects()).resolves.toEqual([]);
  }, 30_000);

  it("counts the file against the limit of the campaign", async () => {
    const bytes = pngOf(1024);
    const completed = await upload(bytes);

    expect(completed.json().storageUsage).toEqual({
      usedBytes: bytes.length,
      totalBytes: 5 * 1024 * 1024 * 1024,
    });

    const removed = await session.injectAs(GM, {
      method: "DELETE",
      url: `${mediaUrl}/${completed.json().id}`,
    });

    expect(removed.json().storageUsage.usedBytes).toBe(0);
  }, 30_000);

  it("supports seeking through range requests, and downloads documents", async () => {
    const bytes = Buffer.concat([Buffer.from("%PDF-1.7 "), Buffer.alloc(4096, 1)]);
    const { id } = (await upload(bytes, "application/pdf", "notes.pdf")).json() as { id: string };
    const served = await content(id);
    const part = await fetch(served.headers.location as string, {
      headers: { range: "bytes=0-3" },
    });

    expect(part.status).toBe(206);
    expect(await part.text()).toBe("%PDF");
    expect(part.headers.get("content-disposition")).toContain("attachment");
  });

  it("gives the same link within a time window, so the browser can use its cache", async () => {
    const { id } = (await upload(pngOf(1024))).json() as { id: string };
    const now = Date.now();
    const windowLeft = 300_000 - (now % 300_000);

    // The window could end between the two requests.
    if (windowLeft > 2000) {
      expect((await content(id)).headers.location).toBe((await content(id)).headers.location);
    }
  });

  it("signs links for the address browsers reach the storage at", async () => {
    const { id } = (await upload(pngOf(1024))).json() as { id: string };
    const publicStorage = createTestS3Storage({
      ...options,
      publicEndpoint: "https://s3.example.test",
    });
    const publicSession = buildTestApp({ publicPorts: { storagePort: publicStorage } });
    const served = await publicSession.injectAs(GM, {
      method: "GET",
      url: `${mediaUrl}/${id}/content`,
    });

    await publicSession.app.close();
    publicStorage.close();

    expect(served.headers.location).toMatch(/^https:\/\/s3\.example\.test\//);
  });

  it("rejects a file above the limit before it takes any byte", async () => {
    const response = await session.injectAs(GM, {
      method: "POST",
      url: `${mediaUrl}/uploads`,
      payload: { originalName: "a.txt", mimeType: "text/plain", sizeBytes: 5 * 1024 * 1024 + 1 },
    });

    expect(response.statusCode).toBe(413);
    await expect(db.select().from(mediaUploads)).resolves.toEqual([]);
  });

  it("rejects a file whose content doesn't match its type and leaves nothing behind", async () => {
    const response = await upload(Buffer.from("not a png"));

    expect(response.statusCode).toBe(415);
    await expect(listObjects()).resolves.toEqual([]);
    await expect(db.select().from(mediaUploads)).resolves.toEqual([]);
  });

  it("generates smaller WebP variants and delivers them", async () => {
    const image = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: "#7a1f2b" },
    })
      .png()
      .toBuffer();
    const { id } = (await upload(image)).json() as { id: string };
    const variants = new MediaVariantService(db, new MediaRepository(), storage, {
      error: (details) => {
        throw new Error(String(details));
      },
    });

    await expect(variants.processNext()).resolves.toBe(true);
    await expect(variants.processNext()).resolves.toBe(false);

    const [row] = await db.select().from(mediaFiles).where(eq(mediaFiles.id, id));

    expect(row).toMatchObject({ width: 3000, height: 2000 });

    const served = await session.injectAs(GM, {
      method: "GET",
      url: `${mediaUrl}/${id}/content?variant=thumbnail`,
    });
    const thumbnail = await fetch(served.headers.location as string);
    const metadata = await sharp(Buffer.from(await thumbnail.arrayBuffer())).metadata();

    expect(thumbnail.headers.get("content-type")).toBe("image/webp");
    expect(metadata).toMatchObject({ format: "webp", width: 480, height: 320 });

    await session.injectAs(GM, { method: "DELETE", url: `${mediaUrl}/${id}` });
    await expect(listObjects()).resolves.toEqual([]);
  }, 30_000);

  it("gives up on an image it can't read and keeps delivering the original", async () => {
    const { id } = (await upload(pngOf(1024))).json() as { id: string };
    const logger = { error: jest.fn() };
    const variants = new MediaVariantService(db, new MediaRepository(), storage, logger);

    await variants.processNext();
    await variants.processNext();
    await variants.processNext();

    await expect(variants.processNext()).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(3);

    const rows = await db.select().from(mediaVariants).where(eq(mediaVariants.mediaId, id));

    expect(rows.map((row) => row.status)).toEqual(["FAILED", "FAILED"]);

    const served = await session.injectAs(GM, {
      method: "GET",
      url: `${mediaUrl}/${id}/content?variant=thumbnail`,
    });
    const file = await fetch(served.headers.location as string);

    expect(file.headers.get("content-type")).toBe("image/png");
  });

  it("survives a client breaking off a part, which can then be sent again", async () => {
    const bytes = pngOf(1024 * 1024);
    const created = await session.injectAs(GM, {
      method: "POST",
      url: `${mediaUrl}/uploads`,
      payload: { originalName: "map.png", mimeType: "image/png", sizeBytes: bytes.length },
    });
    const { id } = created.json() as { id: string };

    await session.app.listen({ port: 0, host: "127.0.0.1" });

    const { port } = session.app.server.address() as AddressInfo;
    const partPath = `http://127.0.0.1:${port}/api/v1${mediaUrl.replace("/api/v1", "")}/uploads/${id}/parts/1`;
    const headers = {
      authorization: `Bearer ${jsonwebtoken.sign({ systemRole: "USER" }, session.env.JWT_ACCESS_SECRET, { algorithm: "HS256", subject: GM_ID, expiresIn: "5m" })}`,
      "content-type": "application/octet-stream",
    };

    await new Promise<void>((resolve) => {
      const request = http.request(partPath, {
        method: "PUT",
        headers: { ...headers, "content-length": bytes.length },
      });

      request.on("error", () => resolve());
      request.write(bytes.subarray(0, 1024), () => {
        setTimeout(() => {
          request.destroy();
          resolve();
        }, 200);
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 300));

    const state = await session.injectAs(GM, { method: "GET", url: `${mediaUrl}/uploads/${id}` });

    expect(state.json()).toMatchObject({ uploadedParts: [] });

    const again = await fetch(partPath, { method: "PUT", headers, body: bytes });

    expect(again.status).toBe(200);

    const done = await session.injectAs(GM, { method: "POST", url: `${mediaUrl}/uploads/${id}/complete` });

    expect(done.statusCode).toBe(201);
  }, 30_000);

  it("still answers when the storage is unreachable", async () => {
    const created = await upload(pngOf(1024));
    const { id } = created.json() as { id: string };

    storage.close();

    const unreachable = createTestS3Storage({ ...options, endpoint: "http://127.0.0.1:1" });
    const down = buildTestApp({ publicPorts: { storagePort: unreachable } });
    const response = await down.injectAs(GM, { method: "GET", url: `${mediaUrl}/${id}/content` });

    await down.app.close();
    unreachable.close();
    storage = createTestS3Storage(options);

    // With direct delivery the link can still be signed; it's the storage that fails afterwards.
    expect(response.statusCode).toBe(302);
  });
});
