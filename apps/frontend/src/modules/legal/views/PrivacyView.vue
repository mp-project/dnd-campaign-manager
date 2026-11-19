<script setup lang="ts">
/** Privacy policy; example content until it is written and reviewed. */
import LegalDocument, { type LegalSection } from "../components/LegalDocument.vue";

const sections: LegalSection[] = [
  { id: "controller", title: "legal.privacy.controller.title", body: "legal.privacy.controller.body" },
  { id: "account", title: "legal.privacy.account.title", body: "legal.privacy.account.body" },
  { id: "content", title: "legal.privacy.content.title", body: "legal.privacy.content.body" },
  { id: "oauth", title: "legal.privacy.oauth.title", body: "legal.privacy.oauth.body" },
  { id: "cookies", title: "legal.privacy.cookies.title", body: "legal.privacy.cookies.body" },
  { id: "security", title: "legal.privacy.security.title", body: "legal.privacy.security.body" },
  { id: "email", title: "legal.privacy.email.title", body: "legal.privacy.email.body" },
  { id: "push", title: "legal.privacy.push.title", body: "legal.privacy.push.body" },
  { id: "retention", title: "legal.privacy.retention.title", body: "legal.privacy.retention.body" },
  { id: "rights", title: "legal.privacy.rights.title", body: "legal.privacy.rights.body" },
];
</script>

<template>
  <LegalDocument
    title="legal.privacy.title"
    subtitle="legal.privacy.subtitle"
    description="legal.privacy.description"
    :sections="sections"
  />
</template>
