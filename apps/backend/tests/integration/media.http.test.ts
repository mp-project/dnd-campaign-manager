import { eq } from "drizzle-orm";

import type { AppModule } from "#core/app/moduleSystem";
import { createDrizzleDb, createPgPool } from "#core/db/pool";
import {
  assetMedia,
  assets,
  campaignMemberships,
  campaigns,
  entityChangeEvents,
  mediaFiles,
  mediaUploads,
  rulesets,
  users,
} from "#core/db/schema";
import { InMemoryStorage } from "#core/storage/index";
import {
  ASSETS_MODULE_DEPENDENCIES,
  type AssetsModuleDependencies,
} from "#src/modules/assets/index";
import { defaultAppModules } from "#src/modules/index";
import {
  MEDIA_MODULE_DEPENDENCIES,
  type MediaLimitOverrides,
  type MediaModuleDependencies,
} from "#src/modules/media/index";
import { buildTestApp, type TestActor } from "#test/helpers/buildTestApp";
import { sendMediaUpload } from "#test/helpers/mediaUpload";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

const ID = {
  ruleset: "10000000-0000-4000-8000-000000002024",
  gm: "a0000000-0000-4000-8000-000000000001",
  player: "a0000000-0000-4000-8000-000000000002",
  outsider: "a0000000-0000-4000-8000-000000000003",
  admin: "a0000000-0000-4000-8000-000000000004",
  editor: "a0000000-0000-4000-8000-000000000005",
  foreignGm: "a0000000-0000-4000-8000-000000000006",
  ghost: "a0000000-0000-4000-8000-00000000000f",
  campaign: "c0000000-0000-4000-8000-00000000000a",
  foreignCampaign: "c0000000-0000-4000-8000-00000000000b",
  shared: "e0000000-0000-4000-8000-000000000001",
  hidden: "e0000000-0000-4000-8000-000000000002",
  archived: "e0000000-0000-4000-8000-000000000003",
  foreignAsset: "e0000000-0000-4000-8000-000000000004",
  systemAsset: "e0000000-0000-4000-8000-000000000005",
  systemFile: "f0000000-0000-4000-8000-00000000000a",
  foreignFile: "f0000000-0000-4000-8000-00000000000b",
  pendingFile: "f0000000-0000-4000-8000-00000000000c",
  unknown: "f0000000-0000-4000-8000-00000000000f",
} as const;

const actor = (actorId: string, systemRole: TestActor["systemRole"] = "USER"): TestActor => ({
  actorId,
  systemRole,
});

const GM = actor(ID.gm);
const EDITOR = actor(ID.editor);
const PLAYER = actor(ID.player);
const OUTSIDER = actor(ID.outsider);
const FOREIGN_GM = actor(ID.foreignGm);
const ADMIN = actor(ID.admin, "ADMIN");

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PDF = Buffer.from("%PDF-1.7 content");

type Part = { name: string; value: string } | { filename: string; type: string; content: Buffer };

const png = (filename = "map.png"): Part => ({ filename, type: "image/png", content: PNG });
const pdf = (filename = "notes.pdf"): Part => ({
  filename,
  type: "application/pdf",
  content: PDF,
});

const visibilityModule: AppModule = {
  name: "test-media-visibility",
  dependencies: ["assets"],
  register: (_app, container) => {
    container.dependencies
      .require<AssetsModuleDependencies>(ASSETS_MODULE_DEPENDENCIES)
      .service.registerVisibilityProvider({
        name: "test-shares",
        listVisibleAssetIds: async ({ actorId }) => (actorId === ID.player ? [ID.shared] : []),
      });
  },
};

let limitOverrides: MediaLimitOverrides | null = null;

const limitsModule: AppModule = {
  name: "test-media-limits",
  dependencies: ["media"],
  register: (_app, container) => {
    container.dependencies
      .require<MediaModuleDependencies>(MEDIA_MODULE_DEPENDENCIES)
      .quota.registerLimitsProvider({
        findOverrides: async (campaignId) => (campaignId === ID.campaign ? limitOverrides : null),
      });
  },
};

/** Limits only apply to S3; this gives the tests of limits the same rules without a real one. */
class S3LikeStorage extends InMemoryStorage {
  public override readonly driver = "s3";
}

