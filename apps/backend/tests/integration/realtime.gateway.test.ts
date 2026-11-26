import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { createAdapter } from "@socket.io/redis-streams-adapter";
import { eq } from "drizzle-orm";
import { Server } from "socket.io";
import { io as connectClient, type Socket as ClientSocket } from "socket.io-client";

import { MemoryCacheStore } from "#core/cache/memoryCacheStore";
import { createDrizzleDb, createPgPool, createTransactionManager } from "#core/db/pool";
import { campaignMemberships, campaigns, rulesets, users } from "#core/db/schema";
import { createLogger } from "#core/log/logger";
import {
  createRealtimeBroker,
  REALTIME_PATH,
  type InvalidateMessage,
  type RealtimeBroker,
  type RealtimeClientToServerEvents,
  type RealtimeServerToClientEvents,
} from "#core/realtime/index";
import { closeRedisClient, createRedisClient, type Redis } from "#core/redis/client";
import { AccountRepository } from "#src/modules/auth/domain/repository/AccountRepository";
import { AccountCache } from "#src/modules/auth/service/AccountCache";
import { AccountService } from "#src/modules/auth/service/AccountService";
import { CampaignsRepository } from "#src/modules/campaigns/domain/repository/CampaignsRepository";
import { attachRealtimeGateway, type RealtimeServer } from "#src/realtime/RealtimeGateway";
import { buildTestApp, type TestActor } from "#test/helpers/buildTestApp";
import { FakeIdentityPort, testIdentityToken } from "#test/helpers/fakeIdentity";
import { closeTestRedis, createTestRedis, TEST_REDIS_URL } from "#test/helpers/testRedis";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

const ID = {
  ruleset: "10000000-0000-4000-8000-000000002024",
  gm: "a0000000-0000-4000-8000-000000000001",
  player: "a0000000-0000-4000-8000-000000000002",
  outsider: "a0000000-0000-4000-8000-000000000003",
  admin: "a0000000-0000-4000-8000-000000000004",
  locked: "a0000000-0000-4000-8000-000000000005",
  campaign: "c0000000-0000-4000-8000-00000000000a",
} as const;

const GM: TestActor = { actorId: ID.gm, systemRole: "USER" };

type Client = ClientSocket<RealtimeServerToClientEvents, RealtimeClientToServerEvents>;

const silentLogger = createLogger({ service: "realtime-test", level: "silent", pretty: false, environment: "test" });

/** Accounts are linked to the fake identity by their id: the token's user is the account id. */
const tokenOf = (userId: string, expiresAt?: Date) => testIdentityToken(userId, "sess_test", expiresAt);

