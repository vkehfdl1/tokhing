import { describe, expect, it } from "vitest";
import {
  memberPreviewToCsv,
  previewMemberCsv,
} from "@/lib/admin/member-csv";

describe("member CSV preview", () => {
  it("classifies valid, duplicate, and invalid rows with Korean reasons", () => {
    const preview = previewMemberCsv(
      [
        "student_number,username,phone_number,department,favorite_team,reset_password",
        '2099999999,"CSV, 회원",01012341234,통계학과,1,false',
        "2099999999,중복 회원,01012341234,통계학과,1,false",
        "2099999998,오류 회원,123,통계학과,없는팀,false",
      ].join("\n"),
      [],
      [{ id: 1, name: "KIA 타이거즈", short_name: "KIA" }],
    );

    expect(preview[0]).toMatchObject({
      rowNumber: 2,
      status: "CREATE",
      member: { username: "CSV, 회원", favorite_team_id: 1 },
    });
    expect(preview[1].errors).toContain("CSV 안에 중복 학번이 있습니다.");
    expect(preview[2].errors).toEqual(
      expect.arrayContaining([
        "전화번호 형식이 올바르지 않습니다.",
        "선호팀을 찾을 수 없습니다.",
      ]),
    );
    expect(memberPreviewToCsv(preview)).toContain("CSV 안에 중복 학번");
  });
});
