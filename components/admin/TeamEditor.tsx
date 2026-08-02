"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveManagedTeam,
  saveTeamAlias,
  type ManagedTeam,
  type TeamAlias,
} from "@/lib/admin/team-client";

type Props = Readonly<{
  team: ManagedTeam | null;
  aliases: TeamAlias[];
  onSaved: () => Promise<void>;
}>;

export default function TeamEditor({ team, aliases, onSaved }: Props) {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [color, setColor] = useState("#32C600");
  const [source, setSource] = useState("KBO");
  const [alias, setAlias] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(team?.name ?? "");
    setShortName(team?.short_name ?? "");
    setColor(team?.team_color ?? "#32C600");
    setMessage("");
  }, [team]);

  async function submitTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await saveManagedTeam({
        id: team?.id,
        name,
        shortName,
        teamColor: color.toUpperCase(),
      });
      setMessage(team ? "팀 정보를 수정했습니다." : "팀을 등록했습니다.");
      if (!team) {
        setName("");
        setShortName("");
        setColor("#32C600");
      }
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "팀 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function submitAlias(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!team) return;
    setSaving(true);
    setMessage("");
    try {
      await saveTeamAlias({ source, alias, teamId: team.id });
      setAlias("");
      setMessage("소스 별칭을 추가했습니다.");
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "별칭 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl p-4">
        <h3 className="mb-4 text-lg font-bold text-black">
          {team ? "팀 정보 수정" : "새 팀 등록"}
        </h3>
        <form className="space-y-3" onSubmit={submitTeam}>
          <div>
            <Label htmlFor="team-name">팀 이름</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="team-short-name">약칭</Label>
            <Input
              id="team-short-name"
              value={shortName}
              onChange={(event) => setShortName(event.target.value)}
              maxLength={10}
              required
            />
          </div>
          <div>
            <Label htmlFor="team-color">팀 색상</Label>
            <div className="mt-1 flex items-center gap-3">
              <Input
                id="team-color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                pattern="#[0-9A-Fa-f]{6}"
                required
              />
              <input
                aria-label="팀 색상 선택"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value.toUpperCase())}
                className="h-12 w-14 rounded-lg border"
              />
            </div>
          </div>
          <Button className="h-12 w-full" disabled={saving}>
            {saving ? "저장 중..." : "팀 저장"}
          </Button>
        </form>
      </Card>

      {team?.is_active ? (
        <Card className="rounded-2xl p-4">
          <h3 className="mb-3 text-lg font-bold text-black">소스별 별칭</h3>
          <div className="mb-4 flex flex-wrap gap-2">
            {aliases.length ? (
              aliases.map((item) => (
                <span
                  key={item.id}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs"
                >
                  {item.source} · {item.alias}
                </span>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">등록된 별칭이 없습니다.</p>
            )}
          </div>
          <form className="space-y-3" onSubmit={submitAlias}>
            <div>
              <Label htmlFor="alias-source">소스</Label>
              <select
                id="alias-source"
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
              <Label htmlFor="team-alias">별칭</Label>
              <Input
                id="team-alias"
                value={alias}
                onChange={(event) => setAlias(event.target.value)}
                required
              />
            </div>
            <Button variant="outline" className="h-12 w-full" disabled={saving}>
              별칭 추가
            </Button>
          </form>
        </Card>
      ) : null}

      {message ? (
        <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
