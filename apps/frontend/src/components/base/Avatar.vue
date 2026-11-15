<script setup lang="ts">
/**
 * Round avatar: picture or initials. `online` true/false shows the presence dot (undefined: none).
 * `crop` is the picture's focus in percent plus zoom.
 */
import { computed } from "vue";

import { useAppI18n } from "@/core/i18n";

import type { AvatarTone } from "./types";

const props = withDefaults(
  defineProps<{
    initials?: string;
    src?: string;
    size?: number;
    tone?: AvatarTone;
    ring?: boolean;
    online?: boolean;
    crop?: { x: number; y: number; zoom: number };
  }>(),
  { size: 40, tone: "teal", online: undefined },
);
const { t } = useAppI18n();

const TONES: Record<AvatarTone, string> = {
  teal: "bg-avatar-teal",
  gold: "bg-gold",
  blue: "bg-avatar-blue",
  brown: "bg-avatar-brown",
  violet: "bg-avatar-violet",
  burgundy: "bg-brand",
};
const dot = computed(() => Math.max(8, Math.round(props.size * 0.3)));
const cropStyle = computed(() =>
  props.crop
    ? {
        objectPosition: `${props.crop.x}% ${props.crop.y}%`,
        transform: `scale(${props.crop.zoom})`,
        transformOrigin: `${props.crop.x}% ${props.crop.y}%`,
      }
    : undefined,
);
</script>

<template>
  <span
    class="avatar relative overflow-visible!"
    :class="[TONES[tone] ?? TONES.teal, ring && 'ring-2 ring-gold-light/70']"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.38)}px` }"
  >
    <span
      v-if="src"
      class="block size-full overflow-hidden rounded-full"
    >
      <img
        :src="src"
        alt=""
        class="size-full object-cover"
        :style="cropStyle"
      >
    </span>
    <span v-else>{{ initials }}</span>
    <span
      v-if="online !== undefined"
      class="absolute right-0 bottom-0 rounded-full border-2 border-parchment-card"
      :class="online ? 'bg-ok' : 'bg-ink-3'"
      :style="{ width: `${dot}px`, height: `${dot}px` }"
      :title="online ? t('common.presence.online') : t('common.presence.offline')"
      aria-hidden="true"
    />
  </span>
</template>
