import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { rulesets, users } from "#core/db/schema";
import { buildTestApp } from "#test/helpers/buildTestApp";
import { captureLogs } from "#test/helpers/logCapture";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

const OWNER = { actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", systemRole: "USER" as const };
const RULESET_ID = "11111111-1111-4111-8111-111111111111";

describe("audit log of committed changes", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  let logs: ReturnType<typeof captureLogs>;
  let session: ReturnType<typeof buildTestApp>;

  /** Rebuilds the app with another setting; the database rows of `beforeEach` stay. */
  async function useApp(changeValues: boolean) {
    await session.app.close();
    logs = captureLogs();
    session = buildTestApp({ logger: logs.logger, env: { LOG_CHANGE_VALUES: changeValues } });
  }

  beforeEach(async () => {
    logs = captureLogs();
    session = buildTestApp({ logger: logs.logger });

    await db.insert(rulesets).values({
      id: RULESET_ID,
      code: "DND_5E_IT_AUDIT",
      name: "D&D 5E IT",
      description: null,
      status: "ACTIVE",
      editionYear: 2024,
      sourceReference: {},
      licenseCode: "TEST",
      attribution: null,
    });
    await db.insert(users).values({
      id: OWNER.actorId,
      email: "owner@example.test",
      displayName: "Owner",
      systemRole: "USER",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    });
  });

  afterEach(async () => {
    await session.app.close();
  });

  afterAll(async () => {
    await pool.end();
  });

  const createCampaign = (slug: string) =>
    session.injectAs(OWNER, {
      method: "POST",
      url: "/api/v1/campaigns",
      payload: {
        name: "Die Schatten von Elaria",
        slug,
        description: "Geheime Notiz",
        rulesetId: RULESET_ID,
        settings: { visibility: "private" },
      },
    });

  it("writes one change line with ids, field names and the new values in the request", async () => {
    const response = await createCampaign("schatten-von-elaria");

    expect(response.statusCode).toBe(201);

    const [request] = logs.find("request");
    const changes = logs.find("change");

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind: "change",
      actorId: OWNER.actorId,
      requestId: request?.requestId,
      userId: OWNER.actorId,
    });

    const entities = changes[0]?.entities as {
      entityType: string;
      fields: string[];
      values?: Record<string, unknown>;
    }[];
    const campaign = entities.find((entity) => entity.entityType === "campaign");

    expect(campaign?.fields).toContain("name");
    expect(campaign?.values).toMatchObject({
      name: "Die Schatten von Elaria",
      description: "Geheime Notiz",
    });
  });

  it("leaves the values out when LOG_CHANGE_VALUES is off", async () => {
    await useApp(false);

    expect((await createCampaign("ohne-werte")).statusCode).toBe(201);

    const [change] = logs.find("change");

    expect(change?.entities).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityType: "campaign" })]),
    );
    expect(JSON.stringify(change)).not.toContain("Die Schatten von Elaria");
    expect(JSON.stringify(change)).not.toContain('"values"');
  });

  it("never logs the values of account and secret fields", async () => {
    const admin = { actorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", systemRole: "ADMIN" as const };

    await db.insert(users).values({
      id: admin.actorId,
      email: "admin@example.test",
      displayName: "Admin",
      systemRole: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    });

    const response = await session.injectAs(admin, {
      method: "PATCH",
      url: `/api/v1/users/${OWNER.actorId}`,
      payload: { expectedVersion: 1, displayName: "Geheimer Name", status: "DISABLED" },
    });

    expect(response.statusCode).toBe(200);

    const [change] = logs.find("change");
    const [user] = change?.entities as { fields: string[]; values: Record<string, unknown> }[];

    expect(change).toMatchObject({ security: true });
    expect(user?.fields).toEqual(expect.arrayContaining(["displayName", "status"]));
    expect(user?.values).toEqual({ status: "DISABLED" });
    expect(JSON.stringify(change)).not.toContain("Geheimer Name");
  });

  it("writes no change line for a rejected request", async () => {
    expect((await createCampaign("doppelt")).statusCode).toBe(201);
    const before = logs.find("change").length;

    const response = await createCampaign("doppelt");

    expect(response.statusCode).toBe(409);
    expect(logs.find("change")).toHaveLength(before);
    expect(logs.find("request").at(-1)).toMatchObject({ statusCode: 409, errorCode: "CONFLICT" });
  });
});
