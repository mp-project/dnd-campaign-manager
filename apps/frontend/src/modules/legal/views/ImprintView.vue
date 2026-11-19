<script setup lang="ts">
/** Legal notice (Impressum); example content until the real details are known. */
import LegalDocument, { type LegalSection } from "../components/LegalDocument.vue";

const sections: LegalSection[] = [
  { id: "provider", title: "legal.imprint.provider.title", body: "legal.imprint.provider.body" },
  { id: "contact", title: "legal.imprint.contact.title", body: "legal.imprint.contact.body" },
  { id: "represented", title: "legal.imprint.represented.title", body: "legal.imprint.represented.body" },
  { id: "register", title: "legal.imprint.register.title", body: "legal.imprint.register.body" },
  { id: "vat", title: "legal.imprint.vat.title", body: "legal.imprint.vat.body" },
  { id: "editorial", title: "legal.imprint.editorial.title", body: "legal.imprint.editorial.body" },
  { id: "dispute", title: "legal.imprint.dispute.title", body: "legal.imprint.dispute.body" },
  { id: "content", title: "legal.imprint.content.title", body: "legal.imprint.content.body" },
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
