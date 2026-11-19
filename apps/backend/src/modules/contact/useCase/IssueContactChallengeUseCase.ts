import type { ContactChallengeDto } from "#src/modules/contact/domain/dto/ContactChallengeDto";
import type { ContactChallengeService } from "#src/modules/contact/service/ContactChallengeService";

/** A new task of the contact form's JS challenge; each message needs its own. */
export class IssueContactChallengeUseCase {
  constructor(private readonly challenges: ContactChallengeService) {}

  async execute(): Promise<ContactChallengeDto> {
    return this.challenges.issue();
  }
}
