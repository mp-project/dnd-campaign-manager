<template>
  <section class="grid gap-5 lg:grid-cols-[320px_1fr]">
    <aside class="rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm">
      <header class="mb-3 flex items-center justify-between gap-3">
        <h2 class="text-sm font-semibold uppercase tracking-[0.08em] text-ink/60">
          Kampagnen
        </h2>
        <button
          type="button"
          class="rounded-lg border border-black/15 px-2 py-1 text-xs font-semibold text-ink/80 transition hover:bg-black/5"
          :disabled="loading || saving"
          @click="loadCampaigns"
        >
          Neu laden
        </button>
      </header>

      <p
        v-if="loading"
        class="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink/70"
      >
        Kampagnen werden geladen...
      </p>

      <p
        v-else-if="campaigns.length === 0"
        class="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink/70"
      >
        Keine Kampagnen vorhanden.
      </p>

      <ul
        v-else
        class="grid gap-2"
      >
        <li
          v-for="campaign in campaigns"
          :key="campaign.id"
        >
          <button
            type="button"
            class="w-full rounded-xl border px-3 py-2 text-left transition"
            :class="
              selectedCampaign?.id === campaign.id
                ? 'border-spruce bg-spruce/10'
                : 'border-black/10 bg-white hover:bg-black/5'
            "
            @click="selectCampaign(campaign.id)"
          >
            <p class="text-sm font-semibold text-ink">{{ campaign.name }}</p>
            <p class="mt-0.5 text-xs text-ink/60">/{{ campaign.slug }}</p>
            <p class="mt-1 text-xs text-ink/60">
              {{ campaign.status }} · Tag {{ campaign.currentGameDay }} · Long Rests {{ campaign.longRestCount }}
            </p>
          </button>
        </li>
      </ul>
    </aside>

    <article class="grid gap-5">
      <p
        v-if="error"
        class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {{ error }}
      </p>

      <section
        v-if="canCreate"
        class="rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm"
      >
        <h3 class="text-base font-semibold text-ink">Neue Kampagne</h3>

        <form
          class="mt-3 grid gap-3 md:grid-cols-2"
          @submit.prevent="onCreateCampaign"
        >
          <label class="grid gap-1 text-sm text-ink/85">
            Name
            <input
              v-model.trim="createForm.name"
              type="text"
              placeholder="The Northern Reach"
              class="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-spruce"
            >
          </label>

          <label class="grid gap-1 text-sm text-ink/85">
            Slug (optional)
            <input
              v-model.trim="createForm.slug"
              type="text"
              placeholder="the-northern-reach"
              class="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-spruce"
            >
          </label>

          <label class="grid gap-1 text-sm text-ink/85 md:col-span-2">
            Ruleset ID
            <input
              v-model.trim="createForm.rulesetId"
              type="text"
              placeholder="11111111-1111-4111-8111-111111111111"
              class="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-spruce"
            >
          </label>

          <label class="grid gap-1 text-sm text-ink/85 md:col-span-2">
            Beschreibung
            <textarea
              v-model.trim="createForm.description"
              rows="3"
              placeholder="Kurze Kampagnenbeschreibung"
              class="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-spruce"
            />
          </label>

          <div class="md:col-span-2">
            <button
              type="submit"
              class="rounded-xl bg-spruce px-4 py-2 text-sm font-semibold text-white transition hover:bg-spruce/90 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="saving"
            >
              {{ saving ? "Wird erstellt..." : "Kampagne erstellen" }}
            </button>
          </div>
        </form>
      </section>

      <section
        v-if="selectedCampaign"
        class="rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm"
      >
        <header class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-base font-semibold text-ink">{{ selectedCampaign.name }}</h3>
            <p class="text-xs text-ink/65">/{{ selectedCampaign.slug }} · {{ selectedCampaign.id }}</p>
          </div>
          <span class="rounded-full bg-black/5 px-2.5 py-1 text-xs font-semibold text-ink/75">
            {{ selectedCampaign.status }}
          </span>
        </header>

        <form
          class="grid gap-3 md:grid-cols-2"
          @submit.prevent="onUpdateCampaign"
        >
          <label class="grid gap-1 text-sm text-ink/85">
            Name
            <input
              v-model.trim="updateForm.name"
              type="text"
              class="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-spruce"
            >
          </label>

          <label class="grid gap-1 text-sm text-ink/85">
            Slug
            <input
              v-model.trim="updateForm.slug"
              type="text"
              class="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-spruce"
            >
          </label>

          <label class="grid gap-1 text-sm text-ink/85">
            Status
            <select
              v-model="updateForm.status"
              class="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-spruce"
            >
              <option value="DRAFT">DRAFT</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </label>

          <label class="grid gap-1 text-sm text-ink/85">
            Ruleset ID
            <input
              :value="selectedCampaign.rulesetId"
              type="text"
              readonly
              class="rounded-xl border border-black/15 bg-parchment px-3 py-2 text-sm text-ink/70"
            >
          </label>

          <label class="grid gap-1 text-sm text-ink/85 md:col-span-2">
            Beschreibung
            <textarea
              v-model.trim="updateForm.description"
              rows="3"
              class="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-spruce"
            />
          </label>

          <div class="md:col-span-2 flex flex-wrap gap-2">
            <button
              v-if="canUpdate"
              type="submit"
              class="rounded-xl bg-spruce px-4 py-2 text-sm font-semibold text-white transition hover:bg-spruce/90 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="saving"
            >
              Speichern
            </button>

            <button
              v-if="canArchive"
              type="button"
              class="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="saving"
              @click="onArchiveCampaign"
            >
              Archivieren
            </button>
          </div>
        </form>
      </section>

      <section
        v-if="selectedCampaign"
        class="rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm"
      >
        <h3 class="text-base font-semibold text-ink">Kampagnenzeit</h3>
        <p class="mt-1 text-sm text-ink/70">
          Aktuell Tag {{ selectedCampaign.currentGameDay }}, Long Rests {{ selectedCampaign.longRestCount }}.
        </p>

        <div class="mt-3 grid gap-3 md:grid-cols-2">
          <form
            v-if="canAdvanceTime"
            class="grid gap-2 rounded-xl border border-black/10 bg-white p-3"
            @submit.prevent="onAdvanceTime"
          >
            <h4 class="text-sm font-semibold text-ink">Zeit vorwärts</h4>
            <label class="grid gap-1 text-xs text-ink/80">
              Tage
              <input
                v-model.number="advanceForm.days"
                type="number"
                min="0"
                class="rounded-lg border border-black/15 px-2 py-1.5 text-sm"
              >
            </label>
            <label class="grid gap-1 text-xs text-ink/80">
              Long Rests
              <input
                v-model.number="advanceForm.longRests"
                type="number"
                min="0"
                class="rounded-lg border border-black/15 px-2 py-1.5 text-sm"
              >
            </label>
            <label class="grid gap-1 text-xs text-ink/80">
              Begründung (optional)
              <input
                v-model.trim="advanceForm.reason"
                type="text"
                class="rounded-lg border border-black/15 px-2 py-1.5 text-sm"
              >
            </label>
            <button
              type="submit"
              class="rounded-lg bg-spruce px-3 py-2 text-sm font-semibold text-white"
              :disabled="saving"
            >
              Anwenden
            </button>
          </form>

          <form
            v-if="canCorrectTime"
            class="grid gap-2 rounded-xl border border-black/10 bg-white p-3"
            @submit.prevent="onCorrectTime"
          >
            <h4 class="text-sm font-semibold text-ink">Zeit korrigieren</h4>
            <label class="grid gap-1 text-xs text-ink/80">
              Spieltag
              <input
                v-model.number="correctForm.gameDay"
                type="number"
                min="0"
                class="rounded-lg border border-black/15 px-2 py-1.5 text-sm"
              >
            </label>
            <label class="grid gap-1 text-xs text-ink/80">
              Long Rests
              <input
                v-model.number="correctForm.longRestCount"
                type="number"
                min="0"
                class="rounded-lg border border-black/15 px-2 py-1.5 text-sm"
              >
            </label>
            <label class="grid gap-1 text-xs text-ink/80">
              Begründung
              <input
                v-model.trim="correctForm.reason"
                type="text"
                class="rounded-lg border border-black/15 px-2 py-1.5 text-sm"
              >
            </label>
            <button
              type="submit"
              class="rounded-lg bg-spruce px-3 py-2 text-sm font-semibold text-white"
              :disabled="saving"
            >
              Korrigieren
            </button>
          </form>
        </div>

        <div class="mt-4">
          <h4 class="text-sm font-semibold uppercase tracking-[0.08em] text-ink/60">
            Zeit-Historie
          </h4>
          <ul class="mt-2 grid gap-2">
            <li
              v-for="event in timeHistory"
              :key="event.id"
              class="rounded-lg border border-black/10 bg-white px-3 py-2"
            >
              <p class="text-sm font-semibold text-ink">
                {{ event.type }} · Tag {{ event.previousGameDay }} → {{ event.newGameDay }}
              </p>
              <p class="text-xs text-ink/65">
                Long Rests {{ event.previousLongRestCount }} → {{ event.newLongRestCount }} · {{ formatDate(event.createdAt) }}
              </p>
              <p
                v-if="event.reason"
                class="mt-1 text-xs text-ink/70"
              >
                {{ event.reason }}
              </p>
            </li>
            <li
              v-if="timeHistory.length === 0"
              class="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-ink/70"
            >
              Noch keine Zeitereignisse vorhanden.
            </li>
          </ul>
        </div>
      </section>
    </article>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, watch } from "vue";

