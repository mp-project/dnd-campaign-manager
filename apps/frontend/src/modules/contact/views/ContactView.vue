<script setup lang="ts">
/**
 * Contact form in the brand layout: first and last name, email, topic, message and the accepted
 * privacy policy, checked here before sending and again by the backend. Spam protection without a
 * captcha: a JS challenge solved in the background from the first focus in the form (`challenge.ts`)
 * and a field nobody sees (`website`). After sending, a thank-you replaces the form. Open to
 * everybody; the page asks the API only once the visitor starts on the form (so prerendering stays
 * without requests).
 */
import { computed, nextTick, reactive, ref } from "vue";
import { useRoute } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import CheckBox from "@/components/base/CheckBox.vue";
import FormField from "@/components/base/FormField.vue";
import Icon from "@/components/base/Icon.vue";
import SelectInput from "@/components/base/SelectInput.vue";
import TextArea from "@/components/base/TextArea.vue";
import TextInput from "@/components/base/TextInput.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import { errorMessageKey, isApiError } from "@/core/api/errors";
import { isEmail } from "@/core/auth/accountRules";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";
import { localizedPath, useLocalizedPage } from "@/core/i18n/localizedRoutes";
import { usePageMeta } from "@/core/seo/pageMeta";
import { absoluteUrl } from "@/core/seo/site";
import BrandLayout from "@/layouts/BrandLayout.vue";

import { CONTACT_TOPICS, type ContactTopic, sendContactMessage } from "../api";
import { ContactChallengeError, type ContactChallengeSolution, solveContactChallenge } from "../challenge";

/** The backend's limits, so the form refuses the same. */
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 5000;
const NAME_MAX = 100;

const { t } = useAppI18n();
const route = useRoute();
const faq = useLocalizedPage("landing-faq");

usePageMeta({
  title: () => t("contact.meta.title"),
  description: () => t("contact.meta.description"),
  structuredData: () => {
    const url = absoluteUrl(localizedPath("kontakt", route.meta.locale ?? "de"));
    return [
      {
        "@context": "https://schema.org",
        "@type": "ContactPage",
        url,
        name: t("contact.meta.title"),
        description: t("contact.meta.description"),
        inLanguage: String(route.meta.locale ?? "de"),
      },
    ];
  },
});

// i18n-dynamic: contact.topics.*
const topics = computed(() =>
  CONTACT_TOPICS.map((topic) => ({ value: topic, label: t(`contact.topics.${topic}` as MessageKey) })),
);

const empty = () => ({ firstName: "", lastName: "", email: "", topic: "" as ContactTopic | "", message: "", privacy: false, website: "" });
const form = reactive(empty());
const errors = reactive({ firstName: "", lastName: "", email: "", topic: "", message: "", privacy: "" });
const failure = ref("");
const busy = ref(false);
const sentTo = ref<string | null>(null);
const success = ref<HTMLElement | null>(null);

const counter = computed(() => t("contact.fields.messageCounter", { count: form.message.length, max: MESSAGE_MAX }));

function validate(): boolean {
  errors.firstName = form.firstName.trim() ? "" : t("contact.validation.firstName");
  errors.lastName = form.lastName.trim() ? "" : t("contact.validation.lastName");
  errors.email = isEmail(form.email) ? "" : t("contact.validation.email");
  errors.topic = form.topic ? "" : t("contact.validation.topic");
  errors.message = form.message.trim().length >= MESSAGE_MIN ? "" : t("contact.validation.message", { min: MESSAGE_MIN });
  errors.privacy = form.privacy ? "" : t("contact.validation.privacy");
  return Object.values(errors).every((error) => !error);
}

// The JS challenge: one task per message, started when the visitor first enters the form.
let challenge: Promise<ContactChallengeSolution> | null = null;
function prepareChallenge(): Promise<ContactChallengeSolution> {
  if (!challenge) {
    const task = solveContactChallenge();
    challenge = task;
    // Awaited when sending; a failed task is forgotten, so the next try starts a new one.
    task.catch(() => {
      if (challenge === task) challenge = null;
    });
  }
  return challenge;
}
/** The backend refused the task (expired, used …): worth one more try with a new one. */
function challengeRefused(error: unknown): boolean {
  return isApiError(error) && error.status === 400 && typeof (error.details as { challenge?: unknown } | undefined)?.challenge === "string";
}

function errorText(error: unknown): string {
  if (error instanceof ContactChallengeError || challengeRefused(error)) return t("contact.challengeFailed");
  if (isApiError(error) && error.code === "RATE_LIMITED" && error.retryAfterSeconds) {
    const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
    return t("contact.retryAfter", minutes, { minutes });
  }
  return t(errorMessageKey(error));
}

async function submit(): Promise<void> {
  failure.value = "";
  if (!validate() || !form.topic) return;

  busy.value = true;
  const email = form.email.trim();
  const message = {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email,
    topic: form.topic,
    message: form.message.trim(),
    privacyAccepted: true as const,
    ...(form.website ? { website: form.website } : {}),
  };
  const send = async () => {
    const solved = await prepareChallenge();
    // Every task counts once, whatever the answer.
    challenge = null;
    await sendContactMessage({ ...message, challenge: solved });
  };
  try {
    try {
      await send();
    } catch (error) {
      if (!challengeRefused(error)) throw error;
      await send();
    }
    sentTo.value = email;
    Object.assign(form, empty());
    await nextTick();
    success.value?.focus();
  } catch (error) {
    failure.value = errorText(error);
  } finally {
    busy.value = false;
  }
}

