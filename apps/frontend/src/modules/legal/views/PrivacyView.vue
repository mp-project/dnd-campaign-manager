<script setup lang="ts">
/**
 * Privacy policy: the eRecht24 text word for word, extended by the services Questaria uses in the
 * same style (template: qrcodly.de/de/privacy-policy), in its chapters.
 */
import CookieDeclaration from "../components/CookieDeclaration.vue";
import LegalDocument, { type LegalSection } from "../components/LegalDocument.vue";

const sections: LegalSection[] = [
  { id: "general", title: "legal.privacy.general.title", body: "legal.privacy.general.body", chapter: "legal.privacy.chapters.overview" },
  { id: "collection", title: "legal.privacy.collection.title", body: "legal.privacy.collection.body" },
  { id: "thirdParty", title: "legal.privacy.thirdParty.title", body: "legal.privacy.thirdParty.body" },
  { id: "hetzner", title: "legal.privacy.hetzner.title", body: "legal.privacy.hetzner.body", chapter: "legal.privacy.chapters.hosting" },
  { id: "cloudflare", title: "legal.privacy.cloudflare.title", body: "legal.privacy.cloudflare.body" },
  { id: "privacy", title: "legal.privacy.privacy.title", body: "legal.privacy.privacy.body", chapter: "legal.privacy.chapters.duties" },
  { id: "controller", title: "legal.privacy.controller.title", body: "legal.privacy.controller.body" },
  { id: "retention", title: "legal.privacy.retention.title", body: "legal.privacy.retention.body" },
  { id: "legalBasis", title: "legal.privacy.legalBasis.title", body: "legal.privacy.legalBasis.body" },
  { id: "recipients", title: "legal.privacy.recipients.title", body: "legal.privacy.recipients.body" },
  { id: "revocation", title: "legal.privacy.revocation.title", body: "legal.privacy.revocation.body" },
  { id: "objection", title: "legal.privacy.objection.title", body: "legal.privacy.objection.body" },
  { id: "complaint", title: "legal.privacy.complaint.title", body: "legal.privacy.complaint.body" },
  { id: "portability", title: "legal.privacy.portability.title", body: "legal.privacy.portability.body" },
  { id: "access", title: "legal.privacy.access.title", body: "legal.privacy.access.body" },
  { id: "restriction", title: "legal.privacy.restriction.title", body: "legal.privacy.restriction.body" },
  { id: "encryption", title: "legal.privacy.encryption.title", body: "legal.privacy.encryption.body" },
  { id: "cookies", title: "legal.privacy.cookies.title", body: "legal.privacy.cookies.body", chapter: "legal.privacy.chapters.website" },
  { id: "consent", title: "legal.privacy.consent.title", body: "legal.privacy.consent.body" },
  { id: "contact", title: "legal.privacy.contact.title", body: "legal.privacy.contact.body" },
  { id: "data", title: "legal.privacy.data.title", body: "legal.privacy.data.body", chapter: "legal.privacy.chapters.platform" },
  { id: "account", title: "legal.privacy.account.title", body: "legal.privacy.account.body" },
  { id: "oauth", title: "legal.privacy.oauth.title", body: "legal.privacy.oauth.body" },
  { id: "push", title: "legal.privacy.push.title", body: "legal.privacy.push.body" },
  { id: "googleTagManager", title: "legal.privacy.googleTagManager.title", body: "legal.privacy.googleTagManager.body", chapter: "legal.privacy.chapters.analytics" },
  { id: "googleAnalytics", title: "legal.privacy.googleAnalytics.title", body: "legal.privacy.googleAnalytics.body" },
  { id: "faro", title: "legal.privacy.faro.title", body: "legal.privacy.faro.body" },
  { id: "sentry", title: "legal.privacy.sentry.title", body: "legal.privacy.sentry.body", chapter: "legal.privacy.chapters.tools" },
  { id: "monitoring", title: "legal.privacy.monitoring.title", body: "legal.privacy.monitoring.body" },
  { id: "changes", body: "legal.privacy.changes.body", chapter: "legal.privacy.chapters.changes" },
  { id: "source", body: "legal.privacy.source.body" },
];
</script>

<template>
  <LegalDocument
    title="legal.privacy.title"
    subtitle="legal.privacy.subtitle"
    description="legal.privacy.description"
    :sections="sections"
  >
    <template #after-consent>
      <CookieDeclaration />
    </template>
  </LegalDocument>
</template>
