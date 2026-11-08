import { and, asc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import {
  rulesetLevelProgressions,
  rulesets,
  rulesetSpellSlotProgressions,
} from "#src/modules/ruleset/domain/entities/RulesetTable";
import type { CreateRulesetDto } from "#src/modules/ruleset/domain/dto/CreateRulesetDto";
import type { RequestRulesetDto } from "#src/modules/ruleset/domain/dto/RequestRulesetDto";
import { toAuditActorId } from "#core/db/auditActor";

export type RulesetRow = typeof rulesets.$inferSelect;
export type RulesetLevelProgressionRow = typeof rulesetLevelProgressions.$inferSelect;
export type RulesetSpellSlotProgressionRow =
  typeof rulesetSpellSlotProgressions.$inferSelect;

export type RulesetStatus = RulesetRow["status"];

export type RulesetAggregate = {
  ruleset: RulesetRow;
  levelProgressions: RulesetLevelProgressionRow[];
  spellSlotProgressions: RulesetSpellSlotProgressionRow[];
};

export type RulesetListFilter = RequestRulesetDto["query"];
type RulesetWhereClause = NonNullable<Parameters<typeof and>[number]>;

export class RulesetRepository {
  async listAggregates(
    db: AppDatabase,
    filters: RulesetListFilter,
  ): Promise<RulesetAggregate[]> {
    const where = this.buildListWhere(filters);

    const rows = await db
      .select({ id: rulesets.id })
      .from(rulesets)
      .where(and(...where))
      .orderBy(asc(rulesets.code))
      .limit(filters.limit);

    return Promise.all(rows.map((row) => this.loadAggregate(db, row.id)));
  }

  async countAggregates(db: AppDatabase, filters: RulesetListFilter): Promise<number> {
    const where = this.buildListWhere(filters);
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(rulesets)
      .where(and(...where));

    return row?.total ?? 0;
  }

  async findById(db: AppDatabase, rulesetId: string): Promise<RulesetRow | null> {
    const rows = await db
      .select()
      .from(rulesets)
      .where(and(eq(rulesets.id, rulesetId), isNull(rulesets.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  /** Edition years of the rulesets in one query; unknown and deleted ids are missing. */
  async listEditionYears(db: AppDatabase, rulesetIds: readonly string[]): Promise<Map<string, number>> {
    if (rulesetIds.length === 0) {
      return new Map();
    }

    const rows = await db
      .select({ id: rulesets.id, editionYear: rulesets.editionYear })
      .from(rulesets)
      .where(and(inArray(rulesets.id, [...new Set(rulesetIds)]), isNull(rulesets.deletedAt)));

    return new Map(rows.map((row) => [row.id, row.editionYear]));
  }

  async findAggregateById(
    db: AppDatabase,
    rulesetId: string,
  ): Promise<RulesetAggregate | null> {
    const row = await this.findById(db, rulesetId);

    if (!row) {
      return null;
    }

    return this.loadAggregate(db, row.id);
  }

  async isActiveCodeTaken(
    db: AppDatabase,
    code: string,
    excludedRulesetId?: string,
  ): Promise<boolean> {
    const rows = await db
      .select({ id: rulesets.id })
      .from(rulesets)
      .where(
        and(
          eq(rulesets.code, code),
          eq(rulesets.status, "ACTIVE"),
          isNull(rulesets.deletedAt),
          excludedRulesetId
            ? sql`${rulesets.id} <> ${excludedRulesetId}`
            : sql`true`,
        ),
      )
      .limit(1);

    return rows.length > 0;
  }

  /**
   * Writes the progression tables of a new ruleset. They never change afterwards, so they have no
   * history of their own.
   */
  async createProgressions(
    db: AppDatabase,
    input: Pick<CreateRulesetDto, "levelProgressions" | "spellSlotProgressions"> & {
      rulesetId: string;
      actorId: string;
    },
  ): Promise<void> {
    const auditActorId = toAuditActorId(input.actorId);

    await db.insert(rulesetLevelProgressions).values(
      input.levelProgressions.map((item) => ({
        rulesetId: input.rulesetId,
        characterLevel: item.characterLevel,
        proficiencyBonus: item.proficiencyBonus,
        experienceThreshold: item.experienceThreshold,
        createdBy: auditActorId,
        updatedBy: auditActorId,
      })),
    );

    await db.insert(rulesetSpellSlotProgressions).values(
      input.spellSlotProgressions.map((item) => ({
        rulesetId: input.rulesetId,
        casterLevel: item.casterLevel,
        slotLevel: item.slotLevel,
        slotCount: item.slotCount,
        createdBy: auditActorId,
        updatedBy: auditActorId,
      })),
    );
  }

  async listLevelProgressions(
    db: AppDatabase,
    rulesetId: string,
  ): Promise<RulesetLevelProgressionRow[]> {
    return db
      .select()
      .from(rulesetLevelProgressions)
      .where(
        and(
          eq(rulesetLevelProgressions.rulesetId, rulesetId),
          isNull(rulesetLevelProgressions.deletedAt),
        ),
      )
      .orderBy(asc(rulesetLevelProgressions.characterLevel));
  }

  async listSpellSlotProgressions(
    db: AppDatabase,
    rulesetId: string,
  ): Promise<RulesetSpellSlotProgressionRow[]> {
    return db
      .select()
      .from(rulesetSpellSlotProgressions)
      .where(
        and(
          eq(rulesetSpellSlotProgressions.rulesetId, rulesetId),
          isNull(rulesetSpellSlotProgressions.deletedAt),
        ),
      )
      .orderBy(
        asc(rulesetSpellSlotProgressions.casterLevel),
        asc(rulesetSpellSlotProgressions.slotLevel),
      );
  }

  private async loadAggregate(
    db: AppDatabase,
    rulesetId: string,
  ): Promise<RulesetAggregate> {
    const [rulesetRow] = await db
      .select()
      .from(rulesets)
      .where(and(eq(rulesets.id, rulesetId), isNull(rulesets.deletedAt)))
      .limit(1);

    if (!rulesetRow) {
      throw new Error(`Ruleset ${rulesetId} not found`);
    }

    const [levelProgressions, spellSlotProgressions] = await Promise.all([
      this.listLevelProgressions(db, rulesetId),
      this.listSpellSlotProgressions(db, rulesetId),
    ]);

    return {
      ruleset: rulesetRow,
      levelProgressions,
      spellSlotProgressions,
    };
  }

  private buildListWhere(filters: RulesetListFilter): RulesetWhereClause[] {
    const where: RulesetWhereClause[] = [isNull(rulesets.deletedAt)];

    if (filters.code) {
      where.push(eq(rulesets.code, filters.code));
    }

    if (filters.status) {
      where.push(eq(rulesets.status, filters.status));
    } else if (!filters.includeArchived) {
      where.push(eq(rulesets.status, "ACTIVE"));
    }

    if (filters.editionYear !== undefined) {
      where.push(eq(rulesets.editionYear, filters.editionYear));
    }

    if (filters.search) {
      const searchCondition = or(
        ilike(rulesets.name, `%${filters.search}%`),
        ilike(rulesets.code, `%${filters.search}%`),
      );

      if (searchCondition) {
        where.push(searchCondition);
      }
    }

    if (filters.where?.code?.eq) {
      where.push(eq(rulesets.code, filters.where.code.eq));
    }

    if (filters.where?.code?.neq) {
      where.push(sql`${rulesets.code} <> ${filters.where.code.neq}`);
    }

    if (filters.where?.code?.like) {
      where.push(ilike(rulesets.code, `%${filters.where.code.like}%`));
    }

    if (filters.where?.name?.eq) {
      where.push(eq(rulesets.name, filters.where.name.eq));
    }

    if (filters.where?.name?.neq) {
      where.push(sql`${rulesets.name} <> ${filters.where.name.neq}`);
    }

    if (filters.where?.name?.like) {
      where.push(ilike(rulesets.name, `%${filters.where.name.like}%`));
    }

    if (filters.where?.status?.eq) {
      where.push(eq(rulesets.status, filters.where.status.eq));
    }

    if (filters.where?.status?.neq) {
      where.push(sql`${rulesets.status} <> ${filters.where.status.neq}`);
    }

    if (filters.where?.status?.in && filters.where.status.in.length > 0) {
      where.push(sql`${rulesets.status} = any(${filters.where.status.in})`);
    }

    if (filters.where?.editionYear?.eq !== undefined) {
      where.push(eq(rulesets.editionYear, filters.where.editionYear.eq));
    }

    if (filters.where?.editionYear?.neq !== undefined) {
      where.push(sql`${rulesets.editionYear} <> ${filters.where.editionYear.neq}`);
    }

    if (filters.where?.editionYear?.gt !== undefined) {
      where.push(sql`${rulesets.editionYear} > ${filters.where.editionYear.gt}`);
    }

    if (filters.where?.editionYear?.gte !== undefined) {
      where.push(sql`${rulesets.editionYear} >= ${filters.where.editionYear.gte}`);
    }

    if (filters.where?.editionYear?.lt !== undefined) {
      where.push(sql`${rulesets.editionYear} < ${filters.where.editionYear.lt}`);
    }

    if (filters.where?.editionYear?.lte !== undefined) {
      where.push(sql`${rulesets.editionYear} <= ${filters.where.editionYear.lte}`);
    }

    if (filters.where?.editionYear?.in && filters.where.editionYear.in.length > 0) {
      where.push(sql`${rulesets.editionYear} = any(${filters.where.editionYear.in})`);
    }

    return where;
  }
}
