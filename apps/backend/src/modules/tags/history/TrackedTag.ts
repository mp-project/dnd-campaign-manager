import type { AppDatabase } from "#core/db/pool";
import { ConflictError } from "#core/error/http/index";
import { campaignHistoryAccess } from "#core/history/campaignHistoryAccess";
import { defineTrackedEntity, field } from "#core/history/defineTrackedEntity";
import type { CampaignRole } from "#core/http/requestContext";
import { normalizeTagName, TagBaseSchema } from "#src/modules/tags/domain/dto/BaseTagDto";
import { tags } from "#src/modules/tags/domain/entities/TagsTable";
import type { TagRow } from "#src/modules/tags/domain/repository/TagsRepository";

export const TAG_ENTITY_TYPE = "tag";

export const TAG_ACTIONS = {
  create: "tag.create",
  update: "tag.update",
  delete: "tag.delete",
} as const;

/** Assignments are a list field of the asset, so they share its history and its rights. */
export const ASSET_TAGS_FIELD = "tagIds";
export const ASSET_TAGS_ACTION = "asset.updateTags";

type TrackedTagDeps = {
  resolveRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<CampaignRole | null>;
};

/** GMs and editors manage tags, so only they read the history. */
export function createTrackedTag(deps: TrackedTagDeps) {
  return defineTrackedEntity({
    type: TAG_ENTITY_TYPE,
    table: tags,
    baseSchema: TagBaseSchema,
    campaignId: (row) => row.campaignId,
    groups: [["name", "normalizedName"]],
    access: campaignHistoryAccess<TagRow>({
      campaignId: (row) => row.campaignId,
      resolveRole: deps.resolveRole,
    }),
    fields: {
      name: field.value(),
      normalizedName: field.value(),
      color: field.value(),
      description: field.value(),
      sortOrder: field.position(),
      // Set once when the tag is created.
      campaignId: field.ignore(),
    },
    validate: (next) => {
      // Undoing can be limited to single fields, which must not separate these two.
      if (normalizeTagName(next.name) !== next.normalizedName) {
        throw new ConflictError("Name and normalized name cannot be changed separately");
      }
    },
  });
}

export type TrackedTag = ReturnType<typeof createTrackedTag>;
