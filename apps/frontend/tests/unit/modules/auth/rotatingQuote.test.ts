import { afterEach, describe, expect, it, vi } from "vitest";

import RotatingQuote from "@/modules/auth/components/RotatingQuote.vue";

import { mountWithApp } from "../../helpers/mount";

describe("rotating motto", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts with a random motto and moves on to the next one", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { wrapper } = await mountWithApp(RotatingQuote, { props: { intervalMs: 1000 } });
    expect(wrapper.text()).toBe("„Große Geschichten beginnen mit einem Ort.“");

    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.text()).toBe("„Jede Legende beginnt mit einer Entscheidung.“");
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.text()).toBe("„Große Abenteuer beginnen mit kleinen Schritten.“");
    wrapper.unmount();
  });

  it("is translated", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { wrapper } = await mountWithApp(RotatingQuote, { locale: "en" });
    expect(wrapper.text()).toBe("“New stories are waiting to be told.”");
    wrapper.unmount();
  });
});
