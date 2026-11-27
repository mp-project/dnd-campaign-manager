import type { SQL } from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import type { ActionMeta, ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  ArchiveContentUseCase,
  assetContentWriter,
  type AssetsService,
  type ContentAccess,
  ContentListing,
  type ContentWriter,
  CreateContentUseCase,
  readContent,
  RestoreContentUseCase,
  UpdateContentUseCase,
} from "#src/modules/assets/index";

type Sample = {
  path: { campaignId: string | null; sampleId: string };
  found: { asset: { id: string }; sampleId: string };
  record: { id: string; status: string };
  create: { name: string };
  update: { name: string };
};

const CONTEXT: RequestContext = { actorId: "actor-1", systemRole: "USER" };
const TX = { tx: true } as unknown as AppDatabase;
const SCOPE = { actionId: "action", tx: TX } as unknown as ActionScope;
const FOUND: Sample["found"] = { asset: { id: "asset-1" }, sampleId: "sample-1" };

function buildHistory() {
  const metas: ActionMeta<unknown>[] = [];
  const port = {
    runAction: async (meta: ActionMeta<unknown>, work: (scope: ActionScope) => Promise<unknown>) => {
      metas.push(meta);
      await meta.authorize(TX);

      return work(SCOPE);
    },
  } as unknown as HistoryPort;

  return { port, metas };
}

function buildWriter() {
  const calls: unknown[][] = [];
  const writer: ContentWriter<Sample> = {
    assertCanWrite: async (...args) => {
      calls.push(["assertCanWrite", ...args]);

      return "actor-1";
    },
    actorIdOf: (context) => context.actorId as string,
    requireForWrite: async (...args) => {
      calls.push(["requireForWrite", ...args]);

      return FOUND;
    },
    create: async (_scope, owner, command) => {
      calls.push(["create", owner, command]);

      return { id: "sample-1", status: "ACTIVE" };
    },
    update: async (_scope, change) => {
      calls.push(["update", change]);

      return { record: { id: "sample-1", status: "ACTIVE" }, merged: ["summary"] };
    },
    archive: async (_scope, change) => {
      calls.push(["archive", change]);

      return { id: "sample-1", status: "ARCHIVED" };
    },
    restore: async (_scope, change) => {
      calls.push(["restore", change]);

      return { id: "sample-1", status: "ACTIVE" };
    },
  };

  return { writer, calls };
}

const toResponse = (record: Sample["record"]) => ({ ...record, view: "FULL" as const });

class CreateSample extends CreateContentUseCase<Sample, ReturnType<typeof toResponse>> {
  protected readonly action = "sample.create";
  protected readonly toResponse = toResponse;
}

class UpdateSample extends UpdateContentUseCase<Sample, ReturnType<typeof toResponse>> {
  protected readonly action = "sample.update";
  protected readonly toResponse = toResponse;
}

class ArchiveSample extends ArchiveContentUseCase<Sample, ReturnType<typeof toResponse>> {
  protected readonly action = "sample.delete";
  protected readonly toResponse = toResponse;
}

class RestoreSample extends RestoreContentUseCase<Sample, ReturnType<typeof toResponse>> {
  protected readonly action = "sample.restore";
  protected readonly toResponse = toResponse;
}

