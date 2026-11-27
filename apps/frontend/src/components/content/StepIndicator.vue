<script setup lang="ts">
/**
 * Multi-step processes: numbered steps, progress and clear states. Done steps with `to` link back.
 * `complete`: every step is done.
 */
import { computed } from "vue";
import type { RouteLocationRaw } from "vue-router";

import Icon from "@/components/base/Icon.vue";
import { useAppI18n } from "@/core/i18n";

const props = defineProps<{ steps: Array<{ id: string; label: string; to?: RouteLocationRaw }>; current?: string; complete?: boolean }>();
const { t } = useAppI18n();
const currentIndex = computed(() =>
  props.complete ? props.steps.length : props.steps.findIndex((step) => step.id === props.current),
);
</script>

<template>
  <ol
    class="mb-6 flex items-center gap-2 md:gap-3"
    :aria-label="t('common.steps.progress')"
  >
    <li
      v-for="(step, index) in steps"
      :key="step.id"
      class="flex min-w-0 flex-1 items-center gap-2 md:gap-3"
      :aria-current="step.id === current ? 'step' : undefined"
    >
      <component
        :is="step.to && index < currentIndex ? 'RouterLink' : 'span'"
        :to="step.to"
        class="flex min-w-0 items-center gap-2"
      >
        <span
          class="num flex size-9 shrink-0 items-center justify-center rounded-full border font-heading text-[0.9375rem]"
          :class="
            index < currentIndex
              ? 'border-ok bg-ok-soft text-ok'
              : index === currentIndex
                ? 'border-primary bg-primary text-parchment-card'
                : 'border-line bg-parchment-card text-ink-3'
          "
        >
          <Icon
            v-if="index < currentIndex"
            name="ui-check"
            :size="18"
          /><template v-else>{{ index + 1 }}</template>
        </span>
        <span
          class="truncate text-[0.9375rem]"
          :class="index === currentIndex ? 'font-semibold text-heading' : 'hidden text-ink-2 md:inline'"
        >{{ step.label }}</span>
      </component>
      <span
        v-if="index < steps.length - 1"
        class="h-px flex-1"
        :class="index < currentIndex ? 'bg-ok' : 'bg-line'"
        aria-hidden="true"
      />
    </li>
  </ol>
</template>
