import { toRefSegment } from "@dnd/contracts";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";

import { campaignKey, meKey } from "@/core/api/queryClient";
import { rememberCampaign } from "@/core/campaign/campaign";
import { useCan } from "@/core/permissions/useCan";

const CAMPAIGN_ID = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

async function canAt(path: string) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(meKey("profile"), { systemRole: "USER", effectiveGlobalPermissions: ["campaigns.create"] });
  queryClient.setQueryData(campaignKey(CAMPAIGN_ID, "detail"), {
    id: CAMPAIGN_ID,
    slug: "elaria",
    role: "PLAYER",
    effectivePermissions: ["campaigns.read"],
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/dashboard", component: { render: () => null } },
      { path: "/k/:campaign", component: { render: () => null } },
    ],
  });
  await router.push(path);
  let result!: ReturnType<typeof useCan>;
  mount(defineComponent({ setup: () => ((result = useCan()), () => h("div")) }), {
    global: { plugins: [router, [VueQueryPlugin, { queryClient }]] },
  });
  await flushPromises();
  return result;
}

describe("useCan", () => {
  afterEach(() => rememberCampaign(null));

  it("asks with the campaign's permissions on a page in the campaign", async () => {
    const { can, role, isGameMaster } = await canAt(`/k/${toRefSegment(CAMPAIGN_ID, "elaria")}`);
    expect(can("campaigns.read")).toBe(true);
    expect(can("campaigns.create")).toBe(false);
    expect(role.value).toBe("PLAYER");
    expect(isGameMaster.value).toBe(false);
  });

  it("asks with the account's permissions elsewhere, even with a remembered campaign", async () => {
    rememberCampaign(CAMPAIGN_ID);
    const { can, canInCampaign, role } = await canAt("/dashboard");
    expect(can("campaigns.create")).toBe(true);
    expect(can("campaigns.read")).toBe(false);
    expect(canInCampaign("campaigns.read")).toBe(true);
    expect(role.value).toBeNull();
  });
});
