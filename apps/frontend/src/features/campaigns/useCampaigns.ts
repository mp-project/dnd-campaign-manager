import { computed, ref } from "vue";

import {
  advanceCampaignTime,
  archiveCampaign,
  correctCampaignTime,
  createCampaign,
  fetchGlobalPermissions,
  getCampaign,
  getCampaignTimeHistory,
  listCampaigns,
  updateCampaign,
} from "@/features/campaigns/api";
import type {
  AdvanceCampaignTimeInput,
  Campaign,
  CampaignTimeEvent,
  CorrectCampaignTimeInput,
  CreateCampaignInput,
  UpdateCampaignInput,
} from "@/features/campaigns/types";

export function useCampaigns() {
  const loading = ref(false);
  const saving = ref(false);
  const error = ref("");
  const campaigns = ref<Campaign[]>([]);
  const selectedCampaignId = ref<string | null>(null);
  const timeHistory = ref<CampaignTimeEvent[]>([]);
  const globalPermissions = ref<string[]>([]);

  const selectedCampaign = computed(() =>
    campaigns.value.find((campaign) => campaign.id === selectedCampaignId.value) ?? null,
  );

  const selectedPermissions = computed(
    () => selectedCampaign.value?.effectivePermissions ?? [],
  );

  const canCreate = computed(() => globalPermissions.value.includes("campaigns.create"));
  const canRead = computed(() => globalPermissions.value.includes("campaigns.read"));

  const canUpdate = computed(() => selectedPermissions.value.includes("campaigns.update"));
  const canArchive = computed(() => selectedPermissions.value.includes("campaigns.archive"));
  const canAdvanceTime = computed(() =>
    selectedPermissions.value.includes("campaigns.advanceTime"),
  );
  const canCorrectTime = computed(() =>
    selectedPermissions.value.includes("campaigns.correctTime"),
  );

  async function loadCampaigns(): Promise<void> {
    loading.value = true;
    error.value = "";

    try {
      globalPermissions.value = await fetchGlobalPermissions();

      if (!canRead.value && !canCreate.value) {
        campaigns.value = [];
        selectedCampaignId.value = null;
        return;
      }

      const response = await listCampaigns({
        includeArchived: true,
        limit: 50,
      });

      campaigns.value = response.data;

      if (campaigns.value.length === 0) {
        selectedCampaignId.value = null;
        timeHistory.value = [];
        return;
      }

      const stillSelected = campaigns.value.some(
        (campaign) => campaign.id === selectedCampaignId.value,
      );

      if (!stillSelected) {
        selectedCampaignId.value = campaigns.value[0]?.id ?? null;
      }

      await loadTimeHistory();
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError);
    } finally {
      loading.value = false;
    }
  }

  async function selectCampaign(campaignId: string): Promise<void> {
    selectedCampaignId.value = campaignId;
    await refreshSelectedCampaign();
    await loadTimeHistory();
  }

  async function refreshSelectedCampaign(): Promise<void> {
    if (!selectedCampaignId.value) {
      return;
    }

    try {
      const campaign = await getCampaign(selectedCampaignId.value);
      campaigns.value = campaigns.value.map((item) =>
        item.id === campaign.id ? campaign : item,
      );
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError);
    }
  }

  async function loadTimeHistory(): Promise<void> {
    if (!selectedCampaignId.value) {
      timeHistory.value = [];
      return;
    }

    try {
      const response = await getCampaignTimeHistory(selectedCampaignId.value, 50);
      timeHistory.value = response.data;
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError);
    }
  }

  async function createNewCampaign(input: CreateCampaignInput): Promise<void> {
    saving.value = true;
    error.value = "";

    try {
      const created = await createCampaign(input);
      campaigns.value = [created, ...campaigns.value];
      selectedCampaignId.value = created.id;
      await loadTimeHistory();
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError);
    } finally {
      saving.value = false;
    }
  }

  async function saveCampaignUpdate(input: UpdateCampaignInput): Promise<void> {
    if (!selectedCampaignId.value) {
      return;
    }

    saving.value = true;
    error.value = "";

    try {
      const updated = await updateCampaign(selectedCampaignId.value, input);
      campaigns.value = campaigns.value.map((item) =>
        item.id === updated.id ? updated : item,
      );
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError);
    } finally {
      saving.value = false;
    }
  }

  async function archiveSelectedCampaign(): Promise<void> {
    if (!selectedCampaignId.value) {
      return;
    }

    saving.value = true;
    error.value = "";

    try {
      await archiveCampaign(selectedCampaignId.value);
      await loadCampaigns();
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError);
    } finally {
      saving.value = false;
    }
  }

  async function advanceSelectedCampaignTime(
    input: AdvanceCampaignTimeInput,
  ): Promise<void> {
    if (!selectedCampaignId.value) {
      return;
    }

    saving.value = true;
    error.value = "";

    try {
      const updated = await advanceCampaignTime(selectedCampaignId.value, input);
      campaigns.value = campaigns.value.map((item) =>
        item.id === updated.id ? updated : item,
      );
      await loadTimeHistory();
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError);
    } finally {
      saving.value = false;
    }
  }

  async function correctSelectedCampaignTime(
    input: CorrectCampaignTimeInput,
  ): Promise<void> {
    if (!selectedCampaignId.value) {
      return;
    }

    saving.value = true;
    error.value = "";

    try {
      const updated = await correctCampaignTime(selectedCampaignId.value, input);
      campaigns.value = campaigns.value.map((item) =>
        item.id === updated.id ? updated : item,
      );
      await loadTimeHistory();
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError);
    } finally {
      saving.value = false;
    }
  }

  return {
    loading,
    saving,
    error,
    campaigns,
    selectedCampaign,
    selectedCampaignId,
    timeHistory,
    canCreate,
    canRead,
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
  };
}

function toErrorMessage(caughtError: unknown): string {
  if (caughtError instanceof Error) {
    return caughtError.message;
  }

  return "Unbekannter Fehler";
}
