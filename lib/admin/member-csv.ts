import type {
  AdminMember,
  AdminMemberInput,
  AdminTeamRef,
} from "@/lib/admin/member-client";

export type MemberCsvPreview = Readonly<{
  rowNumber: number;
  status: "CREATE" | "UPDATE" | "ERROR";
  member: AdminMemberInput | null;
  errors: readonly string[];
}>;

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  cells.push(value.trim());
  return cells;
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

export function previewMemberCsv(
  csv: string,
  members: readonly AdminMember[],
  teams: readonly AdminTeamRef[],
): MemberCsvPreview[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((value) => value.toLowerCase());
  const required = [
    "student_number",
    "username",
    "phone_number",
    "department",
    "favorite_team",
  ];
  if (required.some((header) => !headers.includes(header))) {
    return [
      {
        rowNumber: 1,
        status: "ERROR",
        member: null,
        errors: [`필수 헤더: ${required.join(", ")}`],
      },
    ];
  }

  const existing = new Set(members.map((member) => member.student_number));
  const seen = new Set<number>();
  const teamByLabel = new Map<string, number>();
  for (const team of teams) {
    teamByLabel.set(String(team.id), team.id);
    teamByLabel.set(team.name.toLowerCase(), team.id);
    teamByLabel.set(team.short_name.toLowerCase(), team.id);
  }

  return lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    );
    const errors: string[] = [];
    const studentNumber = Number(row.student_number);
    const phone = normalizePhone(row.phone_number);
    const teamId = teamByLabel.get(row.favorite_team.toLowerCase());

    if (!Number.isSafeInteger(studentNumber) || studentNumber <= 0) {
      errors.push("학번은 양의 정수여야 합니다.");
    } else if (seen.has(studentNumber)) {
      errors.push("CSV 안에 중복 학번이 있습니다.");
    } else {
      seen.add(studentNumber);
    }
    if (!row.username.trim()) errors.push("이름은 필수입니다.");
    if (!row.department.trim()) errors.push("학과는 필수입니다.");
    if (!/^01[016789][0-9]{7,8}$/.test(phone)) {
      errors.push("전화번호 형식이 올바르지 않습니다.");
    }
    if (!teamId) errors.push("선호팀을 찾을 수 없습니다.");

    const member =
      errors.length === 0 && teamId
        ? {
            student_number: studentNumber,
            username: row.username.trim(),
            phone_number: phone,
            department: row.department.trim(),
            favorite_team_id: teamId,
            reset_password: /^(1|true|yes)$/i.test(row.reset_password ?? ""),
          }
        : null;

    return {
      rowNumber: rowIndex + 2,
      status:
        errors.length > 0
          ? "ERROR"
          : existing.has(studentNumber)
            ? "UPDATE"
            : "CREATE",
      member,
      errors,
    };
  });
}

function escapeCsv(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function memberPreviewToCsv(rows: readonly MemberCsvPreview[]): string {
  const lines = [
    ["row", "status", "student_number", "username", "errors"].join(","),
    ...rows.map((row) =>
      [
        row.rowNumber,
        row.status,
        row.member?.student_number ?? "",
        row.member?.username ?? "",
        row.errors.join(" / "),
      ]
        .map(escapeCsv)
        .join(","),
    ),
  ];
  return `\uFEFF${lines.join("\n")}`;
}