describe("content kit use cases", () => {
  it("checks the write rule for the campaign of the input before writing", async () => {
    const { port, metas } = buildHistory();
    const { writer, calls } = buildWriter();

    await new ArchiveSample(port, writer).execute(CONTEXT, {
      campaignId: "campaign-1",
      sampleId: "sample-1",
      command: { expectedAssetVersion: 3 },
    });

    expect(metas[0]?.action).toBe("sample.delete");
    expect(calls[0]).toEqual(["assertCanWrite", CONTEXT, "campaign-1", TX]);
  });

  it("refuses before loading anything when the write rule throws", async () => {
    const { port } = buildHistory();
    const { writer, calls } = buildWriter();
    const denied = {
      ...writer,
      assertCanWrite: async () => {
        throw new Error("denied");
      },
    };

    await expect(
      new ArchiveSample(port, denied).execute(CONTEXT, {
        campaignId: null,
        sampleId: "sample-1",
        command: { expectedAssetVersion: 1 },
      }),
    ).rejects.toThrow("denied");
    expect(calls).toEqual([]);
  });

  it("creates for the acting user in the scope of the input", async () => {
    const { port } = buildHistory();
    const { writer, calls } = buildWriter();

    const response = await new CreateSample(port, writer).execute(CONTEXT, {
      campaignId: null,
      command: { name: "Alert" },
    });

    expect(calls[1]).toEqual(["create", { actorId: "actor-1", campaignId: null }, { name: "Alert" }]);
    expect(response).toEqual({ id: "sample-1", status: "ACTIVE", view: "FULL" });
  });

  it("loads in the transaction, updates and answers with the merged fields", async () => {
    const { port } = buildHistory();
    const { writer, calls } = buildWriter();
    const input = { campaignId: "campaign-1", sampleId: "sample-1", command: { name: "New" } };

    const response = await new UpdateSample(port, writer).execute(CONTEXT, input);

    expect(calls[1]).toEqual(["requireForWrite", TX, input]);
    expect(calls[2]).toEqual(["update", { found: FOUND, actorId: "actor-1", command: { name: "New" } }]);
    expect(response).toEqual({ id: "sample-1", status: "ACTIVE", view: "FULL", merged: ["summary"] });
  });

  it("archives and restores the loaded content with the expected asset version", async () => {
    const { port } = buildHistory();
    const { writer, calls } = buildWriter();
    const input = { campaignId: "campaign-1", sampleId: "sample-1", command: { expectedAssetVersion: 4 } };

    const archived = await new ArchiveSample(port, writer).execute(CONTEXT, input);
    const restored = await new RestoreSample(port, writer).execute(CONTEXT, input);

    expect(calls[2]).toEqual(["archive", { found: FOUND, expectedAssetVersion: 4 }]);
    expect(calls[5]).toEqual(["restore", { found: FOUND, expectedAssetVersion: 4 }]);
    expect(archived.status).toBe("ARCHIVED");
    expect(restored.status).toBe("ACTIVE");
  });
});

describe("assetContentWriter", () => {
  function buildAssets() {
    const calls: unknown[][] = [];
    const assets = {
      assertCanWrite: async (...args: unknown[]) => {
        calls.push(["assertCanWrite", ...args]);

        return "actor-1";
      },
      assertAuthenticated: (context: RequestContext) => context.actorId,
      archiveBase: async (...args: unknown[]) => {
        calls.push(["archiveBase", ...args]);
      },
      restoreBase: async (...args: unknown[]) => {
        calls.push(["restoreBase", ...args]);
      },
    } as unknown as AssetsService;

    return { assets, calls };
  }

  const parts = (calls: unknown[][]) => ({
    requireForWrite: async () => FOUND,
    create: async () => ({ id: "sample-1", status: "ACTIVE" }),
    update: async () => ({ record: { id: "sample-1", status: "ACTIVE" }, merged: [] }),
    reload: async (db: AppDatabase, found: Sample["found"]) => {
      calls.push(["reload", db, found]);

      return { id: found.sampleId, status: "RELOADED" };
    },
  });

  it("checks the content write rule for editing", async () => {
    const { assets, calls } = buildAssets();
    const writer = assetContentWriter<Sample>(assets, parts(calls));

    await writer.assertCanWrite(CONTEXT, "campaign-1", TX);

    expect(calls).toEqual([["assertCanWrite", CONTEXT, "EDIT", "campaign-1", TX]]);
  });

  it("archives and restores the asset, then reloads the record in the transaction", async () => {
    const { assets, calls } = buildAssets();
    const writer = assetContentWriter<Sample>(assets, parts(calls));

    const archived = await writer.archive(SCOPE, { found: FOUND, expectedAssetVersion: 2 });
    await writer.restore(SCOPE, { found: FOUND, expectedAssetVersion: 3 });

    expect(calls).toEqual([
      ["archiveBase", SCOPE, { assetId: "asset-1", expectedVersion: 2 }],
      ["reload", TX, FOUND],
      ["restoreBase", SCOPE, { assetId: "asset-1", expectedVersion: 3 }],
      ["reload", TX, FOUND],
    ]);
    expect(archived.status).toBe("RELOADED");
  });
});

