<script setup lang="ts">
/**
 * A motto under the title of the sign-in pages: starts with a random one and changes every few
 * seconds (fading only without reduced motion). Decoration: the change is not announced.
 */
import { onMounted, onUnmounted, ref } from "vue";

import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";

const props = withDefaults(defineProps<{ intervalMs?: number }>(), { intervalMs: 8000 });
const { t } = useAppI18n();

const QUOTES: readonly MessageKey[] = [
  "auth.shell.quotes.place",
  "auth.shell.quotes.decision",
  "auth.shell.quotes.steps",
  "auth.shell.quotes.dice",
  "auth.shell.quotes.deeds",
  "auth.shell.quotes.nextAdventure",
  "auth.shell.quotes.newStories",
];

const index = ref(Math.floor(Math.random() * QUOTES.length));
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  timer = setInterval(() => (index.value = (index.value + 1) % QUOTES.length), props.intervalMs);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <p
    class="-mt-3 mb-4 text-center text-[15px] text-ink-2 italic"
  >
    <Transition
      mode="out-in"
      enter-active-class="motion-safe:transition-opacity motion-safe:duration-500"
      leave-active-class="motion-safe:transition-opacity motion-safe:duration-500"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <span
        :key="index"
        data-testid="quote"
      >{{ t(QUOTES[index]!) }}</span>
    </Transition>
  </p>
</template>
