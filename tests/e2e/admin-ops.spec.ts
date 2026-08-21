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

test("member lifecycle management is available @issue-37", async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  page.on("dialog", (dialog) => {
    if (dialog.type() === "prompt") {
      void dialog.accept("OwnerPass!234");
    } else {
      void dialog.accept();
    }
  });

  await page.goto("/admin");
  await page.getByPlaceholder("운영자 아이디").fill("owner");
  await page.getByPlaceholder("운영자 비밀번호").fill("OwnerPass!234");
  await page.getByRole("button", { name: "로그인" }).click();

  const memberCard = page.getByRole("heading", { name: "회원 관리" }).locator("..");
  await memberCard.getByRole("button", { name: "접속" }).click();
  await expect(page.getByRole("heading", { name: "회원 관리" })).toBeVisible();

  const userContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3000",
  });
  const userPage = await userContext.newPage();
  await userPage.goto("/login");
  await userPage.getByPlaceholder("학번 입력").fill("2024001");
  await userPage.getByPlaceholder("비밀번호 입력").fill("01012345678");
  await userPage.getByRole("button", { name: "로 그 인" }).click();
  await expect(userPage).toHaveURL(/\/change-password/);
  await userPage.getByPlaceholder("새 비밀번호").fill("UserPass!234");
  await userPage.getByPlaceholder("비밀번호 확인").fill("UserPass!234");
  await userPage.getByRole("button", { name: "변경 완료" }).click();
  await expect(userPage).toHaveURL(/\/$/);

  if (await memberCard.isVisible()) {
    await memberCard.getByRole("button", { name: "접속" }).click();
  }
  await expect(page.getByRole("heading", { name: "회원 관리" })).toBeVisible();
  await page.getByRole("spinbutton", { name: "학번" }).fill("2099999999");
  await page.getByPlaceholder("이름", { exact: true }).fill("신규 회원");
  await page.getByPlaceholder("전화번호").fill("01077778888");
  await page.getByPlaceholder("학과", { exact: true }).fill("컴퓨터공학과");
  await page.getByLabel("선호팀").selectOption("1");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("회원 정보를 저장했습니다.")).toBeVisible();

  const createdMember = page.getByTestId("member-2099999999");
  await expect(createdMember.getByText("신규 회원 · 2099999999")).toBeVisible();
  await expect(createdMember.getByText(/1,?000코인/)).toBeVisible();
  await createdMember.getByRole("button", { name: "비활성화" }).click();
  await expect(page.getByText("회원을 비활성화했습니다.")).toBeVisible();
  await expect(
    page.getByTestId("member-2099999999").getByText("비활성"),
  ).toBeVisible();

  await page
    .getByTestId("member-2024001")
    .getByRole("button", { name: "비활성화" })
    .click();
  await expect(page.getByText("회원을 비활성화했습니다.")).toBeVisible();
  await userPage.goto("/history");
  await expect(userPage).toHaveURL(/\/login/);
  await userContext.close();

  if (await memberCard.isVisible()) {
    await memberCard.getByRole("button", { name: "접속" }).click();
  }
  await expect(page.getByRole("heading", { name: "회원 관리" })).toBeVisible();
  const csv = [
    "student_number,username,phone_number,department,favorite_team,reset_password",
    "2099999998,CSV 회원,01012341234,통계학과,1,false",
    "2099999997,오류 회원,123,통계학과,없는팀,false",
  ].join("\n");
  await expect(page.getByLabel("회원 CSV")).toBeEnabled();
  await page.getByLabel("회원 CSV").setInputFiles({
    name: "members.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.getByText("2행 · CREATE · CSV 회원")).toBeVisible();
  await expect(page.getByText("3행 · ERROR")).toBeVisible();
  await expect(page.getByText("전화번호 형식이 올바르지 않습니다.")).toBeVisible();
  await page.getByRole("button", { name: "유효 행만 반영" }).click();
  await expect(
    page.getByText("1개 행을 반영했습니다. 오류 1개는 제외했습니다."),
  ).toBeVisible();
  await expect(page.getByTestId("member-2099999998")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "처리 결과 CSV 다운로드" })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("member-import-result.csv");

  await page.screenshot({
    path: testInfo.outputPath("issue-37-member-management.png"),
    fullPage: true,
  });
});

