import { createHmac, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { userSettings, users } from "#core/db/schema";
import { buildTestApp } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

// Standard Webhooks secret as Clerk shows it (`whsec_` + base64 key).
const WEBHOOK_KEY = Buffer.from("questaria-test-webhook-signing-key");
const WEBHOOK_SECRET = `whsec_${WEBHOOK_KEY.toString("base64")}`;

function signedWebhook(event: unknown, secret: Buffer = WEBHOOK_KEY) {
  const payload = JSON.stringify(event);
  const id = `msg_${randomUUID()}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");

  return {
    method: "POST" as const,
    url: "/api/v1/webhooks/clerk",
    payload,
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    },
  };
}

function clerkUser(
  id: string,
  email: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    object: "user",
    primary_email_address_id: "idn_1",
    email_addresses: [
      { id: "idn_1", email_address: email, verification: { status: "verified" } },
    ],
    first_name: "Lea",
    last_name: "Sommer",
    username: null,
    locale: null,
    timezone: null,
    unsafe_metadata: {},
    ...overrides,
  };
}

describe("accounts behind Clerk identities", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const session = buildTestApp({
    realAccounts: true,
    env: {
      CLERK_WEBHOOK_SIGNING_SECRET: WEBHOOK_SECRET,
      BOOTSTRAP_MAINTAINER_EMAIL: "Chief@Example.test",
    },
  });
  const { app, identity, injectAsIdentity } = session;

  const me = (externalUserId: string) =>
    injectAsIdentity(externalUserId, { method: "GET", url: "/api/v1/me" });

  async function findByClerkId(clerkUserId: string) {
    const [row] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));

    return row;
  }

  beforeEach(() => {
    identity.users.clear();
    identity.calls.length = 0;
    identity.loadCount = 0;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("answers 401 to a token the provider doesn't confirm", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: "Bearer forged" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("creates the local account on the first request, with the browser's settings", async () => {
    identity.addUser({
      externalUserId: "user_lea",
      email: "Lea@Example.test",
      displayName: "Lea Sommer",
      locale: "en",
      timezone: "Europe/Berlin",
    });

    const response = await me("user_lea");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      email: "lea@example.test",
      displayName: "Lea Sommer",
      username: "lea-sommer",
      systemRole: "USER",
      emailVerificationRequiredCode: null,
      settings: { locale: "en", timezone: "Europe/Berlin" },
    });

    // Known from now on: no second call to the provider.
    expect((await me("user_lea")).statusCode).toBe(200);
    expect(identity.loadCount).toBe(1);
  });

  it("drops a language and time zone the server doesn't accept", async () => {
    identity.addUser({
      externalUserId: "user_odd",
      email: "odd@example.test",
      locale: "klingon!",
      timezone: "Mars/Olympus",
    });

    const response = await me("user_odd");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      displayName: "odd",
      settings: { locale: "de", timezone: "UTC" },
    });
  });

  it("creates one account when the first requests arrive together", async () => {
    identity.addUser({ externalUserId: "user_twice", email: "twice@example.test" });

    const responses = await Promise.all([me("user_twice"), me("user_twice"), me("user_twice")]);

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
    expect(new Set(responses.map((response) => response.json().id)).size).toBe(1);
    expect(await db.select().from(users).where(eq(users.email, "twice@example.test"))).toHaveLength(1);

    const [account] = await db.select().from(users).where(eq(users.email, "twice@example.test"));

    expect(
      await db.select().from(userSettings).where(eq(userSettings.userId, account!.id)),
    ).toHaveLength(1);
  });

  it("refuses an identity that no longer exists at the provider", async () => {
    expect((await me("user_gone")).statusCode).toBe(401);
  });

  it("refuses a locked or disabled account despite a valid session", async () => {
    identity.addUser({ externalUserId: "user_locked", email: "locked@example.test" });
    expect((await me("user_locked")).statusCode).toBe(200);

    await db.update(users).set({ status: "LOCKED" }).where(eq(users.clerkUserId, "user_locked"));

    expect((await me("user_locked")).statusCode).toBe(401);
  });

  it("links a local account without identity by its verified address", async () => {
    await db.insert(users).values({
      email: "legacy@example.test",
      displayName: "Legacy",
      userTag: "legacy#000001",
      status: "ACTIVE",
      emailVerifiedAt: new Date("2026-01-01T00:00:00Z"),
    });
    identity.addUser({ externalUserId: "user_legacy", email: "legacy@example.test" });

    const response = await me("user_legacy");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ displayName: "Legacy", userTag: "legacy#000001" });
    expect((await findByClerkId("user_legacy"))?.emailVerifiedAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("never links by an unverified address or takes over another identity's account", async () => {
    await db.insert(users).values({
      email: "taken@example.test",
      displayName: "Taken",
      userTag: "taken#000001",
      clerkUserId: "user_owner",
    });
    await db.insert(users).values({
      email: "unproven@example.test",
      displayName: "Unproven",
      userTag: "unproven#000001",
    });
    identity.addUser({ externalUserId: "user_thief", email: "taken@example.test" });
    identity.addUser({
      externalUserId: "user_unverified",
      email: "unproven@example.test",
      emailVerified: false,
    });

    expect((await me("user_thief")).statusCode).toBe(401);
    expect((await me("user_unverified")).statusCode).toBe(401);
    expect(await findByClerkId("user_thief")).toBeUndefined();
    expect(await findByClerkId("user_unverified")).toBeUndefined();
  });

  it("makes the bootstrap address the first system maintainer", async () => {
    identity.addUser({ externalUserId: "user_chief", email: "chief@example.test" });

    expect((await me("user_chief")).json()).toMatchObject({ systemRole: "SYSTEM_MAINTAINER" });
  });

  it("gives the bootstrap address no role once there is a system maintainer", async () => {
    await db.insert(users).values({
      email: "maintainer@example.test",
      displayName: "Maintainer",
      userTag: "maintainer#000001",
      systemRole: "SYSTEM_MAINTAINER",
      clerkUserId: "user_maintainer",
    });
    identity.addUser({ externalUserId: "user_chief", email: "chief@example.test" });

    expect((await me("user_chief")).json()).toMatchObject({ systemRole: "USER" });
  });

  it("gives an unverified bootstrap address no role", async () => {
    identity.addUser({
      externalUserId: "user_chief",
      email: "chief@example.test",
      emailVerified: false,
    });

    expect((await me("user_chief")).json()).toMatchObject({ systemRole: "USER" });
  });

  it("locks the provider account when an administrator locks the user, and unlocks it again", async () => {
    identity.addUser({ externalUserId: "user_target", email: "target@example.test" });
    identity.addUser({ externalUserId: "user_admin", email: "admin@example.test" });

    const target = (await me("user_target")).json() as { id: string };

    await me("user_admin");
    await db.update(users).set({ systemRole: "ADMIN" }).where(eq(users.clerkUserId, "user_admin"));

    const lock = await injectAsIdentity("user_admin", {
      method: "PATCH",
      url: `/api/v1/users/${target.id}`,
      payload: { expectedVersion: 1, status: "LOCKED" },
    });

    expect(lock.statusCode).toBe(200);

    const unlock = await injectAsIdentity("user_admin", {
      method: "PATCH",
      url: `/api/v1/users/${target.id}`,
      payload: { expectedVersion: 2, status: "ACTIVE" },
    });

    expect(unlock.statusCode).toBe(200);
    expect(identity.calls).toEqual([
      { action: "lock", externalUserId: "user_target" },
      { action: "unlock", externalUserId: "user_target" },
    ]);
  });

  it("asks the provider only once in a while about an identity that got no account", async () => {
    expect((await me("user_nobody")).statusCode).toBe(401);
    expect((await me("user_nobody")).statusCode).toBe(401);
    expect(identity.loadCount).toBe(1);
  });

  it("retires an unconfirmed account from before Clerk instead of handing it to the mailbox owner", async () => {
    const [squatter] = await db
      .insert(users)
      .values({ email: "owner@example.test", displayName: "Squatter", userTag: "squatter#000001" })
      .returning();
    identity.addUser({ externalUserId: "user_owner_real", email: "owner@example.test", displayName: "Real Owner" });

    const response = await me("user_owner_real");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ displayName: "Real Owner" });
    expect(response.json().id).not.toBe(squatter!.id);

    const [retired] = await db.select().from(users).where(eq(users.id, squatter!.id));

    expect(retired).toMatchObject({ status: "DISABLED" });
    expect(retired?.deletedAt).not.toBeNull();
  });

  it("keeps the lock when banning at Clerk fails, and bans again when the status is saved again", async () => {
    identity.addUser({ externalUserId: "user_target", email: "target@example.test" });
    identity.addUser({ externalUserId: "user_admin", email: "admin@example.test" });

    const target = (await me("user_target")).json() as { id: string };

    await me("user_admin");
    await db.update(users).set({ systemRole: "ADMIN" }).where(eq(users.clerkUserId, "user_admin"));

    const lockUser = jest.spyOn(identity, "lockUser").mockRejectedValueOnce(new Error("Clerk down"));
    const lock = await injectAsIdentity("user_admin", {
      method: "PATCH",
      url: `/api/v1/users/${target.id}`,
      payload: { expectedVersion: 1, status: "LOCKED" },
    });

    expect(lock.statusCode).toBe(200);
    expect((await me("user_target")).statusCode).toBe(401);

    const again = await injectAsIdentity("user_admin", {
      method: "PATCH",
      url: `/api/v1/users/${target.id}`,
      payload: { expectedVersion: 2, status: "LOCKED" },
    });

    expect(again.statusCode).toBe(200);
    expect(lockUser).toHaveBeenCalledTimes(2);
    lockUser.mockRestore();
  });

  describe("webhook", () => {
    it("refuses a missing or wrong signature", async () => {
      const event = { type: "user.created", object: "event", data: clerkUser("user_x", "x@example.test") };
      const unsigned = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/clerk",
        payload: JSON.stringify(event),
        headers: { "content-type": "application/json" },
      });
      const forged = await app.inject(signedWebhook(event, Buffer.from("another-key-entirely")));

      expect(unsigned.statusCode).toBe(400);
      expect(forged.statusCode).toBe(400);
      expect(await findByClerkId("user_x")).toBeUndefined();
    });

    it("answers 503 without a signing secret", async () => {
      const other = buildTestApp({ realAccounts: true });
      const response = await other.app.inject(
        signedWebhook({ type: "user.created", object: "event", data: clerkUser("user_y", "y@example.test") }),
      );

      expect(response.statusCode).toBe(503);
      await other.app.close();
    });

    it("creates the account once, even when Clerk sends the event twice", async () => {
      identity.addUser({ externalUserId: "user_hook", email: "hook@example.test", displayName: "Lea Sommer", locale: "en" });
      const event = { type: "user.created", object: "event", data: clerkUser("user_hook", "hook@example.test") };

      expect((await app.inject(signedWebhook(event))).statusCode).toBe(200);
      expect((await app.inject(signedWebhook(event))).statusCode).toBe(200);

      const account = await findByClerkId("user_hook");

      expect(account).toMatchObject({ email: "hook@example.test", displayName: "Lea Sommer" });
      expect(await db.select().from(users).where(eq(users.email, "hook@example.test"))).toHaveLength(1);
      expect(
        (await db.select().from(userSettings).where(eq(userSettings.userId, account!.id)))[0],
      ).toMatchObject({ locale: "en" });
    });

    it("copies a new verified address but keeps the app's display name", async () => {
      const updated = () =>
        app.inject(signedWebhook({ type: "user.updated", object: "event", data: clerkUser("user_move", "any@example.test") }));

      identity.addUser({ externalUserId: "user_move", email: "old@example.test" });
      await updated();
      await db.update(users).set({ displayName: "Chosen Name" }).where(eq(users.clerkUserId, "user_move"));

      identity.addUser({ externalUserId: "user_move", email: "new@example.test", emailVerified: false, displayName: "Renamed" });
      await updated();
      expect(await findByClerkId("user_move")).toMatchObject({ email: "old@example.test" });

      identity.addUser({ externalUserId: "user_move", email: "new@example.test", displayName: "Renamed" });
      await updated();
      expect(await findByClerkId("user_move")).toMatchObject({
        email: "new@example.test",
        displayName: "Chosen Name",
      });
    });

    it("takes Clerk's current state, so a late older event doesn't bring an old address back", async () => {
      identity.addUser({ externalUserId: "user_late", email: "current@example.test" });
      await me("user_late");

      const stale = clerkUser("user_late", "removed@example.test");

      expect((await app.inject(signedWebhook({ type: "user.updated", object: "event", data: stale }))).statusCode).toBe(200);
      expect(await findByClerkId("user_late")).toMatchObject({ email: "current@example.test" });
    });

    it("disables the account when it is deleted at Clerk, and it stays disabled", async () => {
      identity.addUser({ externalUserId: "user_bye", email: "bye@example.test" });
      await me("user_bye");
      identity.users.delete("user_bye");
      const response = await app.inject(
        signedWebhook({ type: "user.deleted", object: "event", data: { id: "user_bye", deleted: true, object: "user" } }),
      );

      expect(response.statusCode).toBe(200);

      const [account] = await db.select().from(users).where(eq(users.email, "bye@example.test"));

      expect(account).toMatchObject({ status: "DISABLED", clerkUserId: null });

      // Signing up again with the address links the disabled account, which stays refused.
      identity.addUser({ externalUserId: "user_bye_again", email: "bye@example.test" });
      expect((await me("user_bye_again")).statusCode).toBe(401);
    });

    it("ignores events the app doesn't use", async () => {
      const response = await app.inject(
        signedWebhook({ type: "email.created", object: "event", data: { id: "ema_1" } }),
      );

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "accepted" });
    });
  });
});
