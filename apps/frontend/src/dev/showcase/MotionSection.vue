<script setup lang="ts">
/**
 * Motion tokens read straight from main.css and the transition classes of the app UI, each with a
 * small demo. Reduced motion (system or `data-reduced-motion`) makes every demo jump.
 */
import { ref } from "vue";

import BaseButton from "@/components/base/BaseButton.vue";
import { useReducedMotion } from "@/core/motion/reducedMotion";
import themeCss from "@/styles/main.css?raw";

import ShowcaseComponent from "./ShowcaseComponent.vue";
import ShowcaseSection from "./ShowcaseSection.vue";
import ShowcaseVariant from "./ShowcaseVariant.vue";

const tokens = [...themeCss.matchAll(/--motion-(duration|ease)-([\w-]+):\s*([^;]+);/g)].map((match) => ({
  kind: match[1]!,
  name: `--motion-${match[1]}-${match[2]}`,
  value: match[3]!.trim(),
}));
const durations = tokens.filter((token) => token.kind === "duration");
const easings = tokens.filter((token) => token.kind === "ease");

const reduced = useReducedMotion();
const moved = ref(false);
const transitions = ["fade", "slide-left", "slide-right", "slide-up"] as const;
const shown = ref<Record<(typeof transitions)[number], boolean>>({
  fade: true,
  "slide-left": true,
  "slide-right": true,
  "slide-up": true,
});
</script>

<template>
  <ShowcaseSection
    id="motion"
    title="Bewegung"
    description="Dauern und Easings aus src/styles/main.css (--motion-*), Transition-Klassen für Vue <Transition>. Reduzierte Bewegung (System oder Benutzereinstellung) setzt data-reduced-motion auf <html>."
  >
    <ShowcaseComponent
      name="Tokens"
      :description="`Reduzierte Bewegung aktiv: ${reduced ? 'ja' : 'nein'}`"
    >
      <ShowcaseVariant
        label="Dauern"
        wide
      >
        <div class="flex w-full flex-col gap-2">
          <div
            v-for="token in durations"
            :key="token.name"
            class="flex items-center gap-3"
          >
            <code class="w-56 shrink-0 text-[0.8125rem]">{{ token.name }}</code>
            <span class="meta w-14 shrink-0">{{ token.value }}</span>
            <span class="relative h-3 flex-1 overflow-hidden rounded-control bg-parchment-sunk [container-type:inline-size]">
              <span
                class="absolute inset-y-0 left-0 w-6 rounded-control bg-primary"
                :style="{
                  transform: moved ? 'translateX(calc(100cqw - 1.5rem))' : 'none',
                  transition: `transform var(${token.name}) var(--motion-ease-out)`,
                }"
              />
            </span>
          </div>
        </div>
      </ShowcaseVariant>
      <ShowcaseVariant
        label="Easings (Dauer slow)"
        wide
      >
        <div class="flex w-full flex-col gap-2">
          <div
            v-for="token in easings"
            :key="token.name"
            class="flex items-center gap-3"
          >
            <code class="w-56 shrink-0 text-[0.8125rem]">{{ token.name }}</code>
            <span class="relative h-3 flex-1 overflow-hidden rounded-control bg-parchment-sunk [container-type:inline-size]">
              <span
                class="absolute inset-y-0 left-0 w-6 rounded-control bg-gold"
                :style="{
                  transform: moved ? 'translateX(calc(100cqw - 1.5rem))' : 'none',
                  transition: `transform var(--motion-duration-slow) var(${token.name})`,
                }"
              />
            </span>
          </div>
        </div>
      </ShowcaseVariant>
      <ShowcaseVariant label="Abspielen">
        <BaseButton
          size="sm"
          @click="moved = !moved"
        >
          Bewegen
        </BaseButton>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="Transitions"
      description="<Transition name=&quot;…&quot;> in Dialogen, Menüs, Drawern und Bottom Sheets"
    >
      <ShowcaseVariant
        v-for="name in transitions"
        :key="name"
        :label="name"
      >
        <div class="flex w-full items-center gap-3">
          <BaseButton
            size="sm"
            @click="shown[name] = !shown[name]"
          >
            Umschalten
          </BaseButton>
          <div class="relative h-14 flex-1 overflow-hidden rounded-control border border-line">
            <Transition :name="name">
              <div
                v-if="shown[name]"
                class="absolute inset-0 flex items-center justify-center bg-parchment-card"
              >
                <code class="text-[0.8125rem]">.{{ name }}</code>
              </div>
            </Transition>
          </div>
        </div>
      </ShowcaseVariant>
    </ShowcaseComponent>
  </ShowcaseSection>
</template>
