import type { AppDatabase } from "#core/db/pool";
import type { ActionMeta, ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  ArchiveContentUseCase,
  assetContentWriter,
  type AssetsService,
  type ContentWriter,
  CreateContentUseCase,
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
