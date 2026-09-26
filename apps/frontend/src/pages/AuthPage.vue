<template>
  <section class="grid gap-6">
    <nav
      class="grid gap-2 rounded-2xl border border-black/10 bg-white/80 p-2 sm:grid-cols-3"
      aria-label="Authentication templates"
    >
      <RouterLink
        :to="{ name: 'auth-login' }"
        class="rounded-xl px-3 py-2 text-center text-sm font-semibold transition"
        :class="mode === 'login' ? 'bg-spruce text-white' : 'text-ink/80 hover:bg-black/5'"
      >
        Login
      </RouterLink>
      <RouterLink
        :to="{ name: 'auth-register' }"
        class="rounded-xl px-3 py-2 text-center text-sm font-semibold transition"
        :class="mode === 'register' ? 'bg-spruce text-white' : 'text-ink/80 hover:bg-black/5'"
      >
        Registrierung
      </RouterLink>
      <RouterLink
        :to="{ name: 'auth-reset-password' }"
        class="rounded-xl px-3 py-2 text-center text-sm font-semibold transition"
        :class="mode === 'reset-password' ? 'bg-spruce text-white' : 'text-ink/80 hover:bg-black/5'"
      >
        Passwort Reset
      </RouterLink>
    </nav>

    <article class="rounded-2xl border border-black/10 bg-white/80 p-5 shadow-sm">
      <header class="mb-5">
        <h2 class="text-xl font-semibold text-ink">{{ title }}</h2>
        <p class="mt-1 text-sm text-ink/70">{{ subtitle }}</p>
      </header>

      <p
        v-if="formError"
        class="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {{ formError }}
      </p>
      <p
        v-else-if="formSuccess"
        class="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
      >
        {{ formSuccess }}
      </p>

      <form
        v-if="mode === 'login'"
        class="grid gap-4"
        @submit.prevent="onLoginSubmit"
      >
        <label class="grid gap-1.5 text-sm text-ink/85">
          E-Mail
          <input
            v-model.trim="loginEmail"
            type="email"
            autocomplete="email"
            placeholder="hero@campaign.example"
            class="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-spruce focus:ring-2 focus:ring-spruce/20"
          >
        </label>

        <label class="grid gap-1.5 text-sm text-ink/85">
          Passwort
          <input
            v-model="loginPassword"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••••••"
            class="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-spruce focus:ring-2 focus:ring-spruce/20"
          >
        </label>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <label class="inline-flex items-center gap-2 text-sm text-ink/80">
            <input
              type="checkbox"
              class="h-4 w-4 rounded border-black/20"
            >
            Eingeloggt bleiben
          </label>
          <RouterLink
            :to="{ name: 'auth-reset-password' }"
            class="text-sm font-medium text-spruce hover:underline"
          >
            Passwort vergessen?
          </RouterLink>
        </div>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="mt-2 rounded-xl bg-spruce px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-spruce/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {{ isSubmitting ? "Login läuft..." : "Login" }}
        </button>

        <div class="mt-1 grid gap-3">
          <p class="text-xs font-semibold uppercase tracking-[0.08em] text-ink/55">
            oder mit OAuth
          </p>
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              :disabled="isSubmitting"
              class="rounded-xl border border-black/15 bg-white px-3 py-2 text-center text-sm font-semibold text-ink/85 transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60"
              @click="startOAuth('GOOGLE', 'login')"
            >
              Mit Google fortfahren
            </button>
            <button
              type="button"
              :disabled="isSubmitting"
              class="rounded-xl border border-black/15 bg-white px-3 py-2 text-center text-sm font-semibold text-ink/85 transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60"
              @click="startOAuth('DISCORD', 'login')"
            >
              Mit Discord fortfahren
            </button>
          </div>
        </div>
      </form>

      <form
        v-else-if="mode === 'register'"
        class="grid gap-4"
        @submit.prevent="onRegisterSubmit"
      >
        <p
          v-if="isOAuthRegistrationFlow"
          class="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800"
        >
          OAuth-Registrierung: Bitte Anzeigename und Zustimmung ergänzen, um den Account abzuschließen.
        </p>

        <label class="grid gap-1.5 text-sm text-ink/85">
          Anzeigename
          <input
            v-model.trim="registerDisplayName"
            type="text"
            autocomplete="nickname"
            placeholder="Ela Frostblade"
            class="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-spruce focus:ring-2 focus:ring-spruce/20"
          >
        </label>

        <template v-if="!isOAuthRegistrationFlow">
          <label class="grid gap-1.5 text-sm text-ink/85">
            E-Mail
            <input
              v-model.trim="registerEmail"
              type="email"
              autocomplete="email"
              placeholder="hero@campaign.example"
              class="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-spruce focus:ring-2 focus:ring-spruce/20"
            >
          </label>

          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1.5 text-sm text-ink/85">
              Passwort
              <input
                v-model="registerPassword"
                type="password"
                autocomplete="new-password"
                placeholder="Mindestens 12 Zeichen"
                class="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-spruce focus:ring-2 focus:ring-spruce/20"
              >
            </label>
            <label class="grid gap-1.5 text-sm text-ink/85">
              Passwort wiederholen
              <input
                v-model="registerPasswordConfirmation"
                type="password"
                autocomplete="new-password"
                placeholder="Zur Bestätigung"
                class="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-spruce focus:ring-2 focus:ring-spruce/20"
              >
            </label>
          </div>
        </template>

        <label class="inline-flex items-start gap-2 text-sm text-ink/80">
          <input
            v-model="registerPrivacyAccepted"
            type="checkbox"
            class="mt-0.5 h-4 w-4 rounded border-black/20"
          >
          <span>
            Ich akzeptiere die Nutzungsbedingungen und Datenschutzrichtlinie.
          </span>
        </label>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="mt-2 rounded-xl bg-spruce px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-spruce/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {{ registerSubmitLabel }}
        </button>

        <div
          v-if="!isOAuthRegistrationFlow"
          class="mt-1 grid gap-3"
        >
          <p class="text-xs font-semibold uppercase tracking-[0.08em] text-ink/55">
            oder per OAuth registrieren
          </p>
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              :disabled="isSubmitting"
              class="rounded-xl border border-black/15 bg-white px-3 py-2 text-center text-sm font-semibold text-ink/85 transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60"
              @click="startOAuth('GOOGLE', 'register')"
            >
              Mit Google registrieren
            </button>
            <button
              type="button"
              :disabled="isSubmitting"
              class="rounded-xl border border-black/15 bg-white px-3 py-2 text-center text-sm font-semibold text-ink/85 transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60"
              @click="startOAuth('DISCORD', 'register')"
            >
              Mit Discord registrieren
            </button>
          </div>
        </div>
      </form>

      <form
        v-else
        class="grid gap-4"
        @submit.prevent="onResetSubmit"
      >
        <template v-if="hasResetToken">
          <label class="grid gap-1.5 text-sm text-ink/85">
            Reset-Link Token
            <input
              type="text"
              :value="tokenFromLink"
              readonly
              placeholder="Token wird aus dem Link gelesen"
              class="rounded-xl border border-black/15 bg-parchment px-3 py-2 text-sm text-ink/80 outline-none"
            >
          </label>

          <label class="grid gap-1.5 text-sm text-ink/85">
            Neues Passwort
            <input
              v-model="resetPassword"
              type="password"
              autocomplete="new-password"
              placeholder="Mindestens 12 Zeichen"
              class="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-spruce focus:ring-2 focus:ring-spruce/20"
            >
          </label>

          <label class="grid gap-1.5 text-sm text-ink/85">
            Neues Passwort wiederholen
            <input
              v-model="resetPasswordConfirmation"
              type="password"
              autocomplete="new-password"
              placeholder="Zur Bestätigung"
              class="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-spruce focus:ring-2 focus:ring-spruce/20"
            >
          </label>

          <p class="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Der Token wird direkt aus der URL genutzt und einmalig an den Reset-Endpunkt gesendet.
          </p>
        </template>

        <template v-else>
          <label class="grid gap-1.5 text-sm text-ink/85">
            E-Mail für Reset-Link
            <input
              v-model.trim="forgotEmail"
              type="email"
              autocomplete="email"
              placeholder="hero@campaign.example"
              class="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-spruce focus:ring-2 focus:ring-spruce/20"
            >
          </label>

          <p class="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Ohne Token wird ein Passwort-Reset-Link per E-Mail angefordert.
          </p>
        </template>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="mt-2 rounded-xl bg-spruce px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-spruce/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {{ resetSubmitLabel }}
        </button>
      </form>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

