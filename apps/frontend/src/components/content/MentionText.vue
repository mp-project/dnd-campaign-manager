<script setup lang="ts">
/**
 * Text with mentions `@[Name](type:id)` shown as marks with a preview card on hover.
 * The resolver and the opener are provided by the page (MENTION_RESOLVER, MENTION_OPENER); without
 * them the stored name is shown. A target that is gone is struck through.
 */
import { computed, inject } from "vue";

import Avatar from "@/components/base/Avatar.vue";
import Icon from "@/components/base/Icon.vue";
import { useAppI18n } from "@/core/i18n";
import { MENTION_OPENER, MENTION_RESOLVER, type MentionRef, parseMentions } from "@/core/content/mentions";

const props = withDefaults(defineProps<{ text?: string | null }>(), { text: "" });
const { t } = useAppI18n();
const resolve = inject(MENTION_RESOLVER, () => undefined);
const open = inject(MENTION_OPENER, null);

const parts = computed(() =>
  parseMentions(props.text).map((part) => {
    if ("text" in part) return part;
    let target;
    try {
      target = resolve(part.mention);
    } catch {
      target = undefined;
    }
    return { ...part, target };
  }),
);

function activate(ref: MentionRef, gone: boolean): void {
  if (!gone) open?.(ref);
}
</script>

<template>
  <span class="whitespace-pre-line"><template
    v-for="(part, index) in parts"
    :key="index"
  ><template v-if="'text' in part">{{ part.text }}</template><span
    v-else
    class="men-wrap"
  ><button
    type="button"
    class="men"
    :class="part.target === null && 'men-gone'"
    :aria-label="part.target === null ? t('common.mention.gone', { name: part.mention.name }) : undefined"
    @click.stop="activate(part.mention, part.target === null)"
  ><Icon
    :name="part.target?.icon ?? 'ui-link'"
    :size="13"
  />{{ part.target?.name ?? part.mention.name }}</button><span
    v-if="part.target"
    class="men-card"
    role="tooltip"
  >
    <Avatar
      v-if="part.target.round"
      :src="part.target.image"
      :initials="part.target.name.slice(0, 2)"
      :size="40"
    />
    <span
      v-else
      class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-parchment-sunk text-earth"
    >
      <img
        v-if="part.target.image"
        :src="part.target.image"
        alt=""
        class="size-full object-cover"
      >
      <Icon
        v-else
        :name="part.target.icon ?? 'ui-link'"
        :size="20"
      />
    </span>
    <span class="min-w-0">
      <span class="meta block">{{ part.target.typeLabel }}<template v-if="part.target.gmOnly"> · {{ t("common.visibility.gm.short") }}</template></span>
      <b class="block font-heading text-[14px] text-brand">{{ part.target.name }}</b>
      <span
        v-if="part.target.summary"
        class="block text-[12.5px] text-ink-2"
      >{{ part.target.summary }}</span>
    </span>
  </span></span></template></span>
</template>