describe("media", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  // A new app per test, because one test can send more requests than one route allows in its window.
  let session: ReturnType<typeof buildTestApp>;
  let storage: InMemoryStorage;

  const startSession = (
    env: Record<string, unknown> = {},
    newStorage: InMemoryStorage = new InMemoryStorage(),
  ) => {
    storage = newStorage;
    session = buildTestApp({
      env,
      modules: [...defaultAppModules, visibilityModule, limitsModule],
      publicPorts: { storagePort: storage },
    });
  };

  const mediaUrl = (campaignId: string = ID.campaign) => `/api/v1/campaigns/${campaignId}/media`;
  const assetMediaUrl = (assetId: string, campaignId: string = ID.campaign) =>
    `/api/v1/campaigns/${campaignId}/assets/${assetId}/media`;

  const upload = (parts: Part[], as: TestActor = GM) => {
    const file = parts.find((part) => "filename" in part) as Extract<Part, { filename: string }>;
    const fields = Object.fromEntries(
      parts.flatMap((part) => ("name" in part ? [[part.name, part.value]] : [])),
    );

    return sendMediaUpload((request) => session.injectAs(as, request), mediaUrl(), {
      ...fields,
      originalName: file.filename,
      mimeType: file.type,
      content: file.content,
    });
  };

  const uploadsUrl = () => `${mediaUrl()}/uploads`;
  const announce = (payload: Record<string, unknown>, as: TestActor = GM) =>
    session.injectAs(as, { method: "POST", url: uploadsUrl(), payload });
  const sendPart = (uploadId: string, partNumber: number, content: Buffer, as: TestActor = GM) =>
    session.injectAs(as, {
      method: "PUT",
      url: `${uploadsUrl()}/${uploadId}/parts/${partNumber}`,
      payload: content,
      headers: { "content-type": "application/octet-stream" },
    });
  const completeUpload = (uploadId: string, as: TestActor = GM) =>
    session.injectAs(as, { method: "POST", url: `${uploadsUrl()}/${uploadId}/complete` });

  const uploadOk = async (part: Part = png(), fields: Part[] = []) => {
    const response = await upload([...fields, part]);

    expect(response.statusCode).toBe(201);

    return response.json() as { id: string; contentUrl: string };
  };

  const attach = (assetId: string, payload: Record<string, unknown>, as: TestActor = GM) =>
    session.injectAs(as, { method: "POST", url: assetMediaUrl(assetId), payload });

  const attachOk = async (assetId: string, payload: Record<string, unknown>) => {
    const response = await attach(assetId, { role: "GALLERY", ...payload });

    expect(response.statusCode).toBe(201);

    return response.json() as { id: string; version: number };
  };

  const patch = (
    assetId: string,
    id: string,
    payload: Record<string, unknown>,
    as: TestActor = GM,
  ) => session.injectAs(as, { method: "PATCH", url: `${assetMediaUrl(assetId)}/${id}`, payload });

  const detach = (assetId: string, id: string, as: TestActor = GM) =>
    session.injectAs(as, { method: "DELETE", url: `${assetMediaUrl(assetId)}/${id}` });

  const removeFile = (id: string, as: TestActor = GM) =>
    session.injectAs(as, { method: "DELETE", url: `${mediaUrl()}/${id}` });

  const content = (id: string, as: TestActor = GM) =>
    session.injectAs(as, { method: "GET", url: `${mediaUrl()}/${id}/content` });

  const fileRow = async (id: string) => {
    const [row] = await db.select().from(mediaFiles).where(eq(mediaFiles.id, id));

    return row!;
  };

  const assignmentRow = async (id: string) => {
    const [row] = await db.select().from(assetMedia).where(eq(assetMedia.id, id));

    return row!;
  };

  beforeEach(async () => {
    limitOverrides = null;
    startSession();

    await db.insert(rulesets).values({
      id: ID.ruleset,
      code: "MEDIA_MAIN",
      name: "Ruleset",
      status: "ACTIVE",
      editionYear: 2024,
      sourceReference: {},
      licenseCode: "TEST",
    });
    await db.insert(users).values(
      [ID.gm, ID.player, ID.outsider, ID.admin, ID.editor, ID.foreignGm].map((id) => ({
        id,
        email: `${id}@example.test`,
        passwordHash: "hash",
        displayName: "User",
        systemRole: id === ID.admin ? ("ADMIN" as const) : ("USER" as const),
        status: "ACTIVE" as const,
        emailVerifiedAt: new Date(),
      })),
    );
    await db.insert(campaigns).values(
      [
        { id: ID.campaign, ownerUserId: ID.gm, slug: "own" },
        { id: ID.foreignCampaign, ownerUserId: ID.foreignGm, slug: "foreign" },
      ].map((campaign) => ({
        ...campaign,
        rulesetId: ID.ruleset,
        name: "Campaign",
        status: "ACTIVE" as const,
        createdBy: campaign.ownerUserId,
      })),
    );
    await db.insert(campaignMemberships).values([
      { campaignId: ID.campaign, userId: ID.gm, role: "EDITOR", createdBy: ID.gm },
      { campaignId: ID.campaign, userId: ID.editor, role: "EDITOR", createdBy: ID.gm },
      { campaignId: ID.campaign, userId: ID.player, role: "PLAYER", createdBy: ID.gm },
      {
        campaignId: ID.foreignCampaign,
        userId: ID.foreignGm,
        role: "EDITOR",
        createdBy: ID.foreignGm,
      },
    ]);

    const own = {
      scope: "CAMPAIGN",
      origin: "CUSTOM",
      campaignId: ID.campaign,
      assetType: "LOCATION",
    } as const;

    await db.insert(assets).values([
      { ...own, id: ID.shared, title: "Shared", slug: "shared", status: "ACTIVE" },
      { ...own, id: ID.hidden, title: "Hidden", slug: "hidden", status: "ACTIVE" },
      { ...own, id: ID.archived, title: "Old", slug: "old", status: "ARCHIVED" },
      {
        ...own,
        campaignId: ID.foreignCampaign,
        id: ID.foreignAsset,
        title: "Foreign",
        slug: "foreign",
        status: "ACTIVE",
      },
      {
        scope: "SYSTEM",
        origin: "DEFAULT",
        campaignId: null,
        assetType: "SPELL",
        id: ID.systemAsset,
        title: "Light",
        slug: "light",
        status: "ACTIVE",
      },
    ]);

    const file = {
      originalName: "file.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4,
      sha256: "a".repeat(64),
      status: "READY",
      uploadedBy: ID.admin,
    } as const;

    await db.insert(mediaFiles).values([
      { ...file, id: ID.systemFile, scope: "SYSTEM", campaignId: null, storageKey: "media/system.pdf" },
      {
        ...file,
        id: ID.foreignFile,
        scope: "CAMPAIGN",
        campaignId: ID.foreignCampaign,
        storageKey: "media/foreign.pdf",
      },
      {
        ...file,
        id: ID.pendingFile,
        scope: "CAMPAIGN",
        campaignId: ID.campaign,
        storageKey: "media/pending.pdf",
        status: "PENDING",
      },
    ]);
  });

  afterEach(async () => {
    await session.app.close();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("uploading", () => {
    it("stores the file, marks it ready and never answers with the storage key", async () => {
      const response = await upload([
        { name: "title", value: "Map" },
        { name: "altText", value: "A map of the coast" },
        png("../../secret/Karte Küste.png"),
      ]);
      const body = response.json();

      expect(response.statusCode).toBe(201);
      expect(body).toMatchObject({
        view: "GM",
        scope: "CAMPAIGN",
        campaignId: ID.campaign,
        status: "READY",
        mimeType: "image/png",
        sizeBytes: PNG.length,
        originalName: "Karte Küste.png",
        title: "Map",
        altText: "A map of the coast",
        uploadedBy: ID.gm,
        usageCount: 0,
      });
      expect(body).not.toHaveProperty("storageKey");
      expect(JSON.stringify(body)).not.toContain(`media/${ID.campaign}`);
      expect(body.contentUrl).toBe(`${mediaUrl()}/${body.id}/content`);

      const row = await fileRow(body.id);

      expect(row.storageKey).toMatch(new RegExp(`^media/${ID.campaign}/${body.id}\\.png$`));
      await expect(storage.listKeys()).resolves.toEqual([row.storageKey]);
    });

    it("works for editors and administrators", async () => {
      expect((await upload([png()], EDITOR)).statusCode).toBe(201);
      expect((await upload([png()], ADMIN)).statusCode).toBe(201);
    });

    it("refuses everyone else before taking the file", async () => {
      expect((await upload([png()], PLAYER)).statusCode).toBe(403);
      expect((await upload([png()], OUTSIDER)).statusCode).toBe(404);
      expect((await upload([png()], FOREIGN_GM)).statusCode).toBe(404);
      await expect(storage.listKeys()).resolves.toEqual([]);
    });

    it("needs authentication", async () => {
      const response = await session.app.inject({
        method: "POST",
        url: uploadsUrl(),
        payload: { originalName: "x.png", mimeType: "image/png", sizeBytes: 1 },
      });

      expect(response.statusCode).toBe(401);
    });

    it.each([
      ["a false type", { filename: "x.pdf", type: "application/pdf", content: PNG }],
      ["bytes that fit no image", { filename: "x.png", type: "image/png", content: PDF }],
      ["a type that is not allowed", { filename: "x.html", type: "text/html", content: PDF }],
      ["an executable type", { filename: "x.svg", type: "image/svg+xml", content: PDF }],
    ])("rejects %s and keeps nothing", async (_name, part) => {
      expect((await upload([part])).statusCode).toBe(415);
      await expect(storage.listKeys()).resolves.toEqual([]);
      expect(await db.select().from(mediaFiles).where(eq(mediaFiles.originalName, part.filename))).toEqual([]);
    });

    it("rejects requests with invalid fields", async () => {
      const json = await session.injectAs(GM, {
        method: "POST",
        url: uploadsUrl(),
        payload: { name: "x" },
      });

      expect(json.statusCode).toBe(400);
      expect((await upload([{ name: "altText", value: "x".repeat(501) }, png()])).statusCode).toBe(400);
      await expect(storage.listKeys()).resolves.toEqual([]);
      expect(storage.countOpenUploads()).toBe(0);
    });

    it("removes the object again when the row cannot be written", async () => {
      // A signed token of somebody without a user row fails the foreign key.
      const response = await upload([png()], actor(ID.ghost, "ADMIN"));

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      await expect(storage.listKeys()).resolves.toEqual([]);
      expect(await db.select().from(mediaFiles).where(eq(mediaFiles.uploadedBy, ID.ghost))).toEqual([]);
      expect(await db.select().from(mediaUploads)).toEqual([]);
    });

    it("keeps the parts when joining fails, so completing can be repeated", async () => {
      const created = (await announce({ originalName: "a.png", mimeType: "image/png", sizeBytes: PNG.length })).json() as { id: string };

      await sendPart(created.id, 1, PNG);
      jest.spyOn(storage, "completeMultipartUpload").mockRejectedValueOnce(new Error("Storage down"));

      expect((await completeUpload(created.id)).statusCode).toBeGreaterThanOrEqual(500);
      expect((await completeUpload(created.id)).statusCode).toBe(201);
    });
  });

  describe("uploading in parts", () => {
    const PART = 8 * 1024 * 1024;
    const large = Buffer.concat([PNG, Buffer.alloc(PART + 1024 - PNG.length, 7)]);
    const announceLarge = async () => {
      const response = await announce({ originalName: "map.png", mimeType: "image/png", sizeBytes: large.length });

      expect(response.statusCode).toBe(201);

      return response.json() as { id: string; partCount: number; partSizeBytes: number };
    };

    it("continues an interrupted upload with the missing parts", async () => {
      const created = await announceLarge();

      expect(created).toMatchObject({ partCount: 2, partSizeBytes: PART });
      expect((await sendPart(created.id, 2, large.subarray(PART))).statusCode).toBe(200);

      const state = await session.injectAs(GM, { method: "GET", url: `${uploadsUrl()}/${created.id}` });

      expect(state.json()).toMatchObject({ status: "ACTIVE", uploadedParts: [2] });
      expect(JSON.stringify(state.json())).not.toContain("media/");

      const incomplete = await completeUpload(created.id);

      expect(incomplete.statusCode).toBe(409);
      expect(incomplete.json().error.details).toEqual({ missingParts: [1] });

      expect((await sendPart(created.id, 1, large.subarray(0, PART))).statusCode).toBe(200);

      const done = await completeUpload(created.id);

      expect(done.statusCode).toBe(201);
      expect(done.json()).toMatchObject({ id: created.id, sizeBytes: large.length, status: "READY" });
      expect((await content(created.id)).rawPayload.equals(large)).toBe(true);
    });

    it("accepts a part being sent again", async () => {
      const created = (await announce({ originalName: "a.png", mimeType: "image/png", sizeBytes: PNG.length })).json() as { id: string };
      const wrong = Buffer.alloc(PNG.length, 1);

      expect((await sendPart(created.id, 1, wrong)).statusCode).toBe(200);
      expect((await sendPart(created.id, 1, PNG)).statusCode).toBe(200);
      expect((await completeUpload(created.id)).statusCode).toBe(201);
    });

    it("rejects parts of the wrong size and parts that don't exist", async () => {
      const created = await announceLarge();

      expect((await sendPart(created.id, 1, Buffer.alloc(10))).statusCode).toBe(400);
      expect((await sendPart(created.id, 3, Buffer.alloc(10))).statusCode).toBe(400);
    });

    it("only lets whoever started it continue", async () => {
      const created = await announceLarge();

      expect((await sendPart(created.id, 2, large.subarray(PART), EDITOR)).statusCode).toBe(404);
      expect((await completeUpload(created.id, EDITOR)).statusCode).toBe(404);
      expect((await sendPart(created.id, 2, large.subarray(PART), PLAYER)).statusCode).toBe(403);
    });

    it("removes everything when aborted", async () => {
      const created = await announceLarge();
      const url = `${uploadsUrl()}/${created.id}`;

      await sendPart(created.id, 2, large.subarray(PART));

      expect((await session.injectAs(GM, { method: "DELETE", url })).statusCode).toBe(200);
      expect((await session.injectAs(GM, { method: "GET", url })).statusCode).toBe(404);
      expect(storage.countOpenUploads()).toBe(0);
    });

    it("ends an upload that ran out of time", async () => {
      const created = await announceLarge();

      await db
        .update(mediaUploads)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(mediaUploads.id, created.id));

      expect((await sendPart(created.id, 2, large.subarray(PART))).statusCode).toBe(404);
    });

    it("can only be completed once", async () => {
      const created = (await announce({ originalName: "a.png", mimeType: "image/png", sizeBytes: PNG.length })).json() as { id: string };

      await sendPart(created.id, 1, PNG);

      expect((await completeUpload(created.id)).statusCode).toBe(201);
      expect((await completeUpload(created.id)).statusCode).toBe(404);
    });
  });

  describe("limits", () => {
    const MIB = 1024 * 1024;
    const GIB = 1024 * MIB;
    const image = (sizeBytes: number) => ({ originalName: "map.png", mimeType: "image/png", sizeBytes });
    const storeFile = (campaignId: string, sizeBytes: number) =>
      db.insert(mediaFiles).values({
        campaignId,
        scope: "CAMPAIGN",
        storageKey: `media/${campaignId}/${sizeBytes}.bin`,
        originalName: "stored.bin",
        mimeType: "application/pdf",
        sizeBytes,
        sha256: "a".repeat(64),
        status: "READY",
        uploadedBy: ID.gm,
      });

    beforeEach(async () => {
      await session.app.close();
      startSession({}, new S3LikeStorage());
    });

    it("allows files up to the default limit of their type, before any byte is sent", async () => {
      expect((await announce(image(50 * MIB))).statusCode).toBe(201);

      const tooLarge = await announce(image(50 * MIB + 1));

      expect(tooLarge.statusCode).toBe(413);
      expect(tooLarge.json().error).toMatchObject({
        code: "MAX_UPLOAD_SIZE_EXCEEDED",
        details: { category: "image", maxBytes: 50 * MIB },
      });
      expect(storage.countOpenUploads()).toBe(1);

      expect((await announce({ originalName: "a.txt", mimeType: "text/plain", sizeBytes: 5 * MIB + 1 })).statusCode).toBe(413);
      expect((await announce({ originalName: "a.mp4", mimeType: "video/mp4", sizeBytes: 100 * MIB })).statusCode).toBe(201);
    });

    it("counts the total per campaign", async () => {
      const second = "c0000000-0000-4000-8000-00000000000c";

      await db.insert(campaigns).values({
        ownerUserId: ID.gm,
        slug: "second",
        rulesetId: ID.ruleset,
        name: "Second",
        status: "ACTIVE",
        createdBy: ID.gm,
        id: second,
      });
      await storeFile(second, 5 * GIB);

      expect((await announce(image(MIB))).statusCode).toBe(201);

      // The fixtures already hold a few small files in this campaign.
      await storeFile(ID.campaign, 5 * GIB - 2 * MIB);

      const full = await announce(image(2 * MIB));

      expect(full.statusCode).toBe(413);
      expect(full.json().error).toMatchObject({
        code: "STORAGE_QUOTA_EXCEEDED",
        details: { totalBytes: 5 * GIB },
      });
    });

    it("doesn't count deleted files or expired uploads", async () => {
      await storeFile(ID.campaign, 5 * GIB);
      await db.update(mediaFiles).set({ deletedAt: new Date() }).where(eq(mediaFiles.campaignId, ID.campaign));

      const running = (await announce(image(50 * MIB))).json() as { id: string };

      await db
        .update(mediaUploads)
        .set({ expiresAt: new Date(Date.now() - 1000), sizeBytes: 5 * GIB })
        .where(eq(mediaUploads.id, running.id));

      expect((await announce(image(50 * MIB))).statusCode).toBe(201);
    });

    it("lets only concurrent uploads through that fit together", async () => {
      await storeFile(ID.campaign, 5 * GIB - 50 * MIB);

      const responses = await Promise.all([announce(image(30 * MIB)), announce(image(30 * MIB))]);

      expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 413]);
      expect(storage.countOpenUploads()).toBe(1);
    });

    it("lets a provider replace single limits per campaign, whoever uploads", async () => {
      limitOverrides = { maxFileBytes: { image: 60 * MIB }, totalBytes: 10 * GIB };

      expect((await announce(image(60 * MIB), EDITOR)).statusCode).toBe(201);
      expect((await announce(image(60 * MIB + 1), EDITOR)).statusCode).toBe(413);
      // Whatever the provider leaves out keeps its default.
      expect((await announce({ originalName: "a.mp4", mimeType: "video/mp4", sizeBytes: 100 * MIB + 1 })).statusCode).toBe(413);

      await storeFile(ID.campaign, 6 * GIB);

      expect((await announce(image(MIB))).statusCode).toBe(201);

      const listed = await session.injectAs(GM, { method: "GET", url: mediaUrl() });

      expect(listed.json().storageUsage).toEqual({
        usedBytes: expect.any(Number),
        totalBytes: 10 * GIB,
      });

      const foreign = await session.injectAs(FOREIGN_GM, {
        method: "POST",
        url: `${mediaUrl(ID.foreignCampaign)}/uploads`,
        payload: image(60 * MIB),
      });

      expect(foreign.statusCode).toBe(413);
    });

    it("reports the usage after every change to the owner and to administrators", async () => {
      const usedBytes = async (as: TestActor = GM): Promise<number> =>
        (await session.injectAs(as, { method: "GET", url: mediaUrl() })).json().storageUsage.usedBytes;
      const start = await usedBytes();

      expect(await usedBytes(ADMIN)).toBe(start);

      const announced = await announce(image(MIB));

      expect(announced.json().storageUsage).toEqual({ usedBytes: start + MIB, totalBytes: 5 * GIB });

      const aborted = await session.injectAs(GM, {
        method: "DELETE",
        url: `${uploadsUrl()}/${announced.json().id}`,
      });

      expect(aborted.statusCode).toBe(200);
      expect(aborted.json().storageUsage.usedBytes).toBe(start);

      const completed = await sendMediaUpload((request) => session.injectAs(GM, request), mediaUrl(), {
        originalName: "map.png",
        mimeType: "image/png",
        content: PNG,
      });

      expect(completed.statusCode).toBe(201);
      expect(completed.json().storageUsage.usedBytes).toBe(start + PNG.length);

      const removed = await removeFile(completed.json().id as string);

      expect(removed.statusCode).toBe(200);
      expect(removed.json().storageUsage.usedBytes).toBe(start);
    });

    it("shows neither usage nor limits to anybody else", async () => {
      const listAs = (as: TestActor) => session.injectAs(as, { method: "GET", url: mediaUrl() });

      expect((await listAs(EDITOR)).json().storageUsage).toBeNull();
      expect((await listAs(PLAYER)).json().storageUsage).toBeNull();

      const announced = await announce(image(MIB), EDITOR);

      expect(announced.statusCode).toBe(201);
      expect(announced.json().storageUsage).toBeNull();

      const tooLarge = await announce(image(50 * MIB + 1), EDITOR);

      expect(tooLarge.statusCode).toBe(413);
      expect(tooLarge.json().error.code).toBe("MAX_UPLOAD_SIZE_EXCEEDED");
      expect(tooLarge.body).not.toContain(String(50 * MIB));
      expect(tooLarge.json().error.details).toBeNull();

      await storeFile(ID.campaign, 5 * GIB);

      const full = await announce(image(MIB), EDITOR);

      expect(full.json().error.code).toBe("STORAGE_QUOTA_EXCEEDED");
      expect(full.json().error.details).toBeNull();
    });
  });

  describe("without S3", () => {
    it("applies no limits and reports no usage", async () => {
      const announced = await announce({
        originalName: "a.txt",
        mimeType: "text/plain",
        sizeBytes: 100 * 1024 * 1024 * 1024,
      });

      expect(announced.statusCode).toBe(201);
      expect(announced.json().storageUsage).toBeNull();

      const listed = await session.injectAs(GM, { method: "GET", url: mediaUrl() });

      expect(listed.json().storageUsage).toBeNull();
    });
  });

  describe("rate limit", () => {
    it("allows more reads than other routes, because a gallery asks for many at once", async () => {
      const limitOf = async (url: string) =>
        (await session.injectAs(GM, { method: "GET", url })).headers["x-ratelimit-limit"];
      const { id } = await uploadOk();

      expect(await limitOf(mediaUrl())).toBe("300");
      expect(await limitOf(`${mediaUrl()}/${id}`)).toBe("300");
      expect(await limitOf(`${mediaUrl()}/${id}/content`)).toBe("300");
      expect(await limitOf(assetMediaUrl(ID.shared))).toBe("300");
      expect(await limitOf(`${uploadsUrl()}/${id}`)).toBe("60");
    });
  });

  describe("reading and downloading", () => {
    it("streams the content with safe headers", async () => {
      const image = await uploadOk(png());
      const document = await uploadOk(pdf("my notes.pdf"));
      const imageResponse = await content(image.id);
      const documentResponse = await content(document.id);

      expect(imageResponse.statusCode).toBe(200);
      expect(imageResponse.rawPayload.equals(PNG)).toBe(true);
      expect(imageResponse.headers).toMatchObject({
        "content-type": "image/png",
        "content-length": String(PNG.length),
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      });
      expect(imageResponse.headers["content-disposition"]).toContain("inline");
      expect(documentResponse.headers["content-disposition"]).toBe(
        'attachment; filename="my notes.pdf"',
      );
    });

    it("hides files of other campaigns", async () => {
      expect((await content(ID.foreignFile)).statusCode).toBe(404);
      expect(
        (await session.injectAs(GM, { method: "GET", url: `${mediaUrl()}/${ID.foreignFile}` }))
          .statusCode,
      ).toBe(404);
      expect((await removeFile(ID.foreignFile)).statusCode).toBe(404);
      expect((await attach(ID.shared, { mediaId: ID.foreignFile, role: "OTHER" })).statusCode).toBe(404);
    });

    it("pages through the files and counts usages", async () => {
      const a = await uploadOk(png("a.png"));

      await uploadOk(png("b.png"));
      await uploadOk(png("c.png"));
      await attachOk(ID.shared, { mediaId: a.id });

      const first = (await session.injectAs(GM, { method: "GET", url: `${mediaUrl()}?limit=2` })).json();
      const next = (
        await session.injectAs(GM, {
          method: "GET",
          url: `${mediaUrl()}?limit=2&cursor=${first.pageInfo.nextCursor as string}`,
        })
      ).json();

      // The pending file of the fixtures comes first by name.
      expect(first.data.map((file: { originalName: string }) => file.originalName)).toEqual([
        "a.png",
        "b.png",
      ]);
      expect(first.data[0].usageCount).toBe(1);
      expect(next.data.map((file: { originalName: string }) => file.originalName)).toEqual([
        "c.png",
        "file.pdf",
      ]);
      expect(
        (await session.injectAs(GM, { method: "GET", url: `${mediaUrl()}?cursor=nonsense` }))
          .statusCode,
      ).toBe(400);
    });
  });

  describe("players", () => {
    const seed = async () => {
      const forPlayers = await uploadOk(pdf("for-players.pdf"));
      const gmOnly = await uploadOk(pdf("gm-only.pdf"));
      const onHidden = await uploadOk(pdf("on-hidden.pdf"));

      await attachOk(ID.shared, { mediaId: forPlayers.id, visibility: "WITH_ASSET", caption: "Read" });
      await attachOk(ID.shared, { mediaId: gmOnly.id, visibility: "GM_ONLY" });
      await attachOk(ID.hidden, { mediaId: onHidden.id, visibility: "WITH_ASSET" });

      return { forPlayers, gmOnly, onHidden };
    };

    it("only get what is attached for them to assets they see", async () => {
      const { forPlayers, gmOnly, onHidden } = await seed();

      expect((await content(forPlayers.id, PLAYER)).statusCode).toBe(200);

      for (const hidden of [gmOnly, onHidden]) {
        expect((await content(hidden.id, PLAYER)).statusCode).toBe(404);
        expect(
          (await session.injectAs(PLAYER, { method: "GET", url: `${mediaUrl()}/${hidden.id}` }))
            .statusCode,
        ).toBe(404);
      }

      const list = (await session.injectAs(PLAYER, { method: "GET", url: mediaUrl() })).json();

      expect(list.data).toEqual([
        {
          view: "PLAYER",
          id: forPlayers.id,
          mimeType: "application/pdf",
          width: null,
          height: null,
          contentUrl: forPlayers.contentUrl,
        },
      ]);
    });

    it("never see GM-only assignments in the list of an asset", async () => {
      const { forPlayers, gmOnly } = await seed();
      const response = await session.injectAs(PLAYER, {
        method: "GET",
        url: assetMediaUrl(ID.shared),
      });
      const text = response.body;

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toHaveLength(1);
      expect(response.json().data[0]).toMatchObject({
        view: "PLAYER",
        mediaId: forPlayers.id,
        caption: "Read",
      });
      expect(response.json().data[0]).not.toHaveProperty("visibility");
      expect(response.json().data[0]).not.toHaveProperty("createdBy");
      expect(text).not.toContain(gmOnly.id);
      expect(text).not.toContain("gm-only");
    });

    it("do not see the media of an asset they cannot see", async () => {
      await seed();

      expect(
        (await session.injectAs(PLAYER, { method: "GET", url: assetMediaUrl(ID.hidden) })).statusCode,
      ).toBe(404);
    });

    it("lose access when the assignment is hidden or the asset archived", async () => {
      const file = await uploadOk(pdf());
      const assignment = await attachOk(ID.shared, { mediaId: file.id, visibility: "WITH_ASSET" });

      expect((await content(file.id, PLAYER)).statusCode).toBe(200);

      await patch(ID.shared, assignment.id, { visibility: "GM_ONLY", expectedVersion: 1 });

      expect((await content(file.id, PLAYER)).statusCode).toBe(404);

      await patch(ID.shared, assignment.id, { visibility: "WITH_ASSET", expectedVersion: 2 });

      expect((await content(file.id, PLAYER)).statusCode).toBe(200);

      await db.update(assets).set({ status: "ARCHIVED" }).where(eq(assets.id, ID.shared));

      expect((await content(file.id, PLAYER)).statusCode).toBe(404);
    });

    it("cannot change anything", async () => {
      const file = await uploadOk(pdf());
      const assignment = await attachOk(ID.shared, { mediaId: file.id, visibility: "WITH_ASSET" });

      expect((await attach(ID.shared, { mediaId: file.id, role: "COVER" }, PLAYER)).statusCode).toBe(403);
      expect((await patch(ID.shared, assignment.id, { title: "x", expectedVersion: 1 }, PLAYER)).statusCode).toBe(403);
      expect((await detach(ID.shared, assignment.id, PLAYER)).statusCode).toBe(403);
      expect((await removeFile(file.id, PLAYER)).statusCode).toBe(403);
    });
  });

  describe("assignments", () => {
    it("attaches with the defaults of the file", async () => {
      const file = await uploadOk(png(), [
        { name: "title", value: "Map" },
        { name: "altText", value: "A map" },
      ]);
      const response = await attach(
        ID.shared,
        { mediaId: file.id, role: "COVER", visibility: "WITH_ASSET" },
        EDITOR,
      );

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        view: "GM",
        title: "Map",
        altText: "A map",
        visibility: "WITH_ASSET",
        media: { id: file.id, mimeType: "image/png", contentUrl: file.contentUrl },
      });
      expect(response.json().media).not.toHaveProperty("storageKey");
    });

    it("requires an alt text for images that players see, but not for other files", async () => {
      const image = await uploadOk(png());
      const document = await uploadOk(pdf());

      expect(
        (await attach(ID.shared, { mediaId: image.id, role: "COVER", visibility: "WITH_ASSET" }))
          .statusCode,
      ).toBe(400);
      expect(
        (await attach(ID.shared, { mediaId: document.id, role: "DOCUMENT", visibility: "WITH_ASSET" }))
          .statusCode,
      ).toBe(201);

      const hidden = await attachOk(ID.shared, { mediaId: image.id, role: "COVER" });

      expect(
        (await patch(ID.shared, hidden.id, { visibility: "WITH_ASSET", expectedVersion: 1 })).statusCode,
      ).toBe(400);
      expect(
        (
          await patch(ID.shared, hidden.id, {
            visibility: "WITH_ASSET",
            altText: "A map",
            expectedVersion: 1,
          })
        ).statusCode,
      ).toBe(200);
    });

    it("rejects violations in the database as well", async () => {
      const image = await uploadOk(png());
      const row = {
        campaignId: ID.campaign,
        assetId: ID.shared,
        mediaId: image.id,
        role: "COVER" as const,
      };

      await expect(
        db.insert(assetMedia).values({ ...row, isImage: true, visibility: "WITH_ASSET" }),
      ).rejects.toThrow();
      await expect(db.insert(assetMedia).values({ ...row, displayOrder: -1 })).rejects.toThrow();
      await expect(
        db.insert(assetMedia).values({ ...row, campaignId: ID.foreignCampaign }),
      ).rejects.toThrow();
      await expect(
        db.insert(mediaFiles).values({
          scope: "SYSTEM",
          campaignId: ID.campaign,
          storageKey: "x",
          originalName: "x",
          mimeType: "text/plain",
          sizeBytes: 1,
          sha256: "a".repeat(64),
          uploadedBy: ID.gm,
        }),
      ).rejects.toThrow();
    });

    it("rejects assets and files that cannot be used", async () => {
      const file = await uploadOk(pdf());
      const payload = { mediaId: file.id, role: "DOCUMENT" };

      expect((await attach(ID.foreignAsset, payload)).statusCode).toBe(404);
      expect((await attach(ID.systemAsset, payload)).statusCode).toBe(409);
      expect((await attach(ID.archived, payload)).statusCode).toBe(409);
      expect((await attach(ID.shared, { ...payload, mediaId: ID.unknown })).statusCode).toBe(404);
      expect((await attach(ID.shared, { ...payload, mediaId: ID.pendingFile })).statusCode).toBe(409);
      expect((await attach(ID.shared, { ...payload, role: "PICTURE" })).statusCode).toBe(400);
    });

    it("rejects the same file twice in one role, and allows another role", async () => {
      const file = await uploadOk(pdf());

      await attachOk(ID.shared, { mediaId: file.id, role: "DOCUMENT" });

      const before = await db.select().from(entityChangeEvents);

      expect((await attach(ID.shared, { mediaId: file.id, role: "DOCUMENT" })).statusCode).toBe(409);
      expect(await db.select().from(entityChangeEvents)).toHaveLength(before.length);
      expect((await attach(ID.shared, { mediaId: file.id, role: "OTHER" })).statusCode).toBe(201);
    });

    it("keeps one primary file per asset and role", async () => {
      const a = await uploadOk(pdf("a.pdf"));
      const b = await uploadOk(pdf("b.pdf"));
      const c = await uploadOk(pdf("c.pdf"));
      const first = await attachOk(ID.shared, { mediaId: a.id, isPrimary: true });
      const second = await attachOk(ID.shared, { mediaId: b.id, isPrimary: true });
      const otherRole = await attachOk(ID.shared, { mediaId: c.id, role: "OTHER", isPrimary: true });

      expect((await assignmentRow(first.id)).isPrimary).toBe(false);
      expect((await assignmentRow(second.id)).isPrimary).toBe(true);
      expect((await assignmentRow(otherRole.id)).isPrimary).toBe(true);

      const version = (await assignmentRow(first.id)).version;

      expect((await patch(ID.shared, first.id, { isPrimary: true, expectedVersion: version })).statusCode).toBe(200);
      expect((await assignmentRow(first.id)).isPrimary).toBe(true);
      expect((await assignmentRow(second.id)).isPrimary).toBe(false);

      await expect(
        db.insert(assetMedia).values({
          campaignId: ID.campaign,
          assetId: ID.shared,
          mediaId: b.id,
          role: "MAP",
          isPrimary: true,
        }),
      ).resolves.toBeDefined();
      await expect(
        db.insert(assetMedia).values({
          campaignId: ID.campaign,
          assetId: ID.shared,
          mediaId: c.id,
          role: "MAP",
          isPrimary: true,
        }),
      ).rejects.toThrow();
    });

    it("sorts by role and order", async () => {
      const a = await uploadOk(pdf("a.pdf"));
      const b = await uploadOk(pdf("b.pdf"));

      const late = await attachOk(ID.shared, { mediaId: a.id, displayOrder: 5 });

      await attachOk(ID.shared, { mediaId: b.id, displayOrder: 1 });

      const ordered = async () =>
        (
          (await session.injectAs(GM, { method: "GET", url: assetMediaUrl(ID.shared) })).json()
            .data as { mediaId: string }[]
        ).map((item) => item.mediaId);

      expect(await ordered()).toEqual([b.id, a.id]);
      expect((await patch(ID.shared, late.id, { displayOrder: 0, expectedVersion: 1 })).statusCode).toBe(200);
      expect(await ordered()).toEqual([a.id, b.id]);
    });

    it("detects a stale version and only finds the assignment through its asset", async () => {
      const file = await uploadOk(pdf());
      const assignment = await attachOk(ID.shared, { mediaId: file.id });

      expect((await patch(ID.shared, assignment.id, { title: "First", expectedVersion: 1 })).statusCode).toBe(200);
      expect((await patch(ID.shared, assignment.id, { title: "Second", expectedVersion: 1 })).statusCode).toBe(412);
      expect((await patch(ID.hidden, assignment.id, { title: "x", expectedVersion: 2 })).statusCode).toBe(404);
      expect((await detach(ID.hidden, assignment.id)).statusCode).toBe(404);
    });

    it("does not change assignments of archived assets, but still allows detaching", async () => {
      const file = await uploadOk(pdf());
      const assignment = await attachOk(ID.shared, { mediaId: file.id });

      await db.update(assets).set({ status: "ARCHIVED" }).where(eq(assets.id, ID.shared));

      expect((await patch(ID.shared, assignment.id, { title: "x", expectedVersion: 1 })).statusCode).toBe(409);
      expect((await detach(ID.shared, assignment.id)).statusCode).toBe(204);
    });

    it("keeps the file when detaching, and allows attaching it again", async () => {
      const file = await uploadOk(pdf());
      const assignment = await attachOk(ID.shared, { mediaId: file.id });

      expect((await detach(ID.shared, assignment.id)).statusCode).toBe(204);
      expect((await content(file.id)).statusCode).toBe(200);
      expect((await assignmentRow(assignment.id)).deletedAt).not.toBeNull();
      expect((await attach(ID.shared, { mediaId: file.id, role: "GALLERY" })).statusCode).toBe(201);
    });
  });

  describe("deleting a file", () => {
    it("refuses while it is attached, then removes row and object", async () => {
      const file = await uploadOk(pdf());
      const assignment = await attachOk(ID.shared, { mediaId: file.id });
      const blocked = await removeFile(file.id);

      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().error.details).toEqual({ usageCount: 1 });

      await detach(ID.shared, assignment.id);

      expect((await removeFile(file.id, EDITOR)).statusCode).toBe(200);

      const row = await fileRow(file.id);

      expect(row.deletedAt).not.toBeNull();
      expect(row.objectDeletedAt).not.toBeNull();
      await expect(storage.exists(row.storageKey)).resolves.toBe(false);
      expect((await content(file.id)).statusCode).toBe(404);
      expect((await removeFile(file.id)).statusCode).toBe(404);
    });

    it("leaves the object to the cleanup when the storage fails, without failing the request", async () => {
      const file = await uploadOk(pdf());

      jest.spyOn(storage, "delete").mockRejectedValueOnce(new Error("Storage down"));

      expect((await removeFile(file.id)).statusCode).toBe(200);

      const row = await fileRow(file.id);

      expect(row.deletedAt).not.toBeNull();
      expect(row.objectDeletedAt).toBeNull();
      await expect(storage.exists(row.storageKey)).resolves.toBe(true);
    });

    it("never leaves an assignment to a deleted file when both run in parallel", async () => {
      const file = await uploadOk(pdf());
      const [attached, deleted] = await Promise.all([
        attach(ID.shared, { mediaId: file.id, role: "OTHER" }),
        removeFile(file.id),
      ]);

      // Whoever gets the lock first wins; the other one sees the result.
      expect([[201, 409], [404, 200]]).toContainEqual([attached.statusCode, deleted.statusCode]);
    });

    it("lets only administrators delete global files, which campaigns can use", async () => {
      const assignment = await attachOk(ID.shared, { mediaId: ID.systemFile, role: "OTHER" });

      expect((await removeFile(ID.systemFile)).statusCode).toBe(403);
      expect((await removeFile(ID.systemFile, ADMIN)).statusCode).toBe(409);

      await detach(ID.shared, assignment.id);

      expect((await removeFile(ID.systemFile, ADMIN)).statusCode).toBe(200);
    });
  });

  describe("history", () => {
    const entries = (id: string, as: TestActor = GM) =>
      session.injectAs(as, { method: "GET", url: `/api/v1/history/assetMedia/${id}` });

    const revert = (eventId: string, as: TestActor = GM) =>
      session.injectAs(as, {
        method: "POST",
        url: `/api/v1/history/events/${eventId}/revert`,
        payload: {},
      });

    const eventOf = async (id: string, field: string) =>
      ((await entries(id, ADMIN)).json().data as {
        eventId: string;
        field: string;
        action: string;
        isBaseline: boolean;
      }[]).find((item) => item.field === field && !item.isBaseline);

    it("records changes that editors can undo", async () => {
      const file = await uploadOk(pdf());
      const assignment = await attachOk(ID.shared, { mediaId: file.id, title: "Old" });

      await patch(ID.shared, assignment.id, { title: "New", expectedVersion: 1 });

      const event = await eventOf(assignment.id, "title");

      expect(event?.action).toBe("assetMedia.update");
      expect((await revert(event!.eventId, EDITOR)).statusCode).toBe(200);
      expect((await assignmentRow(assignment.id)).title).toBe("Old");
    });

    it("appears as a child in the history of the asset", async () => {
      const file = await uploadOk(pdf());
      const assignment = await attachOk(ID.shared, { mediaId: file.id });
      const items = (
        await session.injectAs(GM, {
          method: "GET",
          url: `/api/v1/history/asset/${ID.shared}?includeChildren=true`,
        })
      ).json().data as { entityType: string; entityId: string }[];

      expect(
        items.some((item) => item.entityType === "assetMedia" && item.entityId === assignment.id),
      ).toBe(true);
    });

    it("is not readable for players and gone after detaching", async () => {
      const file = await uploadOk(pdf());
      const assignment = await attachOk(ID.shared, { mediaId: file.id });

      expect((await entries(assignment.id, PLAYER)).statusCode).toBe(404);
      expect((await entries(assignment.id, EDITOR)).statusCode).toBe(200);

      await detach(ID.shared, assignment.id);

      expect((await entries(assignment.id)).statusCode).toBe(404);
    });

    it("cannot undo the way around the alt text rule", async () => {
      const image = await uploadOk(png());
      const assignment = await attachOk(ID.shared, {
        mediaId: image.id,
        visibility: "WITH_ASSET",
        altText: "A map",
      });

      await patch(ID.shared, assignment.id, { visibility: "GM_ONLY", expectedVersion: 1 });
      await patch(ID.shared, assignment.id, { altText: null, expectedVersion: 2 });

      const visibility = await eventOf(assignment.id, "visibility");

      expect((await revert(visibility!.eventId)).statusCode).toBe(400);
      expect((await assignmentRow(assignment.id)).visibility).toBe("GM_ONLY");
    });

    it("answers 409 when undoing would create a second primary file", async () => {
      const a = await uploadOk(pdf("a.pdf"));
      const b = await uploadOk(pdf("b.pdf"));
      const first = await attachOk(ID.shared, { mediaId: a.id, isPrimary: true });

      await patch(ID.shared, first.id, { isPrimary: false, expectedVersion: 1 });
      await attachOk(ID.shared, { mediaId: b.id, isPrimary: true });

      const event = await eventOf(first.id, "isPrimary");

      expect((await revert(event!.eventId)).statusCode).toBe(409);
    });

    it("rejects undoing while the asset is archived", async () => {
      const file = await uploadOk(pdf());
      const assignment = await attachOk(ID.shared, { mediaId: file.id });

      await patch(ID.shared, assignment.id, { title: "New", expectedVersion: 1 });

      const event = await eventOf(assignment.id, "title");

      await db.update(assets).set({ status: "ARCHIVED" }).where(eq(assets.id, ID.shared));

      expect((await revert(event!.eventId)).statusCode).toBe(409);
    });
  });
});
