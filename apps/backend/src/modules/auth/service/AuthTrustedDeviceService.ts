import { randomBytes } from "node:crypto";

import type { AppDatabase } from "#core/db/pool";
import type {
  AuthRepository,
  TrustedDeviceRow,
} from "#src/modules/auth/domain/repository/AuthRepository";
import {
  type ClientMetadata,
  TRUSTED_DEVICE_TTL_MS,
  type TrustedDeviceView,
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

  /** The user's trusted devices, this browser first, then the most recently used. */
  async list(userId: string, currentToken: string | null): Promise<TrustedDeviceView[]> {
    const currentHash = currentToken ? sha256(currentToken) : null;
    const devices = await this.repository.listTrustedDevicesForUser(this.db, userId, new Date());

    return devices
      .map((device) => ({
        id: device.id,
        userAgent: device.userAgent,
        createdAt: device.createdAt,
        lastUsedAt: device.lastUsedAt,
        expiresAt: device.expiresAt,
        current: device.tokenHash === currentHash,
      }))
      .sort(
        (a, b) =>
          Number(b.current) - Number(a.current) ||
          (b.lastUsedAt ?? b.createdAt).getTime() - (a.lastUsedAt ?? a.createdAt).getTime(),
      );
  }

  /** Null if the device isn't the user's; `current` if it was the asking browser. */
  async removeById(
    userId: string,
    deviceId: string,
    currentToken: string | null,
  ): Promise<{ current: boolean } | null> {
    const tokenHash = await this.repository.deleteTrustedDeviceById(this.db, userId, deviceId);

    return tokenHash ? { current: currentToken !== null && sha256(currentToken) === tokenHash } : null;
  }

  remove(userId: string, token: string): Promise<void> {
    return this.repository.deleteTrustedDevice(this.db, userId, sha256(token));
  }

  markUsed(deviceId: string): Promise<void> {
    return this.repository.updateTrustedDeviceLastUsed(this.db, deviceId, new Date());
  }
}
