import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { campaignInvitations, campaignMemberships, campaigns, rulesets, users } from "#core/db/schema";
import { buildTestApp, type TestActor } from "#test/helpers/buildTestApp";

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
  campaign: "c0000000-0000-4000-8000-00000000000a",
} as const;

const GM: TestActor = { actorId: ID.gm, systemRole: "USER" };
const PLAYER: TestActor = { actorId: ID.player, systemRole: "USER" };
const OUTSIDER: TestActor = { actorId: ID.outsider, systemRole: "USER" };
const ADMIN: TestActor = { actorId: ID.admin, systemRole: "ADMIN" };
const EDITOR: TestActor = { actorId: ID.editor, systemRole: "USER" };

type HistoryItem = {
  eventId: string;
  action: string;
  field: string;
  value: unknown;
  version: number;
  actorId: string | null;
  isBaseline: boolean;
};

describe("campaign memberships history", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const { app, injectAs } = buildTestApp();

  let playerMembershipId: string;
  let editorMembershipId: string;

  beforeEach(async () => {
    await db.insert(rulesets).values({
      id: ID.ruleset,
      code: "DND_5E_IT_MEMBERSHIP_HISTORY",
      name: "Ruleset",
      description: null,
      status: "ACTIVE",
      editionYear: 2024,
      sourceReference: {},
      licenseCode: "TEST",
      attribution: null,
    });
    await db.insert(users).values(
      [ID.gm, ID.player, ID.outsider, ID.admin, ID.editor].map((id) => ({
        id,
        email: `${id}@example.test`,
        passwordHash: "hash",
        displayName: "User",
        systemRole: id === ID.admin ? ("ADMIN" as const) : ("USER" as const),
        status: "ACTIVE" as const,
        emailVerifiedAt: new Date(),
      })),
    );
    await db.insert(campaigns).values({
      id: ID.campaign,
      ownerUserId: ID.gm,
      rulesetId: ID.ruleset,
      name: "North Reach",
      slug: "north-reach",
      status: "ACTIVE",
      createdBy: ID.gm,
    });

    const members = await db
      .insert(campaignMemberships)
      .values([
        { campaignId: ID.campaign, userId: ID.gm, role: "EDITOR", createdBy: ID.gm },
        { campaignId: ID.campaign, userId: ID.player, role: "PLAYER", createdBy: ID.gm },
        { campaignId: ID.campaign, userId: ID.editor, role: "EDITOR", createdBy: ID.gm },
      ])
      .returning();

    playerMembershipId = members.find((member) => member.userId === ID.player)!.id;
    editorMembershipId = members.find((member) => member.userId === ID.editor)!.id;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const memberUrl = (id: string) => `/api/v1/campaigns/${ID.campaign}/members/${id}`;

  const patchRole = (id: string, role: string, expectedVersion: number, actor = GM) =>
    injectAs(actor, {
      method: "PATCH",
      url: memberUrl(id),
      payload: { role, expectedVersion },
    });

  const revoke = (id: string, actor = GM) =>
    injectAs(actor, { method: "DELETE", url: memberUrl(id) });

  const history = (id: string, actor = GM) =>
    injectAs(actor, { method: "GET", url: `/api/v1/history/campaignMembership/${id}` });

  const entries = async (id: string, actor = GM): Promise<HistoryItem[]> => {
    const response = await history(id, actor);

    expect(response.statusCode).toBe(200);

    return response.json().data;
  };

  const revert = (eventId: string, actor = GM) =>
    injectAs(actor, {
      method: "POST",
      url: `/api/v1/history/events/${eventId}/revert`,
      payload: {},
    });

  const restore = (id: string, version: number, actor = GM) =>
    injectAs(actor, {
      method: "POST",
      url: `/api/v1/history/campaignMembership/${id}/versions/${version}/restore`,
      payload: {},
    });

  const findRole = async (id: string) => {
    const [row] = await db.select().from(campaignMemberships).where(eq(campaignMemberships.id, id));

    return row!;
  };

  it("records the owner membership of a new campaign as part of creating it", async () => {
    const created = await injectAs(GM, {
      method: "POST",
      url: "/api/v1/campaigns",
      payload: { name: "New", slug: "new", rulesetId: ID.ruleset, settings: {} },
    });

    expect(created.statusCode).toBe(201);

    const [owner] = await db
      .select()
      .from(campaignMemberships)
      .where(eq(campaignMemberships.campaignId, created.json().id));
    const items = await entries(owner!.id);

    expect(owner).toMatchObject({ role: "EDITOR", status: "ACTIVE", createdBy: ID.gm });
    expect(owner!.joinedAt).not.toBeNull();
    expect(items.map((item) => [item.action, item.field, item.value, item.isBaseline])).toEqual(
      expect.arrayContaining([
        ["campaign.create", "role", "EDITOR", true],
        ["campaign.create", "status", "ACTIVE", true],
      ]),
    );
  });

  it("records a membership from an accepted invitation with the invited person as actor", async () => {
    const token = "a".repeat(43);

    await db.insert(campaignInvitations).values({
      campaignId: ID.campaign,
      email: `${ID.outsider}@example.test`,
      role: "PLAYER",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60_000),
      invitedBy: ID.gm,
      createdBy: ID.gm,
    });

    const accepted = await injectAs(OUTSIDER, {
      method: "POST",
      url: "/api/v1/invitations/accept",
      payload: { token },
    });

    expect(accepted.statusCode).toBe(200);

    const items = await entries(accepted.json().membershipId);

    expect(items.find((item) => item.field === "role")).toMatchObject({
      action: "campaignMembership.join",
      value: "PLAYER",
      actorId: ID.outsider,
    });
  });

  it("records role changes and keeps the history after the member was removed", async () => {
    expect((await patchRole(playerMembershipId, "EDITOR", 1)).statusCode).toBe(200);
    expect((await revoke(playerMembershipId)).statusCode).toBe(204);

    const row = await findRole(playerMembershipId);
    const items = await entries(playerMembershipId);

    expect(row).toMatchObject({ status: "REVOKED", revokedBy: ID.gm, version: 3 });
    expect(row.revokedAt).not.toBeNull();
    expect(items.find((item) => item.version === 2)).toMatchObject({
      action: "campaignMembership.updateRole",
      field: "role",
      value: "EDITOR",
      actorId: ID.gm,
    });
    expect(items.find((item) => item.version === 3)).toMatchObject({
      action: "campaignMembership.revoke",
      field: "status",
      value: "REVOKED",
      actorId: ID.gm,
    });
    expect(items.map((item) => item.field)).not.toEqual(
      expect.arrayContaining(["revokedAt", "revokedBy", "userId", "joinedAt"]),
    );
  });

  it("never undoes a role or a removal, not even for administrators", async () => {
    await patchRole(playerMembershipId, "EDITOR", 1);

    const roleChange = (await entries(playerMembershipId)).find((item) => item.version === 2)!;

    expect((await revert(roleChange.eventId)).statusCode).toBe(409);
    expect((await revert(roleChange.eventId, ADMIN)).statusCode).toBe(409);
    expect((await findRole(playerMembershipId)).role).toBe("EDITOR");

    await revoke(playerMembershipId);

    const removal = (await entries(playerMembershipId)).find((item) => item.version === 3)!;

    expect((await revert(removal.eventId, ADMIN)).statusCode).toBe(409);
    expect((await findRole(playerMembershipId)).status).toBe("REVOKED");
  });

  it("leaves role and status alone when restoring an old version", async () => {
    await patchRole(playerMembershipId, "EDITOR", 1);

    const before = await entries(playerMembershipId);

    expect((await restore(playerMembershipId, 1)).statusCode).toBe(200);
    expect(await findRole(playerMembershipId)).toMatchObject({ role: "EDITOR", version: 2 });
    expect(await entries(playerMembershipId)).toEqual(before);
  });

  it("shows the history only to people who may change memberships", async () => {
    await patchRole(playerMembershipId, "PLAYER", 1);
    await patchRole(editorMembershipId, "PLAYER", 1);
    await patchRole(editorMembershipId, "EDITOR", 2);

    expect((await history(playerMembershipId, GM)).statusCode).toBe(200);
    expect((await history(playerMembershipId, EDITOR)).statusCode).toBe(200);
    expect((await history(playerMembershipId, ADMIN)).statusCode).toBe(200);
    expect((await history(playerMembershipId, PLAYER)).statusCode).toBe(404);
    expect((await history(editorMembershipId, PLAYER)).statusCode).toBe(404);
    expect((await history(playerMembershipId, OUTSIDER)).statusCode).toBe(404);
  });

  it("takes the history away from a removed editor", async () => {
    await patchRole(playerMembershipId, "EDITOR", 1);
    expect((await history(playerMembershipId, EDITOR)).statusCode).toBe(200);

    await revoke(editorMembershipId);

    expect((await history(playerMembershipId, EDITOR)).statusCode).toBe(404);
  });

  it("writes no entries when a player or outsider tries to change a membership", async () => {
    const before = await entries(editorMembershipId);

    expect((await patchRole(editorMembershipId, "PLAYER", 1, PLAYER)).statusCode).toBe(404);
    expect((await patchRole(editorMembershipId, "PLAYER", 1, OUTSIDER)).statusCode).toBe(404);
    expect((await revoke(editorMembershipId, PLAYER)).statusCode).toBe(404);
    expect(await entries(editorMembershipId)).toEqual(before);
  });

  it("reports a role that was kept and rejects a version from the future", async () => {
    expect((await patchRole(playerMembershipId, "EDITOR", 1)).statusCode).toBe(200);

    const kept = await patchRole(playerMembershipId, "PLAYER", 1);

    expect(kept.statusCode).toBe(200);
    expect(kept.json()).toMatchObject({ role: "EDITOR", version: 2, merged: ["role"] });
    expect((await patchRole(playerMembershipId, "PLAYER", 2)).json().merged).toEqual([]);
    expect((await patchRole(playerMembershipId, "EDITOR", 99)).statusCode).toBe(412);
  });

  it("keeps the rules for the owner and writes no entry when they apply", async () => {
    const [owner] = await db
      .select()
      .from(campaignMemberships)
      .where(
        and(eq(campaignMemberships.campaignId, ID.campaign), eq(campaignMemberships.userId, ID.gm)),
      );

    expect((await patchRole(owner!.id, "PLAYER", 1)).statusCode).toBe(409);
    expect((await revoke(owner!.id)).statusCode).toBe(409);
    expect(await findRole(owner!.id)).toMatchObject({ role: "EDITOR", status: "ACTIVE", version: 1 });
  });
});
