import { expect, test } from "@playwright/test";

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

  await page.getByRole("button", { name: "돌아가기" }).click();
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page.getByPlaceholder("운영자 아이디")).toBeVisible();
  await page.getByPlaceholder("운영자 아이디").fill("viewer");
  await page.getByPlaceholder("운영자 비밀번호").fill("ViewerPass!234");
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(
    page.getByRole("heading", { name: "비밀번호 변경 필요" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(
      "issue-36-required-password-change.png",
    ),
    fullPage: true,
  });
  const blockedAudit = await page.request.get("/api/admin/audit");
  expect(blockedAudit.status()).toBe(403);
  await expect(blockedAudit.json()).resolves.toMatchObject({
    code: "ADMIN_PASSWORD_CHANGE_REQUIRED",
  });

  await page
    .getByPlaceholder("현재 임시 비밀번호")
    .fill("ViewerPass!234");
  await page
    .getByPlaceholder("새 비밀번호 (12자 이상)")
    .fill("ViewerChanged!234");
  await page
    .getByPlaceholder("새 비밀번호 확인")
    .fill("ViewerChanged!234");
  await page.getByRole("button", { name: "비밀번호 변경" }).click();
  await expect(
    page.getByRole("heading", { name: "운영 대시보드" }),
  ).toBeVisible();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invalidLogin = await page.request.post(
      "/api/admin/auth/login",
      {
        data: {
          username: "rate-limit-probe",
          password: "WrongPassword!234",
        },
      },
    );
    expect(invalidLogin.status()).toBe(401);
  }

  const throttledLogin = await page.request.post(
    "/api/admin/auth/login",
    {
      data: {
        username: "rate-limit-probe",
        password: "WrongPassword!234",
      },
    },
  );
  expect(throttledLogin.status()).toBe(429);
  await expect(throttledLogin.json()).resolves.toMatchObject({
    code: "ADMIN_LOGIN_RATE_LIMITED",
  });
});
