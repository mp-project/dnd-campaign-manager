<script setup lang="ts">
/**
 * The only way to insert HTML: server-rendered Markdown (`contentHtml`), sanitized again with
 * DOMPurify. `v-html` is forbidden everywhere else (`vue/no-v-html`). Raw fields such as `content`
 * are shown as text, never through here.
 */
import DOMPurify from "dompurify";
import { computed } from "vue";

const props = defineProps<{ html?: string | null }>();

const sanitized = computed(() =>
  props.html ? DOMPurify.sanitize(props.html, { USE_PROFILES: { html: true }, FORBID_TAGS: ["style", "form"] }) : "",
);
</script>

<template>
  <!-- eslint-disable vue/no-v-html -- sanitized above; the one allowed place -->
  <div
    class="safe-html"
    v-html="sanitized"
  />
  <!-- eslint-enable vue/no-v-html -->
</template>
