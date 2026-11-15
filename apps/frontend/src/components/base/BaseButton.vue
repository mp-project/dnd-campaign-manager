<script setup lang="ts">
/**
 * Button with a fixed variant and size. Exactly one dominant primary action per context.
 * - `to` renders a RouterLink, `as="a"` (+ href) a link, `as="span"` a non-clickable marker.
 * - `icon` / `iconRight`: the icon size follows the button size; `iconSize` only for exceptions.
 * - `bare`: slot content without wrapper (partial labels, counters, own icons).
 * Icon-only buttons use IconButton, closing uses CloseButton.
 */
import { computed } from "vue";
import type { RouteLocationRaw } from "vue-router";

import Icon from "./Icon.vue";
import type { IconName } from "./iconNames";
import type { ButtonSize, ButtonVariant } from "./types";

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: IconName;
    iconRight?: IconName;
    iconSize?: number;
    iconRightSize?: number;
    to?: RouteLocationRaw;
    as?: "button" | "a" | "span";
    bare?: boolean;
    /** The label becomes aria-label and tooltip. */
    iconOnly?: boolean;
    label?: string;
    block?: boolean;
    type?: "button" | "submit" | "reset";
  }>(),
  { variant: "secondary", size: "lg", as: "button", type: "button" },
);

const ICON: Record<ButtonSize, number> = { lg: 20, md: 18, sm: 16, xs: 14 };
const ICON_ONLY: Record<ButtonSize, number> = { lg: 22, md: 20, sm: 18, xs: 16 };
const ICON_RIGHT: Record<ButtonSize, number> = { lg: 18, md: 18, sm: 16, xs: 14 };

const iconPx = computed(() => props.iconSize ?? (props.iconOnly ? ICON_ONLY : ICON)[props.size]);
const iconRightPx = computed(() => props.iconRightSize ?? ICON_RIGHT[props.size]);
const tag = computed(() => (props.to ? "RouterLink" : props.as));
</script>

<template>
  <component
    :is="tag"
    :to="to"
    :type="to || as !== 'button' ? undefined : type"
    :class="['btn', `btn-${variant}`, size !== 'lg' && `btn-${size}`, { 'btn-icon': iconOnly, 'w-full': block }]"
    :aria-label="iconOnly ? label : undefined"
    :title="iconOnly ? label : undefined"
  >
    <Icon
      v-if="icon"
      :name="icon"
      :size="iconPx"
    />
    <slot v-if="bare" />
    <span v-else-if="!iconOnly"><slot>{{ label }}</slot></span>
    <Icon
      v-if="iconRight"
      :name="iconRight"
      :size="iconRightPx"
    />
  </component>
</template>
