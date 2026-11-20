<script setup lang="ts">
/**
 * Accepting an invitation from its email (`/invitations/accept#token=…`, the address the backend
 * links). The token moves from the address into this tab's session storage and out of the URL,
 * so it stays out of the history and of the sign-in's `redirect`. Without a session the page leads
 * to sign-in or registration and back here; signed in, it names the account and accepts on a
 * click, then opens the campaign. Errors say what to do: other address, expired, answered
 * meanwhile, unconfirmed. A used-up token is forgotten; after a 404 (often the wrong account) it
 * stays, and the page offers to sign in with another account. A damaged link counts as none and
 * also discards a stored token, so it never answers an older invitation.
 */
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import { meQuery, signOut } from "@/core/auth/session";
import { campaignHomePath, campaignQuery, myCampaignsQuery } from "@/core/campaign/campaign";
import { useAppI18n } from "@/core/i18n";
import BrandLayout from "@/layouts/BrandLayout.vue";

import { acceptInvitationByToken } from "../api";
import { isApiError } from "@/core/api/errors";
import { isUsedUpInvitationError, useInvitationErrorText } from "../errors";
import { myInvitationsQuery } from "../queries";

const STORAGE_KEY = "questaria.invitation-token";
const HERE = "/invitations/accept";

const { t } = useAppI18n();
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const me = useQuery({ ...meQuery, retry: false });
const signedIn = computed(() => !!me.data.value);

function stored(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function store(value: string | null): void {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, value);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Without storage the token lives as long as this page.
  }
}

/**
 * The token of the address: a string, `"damaged"` for a link that names a token but carries none
 * that can be read, or null for an address without one (then the stored token counts).
 */
function tokenOfAddress(hash: string): string | "damaged" | null {
  if (!/(?:^#|&)token=/.test(hash)) return null;
  const raw = /(?:^#|&)token=([^&]*)/.exec(hash)?.[1] ?? "";
  try {
    const decoded = decodeURIComponent(raw).trim();
    return decoded ? decoded : "damaged";
  } catch {
    return "damaged";
  }
}
const fromAddress = tokenOfAddress(route.hash);
// A damaged link must never fall back to an older stored token: that would answer another invitation.
const token = ref<string | null>(fromAddress === "damaged" ? null : (fromAddress ?? stored()));
onMounted(() => {
  if (fromAddress === "damaged") store(null);
  else if (fromAddress) store(fromAddress);
  // Never leave a token in the address, also not a damaged one.
  if (route.hash) void router.replace({ path: HERE, hash: "" });
});

const busy = ref(false);
const failure = ref("");
/** The token was used up: the page says why and offers no second try. */
const used = ref(false);

const errorText = useInvitationErrorText();

async function accept(): Promise<void> {
  if (!token.value) return;
  busy.value = true;
  failure.value = "";
  try {
    const { campaignId } = await acceptInvitationByToken(token.value);
    store(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: myCampaignsQuery.queryKey }),
      queryClient.invalidateQueries({ queryKey: myInvitationsQuery.queryKey }),
    ]);
    const campaign = await queryClient.fetchQuery(campaignQuery(campaignId));
    await router.push(campaignHomePath(campaign));
  } catch (error) {
    failure.value = errorText(error);
    // A used-up token is of no use for any account; after a 404 the right one may still sign in.
    if (isUsedUpInvitationError(error)) {
      store(null);
      used.value = true;
    }
    otherAccount.value = isApiError(error) && error.status === 404;
  } finally {
    busy.value = false;
  }
}

const passOn = { redirect: HERE };

// Signed in with another account than the invited one: sign out here and come back after signing in.
const otherAccount = ref(false);
async function switchAccount(): Promise<void> {
  busy.value = true;
  await signOut(queryClient).catch(() => undefined);
  await router.push({ name: "auth-login", query: passOn });
}
</script>

<template>
  <BrandLayout
    :title="t('campaign-invitations.accept.title')"
    :subtitle="t('campaign-invitations.accept.subtitle')"
  >
    <p
      v-if="me.isPending.value"
      class="text-center text-ink-2"
    >
      {{ t("common.states.loading") }}
    </p>

    <InfoNote
      v-else-if="!token"
      tone="warn"
    >
      {{ t("campaign-invitations.accept.noToken") }}
    </InfoNote>

    <template v-else-if="!signedIn">
      <p class="text-center text-ink-2">
        {{ t("campaign-invitations.accept.signInFirst") }}
      </p>
      <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <BaseButton
          variant="primary"
          :to="{ name: 'auth-login', query: passOn }"
        >
          {{ t("campaign-invitations.accept.signIn") }}
        </BaseButton>
        <BaseButton :to="{ name: 'auth-register', query: passOn }">
          {{ t("campaign-invitations.accept.register") }}
        </BaseButton>
      </div>
    </template>

    <template v-else>
      <p class="text-center text-ink-2">
        {{ t("campaign-invitations.accept.signedInAs", { name: me.data.value?.displayName ?? "", email: me.data.value?.email ?? "" }) }}
      </p>
      <p class="mt-2 text-center font-semibold text-heading">
        {{ t("campaign-invitations.accept.question") }}
      </p>
      <InfoNote
        v-if="failure"
        tone="danger"
        announce
        class="mt-4"
      >
        {{ failure }}
      </InfoNote>
      <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <BaseButton
          v-if="!used"
          variant="primary"
          icon="ui-check"
          :disabled="busy"
          @click="accept"
        >
          {{ t("campaign-invitations.accept.submit") }}
        </BaseButton>
        <BaseButton
          v-if="otherAccount"
          icon="aktion-abmelden"
          :disabled="busy"
          @click="switchAccount"
        >
          {{ t("campaign-invitations.accept.switchAccount") }}
        </BaseButton>
        <BaseButton
          v-else
          to="/dashboard"
        >
          {{ t("campaign-invitations.accept.toDashboard") }}
        </BaseButton>
      </div>
    </template>
  </BrandLayout>
</template>
