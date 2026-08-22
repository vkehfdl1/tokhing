"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchWeeklyGrantStatus,
  runWeeklyGrant,
  saveWeeklyGrantPolicy,
  setWeeklyGrantPaused,
  type WeeklyGrantStatus,
} from "@/lib/admin/weekly-grant-client";

type Props = Readonly<{ onReauthenticate: () => Promise<boolean> }>;

function currentRoundKey() {
  const date = new Date();
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

function nextRunLabel(weekday: number, grantTime: string) {
  const [hour, minute] = grantTime.split(":").map(Number);
  const now = new Date();
  const kstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const current = kstNow.getDay() || 7;
  let days = (weekday - current + 7) % 7;
  const candidate = new Date(kstNow);
  candidate.setDate(candidate.getDate() + days);
  candidate.setHours(hour, minute, 0, 0);
  if (candidate <= kstNow) {
    days += 7;
    candidate.setDate(candidate.getDate() + 7);
  }
  return candidate.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function WeeklyGrantManagement({ onReauthenticate }: Props) {
  const [status, setStatus] = useState<WeeklyGrantStatus | null>(null);
  const [amount, setAmount] = useState("300");
  const [weekday, setWeekday] = useState("1");
  const [grantTime, setGrantTime] = useState("00:00");
  const [automatic, setAutomatic] = useState(true);
  const [roundKey, setRoundKey] = useState(currentRoundKey());
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const next = await fetchWeeklyGrantStatus();
      setStatus(next);
      setAmount(String(next.amount));
      setWeekday(String(next.weekday));
      setGrantTime(next.grant_time);
      setAutomatic(next.automatic_enabled);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "정책 조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function save() {
    setLoading(true);
    try {
      const next = await saveWeeklyGrantPolicy({
        amount: Number(amount),
        weekday: Number(weekday),
        grantTime,
        automaticEnabled: automatic,
      });
      setStatus(next);
      setMessage("주간 지급 정책을 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "정책 저장에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function togglePause() {
    if (!status) return;
    setLoading(true);
    try {
      const next = await setWeeklyGrantPaused(!status.is_paused);
      setStatus(next);
      setMessage(next.is_paused ? "자동 지급을 일시정지했습니다." : "자동 지급을 재개했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "상태 변경에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function run() {
    if (!(await onReauthenticate())) return;
    setLoading(true);
    try {
      const result = await runWeeklyGrant(roundKey);
      setMessage(
        result.status === "SKIPPED"
          ? result.message ?? "이미 지급된 라운드입니다."
          : `${roundKey} 라운드를 수동 지급했습니다.`,
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "수동 지급에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const previewTotal = Number(amount || 0) * (status?.expected_recipient_count ?? 0);

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-xl font-bold text-black">주간 코인 지급 정책</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          KST 기준 정책과 실제 UTC cron을 함께 관리합니다.
        </p>
      </div>
      <Card className="rounded-2xl p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="weekly-amount">회차 지급액</Label>
            <Input id="weekly-amount" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="weekly-weekday">요일 (KST)</Label>
            <select id="weekly-weekday" value={weekday} onChange={(e) => setWeekday(e.target.value)} className="mt-1 h-12 w-full rounded-lg border bg-white px-3">
              {["월","화","수","목","금","토","일"].map((label, index) => <option key={label} value={index + 1}>{label}요일</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="weekly-time">시간 (KST)</Label>
            <Input id="weekly-time" type="time" value={grantTime} onChange={(e) => setGrantTime(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 self-end pb-3 text-sm">
            <input type="checkbox" checked={automatic} onChange={(e) => setAutomatic(e.target.checked)} />
            자동 실행
          </label>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
          <p>예상 다음 실행: {nextRunLabel(Number(weekday), grantTime)} KST</p>
          <p>예상 지급: {status?.expected_recipient_count ?? 0}명 · {previewTotal.toLocaleString()}코인</p>
          <p>저장된 cron: {status?.cron_expression ?? "-"}</p>
        </div>
        <Button className="mt-4 h-12 w-full" disabled={loading} onClick={() => void save()}>정책 저장</Button>
      </Card>
      <Card className="rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{status?.is_paused ? "일시정지" : status?.cron_active ? "자동 실행 중" : "자동 실행 꺼짐"}</p>
            <p className="text-xs text-muted-foreground">다음 실행: {status?.next_run ? new Date(status.next_run).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-"}</p>
          </div>
          <Button variant="outline" disabled={loading} onClick={() => void togglePause()}>{status?.is_paused ? "재개" : "일시정지"}</Button>
        </div>
      </Card>
      <Card className="rounded-2xl p-4">
        <Label htmlFor="weekly-round">수동 지급 라운드</Label>
        <div className="mt-2 flex gap-2">
          <Input id="weekly-round" value={roundKey} onChange={(e) => setRoundKey(e.target.value)} />
          <Button className="h-12 shrink-0" disabled={loading} onClick={() => void run()}>실행/재실행</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">자동 지급이 멈춰 있어도 수동 실행할 수 있으며 성공한 같은 라운드는 다시 지급되지 않습니다.</p>
      </Card>
      <Card className="rounded-2xl p-4">
        <h4 className="font-semibold">최근 실행</h4>
        <div className="mt-3 space-y-2 text-sm">
          {status?.recent_runs.length ? status.recent_runs.map((item) => (
            <div key={item.id} className="rounded-lg bg-slate-50 p-3">
              <p className="font-medium">{item.round_key} · {item.source} · {item.status}</p>
              <p className="text-xs text-muted-foreground">수신 {item.recipient_count}명 · 총 {Number(item.total_payout).toLocaleString()} · 실패 {item.failure_count}</p>
            </div>
          )) : <p className="text-muted-foreground">실행 기록이 없습니다.</p>}
        </div>
      </Card>
      {message ? <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm">{message}</p> : null}
    </section>
  );
}
