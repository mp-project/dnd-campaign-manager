<script setup lang="ts">
/**
 * One feature of the start page: icon, title, text and check points beside or above its picture
 * (default slot). Dark features run as a navy band across the page.
 */
import Icon from "@/components/base/Icon.vue";
import type { IconName } from "@/components/base/iconNames";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";

export type FeatureRowData = {
  id: string;
  icon: IconName;
  title: MessageKey;
  text: MessageKey;
  points: MessageKey[];
  /** Where the picture goes from md on: beside the text, or across the full width below it. */
  layout: "left" | "right" | "wide";
  /** On a navy band across the page, like the footer, instead of the light backdrop. */
  dark?: boolean;
};

defineProps<{ feature: FeatureRowData }>();
defineSlots<{ default(): unknown }>();
const { t } = useAppI18n();

/** Grid of a feature row and order of its text, per layout. */
const LAYOUT = {
  left: { row: "md:grid-cols-[3fr_2fr]", text: "md:order-last" },
  right: { row: "md:grid-cols-[2fr_3fr]", text: "" },
  wide: { row: "", text: "md:grid md:grid-cols-2 md:gap-x-12" },
} as const;
</script>

<template>
  <div
    :class="
      feature.dark
        ? 'relative my-7 overflow-hidden border-y border-navy-line bg-navy-950 py-14 text-parchment md:my-10 md:py-20'
        : 'py-7 md:py-10'
    "
  >
    <div
      v-if="feature.dark"
      class="feature-dark-glow pointer-events-none absolute inset-0"
    />
    <article
      class="relative mx-auto grid max-w-300 items-center gap-6 px-4 md:gap-12 md:px-10"
      :class="[LAYOUT[feature.layout].row, feature.layout === 'wide' && 'md:gap-8']"
      :aria-labelledby="`landing-feature-${feature.id}`"
    >
      <div :class="LAYOUT[feature.layout].text">
        <div>
          <div class="flex items-center gap-4">
            <span
              class="flex size-14 shrink-0 items-center justify-center rounded-full text-gold-light"
              :class="feature.dark ? 'border border-gold bg-navy-900' : 'bg-navy-950'"
            >
              <Icon
                :name="feature.icon"
                :size="32"
              />
            </span>
            <h3
              :id="`landing-feature-${feature.id}`"
              class="section-title text-[24px]"
              :class="feature.dark && 'text-parchment'"
            >
              {{ t(feature.title) }}
            </h3>
          </div>
          <p
            class="mt-4 text-[17px]"
            :class="feature.dark ? 'text-parchment/85' : 'text-ink-2'"
          >
            {{ t(feature.text) }}
          </p>
        </div>
        <ul
          class="mt-4 flex flex-col gap-2"
          :class="feature.layout === 'wide' && 'md:mt-0 md:self-end'"
        >
          <li
            v-for="point in feature.points"
            :key="point"
            class="flex items-start gap-2"
          >
            <Icon
              name="ui-check"
              :size="20"
              class="mt-0.5 shrink-0"
              :class="feature.dark ? 'text-gold-light' : 'text-ok'"
            />
            <span>{{ t(point) }}</span>
          </li>
        </ul>
      </div>
      <slot />
    </article>
  </div>
</template>

<style scoped>
.feature-dark-glow {
  background: radial-gradient(ellipse at 50% 100%, color-mix(in srgb, var(--color-gold) 14%, transparent), transparent 60%);
}
</style>
