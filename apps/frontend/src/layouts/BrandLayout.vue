<script setup lang="ts">
/**
 * Brand layout of the pages outside the app (sign-in, legal notice, privacy): navy background,
 * the sticky site header with the brand and a switch link, a parchment card with the compass
 * rose, title and subtitle, and the legal links in the footer. `size`: `narrow` for short forms, `wide` for text.
 */
import CompassRose from "@/components/layout/CompassRose.vue";
import ParchmentFrame from "@/components/layout/ParchmentFrame.vue";
import SiteHeader from "@/components/layout/SiteHeader.vue";
import { useAppI18n } from "@/core/i18n";

withDefaults(defineProps<{ title: string; subtitle?: string; size?: "narrow" | "default" | "wide" }>(), {
  subtitle: undefined,
  size: "default",
});
defineSlots<{ default(): unknown; switch?(): unknown; footer?(): unknown }>();
const { t } = useAppI18n();

const WIDTH = { narrow: "max-w-130", default: "max-w-140", wide: "max-w-200" } as const;
</script>

<template>
  <div class="relative flex min-h-dvh flex-col overflow-clip bg-navy-950 text-parchment">
    <SiteHeader>
      <div
        v-if="$slots.switch"
        class="hidden text-[15px] sm:block"
      >
        <slot name="switch" />
      </div>
    </SiteHeader>

    <main class="relative z-10 flex flex-1 items-start justify-center px-4 py-6 md:items-center md:py-10">
      <ParchmentFrame
        class="w-full rounded-card px-5 py-7 text-ink shadow-soft md:px-12 md:py-9"
        :class="WIDTH[size]"
      >
        <div
          class="flex items-center justify-center gap-4"
          aria-hidden="true"
        >
          <span class="h-px w-16 bg-gold/70" />
          <CompassRose
            :size="64"
            tone="parchment"
          />
          <span class="h-px w-16 bg-gold/70" />
        </div>
        <h1 class="page-title mt-2 text-center">
          {{ title }}
        </h1>
        <p
          v-if="subtitle"
          class="mt-2 text-center text-[17px] text-ink-2"
        >
          {{ subtitle }}
        </p>
        <div class="mt-6">
          <slot />
        </div>
        <template v-if="$slots.footer">
          <div
            class="mt-6 flex items-center justify-center gap-3"
            aria-hidden="true"
          >
            <span class="h-px w-24 bg-gold/60" />
            <span class="size-2 rotate-45 bg-gold/80" />
            <span class="h-px w-24 bg-gold/60" />
          </div>
          <div class="mt-4 text-center">
            <slot name="footer" />
          </div>
        </template>
      </ParchmentFrame>
    </main>

    <footer class="relative z-10 flex items-center justify-center gap-4 border-t border-navy-line py-3 text-[14px] text-parchment/80">
      <RouterLink
        :to="{ name: 'legal-privacy' }"
        class="inline-flex min-h-11 items-center px-2 hover:underline"
      >
        {{ t("common.legal.privacy") }}
      </RouterLink>
      <span
        class="h-4 w-px bg-navy-line"
        aria-hidden="true"
      />
      <RouterLink
        :to="{ name: 'legal-imprint' }"
        class="inline-flex min-h-11 items-center px-2 hover:underline"
      >
        {{ t("common.legal.imprint") }}
      </RouterLink>
    </footer>
  </div>
</template>
