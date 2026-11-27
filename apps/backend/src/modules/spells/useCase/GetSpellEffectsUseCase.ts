import type { RequestContext } from "#core/http/requestContext";
import type { ResponseSpellEffectsDto } from "#src/modules/spells/domain/dto/ResponseSpellDto";
import {
  readableSpellHeader,
  type SpellCatalogInput,
  type SpellReader,
} from "#src/modules/spells/useCase/SpellReader";

/** Targets, scaling tracks and effects: what the spell does. */
export class GetSpellEffectsUseCase {
  constructor(private readonly reader: SpellReader) {}

  async execute(context: RequestContext, input: SpellCatalogInput): Promise<ResponseSpellEffectsDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const { definition } = await this.reader.definition(readable);

    return {
      ...readableSpellHeader(readable),
      level: readable.found.spell.level,
      targets: definition.targets,
      scalingTracks: definition.scalingTracks,
      effects: definition.effects,
    };
  }
}
