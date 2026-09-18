import { expect, test } from "@playwright/test";

test("homepage responds with app title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("DnD Campaign Manager");
});