function waitFor<T>(register: (resolve: (value: T) => void) => void, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), timeoutMs);
    register((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

/** Collects every `invalidate` a client hears. */
function listen(client: Client): InvalidateMessage[] {
  const heard: InvalidateMessage[] = [];
  client.on("invalidate", (message) => heard.push(message));
  return heard;
}

async function until(check: () => boolean | Promise<boolean>, timeoutMs = 3000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > end) throw new Error("condition not met in time");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("realtime gateway", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const identity = new FakeIdentityPort();
  const clients: Client[] = [];
  const gatewayCache = new MemoryCacheStore();

  let apiRedis: Redis;
  let gatewayRedis: Redis;
  let httpServer: HttpServer;
  let io: RealtimeServer;
  let url: string;
  let broker: RealtimeBroker;
  let api: ReturnType<typeof buildTestApp>;
  let playerMembershipId: string;
  let available = true;

  beforeAll(async () => {
    apiRedis = await createTestRedis("realtime-api");
    gatewayRedis = createRedisClient(TEST_REDIS_URL, silentLogger, "realtime-adapter", { blocking: true });
    broker = createRealtimeBroker(apiRedis, silentLogger);
    api = buildTestApp({ redis: apiRedis });
    await api.app.ready();

    httpServer = createServer();
    io = new Server(httpServer, {
      path: REALTIME_PATH,
      adapter: createAdapter(gatewayRedis, { blockTimeInMs: 200 }),
      connectionStateRecovery: { maxDisconnectionDuration: 60_000, skipMiddlewares: false },
    });
    const campaignsRepository = new CampaignsRepository();
    attachRealtimeGateway(io, {
      identityPort: identity,
      accountPort: new AccountService(
        db,
        createTransactionManager(db),
        new AccountRepository(),
        identity,
        new AccountCache(gatewayCache),
        { bootstrapMaintainerEmail: undefined },
      ),
      resolveCampaignAccess: ({ campaignId, actorId }) =>
        campaignsRepository.resolveCampaignAccess({ db, campaignId, actorId }),
      logger: silentLogger,
      sessionGraceMs: 50,
      isAvailable: () => available,
    });
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await io.close();
    await api.app.close();
    await closeRedisClient(gatewayRedis);
    await closeTestRedis(apiRedis);
    await pool.end();
  });

  beforeEach(async () => {
    gatewayCache.clear();
    await db.insert(rulesets).values({
      id: ID.ruleset,
      code: "DND_5E_IT_REALTIME",
      name: "Ruleset",
      description: null,
      status: "ACTIVE",
      editionYear: 2024,
      sourceReference: {},
      licenseCode: "TEST",
      attribution: null,
    });
    await db.insert(users).values(
      [ID.gm, ID.player, ID.outsider, ID.admin, ID.locked].map((id) => ({
        id,
        clerkUserId: id,
        email: `${id}@example.test`,
        displayName: "User",
        systemRole: id === ID.admin ? ("ADMIN" as const) : ("USER" as const),
        status: id === ID.locked ? ("DISABLED" as const) : ("ACTIVE" as const),
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
      ])
      .returning();
    playerMembershipId = members.find((member) => member.userId === ID.player)!.id;
  });

  afterEach(() => {
    clients.splice(0).forEach((client) => client.disconnect());
    available = true;
  });

  function client(token: string): Client {
    const socket: Client = connectClient(url, {
      path: REALTIME_PATH,
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
    });
    clients.push(socket);
    return socket;
  }

  async function connected(userId: string, expiresAt?: Date): Promise<Client> {
    const socket = client(tokenOf(userId, expiresAt));
    await waitFor<void>((resolve) => socket.once("connect", () => resolve()));
    return socket;
  }

  const join = (socket: Client, campaignId: string) =>
    waitFor<unknown>((resolve) => socket.emit("campaign:join", campaignId, resolve));

  /** Sends through Redis Streams like the API does and waits for the gateway to pass it on. */
  async function send(...messages: Array<Parameters<RealtimeBroker["invalidate"]>>): Promise<void> {
    messages.forEach((message) => broker.invalidate(...message));
    await broker.close();
  }

  it("refuses connections without a valid session or of a locked account", async () => {
    for (const token of ["", "forged", tokenOf(ID.locked), tokenOf("unknown-identity")]) {
      const socket = client(token);
      const error = await waitFor<Error & { data?: { code?: string } }>((resolve) =>
        socket.once("connect_error", resolve),
      );
      expect(error.data?.code).toBe("UNAUTHENTICATED");
    }
  });

  it("refuses connections while messages can't reach it (no Redis)", async () => {
    available = false;
    const socket = client(tokenOf(ID.player));
    const error = await waitFor<Error & { data?: { code?: string } }>((resolve) =>
      socket.once("connect_error", resolve),
    );

    expect(error.data?.code).toBe("UNAVAILABLE");
  });

  it("limits how often one socket may join", async () => {
    const player = await connected(ID.player);
    const results: unknown[] = [];

    for (let index = 0; index < 31; index += 1) results.push(await join(player, ID.campaign));

    expect(results.slice(0, 30).every((result) => (result as { ok: boolean }).ok)).toBe(true);
    expect(results[30]).toEqual({ ok: false, reason: "tooMany" });
  });

  it("takes an administrator out of campaigns they are no member of once their role is gone", async () => {
    const admin = await connected(ID.admin);
    expect(await join(admin, ID.campaign)).toEqual({ ok: true });

    await db.update(users).set({ systemRole: "USER" }).where(eq(users.id, ID.admin));
    // A change through the API drops the cached account (`history.user.changed`); here by hand.
    gatewayCache.clear();
    const result = await waitFor<unknown>((resolve) =>
      admin.emit("auth:refresh", tokenOf(ID.admin), resolve),
    );

    expect(result).toMatchObject({ ok: true });
    await until(async () => (await io.in(`campaign:${ID.campaign}:players`).fetchSockets()).length === 0);
  });

  it("tells the session's lifetime and puts the socket into its account's room", async () => {
    const socket = client(tokenOf(ID.player));
    const session = await waitFor((resolve) => socket.once("session", resolve));
    expect(session).toEqual({ expiresInSeconds: null });

    const heard = listen(socket);
    await send([{ kind: "user", userId: ID.player }, { resource: "account", campaignId: null }]);
    await until(() => heard.length === 1);
    expect(heard).toEqual([{ resource: "account", campaignId: null }]);
  });

  it("lets members into the rooms of their role, nobody else", async () => {
    const gm = await connected(ID.gm);
    const player = await connected(ID.player);
    const admin = await connected(ID.admin);
    const outsider = await connected(ID.outsider);

    expect(await join(gm, ID.campaign)).toEqual({ ok: true });
    expect(await join(player, ID.campaign)).toEqual({ ok: true });
    expect(await join(admin, ID.campaign)).toEqual({ ok: true });
    expect(await join(outsider, ID.campaign)).toEqual({ ok: false, reason: "notFound" });
    expect(await join(outsider, "not-a-campaign")).toEqual({ ok: false, reason: "invalid" });
    expect(await join(gm, "c0000000-0000-4000-8000-0000000000ff")).toEqual({ ok: false, reason: "notFound" });

    const heard = new Map([gm, player, admin, outsider].map((socket) => [socket, listen(socket)]));
    await send(
      [{ kind: "campaignEditors", campaignId: ID.campaign }, { resource: "campaign-memberships", campaignId: ID.campaign }],
      [{ kind: "campaignMembers", campaignId: ID.campaign }, { resource: "content-shares", campaignId: ID.campaign }],
    );
    await until(() => heard.get(gm)!.length === 2 && heard.get(player)!.length === 1);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(heard.get(gm)!.map((message) => message.resource).sort()).toEqual(["campaign-memberships", "content-shares"]);
    expect(heard.get(admin)!.map((message) => message.resource).sort()).toEqual(["campaign-memberships", "content-shares"]);
    expect(heard.get(player)!.map((message) => message.resource)).toEqual(["content-shares"]);
    expect(heard.get(outsider)).toEqual([]);
  });

  it("moves a member's rooms when the game master changes their role through the API", async () => {
    const player = await connected(ID.player);
    const gm = await connected(ID.gm);
    await join(player, ID.campaign);
    await join(gm, ID.campaign);
    const playerHeard = listen(player);
    const gmHeard = listen(gm);

    const promoted = await api.injectAs(GM, {
      method: "PATCH",
      url: `/api/v1/campaigns/${ID.campaign}/members/${playerMembershipId}`,
      payload: { role: "EDITOR", expectedVersion: 1 },
    });
    expect(promoted.statusCode).toBe(200);

    // The member is told to look at the campaign again; the game master gets the member list.
    await until(() => playerHeard.length > 0 && gmHeard.length > 0);
    expect(playerHeard).toEqual([{ resource: "campaign", campaignId: ID.campaign }]);
    expect(gmHeard).toEqual([
      { resource: "campaign-memberships", campaignId: ID.campaign, ids: [playerMembershipId] },
    ]);
    expect(await io.in(`campaign:${ID.campaign}:players`).fetchSockets()).toHaveLength(1);

    // Joining again gives the new role's rooms.
    expect(await join(player, ID.campaign)).toEqual({ ok: true });
    expect(await io.in(`campaign:${ID.campaign}:editors`).fetchSockets()).toHaveLength(2);
  });

  it("takes a removed member out of the campaign, also when they try to join again", async () => {
    const player = await connected(ID.player);
    await join(player, ID.campaign);
    const heard = listen(player);

    const removed = await api.injectAs(GM, {
      method: "DELETE",
      url: `/api/v1/campaigns/${ID.campaign}/members/${playerMembershipId}`,
    });
    expect(removed.statusCode).toBe(204);

    await until(() => heard.length > 0);
    expect(await io.in(`campaign:${ID.campaign}:players`).fetchSockets()).toHaveLength(0);
    expect(await join(player, ID.campaign)).toEqual({ ok: false, reason: "notFound" });
  });

  it("ends the connections of an account an administrator locks", async () => {
    const player = await connected(ID.player);
    const disconnected = waitFor<string>((resolve) => player.once("disconnect", resolve));

    broker.disconnectUser(ID.player);
    await broker.close();

    expect(await disconnected).toBe("io server disconnect");
  });

  it("keeps a connection whose token is refreshed in time and ends one whose token ran out", async () => {
    const soon = () => new Date(Date.now() + 300);
    const refreshed = await connected(ID.player, soon());
    const expiring = await connected(ID.gm, soon());
    const expired = waitFor<string>((resolve) => expiring.once("disconnect", resolve));

    const result = await waitFor<unknown>((resolve) =>
      refreshed.emit("auth:refresh", tokenOf(ID.player, new Date(Date.now() + 60_000)), resolve),
    );
    expect(result).toEqual({ ok: true, session: { expiresInSeconds: expect.any(Number) } });

    expect(await expired).toBe("io server disconnect");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(refreshed.connected).toBe(true);
  });

  it("ends the connection when a refresh brings another account's token", async () => {
    const player = await connected(ID.player);
    const disconnected = waitFor<string>((resolve) => player.once("disconnect", resolve));

    const result = await waitFor<unknown>((resolve) => player.emit("auth:refresh", tokenOf(ID.gm), resolve));

    expect(result).toEqual({ ok: false });
    expect(await disconnected).toBe("io server disconnect");
  });

  it("checks the rooms of a recovered connection again", async () => {
    const player = connectClient(url, {
      path: REALTIME_PATH,
      auth: { token: tokenOf(ID.player) },
      transports: ["websocket"],
      forceNew: true,
      reconnectionDelay: 50,
    }) as Client;
    clients.push(player);
    await waitFor<void>((resolve) => player.once("connect", () => resolve()));
    await join(player, ID.campaign);

    // Removed while the connection is interrupted: the adapter keeps the old rooms for recovery.
    player.io.engine.close();
    await db.update(campaignMemberships).set({ deletedAt: new Date() }).where(eq(campaignMemberships.id, playerMembershipId));

    await waitFor<void>((resolve) => player.once("connect", () => resolve()));
    expect(player.recovered).toBe(true);
    await until(async () => (await io.in(`campaign:${ID.campaign}:players`).fetchSockets()).length === 0);
  });
});
