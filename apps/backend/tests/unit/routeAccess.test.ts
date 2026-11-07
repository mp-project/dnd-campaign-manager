import type { RouteOptions } from "fastify";

import { assertRouteDeclaresAccess } from "#core/http/authorization";
import type { CampaignContext, CampaignRole } from "#core/http/requestContext";
import {
  CAMPAIGN_EDITOR_ROLES,
  PermissionService,
} from "#core/permissions/service";
import { buildTestApp } from "#test/helpers/buildTestApp";

/**
 * Every API route that anybody may call without a permission. A new entry needs a reason in its
 * route config (`config.public`) and a deliberate change here.
 */
const PUBLIC_API_ROUTES = [
  "GET /api/v1",
  "GET /api/v1/auth/email-change/confirm-link",
  "GET /api/v1/auth/oauth/:provider/callback",
  "GET /api/v1/auth/oauth/:provider/start",
  "GET /api/v1/auth/register/verify-email-link",
  "GET /api/v1/ping",
  "POST /api/v1/auth/forgot-password",
  "POST /api/v1/auth/login",
  "POST /api/v1/auth/oauth/complete-registration",
  "POST /api/v1/auth/refresh",
  "POST /api/v1/auth/register",
  "POST /api/v1/auth/register/request-verification",
  "POST /api/v1/auth/register/verify-email",
  "POST /api/v1/auth/reset-password",
];

function route(config: Record<string, unknown>): RouteOptions {
  return {
    method: "GET",
    url: "/api/v1/example",
    handler: async () => null,
    config,
  } as RouteOptions;
}

describe("route access declarations", () => {
  it("refuses API routes without permission or public reason, and with both", () => {
    expect(() => assertRouteDeclaresAccess(route({}), "/api/v1")).toThrow("must set exactly one");
    expect(() => assertRouteDeclaresAccess(route({ public: " " }), "/api/v1")).toThrow();
    expect(() =>
      assertRouteDeclaresAccess(
        route({ public: "sign-in", permission: { key: "notes.read" } }),
        "/api/v1",
      ),
    ).toThrow();
    expect(() =>
      assertRouteDeclaresAccess(route({ permission: { key: "notes.read" } }), "/api/v1"),
    ).not.toThrow();
    expect(() =>
      assertRouteDeclaresAccess({ ...route({}), url: "/health" }, "/api/v1"),
    ).not.toThrow();
  });

  it("opens only the listed API routes to everybody", async () => {
    const { app } = buildTestApp();
    const publicRoutes = new Set<string>();

    app.addHook("onRoute", (options) => {
      const methods = Array.isArray(options.method) ? options.method : [options.method];
      const config = options.config as { public?: string } | undefined;

      if (options.url.startsWith("/api/v1") && config?.public) {
        for (const method of methods.filter((value) => value !== "HEAD")) {
          publicRoutes.add(`${method} ${options.url}`);
        }
      }
    });

    await app.ready();
    await app.close();

    expect(Array.from(publicRoutes).sort()).toEqual([...PUBLIC_API_ROUTES].sort());
  });
});

describe("campaign roles of permission keys", () => {
  const service = new PermissionService();

  service.registerDefinitions("test", [
    { key: "notes.create", description: "", campaignRoles: CAMPAIGN_EDITOR_ROLES },
    {
      key: "campaigns.update",
      description: "",
      campaignRoles: ["OWNER"],
      campaignRoleDenial: "notFound",
    },
    { key: "users.read", description: "" },
  ]);
  service.registerSystemRolePermissions({
    USER: ["notes.create", "campaigns.update", "users.read"],
  });

  function context(campaignRole: CampaignRole | null, systemRole: "USER" | "ADMIN" = "USER") {
    return {
      actorId: "actor",
      systemRole,
      campaignId: "c1",
      rulesetId: "r1",
      campaignMemberId: campaignRole ? "m1" : null,
      campaignRole,
      permissions: [],
    } satisfies CampaignContext;
  }

  it("hides the campaign from non-members", () => {
    expect(() => service.requireCampaignRole("notes.create", context(null))).toThrow(
      "Campaign not found",
    );
  });

  it("refuses a member whose role is not listed, with the key's denial", () => {
    expect(() => service.requireCampaignRole("notes.create", context("PLAYER"))).toThrow(
      "Insufficient permissions",
    );
    expect(() => service.requireCampaignRole("campaigns.update", context("EDITOR"))).toThrow(
      "Resource not found",
    );
  });

  it("lets listed roles, system admins and keys without campaign roles through", () => {
    expect(() => service.requireCampaignRole("notes.create", context("EDITOR"))).not.toThrow();
    expect(() => service.requireCampaignRole("campaigns.update", context(null, "ADMIN"))).not.toThrow();
    expect(() => service.requireCampaignRole("users.read", context(null))).not.toThrow();
  });

  it("lists only the keys the campaign role may use", () => {
    expect(service.listEffectivePermissions(context("PLAYER"))).toEqual(["users.read"]);
    expect(service.listEffectivePermissions(context("OWNER"))).toEqual([
      "campaigns.update",
      "notes.create",
      "users.read",
    ]);
  });
});
