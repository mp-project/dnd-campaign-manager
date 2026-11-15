<script setup lang="ts">
/**
 * Parchment work surface with the fine golden double frame and the four corner ornaments. The
 * corners keep their size (28 px desktop, 22 px mobile, 18 px for `sm` boxes), the edges grow.
 */
withDefaults(defineProps<{ size?: "md" | "sm"; tag?: string }>(), { size: "md", tag: "div" });

const corners = ["oben-links", "oben-rechts", "unten-links", "unten-rechts"] as const;
const base = import.meta.env.BASE_URL;
</script>

<template>
  <component
    :is="tag"
    class="parchment-frame parchment on-parchment"
    :class="`frame-${size}`"
  >
    <img
      v-for="corner in corners"
      :key="corner"
      :src="`${base}assets/deko/ecke-${corner}.png`"
      alt=""
      aria-hidden="true"
      class="frame-corner"
      :class="`corner-${corner}`"
    >
    <slot />
  </component>
</template>

<style scoped>
.frame-corner {
  position: absolute;
  z-index: 1;
  width: 22px;
  height: 22px;
  pointer-events: none;
}
@media (min-width: 768px) {
  .frame-md .frame-corner {
    width: 28px;
    height: 28px;
  }
}
.frame-sm .frame-corner {
  width: 18px;
  height: 18px;
}
.corner-oben-links {
  top: 1px;
  left: 1px;
}
.corner-oben-rechts {
  top: 1px;
  right: 1px;
}
.corner-unten-links {
  bottom: 1px;
  left: 1px;
}
.corner-unten-rechts {
  right: 1px;
  bottom: 1px;
}
</style>
