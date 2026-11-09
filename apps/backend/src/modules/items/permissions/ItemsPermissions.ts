import {
  ANY_CAMPAIGN_ROLE,
  CAMPAIGN_EDITOR_ROLES,
  type PermissionDefinition,
} from "#core/permissions/service";

export const ITEMS_PERMISSIONS = {
  read: "items.read",
  create: "items.create",
  update: "items.update",
  delete: "items.delete",
  restore: "items.restore",
  validate: "items.validate",
  fork: "items.fork",
  readUsages: "items.readUsages",
  resolve: "items.resolve",
} as const;

/**
 * Instances: players read the ones they know of; changing them is left to the GM and editors until
 * the character modules let players handle the items of their own character.
 */
export const ITEM_INSTANCES_PERMISSIONS = {
  read: "itemInstances.read",
  create: "itemInstances.create",
  update: "itemInstances.update",
  delete: "itemInstances.delete",
  transfer: "itemInstances.transfer",
  equip: "itemInstances.equip",
  attune: "itemInstances.attune",
  identify: "itemInstances.identify",
} as const;

export const ITEMS_PERMISSION_KEYS = [
  ...Object.values(ITEMS_PERMISSIONS),
  ...Object.values(ITEM_INSTANCES_PERMISSIONS),
];

/**
 * Whether a user may do this is decided in the use case: global items are changed by
 * administrators only, custom items and instances by GMs and editors of their campaign.
 */
export const ITEMS_USER_PERMISSION_KEYS = ITEMS_PERMISSION_KEYS;

const definition = (
  key: string,
  campaignRoles: NonNullable<PermissionDefinition["campaignRoles"]>,
  description: string,
): PermissionDefinition => ({
  key,
  campaignRoles,
  description,
});

export const itemsPermissionDefinitions: readonly PermissionDefinition[] = [
  definition(
    ITEMS_PERMISSIONS.read,
    ANY_CAMPAIGN_ROLE,
    "Read items; players only active global ones and released custom ones, in the player view",
  ),
  definition(ITEMS_PERMISSIONS.create, CAMPAIGN_EDITOR_ROLES, "Create items; global ones administrators only"),
  definition(ITEMS_PERMISSIONS.update, CAMPAIGN_EDITOR_ROLES, "Update items; global ones administrators only"),
  definition(ITEMS_PERMISSIONS.delete, CAMPAIGN_EDITOR_ROLES, "Archive items; global ones administrators only"),
  definition(ITEMS_PERMISSIONS.restore, CAMPAIGN_EDITOR_ROLES, "Restore archived items"),
  definition(ITEMS_PERMISSIONS.validate, CAMPAIGN_EDITOR_ROLES, "Check a stored item against the current state"),
  definition(ITEMS_PERMISSIONS.fork, CAMPAIGN_EDITOR_ROLES, "Copy an item of the catalog into a custom item"),
  definition(
    ITEMS_PERMISSIONS.readUsages,
    ANY_CAMPAIGN_ROLE,
    "See where an item is used in the campaign; players only for content they may see",
  ),
  definition(
    ITEMS_PERMISSIONS.resolve,
    ANY_CAMPAIGN_ROLE,
    "Calculate what an item gives an actor (attack, damage, armor class, effects) without storing anything",
  ),
  definition(
    ITEM_INSTANCES_PERMISSIONS.read,
    ANY_CAMPAIGN_ROLE,
    "Read item instances; players only those they have seen or identified",
  ),
  definition(ITEM_INSTANCES_PERMISSIONS.create, CAMPAIGN_EDITOR_ROLES, "Create item instances in a campaign"),
  definition(
    ITEM_INSTANCES_PERMISSIONS.update,
    CAMPAIGN_EDITOR_ROLES,
    "Change the state, quantity and charges of item instances",
  ),
  definition(ITEM_INSTANCES_PERMISSIONS.delete, CAMPAIGN_EDITOR_ROLES, "Delete item instances"),
  definition(ITEM_INSTANCES_PERMISSIONS.transfer, CAMPAIGN_EDITOR_ROLES, "Give item instances to another owner"),
  definition(ITEM_INSTANCES_PERMISSIONS.equip, CAMPAIGN_EDITOR_ROLES, "Equip and unequip item instances"),
  definition(ITEM_INSTANCES_PERMISSIONS.attune, CAMPAIGN_EDITOR_ROLES, "Attune actors to item instances"),
  definition(
    ITEM_INSTANCES_PERMISSIONS.identify,
    CAMPAIGN_EDITOR_ROLES,
    "Set what players know about item instances",
  ),
];
