import { z } from "zod";

import { ValidationError } from "#core/error/http/index";
import {
  AssetRelationRegistry,
  RELATED_TO_RELATION,
} from "#src/modules/asset-links/service/AssetRelationRegistry";

const note = { id: "a", assetType: "NOTE" as const };
const otherNote = { id: "b", assetType: "NOTE" as const };
const item = { id: "c", assetType: "ITEM" as const };

function createRegistry() {
  const registry = new AssetRelationRegistry();

  registry.register(RELATED_TO_RELATION);
  registry.register({
    type: "CONTAINS",
    sourceTypes: ["NOTE"],
    targetTypes: ["ITEM"],
    metadataSchema: z.strictObject({ quantity: z.number().int().positive() }),
    playerVisible: false,
    blocksTargetArchive: true,
  });
  registry.register({
    type: "SELF",
    sourceTypes: "ANY",
    targetTypes: "ANY",
    metadataSchema: z.strictObject({}),
    allowSelfLink: true,
    playerVisible: true,
  });

  return registry;
}

describe("asset relation registry", () => {
  it("refuses a relation that is registered twice", () => {
    expect(() => createRegistry().register(RELATED_TO_RELATION)).toThrow("already registered");
  });

  it("reports unknown relations as validation errors", () => {
    expect(() => createRegistry().require("NOPE")).toThrow(ValidationError);
  });

  it("checks metadata strictly against the relation", () => {
    const registry = createRegistry();

    expect(registry.parseMetadata("CONTAINS", { quantity: 2 })).toEqual({ quantity: 2 });
    expect(() => registry.parseMetadata("CONTAINS", { quantity: 0 })).toThrow(ValidationError);
    expect(() => registry.parseMetadata("CONTAINS", { quantity: 1, extra: 1 })).toThrow(
      ValidationError,
    );
    expect(() => registry.parseMetadata("RELATED_TO", { extra: 1 })).toThrow(ValidationError);
  });

  it("checks both ends and self links", () => {
    const registry = createRegistry();

    expect(() => registry.assertEndpoints("CONTAINS", note, item)).not.toThrow();
    expect(() => registry.assertEndpoints("CONTAINS", item, item)).toThrow(ValidationError);
    expect(() => registry.assertEndpoints("CONTAINS", note, otherNote)).toThrow(ValidationError);
    expect(() => registry.assertEndpoints("RELATED_TO", note, note)).toThrow(ValidationError);
    expect(() => registry.assertEndpoints("SELF", note, note)).not.toThrow();
  });

  it("lists the relations that block archiving", () => {
    expect(createRegistry().listBlockingTypes()).toEqual(["CONTAINS"]);
  });
});
