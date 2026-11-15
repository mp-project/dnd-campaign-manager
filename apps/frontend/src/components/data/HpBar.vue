<script setup lang="ts">
/**
 * Hit points as a bar, without steppers (changes go through the game master or the character
 * sheet). Temporary HP are a blue shield segment after the HP; the scale is max(maximum, HP +
 * temporary) so both stay visible. HP below 35 % turn red (`dark`: on navy, gold and alarm red).
 */
import { computed } from "vue";

import { useAppI18n } from "@/core/i18n";

const props = withDefaults(defineProps<{ hp: number; max: number; temp?: number; dark?: boolean; height?: number }>(), {
  temp: 0,
  height: 10,
});
const { t } = useAppI18n();

const scale = computed(() => Math.max(props.max, props.hp + props.temp, 1));
const hpPercent = computed(() => Math.max(0, (props.hp / scale.value) * 100));
const tempPercent = computed(() => (props.temp / scale.value) * 100);
const low = computed(() => props.max > 0 && props.hp / props.max < 0.35);
const label = computed(() =>
  props.temp
    ? t("common.hp.labelWithTemp", { hp: props.hp, max: props.max, temp: props.temp })
    : t("common.hp.label", { hp: props.hp, max: props.max }),
);
</script>

<template>
  <div
    class="flex w-full overflow-hidden rounded-full"
    :class="dark ? 'bg-navy-700' : 'bg-neutral-soft'"
    :style="{ height: `${height}px` }"
    role="meter"
    :aria-valuenow="hp"
    aria-valuemin="0"
    :aria-valuemax="max"
    :aria-label="label"
  >
    <div
      class="h-full motion-safe:transition-[width]"
      :class="[low ? (dark ? 'bg-alert' : 'bg-danger') : dark ? 'bg-gold-light' : 'bg-brand', !temp && 'rounded-r-full']"
      :style="{ width: `${hpPercent}%` }"
    />
    <div
      v-if="temp"
      class="hp-temp h-full rounded-r-full motion-safe:transition-[width]"
      :style="{ width: `${tempPercent}%` }"
      :title="t('common.hp.temp', { temp })"
    />
  </div>
</template>
