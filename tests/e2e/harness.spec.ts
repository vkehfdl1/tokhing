import { expect, test } from "@playwright/test";

test("admin login surface boots against local Supabase @harness", async ({
  page,
}, testInfo) => {
  await page.goto("/admin");

  await expect(
    page.getByRole("heading", { name: "ToKHin' 관리" }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("운영진 비밀번호")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("admin-login-surface.png"),
    fullPage: true,
  });
});
