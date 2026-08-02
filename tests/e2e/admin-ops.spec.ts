import { expect, test } from "@playwright/test";
import { createLocalServiceClient } from "@/tests/helpers/local-supabase";

test("managed operator login protects the dashboard @issue-36", async ({
  page,
}, testInfo) => {
  await page.goto("/admin");

  await expect(page.getByPlaceholder("운영자 아이디")).toBeVisible();
  await page.getByPlaceholder("운영자 아이디").fill("owner");
  await page.getByPlaceholder("운영자 비밀번호").fill("OwnerPass!234");
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(
    page.getByRole("heading", { name: "운영 대시보드" }),
  ).toBeVisible();
  await expect(page.getByText("OWNER")).toBeVisible();

  const operatorCard = page
    .getByRole("heading", { name: "운영자 계정 관리" })
    .locator("..");
  await operatorCard.getByRole("button", { name: "접속" }).click();
  await expect(
    page.getByRole("heading", { name: "운영자 관리" }),
  ).toBeVisible();

  await page.getByPlaceholder("운영자 아이디").fill("viewer");
  await page.getByPlaceholder("표시 이름").fill("조회 운영자");
  await page
    .getByPlaceholder("임시 비밀번호 (12자 이상)")
    .fill("ViewerPass!234");
  await page.getByLabel("운영자 역할").selectOption("VIEWER");
  page.once("dialog", (dialog) => dialog.accept("OwnerPass!234"));
  await page.getByRole("button", { name: "운영자 추가" }).click();
  await expect(page.getByText("운영자를 추가했습니다.")).toBeVisible();
  await expect(page.getByText("viewer · VIEWER")).toBeVisible();

  await page.getByRole("button", { name: "돌아가기" }).click();
  const auditCard = page
    .getByRole("heading", { name: "작업 감사 로그" })
    .locator("..");
  await auditCard.getByRole("button", { name: "접속" }).click();
  await expect(page.getByText("운영자 추가").first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("issue-36-owner-dashboard.png"),
    fullPage: true,
  });
});

test("weekly grant policy management is available @issue-41", async ({
  page,
}, testInfo) => {
  await page.goto("/admin");
  await page.getByPlaceholder("운영자 아이디").fill("owner");
  await page.getByPlaceholder("운영자 비밀번호").fill("OwnerPass!234");
  await page.getByRole("button", { name: "로그인" }).click();

  const coinCard = page
    .getByRole("heading", { name: "코인 지급 관리" })
    .locator("..");
  await coinCard.getByRole("button", { name: "접속" }).click();
  await expect(
    page.getByRole("heading", { name: "주간 코인 지급 정책" }),
  ).toBeVisible();

  await expect(page.getByText("저장된 cron: 0 15 * * 0")).toBeVisible();
  await page.getByLabel("회차 지급액").fill("500");
  await page.getByLabel("요일 (KST)").selectOption("3");
  await page.getByLabel("시간 (KST)").fill("09:30");
  await expect(page.getByText("예상 지급: 3명 · 1,500코인")).toBeVisible();
  await page.getByRole("button", { name: "정책 저장" }).click();
  await expect(page.getByText("주간 지급 정책을 저장했습니다.")).toBeVisible();
  await expect(page.getByText("저장된 cron: 30 0 * * 3")).toBeVisible();

  await page.getByRole("button", { name: "일시정지" }).click();
  await expect(page.getByText("자동 지급을 일시정지했습니다.")).toBeVisible();
  await expect(page.getByText("일시정지", { exact: true })).toBeVisible();

  page.on("dialog", async (dialog) => {
    await dialog.accept("OwnerPass!234");
  });
  await page.getByLabel("수동 지급 라운드").fill("E2E-41");
  await page.getByRole("button", { name: "실행/재실행" }).click();
  await expect(page.getByText("E2E-41 라운드를 수동 지급했습니다.")).toBeVisible();

  const service = createLocalServiceClient();
  const grants = await service
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("description", "주간 코인 지급 E2E-41")
    .eq("amount", 500);
  expect(grants.count).toBe(3);

  await page.getByRole("button", { name: "실행/재실행" }).click();
  await expect(page.getByText("이미 지급된 라운드입니다")).toBeVisible();
  const repeated = await service
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("description", "주간 코인 지급 E2E-41");
  expect(repeated.count).toBe(3);

  await page.getByRole("button", { name: "재개" }).click();
  await expect(page.getByText("자동 지급을 재개했습니다.")).toBeVisible();
  await expect(page.getByText("E2E-41 · MANUAL · SUCCESS")).toBeVisible();

  const audits = await service
    .from("admin_audit_logs")
    .select("action")
    .in("action", [
      "WEEKLY_GRANT_POLICY_UPDATE",
      "WEEKLY_GRANT_PAUSE",
      "WEEKLY_GRANT_RESUME",
      "WEEKLY_GRANT_MANUAL_RUN",
    ]);
  expect(audits.error).toBeNull();
  expect(new Set(audits.data?.map((row) => row.action))).toEqual(
    new Set([
      "WEEKLY_GRANT_POLICY_UPDATE",
      "WEEKLY_GRANT_PAUSE",
      "WEEKLY_GRANT_RESUME",
      "WEEKLY_GRANT_MANUAL_RUN",
    ]),
  );

  await page.screenshot({
    path: testInfo.outputPath("issue-41-weekly-grant-policy.png"),
    fullPage: true,
  });
});
