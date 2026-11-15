<script setup lang="ts">
/**
 * Mobile bottom bar with at most five targets: links, or `panel` targets that open the menu
 * (campaign: "content" at the groups, "more" with everything). `compassFirst` draws the first
 * target (overview) as the compass rose.
 */
import Icon from "@/components/base/Icon.vue";
import type { BottomNavTarget } from "@/core/navigation/navigation";

import CompassRose from "./CompassRose.vue";

defineProps<{ targets: BottomNavTarget[]; active?: string; label: string; compassFirst?: boolean }>();
const emit = defineEmits<{ panel: [panel: "content" | "more"] }>();
</script>

<template>
  <nav
    class="safe-bottom shrink-0 bg-navy-950 text-parchment md:hidden"
    :aria-label="label"
  >
    <ul
      class="grid"
      :style="{ gridTemplateColumns: `repeat(${targets.length}, minmax(0, 1fr))` }"
    >
      <li
        v-for="(target, index) in targets"
        :key="target.id"
      >
        <button
          v-if="'panel' in target"
          type="button"
          class="relative flex h-17 w-full flex-col items-center justify-center gap-1 text-[14px]"
          :class="active === target.id && 'bottom-nav-active text-gold-light'"
          @click="emit('panel', target.panel)"
        >
          <Icon
            :name="target.icon"
            :size="26"
          />
          <span class="max-w-full truncate px-1">{{ target.label }}</span>
        </button>
        <RouterLink
          v-else
          :to="target.to"
          class="relative flex h-17 w-full flex-col items-center justify-center gap-1 text-[14px]"
          :class="active === target.id && 'bottom-nav-active text-gold-light'"
          :aria-current="active === target.id ? 'page' : undefined"
        >
          <CompassRose
            v-if="compassFirst && index === 0"
            :size="28"
            :tone="active === target.id ? 'active' : 'light'"
          />
          <Icon
            v-else
            :name="target.icon"
            :size="26"
          />
          <span class="max-w-full truncate px-1">{{ target.label }}</span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