test("draft season policy management is available @issue-39", async ({
  page,
}, testInfo) => {
  await page.goto("/admin");
  await page.getByPlaceholder("운영자 아이디").fill("owner");
  await page.getByPlaceholder("운영자 비밀번호").fill("OwnerPass!234");
  await page.getByRole("button", { name: "로그인" }).click();

  const seasonCard = page
    .getByRole("heading", { name: "시즌 관리" })
    .locator("..");
  await seasonCard.getByRole("button", { name: "접속" }).click();
  await expect(page.getByText("초기 지급액 1,000코인").first()).toBeVisible();
  await expect(
    page.getByText(
      "ACTIVE와 ARCHIVED 시즌의 이름, 기간, 초기 지급액은 잠겨 있습니다.",
    ).first(),
  ).toBeVisible();

  page.on("dialog", async (dialog) => {
    await dialog.accept("OwnerPass!234");
  });

  let draftCard = page.getByLabel("Season 2 시즌");
  await draftCard.getByRole("button", { name: "수정" }).click();
  await page.getByLabel("시즌 이름").fill("Season 2 Edited");
  await page.getByLabel("초기 지급액").fill("1500");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("DRAFT 시즌을 수정했습니다.")).toBeVisible();

  draftCard = page.getByLabel("Season 2 Edited 시즌");
  await expect(draftCard.getByText("활성화 예정: 3명 · 총 4,500코인")).toBeVisible();
  await draftCard.getByRole("button", { name: "삭제" }).click();
  const deleteDialog = page.getByRole("dialog");
  await expect(deleteDialog.getByText(/연결 경기 0건 · 연결 마켓 0건/)).toBeVisible();
  await deleteDialog.getByRole("button", { name: "삭제" }).click();
  await expect(page.getByText("DRAFT 시즌을 삭제했습니다.")).toBeVisible();

  await page.getByRole("button", { name: "새 시즌" }).click();
  await page.getByLabel("시즌 이름").fill("UI Season");
  await page.getByLabel("시작일").fill("2027-04-10");
  await page.getByLabel("종료일").fill("2027-04-01");
  await page.getByLabel("초기 지급액").fill("1500");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(
    page.getByText("시작일은 종료일보다 빨라야 합니다."),
  ).toBeVisible();
  await page.getByLabel("시작일").fill("2027-04-01");
  await page.getByLabel("종료일").fill("2027-04-30");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("DRAFT 시즌을 생성했습니다.")).toBeVisible();

  const uiSeason = page.getByLabel("UI Season 시즌");
  await expect(uiSeason.getByText("활성화 예정: 3명 · 총 4,500코인")).toBeVisible();

  const service = createLocalServiceClient();
  const marketCleanup = await service
    .from("markets")
    .update({ status: "CANCELED" })
    .eq("season_id", 1);
  expect(marketCleanup.error).toBeNull();

  await uiSeason.getByRole("button", { name: "시즌 시작" }).click();
  const activateDialog = page.getByRole("dialog");
  await expect(
    activateDialog.getByText(/대상 회원 3명 · 1인당 1,500코인 · 총 4,500코인/),
  ).toBeVisible();
  await activateDialog.getByRole("button", { name: "활성화" }).click();
  await expect(
    page.getByText("새 시즌을 활성화하고 초기 코인을 지급했습니다."),
  ).toBeVisible();
  await expect(
    page.getByLabel("UI Season 시즌").getByText("ACTIVE", { exact: true }),
  ).toBeVisible();

  const activated = await service
    .from("seasons")
    .select("id")
    .eq("name", "UI Season")
    .single();
  expect(activated.error).toBeNull();
  const [wallets, grants] = await Promise.all([
    service
      .from("wallets")
      .select("id", { count: "exact", head: true })
      .eq("season_id", activated.data!.id)
      .eq("balance", 1500),
    service
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("season_id", activated.data!.id)
      .eq("type", "SEASON_GRANT")
      .eq("amount", 1500),
  ]);
  expect(wallets.count).toBe(3);
  expect(grants.count).toBe(3);

  await page.screenshot({
    path: testInfo.outputPath("issue-39-draft-season-policy.png"),
    fullPage: true,
  });
});

test("season close readiness processing is available @issue-40", async ({
  page,
}, testInfo) => {
  await page.goto("/admin");
  await page.getByPlaceholder("운영자 아이디").fill("owner");
  await page.getByPlaceholder("운영자 비밀번호").fill("OwnerPass!234");
  await page.getByRole("button", { name: "로그인" }).click();

  const service = createLocalServiceClient();
  const canceledBlocker = await service
    .from("markets")
    .update({ status: "OPEN" })
    .eq("id", 5);
  expect(canceledBlocker.error).toBeNull();

  const seasonCard = page
    .getByRole("heading", { name: "시즌 관리" })
    .locator("..");
  await seasonCard.getByRole("button", { name: "접속" }).click();
  await expect(
    page.getByRole("heading", { name: "시즌 종료 준비" }),
  ).toBeVisible();

  await expect(page.getByText("종료 차단: 미정산 마켓 5건")).toBeVisible();
  await expect(page.getByText("1 / 3")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV 다운로드" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "season-1-close-readiness.csv",
  );

  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  const canceledCard = page.getByLabel("마켓 5");
  await expect(canceledCard.getByText("취소 권장")).toBeVisible();
  await expect(
    canceledCard.getByLabel("마켓 5 작업").locator("option"),
  ).toHaveCount(1);

  page.on("dialog", async (dialog) => {
    await dialog.accept(
      dialog.type() === "prompt" ? "OwnerPass!234" : undefined,
    );
  });
  await page.getByRole("button", { name: "모든 차단 마켓 처리" }).click();
  await expect(
    page.getByText("처리 완료: 성공 5건 · 실패 0건"),
  ).toBeVisible();
  await expect(page.getByText("종료 차단: 미정산 마켓 3건")).toBeVisible();

  await page.getByRole("button", { name: "모든 차단 마켓 처리" }).click();
  await expect(
    page.getByText("처리 완료: 성공 3건 · 실패 0건"),
  ).toBeVisible();
  await expect(page.getByText("종료 및 다음 시즌 활성화 가능")).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath("issue-40-close-ready-console.png"),
    fullPage: true,
  });

  const closeButton = page.getByRole("button", { name: "시즌 종료 확정" });
  await expect(closeButton).toBeEnabled();
  await closeButton.click();
  await expect(
    page.getByLabel("Season 1 시즌").getByText("ARCHIVED", { exact: true }),
  ).toBeVisible();

  const audit = await service
    .from("admin_audit_logs")
    .select("action")
    .in("action", ["SEASON_MARKET_BULK_PROCESS", "SEASON_CLOSE"]);
  expect(audit.error).toBeNull();
  expect(
    new Set(audit.data?.map((row) => row.action)),
  ).toEqual(new Set(["SEASON_MARKET_BULK_PROCESS", "SEASON_CLOSE"]));

  await page.screenshot({
    path: testInfo.outputPath("issue-40-season-close-readiness.png"),
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
