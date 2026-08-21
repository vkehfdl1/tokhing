"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type {
  AdminMemberInput,
  AdminTeamRef,
} from "@/lib/admin/member-client";

type Props = Readonly<{
  form: AdminMemberInput;
  editing: boolean;
  teams: readonly AdminTeamRef[];
  onChange: (form: AdminMemberInput) => void;
  onSave: () => Promise<void>;
}>;

export default function MemberEditor({
  form,
  editing,
  teams,
  onChange,
  onSave,
}: Props) {
  return (
    <Card className="space-y-3 rounded-2xl p-4 shadow">
      <h2 className="font-bold">{editing ? "회원 수정" : "회원 추가"}</h2>
      {!editing ? (
        <p className="text-xs text-muted-foreground">
          초기 비밀번호는 입력한 전화번호로 자동 설정됩니다.
        </p>
      ) : null}
      <Input
        type="number"
        placeholder="학번"
        value={form.student_number || ""}
        disabled={editing}
        onChange={(event) =>
          onChange({ ...form, student_number: Number(event.target.value) })
        }
      />
      <Input
        placeholder="이름"
        value={form.username}
        onChange={(event) => onChange({ ...form, username: event.target.value })}
      />
      <Input
        placeholder="전화번호"
        value={form.phone_number}
        onChange={(event) =>
          onChange({ ...form, phone_number: event.target.value })
        }
      />
      <Input
        placeholder="학과"
        value={form.department}
        onChange={(event) =>
          onChange({ ...form, department: event.target.value })
        }
      />
      <select
        aria-label="선호팀"
        className="h-11 w-full rounded-lg border bg-white px-3"
        value={form.favorite_team_id || ""}
        onChange={(event) =>
          onChange({ ...form, favorite_team_id: Number(event.target.value) })
        }
      >
        <option value="">선호팀 선택</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
      <Button className="w-full" onClick={() => void onSave()}>
        {editing ? "수정 내용 저장" : "회원 바로 추가"}
      </Button>
    </Card>
  );
}
