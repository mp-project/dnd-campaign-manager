import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadConsent() {
  vi.resetModules();
  return import("@/core/consent/consent");
}

describe("consent", () => {
  beforeEach(() => {
    document.getElementById("Cookiebot")?.remove();
    delete window.Cookiebot;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("grants nothing without Cookiebot", async () => {
    vi.stubEnv("VITE_COOKIEBOT_ID", "");
    vi.stubEnv("VITE_DEV_CONSENT", "");
    const consent = await loadConsent();
    const listener = vi.fn();

    consent.onStatisticsConsent(listener);
    consent.startConsent("de");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(false);
    expect(consent.hasConsentManager()).toBe(false);
  });

  it("lets development builds grant statistics without Cookiebot", async () => {
    vi.stubEnv("VITE_COOKIEBOT_ID", "");
    vi.stubEnv("VITE_DEV_CONSENT", "statistics");
    const consent = await loadConsent();
    const listener = vi.fn();

    consent.onStatisticsConsent(listener);
    consent.startConsent("de");

    expect(listener).toHaveBeenLastCalledWith(true);
  });

  it("loads Cookiebot in manual mode and follows its answers", async () => {
    vi.stubEnv("VITE_COOKIEBOT_ID", "c03c6818-ca6f-4955-a00d-ff51e76300ef");
    const consent = await loadConsent();
    const listener = vi.fn();
    consent.onStatisticsConsent(listener);

    consent.startConsent("en");

    const script = document.getElementById("Cookiebot") as HTMLScriptElement;
    expect(script.src).toBe("https://consent.cookiebot.com/uc.js");
    expect(script.dataset.cbid).toBe("c03c6818-ca6f-4955-a00d-ff51e76300ef");
    expect(script.dataset.culture).toBe("en");
    expect(script.dataset.consentmode).toBe("disabled");
    expect(script.dataset.blockingmode).toBeUndefined();
    expect(consent.hasConsentManager()).toBe(true);

    window.Cookiebot = { consent: { statistics: true } };
    window.dispatchEvent(new Event("CookiebotOnAccept"));
    expect(listener).toHaveBeenLastCalledWith(true);

    window.Cookiebot = { consent: { statistics: false } };
    window.dispatchEvent(new Event("CookiebotOnDecline"));
    expect(listener).toHaveBeenLastCalledWith(false);
  });

  it("never loads Cookiebot in a controlled browser (prerendering)", async () => {
    vi.stubEnv("VITE_COOKIEBOT_ID", "c03c6818-ca6f-4955-a00d-ff51e76300ef");
    Object.defineProperty(navigator, "webdriver", { value: true, configurable: true });
    const consent = await loadConsent();

    consent.startConsent("de");

    expect(document.getElementById("Cookiebot")).toBeNull();
    Reflect.deleteProperty(navigator, "webdriver");
  });

  it("opens Cookiebot's dialog again", async () => {
    const consent = await loadConsent();
    const renew = vi.fn();
    window.Cookiebot = { renew };

    consent.openConsentSettings();

    expect(renew).toHaveBeenCalled();
  });
});

describe("withdrawing and declining", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    document.getElementById("Cookiebot")?.remove();
  });

  it("reloads the page once statistics are withdrawn and tells every decline", async () => {
    vi.stubEnv("VITE_COOKIEBOT_ID", "c03c6818-ca6f-4955-a00d-ff51e76300ef");
    vi.resetModules();
    const consent = await import("@/core/consent/consent");
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    const declined = vi.fn();
    consent.onStatisticsDeclined(declined);
    consent.startConsent("de");

    window.Cookiebot = { consent: { statistics: false } };
    window.dispatchEvent(new Event("CookiebotOnConsentReady"));
    expect(declined).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();

    window.Cookiebot = { consent: { statistics: true } };
    window.dispatchEvent(new Event("CookiebotOnAccept"));
    window.Cookiebot = { consent: { statistics: false } };
    window.dispatchEvent(new Event("CookiebotOnDecline"));

    // Window listeners of earlier tests' module instances may answer too; this one must reload.
    expect(reload).toHaveBeenCalled();
    expect(declined).toHaveBeenCalledTimes(2);
  });
});
