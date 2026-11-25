import { AbstractEventHandler } from "#core/events/AbstractEventHandler";
import { EventHandler } from "#core/events/EventHandler";
import { historyChangedEventName, type HistoryChangedEvent } from "#core/history/events";
import { FEATURE_ENTITY_TYPE } from "#src/modules/features/history/TrackedFeature";
import type { FeatureResolutionCache } from "#src/modules/features/service/FeatureResolutionCache";

/** Drops cached resolutions after a change of a feature or its asset (cached by both ids). */
@EventHandler(historyChangedEventName(FEATURE_ENTITY_TYPE), historyChangedEventName("asset"))
export class InvalidateFeatureResolutionsHandler extends AbstractEventHandler<HistoryChangedEvent> {
  constructor(private readonly cache: FeatureResolutionCache) {
    super();
  }

  async handle(event: HistoryChangedEvent): Promise<void> {
    this.cache.invalidate(event.payload.entityId);
  }
}
