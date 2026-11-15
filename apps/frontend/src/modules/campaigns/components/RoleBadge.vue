<script setup lang="ts">
/** The viewer's role in a campaign: game master (crown), co-author, player. */
import { computed } from "vue";

import Badge from "@/components/base/Badge.vue";
import type { IconName } from "@/components/base/iconNames";
import type { BadgeTone } from "@/components/base/types";
import { type CampaignRole, roleMessageKey } from "@/core/campaign/campaign";
import { useAppI18n } from "@/core/i18n";

const props = defineProps<{ role: CampaignRole }>();
const { t } = useAppI18n();

const LOOK: Record<CampaignRole, { tone: BadgeTone; icon: IconName }> = {
  OWNER: { tone: "gold", icon: "orig-krone" },
  EDITOR: { tone: "blue", icon: "aktion-bearbeiten" },
  PLAYER: { tone: "neutral", icon: "ui-user" },
};
const look = computed(() => LOOK[props.role]);
</script>

<template>
  <Badge
    :tone="look.tone"
    :icon="look.icon"
  >
    {{ t(roleMessageKey(role)) }}
  </Badge>
</template>