describe("readContent", () => {
  const ADMIN: RequestContext = { actorId: "admin-1", systemRole: "ADMIN" };

  function buildAssets(isFullView: boolean) {
    const calls: unknown[][] = [];
    const access = { isFullView } as unknown as ContentAccess;
    const assets = {
      assertAuthenticated: (context: RequestContext) => {
        calls.push(["assertAuthenticated", context]);

        return context.actorId;
      },
      access: async (context: RequestContext, campaignId: string) => {
        calls.push(["access", context, campaignId]);

        return access;
      },
    } as unknown as AssetsService;

    return { assets, access, calls };
  }

  const lookups = (status: string, calls: unknown[][]) => ({
    global: async () => ({ asset: { status } }),
    readable: async (access: ContentAccess, purpose: string) => {
      calls.push(["readable", access, purpose]);

      return { asset: { status } };
    },
    notFound: "Sample not found",
  });

  it("gives administrators the full view of global content, also of drafts", async () => {
    const { assets } = buildAssets(false);

    const readable = await readContent(assets, ADMIN, "system", undefined, lookups("DRAFT", []));

    expect(readable).toEqual({ found: { asset: { status: "DRAFT" } }, view: "FULL", access: null });
  });

  it("gives everybody else the player view of active global content and 404 otherwise", async () => {
    const { assets } = buildAssets(false);

    await expect(readContent(assets, CONTEXT, "system", undefined, lookups("ACTIVE", []))).resolves.toEqual({
      found: { asset: { status: "ACTIVE" } },
      view: "PLAYER",
      access: null,
    });
    await expect(readContent(assets, CONTEXT, "system", undefined, lookups("DRAFT", []))).rejects.toThrow(
      "Sample not found",
    );
  });

  it("reads in a campaign through the access session, with the purpose of the mode", async () => {
    const { assets, access, calls } = buildAssets(true);

    const managed = await readContent(assets, CONTEXT, "campaign", "campaign-1", lookups("ARCHIVED", calls));
    await readContent(assets, CONTEXT, "catalog", "campaign-1", lookups("ACTIVE", calls));

    expect(calls).toEqual([
      ["access", CONTEXT, "campaign-1"],
      ["readable", access, "MANAGE"],
      ["access", CONTEXT, "campaign-1"],
      ["readable", access, "CATALOG"],
    ]);
    expect(managed.view).toBe("FULL");
    expect(managed.access).toBe(access);
  });

  it("gives players the player view in a campaign", async () => {
    const { assets } = buildAssets(false);

    const readable = await readContent(assets, CONTEXT, "catalog", "campaign-1", lookups("ACTIVE", []));

    expect(readable.view).toBe("PLAYER");
  });
});

describe("ContentListing", () => {
  type Query = { limit: number; status?: "ACTIVE" | undefined; scope?: "SYSTEM" | undefined; search?: string };
  type Types = {
    campaignQuery: Query;
    catalogQuery: Query;
    systemQuery: Query;
    filter: { limit: number; search: string | undefined };
    page: { items: string[] };
    response: { fullView: boolean; items: string[]; limit: number };
  };

  class SampleListing extends ContentListing<Types> {
    readonly pages: unknown[] = [];

    protected filterOf(query: Query) {
      return { limit: query.limit, search: query.search };
    }

    protected async listPage(filter: Types["filter"] & { where: SQL }) {
      this.pages.push(filter);

      return { items: ["a", "b"] };
    }

    protected async toResponse(page: Types["page"], fullView: boolean, limit: number) {
      return { fullView, items: page.items, limit };
    }
  }

  function buildAssets(isFullView: boolean) {
    const calls: unknown[][] = [];
    const assets = {
      assertAuthenticated: (context: RequestContext) => context.actorId,
      access: async () => ({
        isFullView,
        listWhere: (purpose: string, filter: unknown) => {
          calls.push(["listWhere", purpose, filter]);

          return `where:${purpose}`;
        },
      }),
      globalListWhere: (context: RequestContext, query: unknown) => {
        calls.push(["globalListWhere", context, query]);

        return "where:global";
      },
    } as unknown as AssetsService;

    return { assets, calls };
  }

  it("lists the campaign's own content and the catalog with the purpose, scope and status", async () => {
    const { assets, calls } = buildAssets(true);
    const listing = new SampleListing(assets);

    const own = await listing.listCampaign(CONTEXT, { campaignId: "c-1", query: { limit: 10, search: "x" } });
    await listing.listCatalog(CONTEXT, {
      campaignId: "c-1",
      query: { limit: 5, status: "ACTIVE", scope: "SYSTEM" },
    });

    expect(calls).toEqual([
      ["listWhere", "MANAGE", { scope: undefined, status: undefined }],
      ["listWhere", "CATALOG", { scope: "SYSTEM", status: "ACTIVE" }],
    ]);
    expect(listing.pages[0]).toEqual({ limit: 10, search: "x", where: "where:MANAGE" });
    expect(own).toEqual({ fullView: true, items: ["a", "b"], limit: 10 });
  });

  it("lists global content with the global rule; only administrators get the full view", async () => {
    const { assets, calls } = buildAssets(false);
    const listing = new SampleListing(assets);
    const query = { limit: 20 };

    const forUser = await listing.listSystem(CONTEXT, query);
    const forAdmin = await listing.listSystem({ actorId: "admin-1", systemRole: "ADMIN" }, query);

    expect(calls[0]).toEqual(["globalListWhere", CONTEXT, query]);
    expect(listing.pages[0]).toEqual({ limit: 20, search: undefined, where: "where:global" });
    expect(forUser.fullView).toBe(false);
    expect(forAdmin.fullView).toBe(true);
  });
});
