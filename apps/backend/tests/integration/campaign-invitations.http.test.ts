import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { campaignInvitations, campaignMemberships, campaigns, rulesets, users } from "#core/db/schema";
import type { EmailMessage } from "#core/email/port";
import { buildTestApp, type TestActor } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

const ID = {
  ruleset: "10000000-0000-4000-8000-000000003001",
  gm: "a0000000-0000-4000-8000-000000003001",
  player: "a0000000-0000-4000-8000-000000003002",
  outsider: "a0000000-0000-4000-8000-000000003003",
  campaign: "c0000000-0000-4000-8000-000000003001",
} as const;

const GM: TestActor = { actorId: ID.gm, systemRole: "USER" };
const PLAYER: TestActor = { actorId: ID.player, systemRole: "USER" };
const OUTSIDER: TestActor = { actorId: ID.outsider, systemRole: "USER" };

const PLAYER_EMAIL = "player@example.test";
const PLAYER_TAG = "jonas#000002";

describe("campaign invitations over HTTP", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const sent: EmailMessage[] = [];
  const { app, injectAs } = buildTestApp({
    publicPorts: {
      emailPort: {
        async send(message) {
          sent.push(message);
        },
      },
    },
  });

  const invite = (body: object) =>
    injectAs(GM, { method: "POST", url: `/api/v1/campaigns/${ID.campaign}/invitations`, payload: body });
  const tokenOf = (message: EmailMessage | undefined) => /#token=([A-Za-z0-9_-]+)/.exec(message?.text ?? "")?.[1] ?? "";
  const invitationRow = async (id: string) =>
    (await db.select().from(campaignInvitations).where(eq(campaignInvitations.id, id)))[0]!;

  beforeEach(async () => {
    sent.length = 0;
    await db.insert(rulesets).values({
      id: ID.ruleset,
      code: "DND_5E_IT_INVITATIONS",
      name: "Ruleset",
      description: null,
      status: "ACTIVE",
      editionYear: 2024,
      sourceReference: {},
      licenseCode: "TEST",
      attribution: null,
    });
    await db.insert(users).values([
      { id: ID.gm, email: "gm@example.test", displayName: "Mira Falkenstein", userTag: "mira#000001", status: "ACTIVE", emailVerifiedAt: new Date() },
      { id: ID.player, email: PLAYER_EMAIL, displayName: "Jonas Weber", userTag: PLAYER_TAG, status: "ACTIVE", emailVerifiedAt: new Date() },
      { id: ID.outsider, email: "outsider@example.test", displayName: "Somebody", userTag: "other#000003", status: "ACTIVE", emailVerifiedAt: new Date() },
    ]);
    await db.insert(campaigns).values({
      id: ID.campaign,
      ownerUserId: ID.gm,
      rulesetId: ID.ruleset,
      name: "North Reach",
      slug: "north-reach",
      status: "ACTIVE",
      createdBy: ID.gm,
    });
    await db.insert(campaignMemberships).values({ campaignId: ID.campaign, userId: ID.gm, role: "EDITOR", createdBy: ID.gm });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("keeps an invitation by email address apart from any account, and shows it to the address's owner", async () => {
    const created = await invite({ email: PLAYER_EMAIL, role: "PLAYER" });
    expect(created.statusCode).toBe(201);
    // The address has an account, but the answer doesn't say so.
    expect(created.json()).toMatchObject({ email: PLAYER_EMAIL, userTag: null, createdAt: expect.any(String) });
    expect((await invitationRow(created.json().id)).targetUserId).toBeNull();

    const mine = await injectAs(PLAYER, { method: "GET", url: "/api/v1/me/invitations" });
    expect(mine.json().data).toEqual([
      expect.objectContaining({ invitationId: created.json().id, campaignName: "North Reach", invitedByName: "Mira Falkenstein", role: "PLAYER" }),
    ]);
    const others = await injectAs(OUTSIDER, { method: "GET", url: "/api/v1/me/invitations" });
    expect(others.json().data).toEqual([]);
  });

  it("ties an invitation by user tag to the account, without showing its address, also after an address change", async () => {
    const created = await invite({ userTag: PLAYER_TAG, role: "EDITOR" });
    expect(created.json()).toMatchObject({ email: null, userTag: PLAYER_TAG });
    const list = await injectAs(GM, { method: "GET", url: `/api/v1/campaigns/${ID.campaign}/invitations` });
    expect(list.json().data).toEqual([expect.objectContaining({ email: null, userTag: PLAYER_TAG })]);

    // The player moves to a new address; somebody else takes the old one.
    await db.update(users).set({ email: "jonas-new@example.test" }).where(eq(users.id, ID.player));
    await db.update(users).set({ email: PLAYER_EMAIL }).where(eq(users.id, ID.outsider));
    expect((await injectAs(OUTSIDER, { method: "GET", url: "/api/v1/me/invitations" })).json().data).toEqual([]);
    const outsiderTry = await injectAs(OUTSIDER, { method: "POST", url: `/api/v1/me/invitations/${created.json().id}/accept` });
    expect(outsiderTry.statusCode).toBe(404);

    const accepted = await injectAs(PLAYER, { method: "POST", url: `/api/v1/me/invitations/${created.json().id}/accept` });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ campaignId: ID.campaign, role: "EDITOR" });

    const members = await injectAs(GM, { method: "GET", url: `/api/v1/campaigns/${ID.campaign}/members` });
    expect(members.json().data.map((member: { userTag: string; isOwner: boolean }) => [member.userTag, member.isOwner])).toEqual(
      expect.arrayContaining([
        ["mira#000001", true],
        [PLAYER_TAG, false],
      ]),
    );
  });

  it("answers 404 for a foreign invitation, expired or not, and writes nothing for it", async () => {
    const created = await invite({ email: PLAYER_EMAIL, role: "PLAYER" });
    const id = created.json().id as string;
    await db.update(campaignInvitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(campaignInvitations.id, id));

    for (const action of ["accept", "decline"]) {
      const response = await injectAs(OUTSIDER, { method: "POST", url: `/api/v1/me/invitations/${id}/${action}` });
      expect(response.statusCode).toBe(404);
    }
    expect((await invitationRow(id)).status).toBe("PENDING");

    // The invited account learns why: expired.
    const own = await injectAs(PLAYER, { method: "POST", url: `/api/v1/me/invitations/${id}/accept` });
    expect(own.statusCode).toBe(409);
    expect(own.json().error.details).toEqual({ reason: "expired" });
  });

  it("declines: the token stops working and the game master may invite again", async () => {
    const created = await invite({ email: PLAYER_EMAIL, role: "PLAYER" });
    const token = tokenOf(sent.at(-1));
    expect(token).not.toBe("");

    const declined = await injectAs(PLAYER, { method: "POST", url: `/api/v1/me/invitations/${created.json().id}/decline` });
    expect(declined.statusCode).toBe(204);
    expect(await invitationRow(created.json().id)).toMatchObject({ status: "REVOKED", updatedBy: ID.player });

    const byToken = await injectAs(PLAYER, { method: "POST", url: "/api/v1/invitations/accept", payload: { token } });
    expect(byToken.statusCode).toBe(409);
    expect(byToken.json().error.details).toEqual({ reason: "changed" });
    expect((await injectAs(PLAYER, { method: "GET", url: "/api/v1/me/invitations" })).json().data).toEqual([]);
    expect((await invite({ email: PLAYER_EMAIL, role: "PLAYER" })).statusCode).toBe(201);
  });

  it("lets only one of accepting and declining the same invitation win", async () => {
    const created = await invite({ email: PLAYER_EMAIL, role: "PLAYER" });
    const url = `/api/v1/me/invitations/${created.json().id}`;

    const [accepted, declined] = await Promise.all([
      injectAs(PLAYER, { method: "POST", url: `${url}/accept` }),
      injectAs(PLAYER, { method: "POST", url: `${url}/decline` }),
    ]);

    // Whichever comes second finds the invitation answered: 409 `changed`.
    const outcomes = [accepted.statusCode, declined.statusCode].sort();
    expect([
      [200, 409],
      [204, 409],
    ]).toContainEqual(outcomes);
    const loser = accepted.statusCode === 409 ? accepted : declined;
    expect(loser.json().error.details).toEqual({ reason: "changed" });
    const row = await invitationRow(created.json().id);
    const member = await db.select().from(campaignMemberships).where(eq(campaignMemberships.userId, ID.player));
    // Accepted means a membership, declined means none.
    expect(row.status === "ACCEPTED").toBe(member.length === 1);
  });

  it("never lets a refused duplicate link an address to an account", async () => {
    // By tag first, then guessing the account's address by email: both are separate invitations.
    expect((await invite({ userTag: PLAYER_TAG, role: "PLAYER" })).statusCode).toBe(201);
    expect((await invite({ email: PLAYER_EMAIL, role: "PLAYER" })).statusCode).toBe(201);
    expect((await invite({ email: "wrong-guess@example.test", role: "PLAYER" })).statusCode).toBe(201);
    // Only the same way twice is a duplicate.
    expect((await invite({ userTag: PLAYER_TAG, role: "PLAYER" })).statusCode).toBe(409);
    expect((await invite({ email: PLAYER_EMAIL, role: "PLAYER" })).statusCode).toBe(409);
  });

  it("invites by email without looking at accounts: members and locked accounts answer like strangers", async () => {
    await db.insert(campaignMemberships).values({ campaignId: ID.campaign, userId: ID.player, role: "PLAYER", createdBy: ID.gm });
    await db.update(users).set({ status: "LOCKED" }).where(eq(users.id, ID.outsider));

    const member = await invite({ email: PLAYER_EMAIL, role: "PLAYER" });
    const locked = await invite({ email: "outsider@example.test", role: "PLAYER" });
    expect([member.statusCode, locked.statusCode]).toEqual([201, 201]);
    expect([member.json().userTag, locked.json().userTag]).toEqual([null, null]);

    // A member can't be invited again: the invitation doesn't show for them, and accepting its
    // token ends it without a second membership.
    expect((await injectAs(PLAYER, { method: "GET", url: "/api/v1/me/invitations" })).json().data).toEqual([]);
    const token = tokenOf(sent.find((message) => message.to === PLAYER_EMAIL));
    const accepted = await injectAs(PLAYER, { method: "POST", url: "/api/v1/invitations/accept", payload: { token } });
    expect(accepted.statusCode).toBe(409);
    expect(accepted.json().error.details).toEqual({ reason: "member" });
    expect((await invitationRow(member.json().id)).status).toBe("REVOKED");
    expect(await db.select().from(campaignMemberships).where(eq(campaignMemberships.userId, ID.player))).toHaveLength(1);
  });

  it("uses up the account's other invitations to the campaign once it joined", async () => {
    const byTag = await invite({ userTag: PLAYER_TAG, role: "EDITOR" });
    const byEmail = await invite({ email: PLAYER_EMAIL, role: "PLAYER" });

    const accepted = await injectAs(PLAYER, { method: "POST", url: `/api/v1/me/invitations/${byTag.json().id}/accept` });
    expect(accepted.statusCode).toBe(200);
    expect((await invitationRow(byEmail.json().id)).status).toBe("REVOKED");
    expect((await injectAs(PLAYER, { method: "GET", url: "/api/v1/me/invitations" })).json().data).toEqual([]);

    // Accepting the same invitation again returns the membership.
    const again = await injectAs(PLAYER, { method: "POST", url: `/api/v1/me/invitations/${byTag.json().id}/accept` });
    expect(again.statusCode).toBe(200);
    expect(again.json().membershipId).toBe(accepted.json().membershipId);
    // Inviting the member by tag is refused.
    expect((await invite({ userTag: PLAYER_TAG, role: "PLAYER" })).statusCode).toBe(409);
  });

  it("keeps a token valid when another account tried it", async () => {
    await invite({ email: PLAYER_EMAIL, role: "PLAYER" });
    const token = tokenOf(sent.at(-1));

    const foreign = await injectAs(OUTSIDER, { method: "POST", url: "/api/v1/invitations/accept", payload: { token } });
    expect(foreign.statusCode).toBe(404);
    const own = await injectAs(PLAYER, { method: "POST", url: "/api/v1/invitations/accept", payload: { token } });
    expect(own.statusCode).toBe(200);
  });

  it("shows invitations by email only once the address is verified", async () => {
    await invite({ email: PLAYER_EMAIL, role: "PLAYER" });
    await db.update(users).set({ emailVerifiedAt: null }).where(eq(users.id, ID.player));
    expect((await injectAs(PLAYER, { method: "GET", url: "/api/v1/me/invitations" })).json().data).toEqual([]);
  });

  it("tells the invited account why its invitation can't be answered: expired (also once marked) or taken back", async () => {
    const expired = await invite({ email: PLAYER_EMAIL, role: "PLAYER" });
    await db.update(campaignInvitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(campaignInvitations.id, expired.json().id));
    // The game master's list marks it as expired.
    await injectAs(GM, { method: "GET", url: `/api/v1/campaigns/${ID.campaign}/invitations` });
    expect((await invitationRow(expired.json().id)).status).toBe("EXPIRED");

    const taken = await invite({ userTag: PLAYER_TAG, role: "PLAYER" });
    await injectAs(GM, { method: "DELETE", url: `/api/v1/campaigns/${ID.campaign}/invitations/${taken.json().id}` });

    for (const [id, reason] of [
      [expired.json().id, "expired"],
      [taken.json().id, "changed"],
    ]) {
      for (const action of ["accept", "decline"]) {
        const response = await injectAs(PLAYER, { method: "POST", url: `/api/v1/me/invitations/${id}/${action}` });
        expect([action, response.statusCode, response.json().error.details]).toEqual([action, 409, { reason }]);
      }
    }
  });

  it("refuses a malformed invitation id and needs a session", async () => {
    expect((await injectAs(PLAYER, { method: "POST", url: "/api/v1/me/invitations/not-an-id/accept" })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: `/api/v1/me/invitations/${ID.campaign}/decline` })).statusCode).toBe(401);
  });
});
