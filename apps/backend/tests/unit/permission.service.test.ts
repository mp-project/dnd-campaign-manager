import { NotFoundError } from "#core/error/http/index";
import type {
  CampaignContext,
  SystemRole,
} from "#core/http/requestContext";
import {
  createPermissionService,
  type PermissionService,
} from "#core/permissions/service";

type AccessAction = "crud" | "share" | "own";

type MatrixCase = {
  label: string;
  systemRole: SystemRole;
  actorId: string | null;
  campaignMemberId: string | null;
  membershipActive: boolean;
  expected: Record<AccessAction, boolean>;
};

function createContext(params: {
  actorId: string | null;
  systemRole: SystemRole;
  campaignMemberId: string | null;
  campaignId?: string;
}): CampaignContext {
  return {
    actorId: params.actorId,
    systemRole: params.systemRole,
    campaignId: params.campaignId ?? "campaign-alpha",
    rulesetId: "ruleset-a",
    campaignMemberId: params.campaignMemberId,
    permissions: [],
  };
}

function hydratePermissions(
  service: PermissionService,
  context: CampaignContext,
): CampaignContext {
  return {
    ...context,
    permissions: service.listEffectivePermissions(context),
  };
}

describe("permission service", () => {
  const service = createPermissionService();

  service.registerSystemRolePermissions({
    USER: ["campaign.crud", "campaign.readShared", "character.updateOwn", "character.readOwn"],
  });

  const actionMap: Record<
    AccessAction,
    {
      key: string;
      createResource: (
        context: CampaignContext,
        membershipActive: boolean,
      ) => {
        campaignId: string;
        membershipActive: boolean;
        assetShared?: boolean;
        ownerActorId?: string | null;
        assignmentActive?: boolean;
        deletedAt?: Date | null;
      };
    }
  > = {
    crud: {
      key: "campaign.crud",
      createResource: (context, membershipActive) => ({
        campaignId: context.campaignId,
        membershipActive,
        deletedAt: null,
      }),
    },
    share: {
      key: "campaign.readShared",
      createResource: (context, membershipActive) => ({
        campaignId: context.campaignId,
        membershipActive,
        assetShared: true,
        deletedAt: null,
      }),
    },
    own: {
      key: "character.updateOwn",
      createResource: (context, membershipActive) => ({
        campaignId: context.campaignId,
        membershipActive,
        ownerActorId: context.actorId,
        assignmentActive: true,
        deletedAt: null,
      }),
    },
  };

  const matrix: MatrixCase[] = [
    {
      label: "ADMIN",
      systemRole: "ADMIN",
      actorId: "admin-1",
      campaignMemberId: null,
      membershipActive: false,
      expected: {
        crud: true,
        share: true,
        own: true,
      },
    },
    {
      label: "MEMBER",
      systemRole: "USER",
      actorId: "member-1",
      campaignMemberId: "member-row-1",
      membershipActive: true,
      expected: {
        crud: true,
        share: true,
        own: true,
      },
    },
    {
      label: "INACTIVE_MEMBERSHIP",
      systemRole: "USER",
      actorId: "member-2",
      campaignMemberId: "member-row-2",
      membershipActive: false,
      expected: {
        crud: false,
        share: false,
        own: false,
      },
    },
    {
      label: "NOT_MEMBER",
      systemRole: "USER",
      actorId: "user-no-member",
      campaignMemberId: null,
      membershipActive: false,
      expected: {
        crud: false,
        share: false,
        own: false,
      },
    },
  ];

  it.each(matrix)(
    "applies role and membership matrix for $label",
    ({ actorId, campaignMemberId, membershipActive, expected, systemRole }) => {
      const context = hydratePermissions(
        service,
        createContext({ actorId, systemRole, campaignMemberId }),
      );

      (Object.keys(actionMap) as AccessAction[]).forEach((action) => {
        const actionConfig = actionMap[action];
        const allowed = service.can(
          actionConfig.key,
          context,
          actionConfig.createResource(context, membershipActive),
        );

        expect(allowed).toBe(expected[action]);
      });
    },
  );

  it("ignores forged effective permissions from client context data", () => {
    const context = hydratePermissions(
      service,
      createContext({
        actorId: "user-no-member",
        systemRole: "USER",
        campaignMemberId: null,
      }),
    );

    const deniedCrud = service.can(
      "campaign.crud",
      {
        ...context,
        permissions: ["campaign.readShared", "campaign.crud"],
      },
      {
        campaignId: "campaign-alpha",
        membershipActive: false,
        deletedAt: null,
      },
    );

    expect(deniedCrud).toBe(false);
  });

  it("denies resources from foreign campaign", () => {
    const context = hydratePermissions(
      service,
      createContext({
        actorId: "member-1",
        systemRole: "USER",
        campaignMemberId: "member-row-1",
      }),
    );

    const allowed = service.can("campaign.crud", context, {
      campaignId: "campaign-beta",
      membershipActive: true,
      deletedAt: null,
    });

    expect(allowed).toBe(false);
  });

  it("denies revoked own-character assignment", () => {
    const context = hydratePermissions(
      service,
      createContext({
        actorId: "member-1",
        systemRole: "USER",
        campaignMemberId: "member-row-1",
      }),
    );

    const allowed = service.can("character.readOwn", context, {
      campaignId: "campaign-alpha",
      membershipActive: true,
      ownerActorId: "member-1",
      assignmentActive: false,
      deletedAt: null,
    });

    expect(allowed).toBe(false);
  });

  it("denies non-shared campaign resources and can hide as 404", () => {
    const context = hydratePermissions(
      service,
      createContext({
        actorId: "member-1",
        systemRole: "USER",
        campaignMemberId: "member-row-1",
      }),
    );

    const allowed = service.can("campaign.readShared", context, {
      campaignId: "campaign-alpha",
      membershipActive: true,
      assetShared: false,
      outlineShared: false,
      deletedAt: null,
    });

    expect(allowed).toBe(false);

    expect(() => {
      service.require(
        "campaign.readShared",
        context,
        {
          campaignId: "campaign-alpha",
          membershipActive: true,
          assetShared: false,
          outlineShared: false,
          deletedAt: null,
        },
        { hideAsNotFoundForPlayers: true },
      );
    }).toThrow(NotFoundError);
  });
});
