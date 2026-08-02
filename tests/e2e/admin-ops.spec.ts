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

test("KBO sync operations are available @issue-42", async ({
  page,
}, testInfo) => {
  await page.goto("/admin");
  await page.getByPlaceholder("운영자 아이디").fill("owner");
  await page.getByPlaceholder("운영자 비밀번호").fill("OwnerPass!234");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByRole("heading", { name: "KBO 동기화" })).toBeVisible();
  await expect(page.getByText("Vault secret: 미설정")).toBeVisible();

  page.on("dialog", async (dialog) => {
    await dialog.accept("OwnerPass!234");
  });
  const seed = page.getByLabel("DAILY_SEED");
  await seed.getByRole("button", { name: "즉시 실행" }).click();
  await expect(page.getByText(/MISSING_VAULT_SECRET/)).toBeVisible();

  const service = createLocalServiceClient();
  const secret = await service
    .from("kbo_sync_secret_status")
    .update({ configured: true, last_rotated_at: new Date().toISOString() })
    .eq("id", true);
  expect(secret.error).toBeNull();
  await seed.getByRole("button", { name: "동일 입력 재시도" }).click();
  await expect(page.getByText("동기화를 완료했습니다.")).toBeVisible();

  const refresh = page.getByLabel("HOURLY_REFRESH");
  await refresh.getByRole("button", { name: "즉시 실행" }).click();
  await expect(page.getByText("동기화를 완료했습니다.")).toBeVisible();

  await seed.getByLabel("DAILY_SEED KST 시간").fill("08:30");
  await seed.getByRole("button", { name: "일시정지" }).click();
  await expect(seed.getByText(/PAUSED/)).toBeVisible();

  const actions = await service
    .from("admin_audit_logs")
    .select("action")
    .in("action", [
      "KBO_SYNC_JOB_UPDATE",
      "KBO_SYNC_MANUAL_RUN",
      "KBO_SYNC_RETRY",
    ]);
  expect(new Set(actions.data?.map((row) => row.action))).toEqual(
    new Set([
      "KBO_SYNC_JOB_UPDATE",
      "KBO_SYNC_MANUAL_RUN",
      "KBO_SYNC_RETRY",
    ]),
  );
  await page.screenshot({
    path: testInfo.outputPath("issue-42-kbo-sync.png"),
    fullPage: true,
  });
});