const props = defineProps<{
  mode: "login" | "register" | "reset-password";
}>();

const route = useRoute();
const router = useRouter();
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

const loginEmail = ref("");
const loginPassword = ref("");

const registerDisplayName = ref("");
const registerEmail = ref("");
const registerPassword = ref("");
const registerPasswordConfirmation = ref("");
const registerPrivacyAccepted = ref(false);

const forgotEmail = ref("");
const resetPassword = ref("");
const resetPasswordConfirmation = ref("");

const formError = ref("");
const formSuccess = ref("");
const isSubmitting = ref(false);

type OAuthProvider = "GOOGLE" | "DISCORD";
type OAuthIntent = "login" | "register";
type OAuthCallbackStatus = "success" | "registration_required" | "error";

const isOAuthCallbackRoute = computed(() => route.name === "auth-callback");

const tokenFromLink = computed(() => {
  const value = singleQueryValue(route.query.token);
  return value ?? "";
});

const hasResetToken = computed(() => tokenFromLink.value.length > 0);

const isOAuthRegistrationFlow = computed(
  () => props.mode === "register" && singleQueryValue(route.query.oauth) === "1",
);

const oauthCallbackStatus = computed<OAuthCallbackStatus | null>(() => {
  const status = singleQueryValue(route.query.status);

  if (status === "success" || status === "registration_required" || status === "error") {
    return status;
  }

  return null;
});

