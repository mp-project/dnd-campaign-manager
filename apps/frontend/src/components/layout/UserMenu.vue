<script setup lang="ts">
/** Account menu behind the avatar: the account's name, dashboard, switching views, signing out. */
import { useQueryClient } from "@tanstack/vue-query";
import { computed } from "vue";
import { useRouter } from "vue-router";

import Avatar from "@/components/base/Avatar.vue";
import DropdownMenu, { type DropdownItem } from "@/components/base/DropdownMenu.vue";
import Icon from "@/components/base/Icon.vue";
import { signOut, useMe } from "@/core/auth/session";
import { useAppI18n } from "@/core/i18n";

const props = defineProps<{
  compact?: boolean;
  /** An extra entry to switch between the campaign area and the player view. */
  switchTo?: { label: string; to: string } | null;
}>();

const { t } = useAppI18n();
const router = useRouter();
const queryClient = useQueryClient();
const me = useMe();

const initials = computed(() =>
  (me.data.value?.displayName ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join(""),
);

/**
 * Signing out of this browser works locally even if the server can't be reached; the session
 * cookie expires on its own. Signing out everywhere is a security action: if it fails, this
 * browser is still signed out, and the sign-in page says that the other sessions may remain.
 */
async function leave(scope: "device" | "everywhere" = "device"): Promise<void> {
  if (scope === "device") {
    await signOut(queryClient).catch(() => undefined);
    await router.push({ name: "auth-login" });
    return;
  }

  try {
    await signOut(queryClient, "everywhere");
    await router.push({ name: "auth-login" });
  } catch {
    await signOut(queryClient).catch(() => undefined);
    await router.push({ name: "auth-login", query: { signedOut: "partial" } });
  }
}

const items = computed<DropdownItem[]>(() => [
  ...(me.data.value ? [{ heading: me.data.value.displayName }] : []),
  { label: t("common.shell.dashboard"), icon: "nav-dashboard", to: "/dashboard" },
  ...(props.switchTo ? [{ label: props.switchTo.label, icon: "nav-spielbrett" as const, to: props.switchTo.to }] : []),
  { divider: true },
  { label: t("common.shell.signOut"), icon: "aktion-abmelden", action: () => void leave() },
  { label: t("common.shell.signOutEverywhere"), icon: "aktion-abmelden", action: () => void leave("everywhere") },
]);
</script>

<template>
  <DropdownMenu
    :items="items"
    dark
  >
    <template #trigger="{ toggle, open }">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-full text-parchment"
        :aria-expanded="open"
        :aria-label="t('common.shell.account')"
        @click="toggle"
      >
        <Avatar
          :initials="initials"
          :size="compact ? 40 : 44"
        />
        <Icon
          name="ui-chevron-down"
          :size="18"
        />
      </button>
    </template>
  </DropdownMenu>
</template>
