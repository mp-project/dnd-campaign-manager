import type { FastifyBaseLogger } from "fastify";

import type { HistoryEvent, HistoryEventValues } from "#core/history/types";
import { contextLogger, currentLogContext } from "#core/log/logContext";

export type AuditEntity = {
  entityType: string;
  entityId: string;
  version?: number;
  /** Names of the changed fields. */
  fields?: readonly string[];
  /**
   * New values, written only while `LOG_CHANGE_VALUES` is on (the request's setting). Never
   * passwords, tokens or codes; the history leaves out account and secret fields.
   */
  values?: Readonly<Record<string, unknown>>;
};

export type AuditEntry = {
  /** What was done, e.g. `campaignInvitations.create`, `media.delete`. */
  action: string;
  entities: readonly AuditEntity[];
  campaignId?: string | null;
  actorId?: string | null;
  /** Reason of an action that is open on purpose (`publicAction`). */
  public?: string | null;
  /** Rights, account status or memberships changed; filtered and alerted on separately. */
  security?: boolean;
};

/** Changes to these fields change who may do what. */
const SECURITY_FIELDS: Readonly<Record<string, readonly string[]>> = {
  user: ["systemRole", "status"],
  campaignMembership: ["role", "status"],
};

function isSecurityRelevant(entity: AuditEntity): boolean {
  const fields = SECURITY_FIELDS[entity.entityType];

  return Boolean(fields && entity.fields?.some((field) => fields.includes(field)));
}

/** Values only where the serving app asked for them; outside a request never. */
function withAllowedValues(entities: readonly AuditEntity[], allowed: boolean): AuditEntity[] {
  return entities.map(({ values, ...entity }) =>
    allowed && values !== undefined ? { ...entity, values } : entity,
  );
}

/**
 * One `change` line per committed action. Call it after the commit, so a rolled back action never
 * shows up as a change; the history does this for tracked content, writes without history call it
 * themselves. Ids and field names always, the new values only while `LOG_CHANGE_VALUES` is on.
 */
export function auditLog(logger: FastifyBaseLogger, entry: AuditEntry): void {
  const security = entry.security ?? entry.entities.some(isSecurityRelevant);
  const entities = withAllowedValues(entry.entities, currentLogContext()?.changeValues === true);

  logger.info(
    {
      kind: "change",
      action: entry.action,
      entities,
      ...(entry.campaignId ? { campaignId: entry.campaignId } : {}),
      ...(entry.actorId ? { actorId: entry.actorId } : {}),
      ...(entry.public ? { public: entry.public } : {}),
      ...(security ? { security: true } : {}),
    },
    "change",
  );
}

/**
 * `auditLog` for writes without history (invitations, media files, the own profile, auth): call
 * it after the commit, in the request or script that made the change.
 */
export function recordChange(entry: AuditEntry): void {
  const logger = contextLogger();

  if (logger) {
    auditLog(logger, entry);
  }
}

/** The `change` lines of one history action; the events of an action share its id. */
export function auditHistoryEvents(
  logger: FastifyBaseLogger,
  events: readonly HistoryEvent[],
  values?: HistoryEventValues,
): void {
  const actions = new Map<string, HistoryEvent[]>();

  for (const event of events) {
    const group = actions.get(event.actionId);

    if (group) {
      group.push(event);
    } else {
      actions.set(event.actionId, [event]);
    }
  }

  for (const group of actions.values()) {
    const [first] = group;

    if (!first) {
      continue;
    }

    const campaignIds = new Set(group.map((event) => event.campaignId));

    auditLog(logger, {
      action: first.action,
      entities: group.map((event) => {
        const eventValues = values?.get(event.eventId);

        return {
          entityType: event.entityType,
          entityId: event.entityId,
          version: event.entityVersion,
          fields: event.fields,
          ...(eventValues ? { values: eventValues } : {}),
        };
      }),
      campaignId: campaignIds.size === 1 ? first.campaignId : null,
      actorId: first.actorId,
      public: first.publicReason ?? null,
    });
  }
}
