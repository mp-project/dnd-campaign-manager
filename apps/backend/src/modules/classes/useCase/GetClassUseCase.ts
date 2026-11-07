import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseClassDto,
  toClassGmResponse,
  toClassPlayerResponse,
} from "#src/modules/classes/domain/dto/ResponseClassDto";
import { ClassesService } from "#src/modules/classes/service/ClassesService";
import type { ClassReader, ClassReadMode } from "#src/modules/classes/useCase/ClassReader";

/** The whole class; the view depends on who reads it, see `ClassReader`. */
export class GetClassUseCase {
  constructor(
    private readonly classesService: ClassesService,
    private readonly reader: ClassReader,
    private readonly mode: ClassReadMode,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId?: string | undefined; classId: string },
  ): Promise<ResponseClassDto> {
    const { found, view, isVisible } = await this.reader.read(context, this.mode, input);

    if (view === "PLAYER") {
      return toClassPlayerResponse(found, isVisible);
    }

    return toClassGmResponse(await this.classesService.loadRecord(this.classesService.db, found));
  }
}
