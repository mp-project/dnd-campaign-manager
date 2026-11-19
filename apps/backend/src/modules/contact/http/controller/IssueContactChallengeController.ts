import { AbstractController } from "#core/http/controller/AbstractController";
import type { IssueContactChallengeUseCase } from "#src/modules/contact/useCase/IssueContactChallengeUseCase";

export class IssueContactChallengeController extends AbstractController {
  constructor(private readonly issueContactChallengeUseCase: IssueContactChallengeUseCase) {
    super();
  }

  handle = async () => this.execute(async () => this.issueContactChallengeUseCase.execute());
}
