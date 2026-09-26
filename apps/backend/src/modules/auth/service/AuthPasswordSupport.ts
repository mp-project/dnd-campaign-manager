import argon2 from "argon2";

export class AuthPasswordSupport {
  private readonly dummyPasswordHashPromise: Promise<string>;

  constructor() {
    this.dummyPasswordHashPromise = argon2.hash("dummy-password", {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async verifyPassword(
    passwordHash: string | null,
    password: string,
  ): Promise<boolean> {
    if (!passwordHash) {
      await this.consumeComparableDelay(password);
      return false;
    }

    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      await this.consumeComparableDelay(password);
      return false;
    }
  }

  async consumeComparableDelay(secret: string): Promise<void> {
    try {
      const dummyHash = await this.dummyPasswordHashPromise;
      await argon2.verify(dummyHash, secret);
    } catch {
      // keep failure path behavior constant for enumeration resistance
    }
  }
}
