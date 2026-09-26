import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  VersionConflictError,
} from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { isElevatedSystemRole } from "#core/permissions/roles";
import type {
  CreateRulesetInput,
  RulesetAggregate,
  RulesetListFilter,
  RulesetLevelProgressionRow,
  RulesetSpellSlotProgressionRow,
  RulesetStatus,
  UpdateRulesetPatch,
} from "#src/modules/ruleset/domain/repository/RulesetRepository";
import { RulesetRepository } from "#src/modules/ruleset/domain/repository/RulesetRepository";
import type { UpdateRulesetDto } from "#src/modules/ruleset/domain/dto/UpdateRulesetDto";

export class RulesetService {
  constructor(
    private readonly db: AppDatabase,
    private readonly transactionManager: TransactionManager,
    private readonly repository: RulesetRepository,
  ) {}

  async listActive(
    context: RequestContext,
    filters: RulesetListFilter,
  ): Promise<{ items: RulesetAggregate[]; total: number }> {
    this.assertAuthenticated(context);

    const [items, total] = await Promise.all([
      this.repository.listAggregates(this.db, filters),
      this.repository.countAggregates(this.db, filters),
    ]);

    return { items, total };
  }

  async getById(context: RequestContext, rulesetId: string): Promise<RulesetAggregate> {
    this.assertAuthenticated(context);

    const ruleset = await this.repository.findAggregateById(this.db, rulesetId);

    if (!ruleset) {
      throw new NotFoundError("Ruleset not found");
    }

    return ruleset;
  }

  async getByCode(context: RequestContext, code: string): Promise<RulesetAggregate> {
    this.assertAuthenticated(context);

    const ruleset = await this.repository.findActiveAggregateByCode(this.db, code);

    if (!ruleset) {
      throw new NotFoundError("Ruleset not found");
    }

    return ruleset;
  }

  async create(
    context: RequestContext,
    input: CreateRulesetInput,
  ): Promise<RulesetAggregate> {
    const actorId = this.assertAdmin(context);

    return this.transactionManager.inTransaction(async (tx) => {
      const codeTaken = await this.repository.isActiveCodeTaken(tx, input.code);

      if (codeTaken) {
        throw new ConflictError(`Ruleset code '${input.code}' is already in use`);
      }

      return this.repository.insertAggregate(tx, {
        ...input,
        actorId,
      });
    });
  }

  async update(
    context: RequestContext,
    rulesetId: string,
    input: UpdateRulesetDto,
  ): Promise<RulesetAggregate> {
    const actorId = this.assertAdmin(context);

    const current = await this.repository.findById(this.db, rulesetId);

    if (!current) {
      throw new NotFoundError("Ruleset not found");
    }

    if (await this.willCollideWithActiveCode(current.code, current.status, input.status, rulesetId)) {
      throw new ConflictError(`Ruleset code '${current.code}' is already in use`);
    }

    const patch: UpdateRulesetPatch = {};

    if (input.name !== undefined) {
      patch.name = input.name;
    }

    if (input.description !== undefined) {
      patch.description = input.description;
    }

    if (input.status !== undefined) {
      patch.status = input.status;
    }

    if (input.sourceReference !== undefined) {
      patch.sourceReference = input.sourceReference;
    }

    if (input.attribution !== undefined) {
      patch.attribution = input.attribution;
    }

    const updated = await this.repository.updateMetadataWithVersion(this.db, {
      rulesetId,
      actorId,
      expectedVersion: input.expectedVersion,
      patch,
    });

    if (!updated) {
      throw new VersionConflictError("Ruleset update version mismatch");
    }

    return updated;
  }

  async softDelete(context: RequestContext, rulesetId: string): Promise<void> {
    const actorId = this.assertAdmin(context);

    const current = await this.repository.findById(this.db, rulesetId);

    if (!current) {
      throw new NotFoundError("Ruleset not found");
    }

    const deleted = await this.repository.softDeleteWithVersion(this.db, {
      rulesetId,
      actorId,
      expectedVersion: current.version,
    });

    if (!deleted) {
      throw new VersionConflictError("Ruleset delete version mismatch");
    }
  }

  async validate(context: RequestContext, rulesetId: string): Promise<boolean> {
    this.assertAdmin(context);

    const ruleset = await this.repository.findById(this.db, rulesetId);

    if (!ruleset) {
      throw new NotFoundError("Ruleset not found");
    }

    return ruleset.status === "ACTIVE";
  }

  async getLevelProgression(
    context: RequestContext,
    rulesetId: string,
  ): Promise<RulesetLevelProgressionRow[]> {
    this.assertAuthenticated(context);

    const ruleset = await this.repository.findById(this.db, rulesetId);

    if (!ruleset) {
      throw new NotFoundError("Ruleset not found");
    }

    return this.repository.listLevelProgressions(this.db, rulesetId);
  }

  async getSpellSlotTable(
    context: RequestContext,
    rulesetId: string,
  ): Promise<RulesetSpellSlotProgressionRow[]> {
    this.assertAuthenticated(context);

    const ruleset = await this.repository.findById(this.db, rulesetId);

    if (!ruleset) {
      throw new NotFoundError("Ruleset not found");
    }

    return this.repository.listSpellSlotProgressions(this.db, rulesetId);
  }

  async assertCompatible(
    context: RequestContext,
    assetId: string,
    rulesetId: string,
  ): Promise<void> {
    this.assertAuthenticated(context);
    await this.assertCompatibleInternal(assetId, rulesetId);
  }

  async assertCompatibleInternal(assetId: string, rulesetId: string): Promise<void> {
    const ruleset = await this.repository.findById(this.db, rulesetId);

    if (!ruleset) {
      throw new NotFoundError("Ruleset not found");
    }

    const mappings = await this.repository.listAssetRulesets(this.db, assetId);

    if (mappings.length === 0) {
      return;
    }

    const match = mappings.find((item) => item.rulesetId === rulesetId);

    if (match && (match.compatibility === "SUPPORTED" || match.compatibility === "NEUTRAL")) {
      return;
    }

    throw new ConflictError("RULESET_CHANGE_REQUIRES_MIGRATION", {
      assetId,
      rulesetId,
      supportedRulesetIds: mappings
        .filter((item) => item.compatibility === "SUPPORTED")
        .map((item) => item.rulesetId),
    });
  }

  async assertRulesetChangeRequiresMigration(input: {
    currentRulesetId: string;
    nextRulesetId: string;
  }): Promise<void> {
    if (input.currentRulesetId === input.nextRulesetId) {
      return;
    }

    throw new ConflictError("RULESET_CHANGE_REQUIRES_MIGRATION", {
      currentRulesetId: input.currentRulesetId,
      nextRulesetId: input.nextRulesetId,
    });
  }

  private assertAuthenticated(context: RequestContext): string {
    if (!context.actorId) {
      throw new UnauthenticatedError("Authentication required");
    }

    return context.actorId;
  }

  private assertAdmin(context: RequestContext): string {
    const actorId = this.assertAuthenticated(context);

    if (!isElevatedSystemRole(context.systemRole)) {
      throw new ForbiddenError("Admin permissions required");
    }

    return actorId;
  }

  private async willCollideWithActiveCode(
    code: string,
    currentStatus: RulesetStatus,
    nextStatus: RulesetStatus | undefined,
    rulesetId: string,
  ): Promise<boolean> {
    const targetStatus = nextStatus ?? currentStatus;

    if (targetStatus !== "ACTIVE") {
      return false;
    }

    return this.repository.isActiveCodeTaken(this.db, code, rulesetId);
  }
}
