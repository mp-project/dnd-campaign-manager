import { ConflictError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { ResolveSpellDto } from "#src/modules/spells/domain/dto/RequestSpellDto";
import {
  type ResponseSpellResolutionDto,
  toSpellResolutionResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import { resolveSpellCast, SpellCastError } from "#src/modules/spells/domain/SpellCasting";
import {
  readableSpellHeader,
  type SpellCatalogInput,
  type SpellReader,
} from "#src/modules/spells/useCase/SpellReader";

/**
 * Resolves one cast for a caster described in the body: slot, scaling and every effect. Nothing
 * is spent or stored; the actor modules keep slots, materials and concentration.
 */
export class ResolveSpellUseCase {
  constructor(private readonly reader: SpellReader) {}

  async execute(
    context: RequestContext,
    input: SpellCatalogInput & { command: ResolveSpellDto },
  ): Promise<ResponseSpellResolutionDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const { definition, isVisible } = await this.reader.definition(readable);

    try {
      return toSpellResolutionResponse(
        readableSpellHeader(readable),
        resolveSpellCast(readable.found.spell, definition, input.command, isVisible),
      );
    } catch (error) {
      if (error instanceof SpellCastError) {
        throw new ConflictError(error.message, { path: error.path });
      }

      throw error;
    }
  }
}
