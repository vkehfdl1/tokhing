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
});

test("team master data management is available @issue-38", async ({
  page,
}, testInfo) => {
  await page.goto("/admin");
  await page.getByPlaceholder("운영자 아이디").fill("owner");
  await page.getByPlaceholder("운영자 비밀번호").fill("OwnerPass!234");
  await page.getByRole("button", { name: "로그인" }).click();

  const teamCard = page
    .getByRole("heading", { name: "팀 관리" })
    .locator("..");
  await teamCard.getByRole("button", { name: "접속" }).click();
  await expect(
    page.getByRole("heading", { name: "팀 관리" }),
  ).toBeVisible();

  await page.getByLabel("팀 이름").fill("테스트 원본팀");
  await page.getByLabel("약칭").fill("TSRC");
  await page.getByLabel("팀 색상", { exact: true }).fill("#112244");
  await page.getByRole("button", { name: "팀 저장" }).click();
  await expect(page.getByText("팀을 등록했습니다.")).toBeVisible();

  await page.getByLabel("팀 이름").fill("테스트 유지팀");
  await page.getByLabel("약칭").fill("TDST");
  await page.getByLabel("팀 색상", { exact: true }).fill("#335566");
  await page.getByRole("button", { name: "팀 저장" }).click();
  await expect(page.getByText("팀을 등록했습니다.")).toBeVisible();

  await page.getByLabel("팀 이름").fill("약칭 충돌팀");
  await page.getByLabel("약칭").fill("TDST");
  await page.getByLabel("팀 색상", { exact: true }).fill("#778899");
  await page.getByRole("button", { name: "팀 저장" }).click();
  await expect(
    page.getByText("팀 이름, 약칭 또는 같은 소스의 별칭이 이미 사용 중입니다."),
  ).toBeVisible();

  await page.getByRole("button", { name: /테스트 원본팀.*TSRC/ }).click();
  await page.getByLabel("팀 이름").fill("테스트 원본팀 수정");
  await page.getByRole("button", { name: "팀 저장" }).click();
  await expect(page.getByText("팀 정보를 수정했습니다.")).toBeVisible();
  await page.getByLabel("소스").selectOption("WBC");
  await page.getByLabel("별칭").fill("Test Source");
  await page.getByRole("button", { name: "별칭 추가" }).click();
  await expect(page.getByText("소스 별칭을 추가했습니다.")).toBeVisible();

  await page.getByRole("button", { name: /승인 대기/ }).click();
  await page.getByLabel("소스").selectOption("WBC");
  await page
    .getByLabel("외부 팀명")
    .fill("Test Source, Unmapped Nine");
  await page.getByRole("button", { name: "매핑 미리보기" }).click();
  const preview = page.getByLabel("매핑 미리보기 결과");
  await expect(preview.getByText(/자동 매핑 · 테스트 원본팀 수정/)).toBeVisible();
  await expect(preview.getByText("승인 필요")).toBeVisible();

  const namesBeforeApproval = await page.evaluate(async () => {
    const response = await fetch("/api/admin/teams");
    const body = (await response.json()) as {
      teams: Array<{ name: string }>;
    };
    return body.teams.map((team) => team.name);
  });
  expect(namesBeforeApproval).not.toContain("Unmapped Nine");

  await page.getByLabel("기존 팀에 매핑").selectOption({
    label: "테스트 유지팀 (TDST)",
  });
  await page.getByRole("button", { name: "매핑 승인" }).click();
  await expect(
    page.getByText("Unmapped Nine 매핑을 승인했습니다."),
  ).toBeVisible();

  const teamIds = await page.evaluate(async () => {
    const response = await fetch("/api/admin/teams");
    const body = (await response.json()) as {
      teams: Array<{ id: number; name: string }>;
    };
    return {
      source: body.teams.find((team) => team.name === "테스트 원본팀 수정")!
        .id,
      target: body.teams.find((team) => team.name === "테스트 유지팀")!.id,
    };
  });
  const gameSave = await page.evaluate(async ({ source, target }) => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    const response = await fetch("/api/admin/game-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_games",
        games: [
          {
            game_date: date.toISOString().slice(0, 10),
            game_time: "18:30",
            home_team_id: source,
            away_team_id: 1,
            home_pitcher: "",
            away_pitcher: "",
            home_score: null,
            away_score: null,
            game_status: "SCHEDULED",
          },
        ],
      }),
    });
    return { ok: response.ok, target };
  }, teamIds);
  expect(gameSave.ok).toBe(true);

  await page.getByRole("button", { name: "팀 병합" }).click();
  await page.getByLabel("병합 원본 팀").selectOption(String(teamIds.source));
  await page.getByLabel("병합 유지 팀").selectOption(String(teamIds.target));
  await page.getByRole("button", { name: "영향 확인" }).click();
  await expect(page.getByText("영향 경기 1건")).toBeVisible();

  page.on("dialog", async (dialog) => {
    await dialog.accept(
      dialog.type() === "prompt" ? "OwnerPass!234" : undefined,
    );
  });
  await page.getByRole("button", { name: "확인 후 병합 실행" }).click();
  await expect(page.getByText("팀 병합을 완료했습니다.")).toBeVisible();
  await page.getByRole("button", { name: "팀 목록" }).click();
  await expect(page.getByText("TSRC · 병합됨")).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath("issue-38-team-management.png"),
    fullPage: true,
  });
});