const registerSubmitLabel = computed(() => {
  if (isSubmitting.value) {
    return isOAuthRegistrationFlow.value
      ? "OAuth-Registrierung läuft..."
      : "Registrierung läuft...";
  }

  return isOAuthRegistrationFlow.value ? "OAuth-Registrierung abschließen" : "Registrierung";
});

const resetSubmitLabel = computed(() => {
  if (isSubmitting.value) {
    return hasResetToken.value ? "Passwort wird zurückgesetzt..." : "Link wird gesendet...";
  }

  return hasResetToken.value ? "Passwort zurücksetzen" : "Reset-Link senden";
});

const title = computed(() => {
  if (props.mode === "register") {
    return "Registrierung";
  }

  if (props.mode === "reset-password") {
    return "Passwort zurücksetzen";
  }

  if (isOAuthCallbackRoute.value) {
    return "OAuth Rückmeldung";
  }

  return "Login";
});

const subtitle = computed(() => {
  if (props.mode === "register") {
    return isOAuthRegistrationFlow.value
      ? "Vervollständige deine OAuth-Registrierung mit Anzeigename und Zustimmung."
      : "Lege ein Konto an und starte direkt in deine Kampagnen.";
  }

  if (props.mode === "reset-password") {
    return hasResetToken.value
      ? "Setze dein Passwort mit einem gültigen Einmal-Link zurück."
      : "Fordere einen neuen Passwort-Reset-Link per E-Mail an.";
  }

  if (isOAuthCallbackRoute.value) {
    if (oauthCallbackStatus.value === "success") {
      return "Anmeldung erfolgreich. Du wirst weitergeleitet...";
    }

    if (oauthCallbackStatus.value === "registration_required") {
      return "Bitte ergänze deine Angaben für die Kontoerstellung.";
    }

    if (oauthCallbackStatus.value === "error") {
      return "Der OAuth-Start war nicht möglich. Bitte nutze Login/Registrierung oder prüfe die Provider-Konfiguration.";
    }
  }

  return "Melde dich mit E-Mail und Passwort an.";
});

onMounted(async () => {
  if (!isOAuthCallbackRoute.value) {
    return;
  }

  const status = oauthCallbackStatus.value;

  if (status === "success") {
    await router.replace(getRedirectPath());
    return;
  }

  if (status === "registration_required") {
    await router.replace({
      name: "auth-register",
      query: {
        oauth: "1",
        redirect: getRedirectPath(),
      },
    });
    return;
  }

  if (status === "error") {
    formError.value = getOAuthErrorMessage();
  }
});

function singleQueryValue(value: unknown): string | null {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : null;
  }

  return typeof value === "string" ? value : null;
}

function clearFeedback(): void {
  formError.value = "";
  formSuccess.value = "";
}

function normalizeRedirectPath(value: unknown): string {
  if (typeof value !== "string") {
    return "/";
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/";
  }

  return trimmed;
}

function getRedirectPath(): string {
  return normalizeRedirectPath(singleQueryValue(route.query.redirect));
}

function toAbsoluteApiUrl(path: string): string {
  return new URL(`${apiBaseUrl}${path}`, window.location.origin).toString();
}

