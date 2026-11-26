import { readonly, ref } from "vue";

const connected = ref(false);
const joinedCampaign = ref<string | null>(null);

/**
 * Whether the realtime channel is connected, and which campaign it joined (the gateway accepted
 * the join for the viewer's role). Kept apart from the connection code, so checks that only run
 * without it (the minute check of the open campaign) don't load Socket.IO.
 */
export const realtimeConnected = readonly(connected);
export const realtimeCampaign = readonly(joinedCampaign);

export function setRealtimeConnected(value: boolean): void {
  connected.value = value;
  if (!value) joinedCampaign.value = null;
}

export function setRealtimeCampaign(campaignId: string | null): void {
  joinedCampaign.value = campaignId;
}
