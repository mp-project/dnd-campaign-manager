<script setup lang="ts">
/**
 * Long texts: a short preview with ellipsis and a toggle; "show more" opens the full text in place.
 * Mentions are shown as marks. `compact`: small variant for table cells (one line, small toggle).
 * The toggle only appears when the text is actually cut off.
 */
import { computed, nextTick, onMounted, ref, watch } from "vue";

import Icon from "@/components/base/Icon.vue";
import { useAppI18n } from "@/core/i18n";

import MentionText from "./MentionText.vue";

const props = defineProps<{ text?: string | null; lines?: number; compact?: boolean }>();
const { t } = useAppI18n();
const open = ref(false);
const overflowing = ref(true);
const body = ref<HTMLElement>();
const lineCount = computed(() => props.lines ?? (props.compact ? 1 : 3));

async function measure(): Promise<void> {
  await nextTick();
  const element = body.value;
  // jsdom and hidden elements have no layout: keep the toggle then.
  if (element && element.clientHeight > 0) overflowing.value = element.scrollHeight > element.clientHeight + 1;
}

onMounted(measure);
watch(() => props.text, measure);
</script>

<template>
  <div>
    <p
      ref="body"
      class="whitespace-pre-line"
      :class="compact ? 'text-[0.875rem] leading-snug text-ink-2' : 'text-ink'"
      :style="!open ? { display: '-webkit-box', WebkitLineClamp: lineCount, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : undefined"
    >
      <slot><MentionText :text="text" /></slot>
    </p>
    <button
      v-if="overflowing || open"
      type="button"
      class="inline-flex items-center font-medium text-brand hover:underline"
      :class="compact ? 'min-h-7 gap-1 text-[0.84375rem]' : 'mt-1 min-h-11 gap-1.5'"
      :aria-expanded="open"
      @click.stop="open = !open"
    >
      <Icon
        :name="open ? 'ui-chevron-up' : 'ui-chevron-down'"
        :size="compact ? 14 : 18"
      />
      {{ open ? t("common.actions.showLess") : t("common.actions.showMore") }}
    </button>
  </div>
</template>