async function postJson(path: string, payload: unknown): Promise<unknown> {
  const response = await fetch(toAbsoluteApiUrl(path), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return body;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Die Anfrage konnte nicht verarbeitet werden.";
}

function getOAuthErrorMessage(): string {
  const reason = singleQueryValue(route.query.reason);
  const provider = singleQueryValue(route.query.provider);

  if (reason === "provider_unavailable") {
    if (provider === "GOOGLE") {
      return "Google OAuth ist aktuell nicht konfiguriert.";
    }

    if (provider === "DISCORD") {
      return "Discord OAuth ist aktuell nicht konfiguriert.";
    }

    return "OAuth ist aktuell nicht konfiguriert.";
  }

  return "OAuth konnte nicht gestartet werden. Bitte erneut versuchen.";
}

async function onLoginSubmit(): Promise<void> {
  clearFeedback();

  if (!loginEmail.value || !loginPassword.value) {
    formError.value = "Bitte E-Mail und Passwort ausfüllen.";
    return;
  }

  isSubmitting.value = true;

  try {
    await postJson("/auth/login", {
      email: loginEmail.value,
      password: loginPassword.value,
    });

    formSuccess.value = "Login erfolgreich.";
    await router.push(getRedirectPath());
  } catch (error) {
    formError.value = getErrorMessage(error);
  } finally {
    isSubmitting.value = false;
  }
}

async function onRegisterSubmit(): Promise<void> {
  clearFeedback();

  if (!registerDisplayName.value) {
    formError.value = "Bitte einen Anzeigenamen eingeben.";
    return;
  }

  if (!registerPrivacyAccepted.value) {
    formError.value = "Bitte akzeptiere die Nutzungsbedingungen und Datenschutzrichtlinie.";
    return;
  }

  isSubmitting.value = true;

  try {
    if (isOAuthRegistrationFlow.value) {
      await postJson("/auth/oauth/complete-registration", {
        displayName: registerDisplayName.value,
        privacyAccepted: true,
      });

      formSuccess.value = "OAuth-Registrierung abgeschlossen.";
      await router.push(getRedirectPath());
      return;
    }

    if (!registerEmail.value || !registerPassword.value) {
      formError.value = "Bitte alle Pflichtfelder ausfüllen.";
      return;
    }

    if (registerPassword.value.length < 12) {
      formError.value = "Das Passwort muss mindestens 12 Zeichen lang sein.";
      return;
    }

    if (registerPassword.value !== registerPasswordConfirmation.value) {
      formError.value = "Die Passwortbestätigung stimmt nicht überein.";
      return;
    }

    await postJson("/auth/register", {
      displayName: registerDisplayName.value,
      email: registerEmail.value,
      password: registerPassword.value,
    });

    formSuccess.value = "Registrierung erfolgreich. Du kannst dich jetzt einloggen.";
    await router.push({ name: "auth-login" });
  } catch (error) {
    formError.value = getErrorMessage(error);
  } finally {
    isSubmitting.value = false;
  }
}

async function onResetSubmit(): Promise<void> {
  clearFeedback();
  isSubmitting.value = true;

  try {
    if (hasResetToken.value) {
      if (!resetPassword.value) {
        formError.value = "Bitte ein neues Passwort eingeben.";
        return;
      }

      if (resetPassword.value.length < 12) {
        formError.value = "Das neue Passwort muss mindestens 12 Zeichen lang sein.";
        return;
      }

      if (resetPassword.value !== resetPasswordConfirmation.value) {
        formError.value = "Die Passwortbestätigung stimmt nicht überein.";
        return;
      }

      await postJson("/auth/reset-password", {
        token: tokenFromLink.value,
        newPassword: resetPassword.value,
      });

      formSuccess.value = "Passwort erfolgreich zurückgesetzt. Du kannst dich jetzt anmelden.";
      resetPassword.value = "";
      resetPasswordConfirmation.value = "";
      await router.push({ name: "auth-login" });
      return;
    }

    if (!forgotEmail.value) {
      formError.value = "Bitte eine E-Mail-Adresse eingeben.";
      return;
    }

    await postJson("/auth/forgot-password", {
      email: forgotEmail.value,
    });

    formSuccess.value = "Wenn die E-Mail existiert, wurde ein Reset-Link versendet.";
  } catch (error) {
    formError.value = getErrorMessage(error);
  } finally {
    isSubmitting.value = false;
  }
}

function buildOAuthStartUrl(provider: OAuthProvider, intent: OAuthIntent): string {
  const url = new URL(
    `${apiBaseUrl}/auth/oauth/${provider}/start`,
    window.location.origin,
  );

  url.searchParams.set("intent", intent);
  url.searchParams.set("redirect", getRedirectPath());

  return url.toString();
}

function startOAuth(provider: OAuthProvider, intent: OAuthIntent): void {
  clearFeedback();
  window.location.assign(buildOAuthStartUrl(provider, intent));
}
</script>
