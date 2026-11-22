<script setup lang="ts">
/**
 * Cookiebot's cookie declaration (the cookies in use, the visitor's consent and the way to change
 * it), loaded from Cookiebot into this place. Cookiebot renders it next to the script tag with the
 * id `CookieDeclaration`, so the tag is created here, in the language of the page. Without
 * `VITE_COOKIEBOT_ID` and while prerendering nothing is loaded. The note above it says where the
 * list comes from, so a browser that blocks Cookiebot doesn't leave the section empty.
 */
import { onMounted, ref } from "vue";

import { useAppI18n } from "@/core/i18n";

const { t, locale } = useAppI18n();
const host = ref<HTMLElement | null>(null);
const id = import.meta.env.VITE_COOKIEBOT_ID?.trim() ?? "";

/** The build's prerendering saves the page without external scripts (`scripts/prerender.ts`). */
function prerendering(): boolean {
  return (window as { __QUESTARIA_PRERENDER__?: boolean }).__QUESTARIA_PRERENDER__ === true;
}

onMounted(() => {
  if (!id || !host.value || prerendering()) return;
  const script = document.createElement("script");
  script.id = "CookieDeclaration";
  script.src = `https://consent.cookiebot.com/${encodeURIComponent(id)}/cd.js`;
  script.type = "text/javascript";
  script.async = true;
  script.dataset.culture = locale.value === "en" ? "en" : "de";
  host.value.appendChild(script);
});
</script>

<template>
  <div class="mt-4 text-ink-2">
    <p class="meta">
      {{ t(id ? "legal.privacy.consent.declaration" : "legal.privacy.consent.declarationMissing") }}
    </p>
    <div
      ref="host"
      class="mt-2"
    />
  </div>
</template>

