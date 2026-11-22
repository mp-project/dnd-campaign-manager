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
  it("shows the legal notice with its sections", async () => {
    const { wrapper } = await open(ImprintView, "/impressum");
    expect(wrapper.find("h1").text()).toBe("Impressum");
    expect(wrapper.findAll("h2").map((heading) => heading.text())).toContain("Anbieter");
    expect(wrapper.text()).toContain("info@questaria.de");
    wrapper.unmount();
  });

  it("turns web addresses in the privacy policy into links that open in a new tab", async () => {
    const { wrapper } = await open(PrivacyView, "/datenschutz");
    const link = wrapper.find('main a[href="https://www.cloudflare.com/privacypolicy/"]');
    expect(link.text()).toBe("https://www.cloudflare.com/privacypolicy/");
    expect(link.attributes("target")).toBe("_blank");
    expect(link.attributes("rel")).toBe("noopener noreferrer");
    // The full stop after an address stays text.
    expect(link.element.parentElement?.textContent).toContain("https://www.cloudflare.com/privacypolicy/.");
    // The eRecht24 chapters are the second level, their sections the third.
    expect(wrapper.findAll("main h2").map((heading) => heading.text())).toEqual(
      expect.arrayContaining(["1. Datenschutz auf einen Blick", "2. Hosting und Content Delivery Networks (CDN)", "7. Plugins und Tools"]),
    );
    expect(wrapper.findAll("main h3").map((heading) => heading.text())).toEqual(
      expect.arrayContaining(["Hetzner", "Cloudflare", "Google Analytics", "Sentry", "Einwilligung mit Cookiebot"]),
    );
    expect(wrapper.text()).toContain("Quelle:");
    wrapper.unmount();
  });

  it("shows the privacy policy in English and links both pages in the footer", async () => {
    const { wrapper } = await open(PrivacyView, "/datenschutz", "en");
    expect(wrapper.find("h1").text()).toBe("Privacy policy");
    expect(wrapper.text()).toContain("Signing in with Google or Discord");
    // The footer of every public page: the start page's call to action, then privacy and imprint.
    const footer = wrapper.find("footer");
    expect(footer.find("h2").text()).toBe("Ready for the next adventure?");
    const footerLinks = footer.findAll("a").map((link) => link.attributes("href"));
    expect(footerLinks).toContain("/en/warteliste");
    expect(footerLinks).not.toContain("/login");
    const legal = footer.find("nav").findAll("a");
    expect(legal.map((link) => link.attributes("href"))).toEqual(["/datenschutz", "/impressum"]);
    // The page shown is marked (underlined) like in the header.
    expect(legal.map((link) => link.attributes("aria-current"))).toEqual(["page", undefined]);
    // The header leads to FAQ, roadmap and contact in the active language, but no longer to sign-in.
    const header = wrapper.find("header nav").findAll("a");
    expect(header.map((link) => [link.text(), link.attributes("href")])).toEqual([
      ["FAQ", "/en/faq"],
      ["Roadmap", "/en/roadmap"],
      ["Contact", "/en/kontakt"],
    ]);
    expect(wrapper.find("header").findAll("a").map((link) => link.attributes("href"))).not.toContain("/login");
    wrapper.unmount();
  });

  it("loads Cookiebot's cookie declaration into the consent section, in the page's language", async () => {
    vi.stubEnv("VITE_COOKIEBOT_ID", "c03c6818-ca6f-4955-a00d-ff51e76300ef");
    try {
      const { wrapper } = await open(PrivacyView, "/datenschutz", "en");
      const section = wrapper.find('section[aria-labelledby="legal-consent"]');
      const script = section.find("script#CookieDeclaration");
      expect(script.attributes("src")).toBe("https://consent.cookiebot.com/c03c6818-ca6f-4955-a00d-ff51e76300ef/cd.js");
      expect(script.attributes("data-culture")).toBe("en");
      expect(section.text()).toContain("Cybot A/S");
      wrapper.unmount();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("says where the cookie declaration will appear while Cookiebot has no id", async () => {
    vi.stubEnv("VITE_COOKIEBOT_ID", "");
    try {
      const { wrapper } = await open(PrivacyView, "/datenschutz");
      expect(wrapper.find("script#CookieDeclaration").exists()).toBe(false);
      expect(wrapper.text()).toContain("sobald Cookiebot eingebunden ist");
      wrapper.unmount();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("goes back where the visitor came from", async () => {
    // The browser history knows the previous page of the app (`state.back`).
    const router = createRouter({ history: createWebHistory(), routes: buildRoutes([authModule, legalModule, landingModule, contactModule, pages]) });
    await router.push("/login");
    await router.push("/impressum");
    const { wrapper } = await mountWithApp(ImprintView, { router });
    await wrapper.find("main button").trigger("click");
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/login"));
    await flushPromises();
    wrapper.unmount();
  });
});
