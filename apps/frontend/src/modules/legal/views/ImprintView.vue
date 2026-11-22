<script setup lang="ts">
/** Legal notice (Impressum) according to § 5 DDG: the eRecht24 text word for word. */
import LegalDocument, { type LegalSection } from "../components/LegalDocument.vue";

const sections: LegalSection[] = [
  { id: "provider", title: "legal.imprint.provider.title", body: "legal.imprint.provider.body" },
  { id: "contact", title: "legal.imprint.contact.title", body: "legal.imprint.contact.body" },
  { id: "source", body: "legal.imprint.source.body" },
];
</script>

<template>
  <LegalDocument
    title="legal.imprint.title"
    subtitle="legal.imprint.subtitle"
    description="legal.imprint.description"
    :sections="sections"
  />
</template>
