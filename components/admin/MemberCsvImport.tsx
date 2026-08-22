"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  memberPreviewToCsv,
  previewMemberCsv,
} from "@/lib/admin/member-csv";
import {
  bulkUpsertAdminMembers,
  type AdminMember,
  type AdminTeamRef,
} from "@/lib/admin/member-client";

type Props = Readonly<{
  members: readonly AdminMember[];
  teams: readonly AdminTeamRef[];
  onApplied: () => Promise<void>;
}>;

export default function MemberCsvImport({
  members,
  teams,
  onApplied,
}: Props) {
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof previewMemberCsv>>(
    [],
  );
  const [message, setMessage] = useState("");
  const validRows = preview.filter((row) => row.member !== null);
  const errorCount = preview.filter((row) => row.status === "ERROR").length;

  async function handleFile(file: File | undefined) {
    setMessage("");
    const text = file ? await file.text() : "";
    setFileName(file?.name ?? "");
    setPreview(text ? previewMemberCsv(text, members, teams) : []);
  }

  async function handleApply() {
    if (validRows.length === 0) return;
    try {
      await bulkUpsertAdminMembers(
        validRows.flatMap((row) => (row.member ? [row.member] : [])),
      );
      setMessage(
        `${validRows.length}개 행을 반영했습니다.${
          errorCount ? ` 오류 ${errorCount}개는 제외했습니다.` : ""
        }`,
      );
      await onApplied();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "반영에 실패했습니다.");
    }
  }

  function downloadResult() {
    const url = URL.createObjectURL(
      new Blob([memberPreviewToCsv(preview)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "member-import-result.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="space-y-3 rounded-2xl p-4 shadow">
      <div>
        <h2 className="font-bold">CSV 일괄 등록</h2>
        <p className="text-xs text-muted-foreground">
          student_number, username, phone_number, department, favorite_team,
          reset_password
        </p>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <label className="cursor-pointer rounded-lg border bg-white px-3 py-2 font-semibold">
          CSV 파일 선택
          <input
            aria-label="회원 CSV"
            className="sr-only"
            type="file"
            accept=".csv,text/csv"
            disabled={teams.length === 0}
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
        </label>
        <span className="truncate text-muted-foreground">
          {fileName || "선택된 파일 없음"}
        </span>
      </div>
      {preview.length > 0 && (
        <>
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {preview.map((row) => (
              <div
                key={row.rowNumber}
                className="rounded-lg border bg-white p-2 text-xs"
              >
                <p className="font-semibold">
                  {row.rowNumber}행 · {row.status}
                  {row.member ? ` · ${row.member.username}` : ""}
                </p>
                {row.errors.map((error) => (
                  <p key={error} className="text-red-600">
                    {error}
                  </p>
                ))}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => void handleApply()}>
              {errorCount ? "유효 행만 반영" : "전체 반영"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setFileName("");
                setPreview([]);
              }}
            >
              전체 취소
            </Button>
            <Button
              variant="outline"
              className="col-span-2"
              onClick={downloadResult}
            >
              처리 결과 CSV 다운로드
            </Button>
          </div>
        </>
      )}
      {message && <p className="text-sm font-semibold">{message}</p>}
    </Card>
  );
}
