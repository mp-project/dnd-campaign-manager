<script setup lang="ts">
/**
 * An uploaded image of a campaign. The browser can't send the session token with `<img src>`, so
 * the image asks the API for a signed link first (several images of a page in one request) and
 * shows that. It fills the box its class gives it: a calm placeholder while loading, an image
 * symbol when the file can't be shown. An image that fails to load gets one more try.
 */
import { useQuery } from "@tanstack/vue-query";
import { computed, ref, watch } from "vue";

import Icon from "@/components/base/Icon.vue";

import type { MediaVariant } from "../api";
import { mediaLinkQuery } from "../queries";

const props = withDefaults(
  defineProps<{
    campaignId: string;
    mediaId: string;
    /** Required; "" marks a purely decorative image. */
    alt: string;
    variant?: MediaVariant;
    /** `contain` for cut-out pictures (items), `cover` fills the box. */
    fit?: "cover" | "contain";
  }>(),
  { variant: undefined, fit: "cover" },
);

const link = useQuery(computed(() => mediaLinkQuery(props.campaignId, props.mediaId, props.variant)));
const url = computed(() => link.data.value?.url ?? null);
/** Whether the current image already had its second chance; a successful load gives it back. */
const retried = ref(false);
const broken = ref(false);
/** Changing it mounts the `<img>` anew, which loads the same address again. */
const attempt = ref(0);

watch(
  () => [props.campaignId, props.mediaId, props.variant],
  () => {
    retried.value = false;
    broken.value = false;
  },
);

function onLoad() {
  retried.value = false;
}

/**
 * One more try per failure streak: a fresh link if the old one expired (or the dev server lost its
 * key), else the same link again, since links stay the same within their time window and the
 * failure may have been the network.
 */
async function onLoadError() {
  if (retried.value) {
    broken.value = true;
    return;
  }

  retried.value = true;
  const failedUrl = url.value;
  await link.refetch();

  if (url.value === failedUrl) {
    attempt.value += 1;
  }
}
</script>

<template>
  <span
    class="block overflow-hidden"
    :class="fit === 'contain' ? 'bg-navy-900' : 'bg-parchment-sunk'"
    :aria-busy="link.isPending.value ? 'true' : undefined"
  >
    <img
      v-if="url && !broken"
      :key="attempt"
      :src="url"
      :alt="alt"
      class="size-full"
      :class="fit === 'contain' ? 'object-contain p-1' : 'object-cover'"
      loading="lazy"
      decoding="async"
      @load="onLoad"
      @error="onLoadError"
    >
    <span
      v-else-if="broken || link.isError.value"
      class="flex size-full items-center justify-center text-ink-3"
      :role="alt ? 'img' : undefined"
      :aria-label="alt || undefined"
    >
      <Icon
        name="ui-image"
        :size="20"
      />
    </span>
  </span>
</template>
