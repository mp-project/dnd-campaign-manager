<script setup lang="ts">
/**
 * Brand layout of the pages outside the app (sign-in, contact, legal notice, privacy): navy
 * background, the header of every public page (`PublicHeader`), a parchment card with the wing
 * rose, title and subtitle, the `switch` slot below the card (e.g. from sign-in to registration)
 * and the footer of every public page (`SiteFooter`). `size`: `narrow` for short forms, `wide` for
 * text. The `closing` slot replaces the footer's call to action.
 */
import ParchmentFrame from "@/components/layout/ParchmentFrame.vue";
import PublicHeader from "@/components/layout/PublicHeader.vue";
import SiteFooter from "@/components/layout/SiteFooter.vue";
import WingSeal from "@/components/layout/WingSeal.vue";

withDefaults(defineProps<{ title: string; subtitle?: string; size?: "narrow" | "default" | "wide" }>(), {
  subtitle: undefined,
  size: "default",
});
defineSlots<{ default(): unknown; switch?(): unknown; footer?(): unknown; closing?(): unknown }>();

const WIDTH = { narrow: "max-w-130", default: "max-w-140", wide: "max-w-200" } as const;
</script>

<template>
  <div class="relative flex min-h-dvh flex-col overflow-clip bg-navy-950 text-parchment">
    <PublicHeader />

    <main class="relative z-10 flex flex-1 flex-col items-center justify-start px-4 pt-6 pb-28 md:justify-center md:pt-10 md:pb-44">
      <ParchmentFrame
        class="w-full rounded-card px-5 py-7 text-ink shadow-soft md:px-12 md:py-9"
        :class="WIDTH[size]"
      >
        <div
          class="flex items-center justify-center gap-4"
          aria-hidden="true"
        >
          <span class="h-px w-16 bg-gold/70" />
          <WingSeal
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
      <p
        v-if="$slots.switch"
        class="mt-6 text-center text-[15px]"
      >
        <slot name="switch" />
      </p>
    </main>

    <SiteFooter>
      <template
        v-if="$slots.closing"
        #default
      >
        <slot name="closing" />
      </template>
    </SiteFooter>
  </div>
</template>
