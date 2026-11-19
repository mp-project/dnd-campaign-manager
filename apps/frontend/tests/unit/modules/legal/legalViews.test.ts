import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter, createWebHistory } from "vue-router";

import { buildRoutes } from "@/app/router";
import { defineFrontendModule } from "@/core/modules";
import { authModule } from "@/modules/auth";
import { contactModule } from "@/modules/contact";
import { landingModule } from "@/modules/landing";
import { legalModule } from "@/modules/legal";
import ImprintView from "@/modules/legal/views/ImprintView.vue";
import PrivacyView from "@/modules/legal/views/PrivacyView.vue";

import { mountWithApp } from "../../helpers/mount";

const pages = defineFrontendModule({
  name: "pages",
  routes: { bare: [{ path: "dashboard", name: "dashboard", component: { render: () => null } }] },
});

async function open(component: typeof ImprintView, url: string, locale = "de") {
  const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes([authModule, legalModule, landingModule, contactModule, pages]) });
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
    // The footer of every public page: the start page's call to action, then privacy, imprint and FAQ.
    const footer = wrapper.find("footer");
    expect(footer.find("h2").text()).toBe("Ready for the next adventure?");
    expect(footer.findAll("a").map((link) => link.attributes("href"))).toEqual(
      expect.arrayContaining(["/registrieren", "/login"]),
    );
    expect(footer.find("nav").findAll("a").map((link) => link.attributes("href"))).toEqual([
      "/datenschutz",
      "/impressum",
      "/en/faq",
      "/en/kontakt",
    ]);
    wrapper.unmount();
  });

  it("goes back where the visitor came from", async () => {
    // The browser history knows the previous page of the app (`state.back`).
    const router = createRouter({ history: createWebHistory(), routes: buildRoutes([authModule, legalModule, landingModule, contactModule, pages]) });
    await router.push("/login");
    await router.push("/impressum");
    const { wrapper } = await mountWithApp(ImprintView, { router });
    await wrapper.find("button").trigger("click");
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/login"));
    await flushPromises();
    wrapper.unmount();
  });
});
