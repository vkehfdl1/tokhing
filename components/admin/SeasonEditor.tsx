"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveDraftSeason,
  type ManagedSeason,
} from "@/lib/admin/season-client";

type Props = Readonly<{
  season: ManagedSeason | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}>;

export default function SeasonEditor({ season, onClose, onSaved }: Props) {
  const [name, setName] = useState(season?.name ?? "");
  const [startDate, setStartDate] = useState(season?.start_date ?? "");
  const [endDate, setEndDate] = useState(season?.end_date ?? "");
  const [initialGrant, setInitialGrant] = useState(
    String(season?.initial_grant_amount ?? 1000),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(initialGrant);
    if (startDate >= endDate) {
      setError("시작일은 종료일보다 빨라야 합니다.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("초기 지급액은 0보다 커야 합니다.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveDraftSeason({
        id: season?.id,
        name,
        startDate,
        endDate,
        initialGrantAmount: amount,
      });
      await onSaved();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "DRAFT 시즌 저장에 실패했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-md rounded-2xl bg-white p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-black">
          {season ? "DRAFT 시즌 수정" : "새 DRAFT 시즌"}
        </h3>
        <form className="mt-5 space-y-4" onSubmit={submit}>
          <div>
            <Label htmlFor="season-name">시즌 이름</Label>
            <Input
              id="season-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="season-start">시작일</Label>
            <Input
              id="season-start"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="season-end">종료일</Label>
            <Input
              id="season-end"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="season-initial-grant">초기 지급액</Label>
            <Input
              id="season-initial-grant"
              type="number"
              min="1"
              value={initialGrant}
              onChange={(event) => setInitialGrant(event.target.value)}
              required
            />
          </div>
          {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-12" onClick={onClose}>
              취소
            </Button>
            <Button className="h-12" disabled={saving}>
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
