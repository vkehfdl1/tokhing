"use client";

import { useCallback, useEffect, useState } from "react";
import MemberCsvImport from "@/components/admin/MemberCsvImport";
import MemberEditor from "@/components/admin/MemberEditor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getAdminMemberImpact,
  listAdminMembers,
  repairAdminMemberWallet,
  resetAdminMemberPassword,
  setAdminMemberActive,
  upsertAdminMember,
  type AdminMember,
  type AdminMemberInput,
  type AdminTeamRef,
} from "@/lib/admin/member-client";
import type { AdminOperator } from "@/lib/admin/types";

type Props = Readonly<{
  operator: AdminOperator;
  onBack: () => void;
  onReauthenticate: () => Promise<boolean>;
}>;
const EMPTY_FORM: AdminMemberInput = {
  student_number: 0,
  username: "",
  phone_number: "",
  department: "",
  favorite_team_id: 0,
};
const formatCoins = (value: number | null): string =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(
    value ?? 0,
  );
export default function MemberManagement({
  operator,
  onBack,
  onReauthenticate,
}: Props) {
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [teams, setTeams] = useState<AdminTeamRef[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<"all" | "active" | "inactive">("all");
  const [form, setForm] = useState<AdminMemberInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const loadMembers = useCallback(async () => {
    try {
      const data = await listAdminMembers(query, active);
      setMembers(data.members);
      setTeams(data.teams);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "조회에 실패했습니다.");
    }
  }, [active, query]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  function editMember(member: AdminMember) {
    setEditingId(member.id);
    setForm({
      student_number: member.student_number,
      username: member.username,
      phone_number: member.phone_number,
      department: member.department,
      favorite_team_id: member.favorite_team_id,
    });
  }

  async function saveMember(resetPassword = false) {
    if (!(await onReauthenticate())) return;
    try {
      await upsertAdminMember({ ...form, reset_password: resetPassword });
      setMessage(
        resetPassword ? "회원 정보와 초기 비밀번호를 갱신했습니다." : "회원 정보를 저장했습니다.",
      );
      setForm(EMPTY_FORM);
      setEditingId(null);
      await loadMembers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장에 실패했습니다.");
    }
  }

  async function toggleMember(member: AdminMember) {
    try {
      const impact = await getAdminMemberImpact(member.id);
      const confirmation = member.is_active
        ? window.confirm(
            `미정산 포지션 ${impact.open_position_count}개와 기록은 유지됩니다. 비활성화할까요?`,
          )
        : true;
      if (!confirmation || !(await onReauthenticate())) return;
      await setAdminMemberActive(
        member.id,
        !member.is_active,
        confirmation,
        member.is_active ? "관리자 비활성화" : undefined,
      );
      setMessage(member.is_active ? "회원을 비활성화했습니다." : "회원을 재활성화했습니다.");
      await loadMembers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "상태 변경에 실패했습니다.");
    }
  }

  async function repairWallet(member: AdminMember) {
    try {
      if (!(await onReauthenticate())) return;
      await repairAdminMemberWallet(member.id);
      setMessage("활성 시즌 지갑을 복구했습니다.");
      await loadMembers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "지갑 복구에 실패했습니다.");
    }
  }

  async function resetPassword(member: AdminMember) {
    try {
      if (!(await onReauthenticate())) return;
      await resetAdminMemberPassword(member.id);
      setMessage("전화번호 기준 초기 비밀번호로 재설정했습니다.");
      await loadMembers();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "비밀번호 초기화에 실패했습니다.",
      );
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-[430px] space-y-4 bg-gray-50 px-5 py-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-tokhin-green">MEMBERS</p>
          <h1 className="text-2xl font-bold">회원 관리</h1>
        </div>
        <Button variant="outline" onClick={onBack}>
          돌아가기
        </Button>
      </div>

      <Card className="space-y-3 rounded-2xl p-4 shadow">
        <div className="flex gap-2">
          <Input
            placeholder="학번, 이름, 학과 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button variant="outline" onClick={() => void loadMembers()}>
            검색
          </Button>
        </div>
        <select
          aria-label="회원 상태"
          className="h-11 w-full rounded-lg border bg-white px-3"
          value={active}
          onChange={(event) =>
            setActive(event.target.value as "all" | "active" | "inactive")
          }
        >
          <option value="all">전체</option>
          <option value="active">활성</option>
          <option value="inactive">비활성</option>
        </select>
      </Card>

      {operator.role !== "VIEWER" && (
        <MemberEditor
          form={form}
          editing={editingId !== null}
          teams={teams}
          onChange={setForm}
          onSave={saveMember}
        />
      )}

      {operator.role !== "VIEWER" && (
        <MemberCsvImport
          members={members}
          teams={teams}
          onApplied={loadMembers}
          onReauthenticate={onReauthenticate}
        />
      )}

      {message && <p className="text-sm font-semibold">{message}</p>}
      <div className="space-y-3">
        {members.map((member) => (
          <Card
            key={member.id}
            data-testid={`member-${member.student_number}`}
            className="rounded-2xl p-4 shadow"
          >
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-bold">
                  {member.username} · {member.student_number}
                </p>
                <p className="text-sm text-muted-foreground">
                  {member.department} · {member.teams?.short_name ?? "팀 없음"}
                </p>
                <p className="text-sm">
                  지갑:{" "}
                  {member.has_active_wallet
                    ? `${formatCoins(member.active_wallet_balance)}코인`
                    : "누락"}
                </p>
              </div>
              <span className={member.is_active ? "text-green-600" : "text-gray-500"}>
                {member.is_active ? "활성" : "비활성"}
              </span>
            </div>
            {operator.role !== "VIEWER" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => editMember(member)}>
                  수정
                </Button>
                <Button variant="outline" onClick={() => void toggleMember(member)}>
                  {member.is_active ? "비활성화" : "재활성화"}
                </Button>
                {!member.has_active_wallet && member.is_active && (
                  <Button
                    variant="outline"
                    onClick={() => void repairWallet(member)}
                  >
                    지갑 복구
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => void resetPassword(member)}
                >
                  비밀번호 초기화
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </main>
  );
}
