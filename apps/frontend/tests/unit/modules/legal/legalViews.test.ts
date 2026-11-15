import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter, createWebHistory } from "vue-router";

import { buildRoutes } from "@/app/router";
import { defineFrontendModule } from "@/core/modules";
import { authModule } from "@/modules/auth";
import { legalModule } from "@/modules/legal";
import ImprintView from "@/modules/legal/views/ImprintView.vue";
import PrivacyView from "@/modules/legal/views/PrivacyView.vue";

import { mountWithApp } from "../../helpers/mount";

const pages = defineFrontendModule({
  name: "pages",
  routes: { bare: [{ path: "dashboard", name: "dashboard", component: { render: () => null } }] },
});

async function open(component: typeof ImprintView, url: string, locale = "de") {
  const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes([authModule, legalModule, pages]) });
  await router.push(url);
  const { wrapper } = await mountWithApp(component, { router, locale });
  return { wrapper, router };
}

describe("legal pages", () => {
  it("shows the legal notice with its sections, marked as example content", async () => {
    const { wrapper } = await open(ImprintView, "/impressum");
    expect(wrapper.find("h1").text()).toBe("Impressum");
    expect(wrapper.findAll("h2").map((heading) => heading.text())).toContain("Anbieter");
    expect(wrapper.text()).toContain("kontakt@example.com");
    expect(wrapper.text()).toContain("Beispielinhalt");
    wrapper.unmount();
  });

  it("shows the privacy policy in English and links both pages in the footer", async () => {
    const { wrapper } = await open(PrivacyView, "/datenschutz", "en");
    expect(wrapper.find("h1").text()).toBe("Privacy");
    expect(wrapper.text()).toContain("Signing in with Google or Discord");
    const footer = wrapper.find("footer").findAll("a").map((link) => link.attributes("href"));
    expect(footer).toEqual(["/datenschutz", "/impressum"]);
    wrapper.unmount();
  });

  it("goes back where the visitor came from", async () => {
    // The browser history knows the previous page of the app (`state.back`).
    const router = createRouter({ history: createWebHistory(), routes: buildRoutes([authModule, legalModule, pages]) });
    await router.push("/login");
    await router.push("/impressum");
    const { wrapper } = await mountWithApp(ImprintView, { router });
    await wrapper.find("button").trigger("click");
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/login"));
    await flushPromises();
    wrapper.unmount();
  });
});
