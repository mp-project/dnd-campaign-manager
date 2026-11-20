import { expect, test } from "@playwright/test";

test("start page responds in German and English", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Questaria – Kampagnenverwaltung für D&D 5E");
  await page.goto("/en");
  await expect(page).toHaveTitle("Questaria – campaign manager for D&D 5E");
});