import { useCampaigns } from "@/features/campaigns/useCampaigns";

const {
  loading,
  saving,
  error,
  campaigns,
  selectedCampaign,
  timeHistory,
  canCreate,
  canUpdate,
  canArchive,
  canAdvanceTime,
  canCorrectTime,
  loadCampaigns,
  selectCampaign,
  createNewCampaign,
  saveCampaignUpdate,
  archiveSelectedCampaign,
  advanceSelectedCampaignTime,
  correctSelectedCampaignTime,
} = useCampaigns();

const createForm = reactive({
  name: "",
  slug: "",
  description: "",
  rulesetId: "",
});

const updateForm = reactive({
  name: "",
  slug: "",
  description: "",
  status: "DRAFT" as "DRAFT" | "ACTIVE" | "ARCHIVED",
});

const advanceForm = reactive({
  days: 1,
  longRests: 0,
  reason: "",
});

const correctForm = reactive({
  gameDay: 0,
  longRestCount: 0,
  reason: "",
});

watch(
  () => selectedCampaign.value,
  (campaign) => {
    if (!campaign) {
      return;
    }

    updateForm.name = campaign.name;
    updateForm.slug = campaign.slug;
    updateForm.description = campaign.description ?? "";
    updateForm.status = campaign.status;

    correctForm.gameDay = campaign.currentGameDay;
    correctForm.longRestCount = campaign.longRestCount;
  },
  { immediate: true },
);

