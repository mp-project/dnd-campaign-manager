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

async function leave(): Promise<void> {
  // Signed out locally even if the server can't be reached; the session cookie expires on its own.
  await signOut(queryClient).catch(() => undefined);
  await router.push({ name: "auth-login" });
}

const items = computed<DropdownItem[]>(() => [
  ...(me.data.value ? [{ heading: me.data.value.displayName }] : []),
  { label: t("common.shell.dashboard"), icon: "nav-dashboard", to: "/dashboard" },
  ...(props.switchTo ? [{ label: props.switchTo.label, icon: "nav-spielbrett" as const, to: props.switchTo.to }] : []),
  { divider: true },
  { label: t("common.shell.signOut"), icon: "aktion-abmelden", action: () => void leave() },
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