function writeAgain(): void {
  sentTo.value = null;
}
</script>

<template>
  <BrandLayout
    :title="t('contact.title')"
    :subtitle="t('contact.subtitle')"
    size="wide"
  >
    <div
      v-if="sentTo"
      ref="success"
      tabindex="-1"
      class="flex flex-col items-center py-4 text-center outline-none"
      role="status"
    >
      <span class="flex size-16 items-center justify-center rounded-full border border-gold bg-parchment text-ok shadow-soft">
        <Icon
          name="ui-check-circle"
          :size="32"
        />
      </span>
      <h2 class="section-title mt-5">
        {{ t("contact.success.title") }}
      </h2>
      <p class="mt-2 max-w-120 text-ink-2">
        {{ t("contact.success.text", { email: sentTo }) }}
      </p>
      <BaseButton
        variant="secondary"
        size="md"
        class="mt-6"
        @click="writeAgain"
      >
        {{ t("contact.success.again") }}
      </BaseButton>
    </div>

    <template v-else>
      <InfoNote icon="orig-info">
        {{ t("contact.faqHint") }}
        <RouterLink
          :to="faq"
          class="ml-1 font-medium text-info underline underline-offset-4"
        >
          {{ t("contact.faqLink") }}
        </RouterLink>
      </InfoNote>

      <form
        class="mt-6 grid gap-4 md:grid-cols-2"
        novalidate
        @focusin="prepareChallenge"
        @submit.prevent="submit"
      >
        <FormField
          v-slot="field"
          :label="t('contact.fields.firstName')"
          :error="errors.firstName"
          required
        >
          <TextInput
            :id="field.id"
            v-model="form.firstName"
            autocomplete="given-name"
            :maxlength="NAME_MAX"
            :invalid="field.invalid"
            :aria-describedby="field.describedby"
          />
        </FormField>
        <FormField
          v-slot="field"
          :label="t('contact.fields.lastName')"
          :error="errors.lastName"
          required
        >
          <TextInput
            :id="field.id"
            v-model="form.lastName"
            autocomplete="family-name"
            :maxlength="NAME_MAX"
            :invalid="field.invalid"
            :aria-describedby="field.describedby"
          />
        </FormField>
        <FormField
          v-slot="field"
          :label="t('contact.fields.email')"
          :hint="t('contact.fields.emailHint')"
          :error="errors.email"
          required
          wide
        >
          <TextInput
            :id="field.id"
            v-model="form.email"
            type="email"
            icon="ui-mail"
            autocomplete="email"
            autocapitalize="none"
            spellcheck="false"
            maxlength="320"
            :invalid="field.invalid"
            :aria-describedby="field.describedby"
          />
        </FormField>
        <FormField
          v-slot="field"
          :label="t('contact.fields.topic')"
          :error="errors.topic"
          required
          wide
        >
          <SelectInput
            :id="field.id"
            v-model="form.topic"
            :options="topics"
            :placeholder="t('contact.fields.topicPlaceholder')"
            :invalid="field.invalid"
            :aria-describedby="field.describedby"
          />
        </FormField>
        <FormField
          v-slot="field"
          :label="t('contact.fields.message')"
          :error="errors.message"
          :counter="counter"
          required
          wide
        >
          <TextArea
            :id="field.id"
            v-model="form.message"
            :rows="7"
            :maxlength="MESSAGE_MAX"
            :invalid="field.invalid"
            :aria-describedby="field.describedby"
          />
        </FormField>

        <!-- Nobody fills this in but bots: hidden from sight, keyboard and screen readers. -->
        <div
          class="honeypot"
          aria-hidden="true"
        >
          <label for="contact-website">{{ t("contact.fields.website") }}</label>
          <input
            id="contact-website"
            v-model="form.website"
            type="text"
            name="website"
            tabindex="-1"
            autocomplete="off"
          >
        </div>

        <div class="md:col-span-2">
          <CheckBox
            v-model="form.privacy"
            :label="t('contact.fields.privacy')"
          />
          <!-- New tab, so the filled-in form stays. -->
          <RouterLink
            :to="{ name: 'legal-privacy' }"
            target="_blank"
            class="ml-8 inline-flex min-h-11 items-center text-info underline underline-offset-4"
          >
            {{ t("common.legal.readPrivacy") }}
          </RouterLink>
          <p
            v-if="errors.privacy"
            class="flex items-center gap-1.5 text-[14px] text-danger"
          >
            <Icon
              name="ui-alert"
              :size="16"
            />{{ errors.privacy }}
          </p>
        </div>

        <InfoNote
          v-if="failure"
          tone="danger"
          announce
          class="md:col-span-2"
        >
          {{ failure }}
        </InfoNote>

        <div class="md:col-span-2 md:flex md:justify-end">
          <BaseButton
            variant="primary"
            type="submit"
            icon="ui-mail"
            class="w-full md:w-auto"
            :disabled="busy"
          >
            {{ t("contact.submit") }}
          </BaseButton>
        </div>
      </form>
    </template>
  </BrandLayout>
</template>

<style scoped>
.honeypot {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
