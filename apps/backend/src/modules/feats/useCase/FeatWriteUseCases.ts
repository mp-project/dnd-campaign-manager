import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { CreateFeatDto } from "#src/modules/feats/domain/dto/CreateFeatDto";
import {
  type ResponseFeatFullDto,
  type ResponseFeatValidationDto,
  type ResponseUpdateFeatDto,
  toFeatFullResponse,
} from "#src/modules/feats/domain/dto/ResponseFeatDto";
import type {
  FeatLifecycleCommandDto,
  UpdateFeatDto,
} from "#src/modules/feats/domain/dto/UpdateFeatDto";
import { FEAT_ACTIONS } from "#src/modules/feats/history/TrackedFeat";
import type { FeatsService } from "#src/modules/feats/service/FeatsService";

/** `campaignId` null creates a global feat, which only administrators may do. */
export type CreateFeatInput = { campaignId: string | null; command: CreateFeatDto };

export type UpdateFeatInput = { campaignId: string | null; featId: string; command: UpdateFeatDto };

export type FeatLifecycleInput = {
  campaignId: string | null;
  featId: string;
  command: FeatLifecycleCommandDto;
};

export class CreateFeatUseCase extends MutationUseCase<CreateFeatInput, ResponseFeatFullDto> {
  protected readonly action = FEAT_ACTIONS.create;

  constructor(
    history: HistoryPort,
    private readonly featsService: FeatsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: CreateFeatInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.featsService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: CreateFeatInput,
  ): Promise<ResponseFeatFullDto> {
    const actorId = this.featsService.actorIdOf(context);

    return toFeatFullResponse(
      await this.featsService.createFeat(scope, { actorId, campaignId: input.campaignId }, input.command),
    );
  }
}

export class UpdateFeatUseCase extends MutationUseCase<UpdateFeatInput, ResponseUpdateFeatDto> {
  protected readonly action = FEAT_ACTIONS.update;

  constructor(
    history: HistoryPort,
    private readonly featsService: FeatsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: UpdateFeatInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.featsService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: UpdateFeatInput,
  ): Promise<ResponseUpdateFeatDto> {
    const actorId = this.featsService.actorIdOf(context);
    const found = await this.featsService.requireForWrite(scope.tx, input);
    const { record, merged } = await this.featsService.updateFeat(scope, {
      found,
      actorId,
      command: input.command,
    });

    return { ...toFeatFullResponse(record), merged };
  }
}

/** Archives the feat; it can be restored. Fails while other content refers to it. */
export class DeleteFeatUseCase extends MutationUseCase<FeatLifecycleInput, ResponseFeatFullDto> {
  protected readonly action = FEAT_ACTIONS.delete;

  constructor(
    history: HistoryPort,
    private readonly featsService: FeatsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: FeatLifecycleInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.featsService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: FeatLifecycleInput,
  ): Promise<ResponseFeatFullDto> {
    const found = await this.featsService.requireForWrite(scope.tx, input);

    return toFeatFullResponse(
      await this.featsService.archiveFeat(scope, {
        found,
        expectedAssetVersion: input.command.expectedAssetVersion,
      }),
    );
  }
}

/** Restores an archived feat, including a release it had; checked again at the end. */
export class RestoreFeatUseCase extends MutationUseCase<FeatLifecycleInput, ResponseFeatFullDto> {
  protected readonly action = FEAT_ACTIONS.restore;

  constructor(
    history: HistoryPort,
    private readonly featsService: FeatsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: FeatLifecycleInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.featsService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: FeatLifecycleInput,
  ): Promise<ResponseFeatFullDto> {
    const found = await this.featsService.requireForWrite(scope.tx, input);

    return toFeatFullResponse(
      await this.featsService.restoreFeat(scope, {
        found,
        expectedAssetVersion: input.command.expectedAssetVersion,
      }),
    );
  }
}

/**
 * Checks a stored definition against the current state: schemas, rules across parts, the code per
 * ruleset, the category, referenced assets, feature bindings and prerequisite cycles. Changes
 * nothing, so a definition that became invalid through changes elsewhere can be found first.
 */
export class ValidateFeatUseCase {
  constructor(private readonly featsService: FeatsService) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string | null; featId: string },
  ): Promise<ResponseFeatValidationDto> {
    const { db } = this.featsService;

    await this.featsService.assertCanWrite(context, input.campaignId, db);

    const found = await this.featsService.requireForWrite(db, input);
    const issues = await this.featsService.validateStored(db, found);

    return { featId: found.feat.id, valid: issues.length === 0, issues };
  }
}
