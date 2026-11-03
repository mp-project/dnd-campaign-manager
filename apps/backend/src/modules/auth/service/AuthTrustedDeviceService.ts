import { randomBytes } from "node:crypto";

import type { AppDatabase } from "#core/db/pool";
import type {
  AuthRepository,
  TrustedDeviceRow,
} from "#src/modules/auth/domain/repository/AuthRepository";
import {
  type ClientMetadata,
  TRUSTED_DEVICE_TTL_MS,
} from "#src/modules/auth/service/AuthService.contracts";
import { sha256 } from "#src/modules/auth/utils/crypto";

export type TrustedDeviceToken = {
  token: string;
  expiresAt: Date;
};

/**
 * Devices the user linked to their account. A trusted device still needs the password, but keeps
 * its own login attempt limit, so attacks on the account cannot lock it out.
 */
export class AuthTrustedDeviceService {
  constructor(
    private readonly db: AppDatabase,
    private readonly repository: AuthRepository,
  ) {}

  /**
   * Returns the device only if the token is valid for this account.
   */
  async findForEmail(token: string | null, email: string): Promise<TrustedDeviceRow | null> {
    if (!token) {
      return null;
    }

    const device = await this.repository.findTrustedDeviceByHash(this.db, sha256(token), new Date());

    return device?.email === email ? device.device : null;
  }

  /**
   * Links the current browser to the account and replaces a token it already holds.
   */
  async trust(
    userId: string,
    metadata: ClientMetadata,
    currentToken: string | null = null,
  ): Promise<TrustedDeviceToken> {
    const now = new Date();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + TRUSTED_DEVICE_TTL_MS);

    await this.repository.deleteExpiredTrustedDevices(this.db, userId, now);

    if (currentToken) {
      await this.repository.deleteTrustedDevice(this.db, userId, sha256(currentToken));
    }

    await this.repository.createTrustedDevice(this.db, {
      userId,
      tokenHash: sha256(token),
      userAgent: metadata.userAgent?.slice(0, 500) ?? null,
      expiresAt,
    });

    return { token, expiresAt };
  }

  remove(userId: string, token: string): Promise<void> {
    return this.repository.deleteTrustedDevice(this.db, userId, sha256(token));
  }

  markUsed(deviceId: string): Promise<void> {
    return this.repository.updateTrustedDeviceLastUsed(this.db, deviceId, new Date());
  }
}
