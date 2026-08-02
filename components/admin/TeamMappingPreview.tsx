"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resolveAdminTeamMappings,
  type TeamMappingPreview as MappingResult,
} from "@/lib/admin/team-client";

type Props = Readonly<{
  onPendingCreated: () => Promise<void>;
}>;

export default function TeamMappingPreview({ onPendingCreated }: Props) {
  const [source, setSource] = useState("KBO");
  const [names, setNames] = useState("");
  const [results, setResults] = useState<MappingResult[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const externalNames = names
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    setLoading(true);
    setMessage("");
    try {
      setResults(await resolveAdminTeamMappings(source, externalNames));
      await onPendingCreated();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "자동 매핑 미리보기에 실패했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="rounded-2xl p-4">
      <h3 className="mb-2 text-lg font-bold text-black">자동 매핑 미리보기</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        찾지 못한 값은 팀을 임의 생성하지 않고 승인 대기 목록으로 보냅니다.
      </p>
      <form className="space-y-3" onSubmit={preview}>
        <div>
          <Label htmlFor="mapping-preview-source">소스</Label>
          <select
            id="mapping-preview-source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="mt-1 h-12 w-full rounded-lg border bg-white px-3 text-sm"
          >
            <option value="KBO">KBO</option>
            <option value="WBC">WBC</option>
            <option value="FRIENDLY">친선 경기</option>
          </select>
        </div>
        <div>
          <Label htmlFor="mapping-preview-names">외부 팀명</Label>
          <Input
            id="mapping-preview-names"
            value={names}
            onChange={(event) => setNames(event.target.value)}
            placeholder="팀명을 쉼표로 구분"
            required
          />
        </div>
        <Button className="h-12 w-full" disabled={loading}>
          {loading ? "확인 중..." : "매핑 미리보기"}
        </Button>
      </form>
      {results.length ? (
        <div className="mt-4 space-y-2" aria-label="매핑 미리보기 결과">
          {results.map((result) => (
            <div
              key={result.external_name}
              className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm"
            >
              <span>{result.external_name}</span>
              <span
                className={
                  result.mapping_status === "MAPPED"
                    ? "font-semibold text-green-600"
                    : "font-semibold text-amber-600"
                }
              >
                {result.mapping_status === "MAPPED"
                  ? `자동 매핑 · ${result.team_name}`
                  : "승인 필요"}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {message ? <p role="alert" className="mt-3 text-sm text-red-600">{message}</p> : null}
    </Card>
  );
}
