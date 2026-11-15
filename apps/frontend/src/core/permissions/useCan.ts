import { computed } from "vue";

import { useMe } from "@/core/auth/session";
import { useCurrentCampaign } from "@/core/campaign/campaign";

/**
 * What the viewer may do, to hide what the API would refuse anyway (the backend decides).
 * A page in a campaign (campaign in the URL) asks with the campaign's permissions, which the
 * backend already limits to the viewer's role there; every other page with the account's global
 * permissions. The campaign remembered for account pages never counts for the page itself.
 *
 *   const { can, role } = useCan();
 *   <BaseButton v-if="can('campaigns.update')">…</BaseButton>
 */
export function useCan() {
  const me = useMe();
  const { campaign, role, inUrl } = useCurrentCampaign();
  const global = computed(() => new Set(me.data.value?.effectiveGlobalPermissions ?? []));
  const ofCampaign = computed(() => new Set(campaign.value?.effectivePermissions ?? []));

  return {
    /** For the current page. */
    can: (permission: string) => (inUrl.value ? ofCampaign.value : global.value).has(permission),
    /** For the current campaign, also the remembered one (its navigation on account pages). */
    canInCampaign: (permission: string) => ofCampaign.value.has(permission),
    /** For the account, regardless of the page. */
    canGlobally: (permission: string) => global.value.has(permission),
    /** Role in the campaign of the page; null outside a campaign and for administrators without membership. */
    role: computed(() => (inUrl.value ? role.value : null)),
    /** Game master: the owner of the campaign of the page. */
    isGameMaster: computed(() => inUrl.value && role.value === "OWNER"),
  };
}
