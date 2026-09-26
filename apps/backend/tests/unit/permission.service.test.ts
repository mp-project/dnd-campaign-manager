import { NotFoundError } from "#core/error/http/index";
import type {
  CampaignContext,
  CampaignRole,
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
  campaignRole: CampaignRole | null;
  actorId: string | null;
  campaignMemberId: string | null;
  expected: Record<AccessAction, boolean>;
};

function createContext(params: {
  actorId: string | null;
  systemRole: SystemRole;
  campaignRole: CampaignRole | null;
  campaignMemberId: string | null;
  campaignId?: string;
}): CampaignContext {
  return {
    actorId: params.actorId,
    systemRole: params.systemRole,
    campaignId: params.campaignId ?? "campaign-alpha",
    rulesetId: "ruleset-a",
    campaignMemberId: params.campaignMemberId,
    campaignRole: params.campaignRole,
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

  const actionMap: Record<
    AccessAction,
    {
      key: string;
      createResource: (context: CampaignContext) => {
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
      createResource: (context) => ({
        campaignId: context.campaignId,
        membershipActive: true,
        deletedAt: null,
      }),
    },
    share: {
      key: "campaign.readShared",
      createResource: (context) => ({
        campaignId: context.campaignId,
        membershipActive: true,
        assetShared: true,
        deletedAt: null,
      }),
    },
    own: {
      key: "character.updateOwn",
      createResource: (context) => ({
        campaignId: context.campaignId,
        membershipActive: true,
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
      campaignRole: null,
      actorId: "admin-1",
      campaignMemberId: null,
      expected: {
        crud: true,
        share: true,
        own: true,
      },
    },
    {
      label: "EDITOR",
      systemRole: "USER",
      campaignRole: "EDITOR",
      actorId: "editor-1",
      campaignMemberId: "member-editor-1",
      expected: {
        crud: true,
        share: true,
        own: true,
      },
    },
    {
      label: "PLAYER",
      systemRole: "USER",
      campaignRole: "PLAYER",
      actorId: "player-1",
      campaignMemberId: "member-player-1",
      expected: {
        crud: false,
        share: true,
        own: true,
      },
    },
    {
      label: "NOT_MEMBER",
      systemRole: "USER",
      campaignRole: null,
      actorId: "user-no-member",
      campaignMemberId: null,
      expected: {
        crud: false,
        share: false,
        own: false,
      },
    },
    {
      label: "INACTIVE_MEMBERSHIP",
      systemRole: "USER",
      campaignRole: null,
      actorId: "player-inactive",
      campaignMemberId: null,
      expected: {
        crud: false,
        share: false,
        own: false,
      },
    },
  ];

  it.each(matrix)(
    "applies role matrix for $label",
    ({ actorId, campaignMemberId, campaignRole, expected, systemRole }) => {
      const context = hydratePermissions(
        service,
        createContext({ actorId, systemRole, campaignRole, campaignMemberId }),
      );

      (Object.keys(actionMap) as AccessAction[]).forEach((action) => {
        const actionConfig = actionMap[action];
        const allowed = service.can(
          actionConfig.key,
          context,
          actionConfig.createResource(context),
        );

        expect(allowed).toBe(expected[action]);
      });
    },
  );

  it("ignores forged role and ruleset values from client context data", () => {
    const context = hydratePermissions(
      service,
      createContext({
        actorId: "player-1",
        systemRole: "USER",
        campaignRole: "PLAYER",
        campaignMemberId: "member-player-1",
      }),
    );

    const deniedCrud = service.can("campaign.crud", {
      ...context,
      permissions: ["campaign.readShared", "campaign.crud"],
      rulesetId: "forged-ruleset",
      campaignRole: "PLAYER",
    }, {
      campaignId: "campaign-alpha",
      membershipActive: true,
      deletedAt: null,
    });

    expect(deniedCrud).toBe(false);
  });

  it("denies resources from foreign campaign", () => {
    const context = hydratePermissions(
      service,
      createContext({
        actorId: "editor-1",
        systemRole: "USER",
        campaignRole: "EDITOR",
        campaignMemberId: "member-editor-1",
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
        actorId: "player-1",
        systemRole: "USER",
        campaignRole: "PLAYER",
        campaignMemberId: "member-player-1",
      }),
    );

    const allowed = service.can("character.readOwn", context, {
      campaignId: "campaign-alpha",
      membershipActive: true,
      ownerActorId: "player-1",
      assignmentActive: false,
      deletedAt: null,
    });

    expect(allowed).toBe(false);
  });

  it("denies non-shared campaign resources for players and can hide as 404", () => {
    const context = hydratePermissions(
      service,
      createContext({
        actorId: "player-1",
        systemRole: "USER",
        campaignRole: "PLAYER",
        campaignMemberId: "member-player-1",
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
