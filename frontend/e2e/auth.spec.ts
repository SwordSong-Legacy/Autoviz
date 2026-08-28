import { test, expect } from "@playwright/test";

test.describe("Public Access", () => {
  test("should allow public access to main page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();
  });
});