onMounted(async () => {
  await loadCampaigns();
});

async function onCreateCampaign(): Promise<void> {
  const payload: {
    name: string;
    description: string | null;
    rulesetId: string;
    settings: Record<string, unknown>;
    slug?: string;
  } = {
    name: createForm.name,
    description: createForm.description || null,
    rulesetId: createForm.rulesetId,
    settings: {},
  };

  if (createForm.slug) {
    payload.slug = createForm.slug;
  }

  await createNewCampaign(payload);

  createForm.name = "";
  createForm.slug = "";
  createForm.description = "";
}

async function onUpdateCampaign(): Promise<void> {
  if (!selectedCampaign.value) {
    return;
  }

  await saveCampaignUpdate({
    expectedVersion: selectedCampaign.value.version,
    name: updateForm.name,
    slug: updateForm.slug,
    description: updateForm.description || null,
    status: updateForm.status,
    settings: selectedCampaign.value.settings,
  });
}

async function onArchiveCampaign(): Promise<void> {
  await archiveSelectedCampaign();
}

async function onAdvanceTime(): Promise<void> {
  await advanceSelectedCampaignTime({
    days: advanceForm.days,
    longRests: advanceForm.longRests,
    reason: advanceForm.reason || null,
  });
}

async function onCorrectTime(): Promise<void> {
  await correctSelectedCampaignTime({
    gameDay: correctForm.gameDay,
    longRestCount: correctForm.longRestCount,
    reason: correctForm.reason,
  });
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("de-DE");
}
</script>
