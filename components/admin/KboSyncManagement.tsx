"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Job = { mode:string; status:string; schedule_kst:string; enabled:boolean; next_run:string|null; recent_runs:Array<Record<string,unknown>> };
type Status = { jobs:Job[]; secret:{configured:boolean;last_rotated_at:string|null} };
async function request(body?:unknown):Promise<any>{
 const response=await fetch("/api/admin/kbo-sync",{method:body?"POST":"GET",credentials:"same-origin",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,cache:"no-store"});
 const data=await response.json(); if(!response.ok) throw new Error(data.error??"KBO 동기화 요청 실패"); return data;
}
export default function KboSyncManagement({onReauthenticate}:{onReauthenticate:()=>Promise<boolean>}){
 const [status,setStatus]=useState<Status|null>(null); const [date,setDate]=useState(new Date().toISOString().slice(0,10)); const [price,setPrice]=useState("33"); const [message,setMessage]=useState("");
 async function refresh(){try{setStatus((await request()).status);}catch(e){setMessage(e instanceof Error?e.message:"조회 실패");}}
 useEffect(()=>{void refresh();},[]);
 async function update(job:Job,paused:boolean){try{await request({action:"update",mode:job.mode,scheduleKst:job.schedule_kst,enabled:job.enabled,paused});setMessage("작업 설정을 저장했습니다.");await refresh();}catch(e){setMessage(e instanceof Error?e.message:"저장 실패");}}
 async function run(mode:string,retryRunId?:number){if(!(await onReauthenticate()))return;try{const result=(await request({action:"run",mode,targetDate:date,initialPrice:Number(price),retryRunId})).result;setMessage(result.status==="SUCCESS"?"동기화를 완료했습니다.":`${result.error_code}: 관리자 경기 입력으로 전환할 수 있습니다.`);await refresh();}catch(e){setMessage(e instanceof Error?e.message:"실행 실패");}}
 return <section className="space-y-4">
  <div><h2 className="text-2xl font-bold">KBO 동기화</h2><p className="text-sm text-muted-foreground">일일 시드와 시간별 새로고침을 독립적으로 관찰하고 제어합니다.</p></div>
  <Card className="rounded-2xl p-4"><p className="font-semibold">Vault secret: {status?.secret.configured?"설정됨":"미설정"}</p><p className="text-xs text-muted-foreground">마지막 교체: {status?.secret.last_rotated_at??"-"} · 평문 secret은 표시하지 않습니다.</p></Card>
  <div className="grid grid-cols-2 gap-2"><Input aria-label="동기화 대상 날짜" type="date" value={date} onChange={e=>setDate(e.target.value)}/><Input aria-label="초기 가격" type="number" value={price} onChange={e=>setPrice(e.target.value)}/></div>
  {status?.jobs.map(job=><Card key={job.mode} className="rounded-2xl p-4" aria-label={job.mode}>
   <div className="flex justify-between"><div><h3 className="font-bold">{job.mode}</h3><p className="text-xs text-muted-foreground">{job.status} · 다음 실행 {job.next_run?new Date(job.next_run).toLocaleString("ko-KR"):"-"}</p></div><span className="text-xs">{job.enabled?"ENABLED":"DISABLED"}</span></div>
   <Input aria-label={`${job.mode} KST 시간`} type="time" value={job.schedule_kst} onChange={e=>setStatus(s=>s?{...s,jobs:s.jobs.map(j=>j.mode===job.mode?{...j,schedule_kst:e.target.value}:j)}:s)}/>
   <div className="mt-3 grid grid-cols-3 gap-2"><Button variant="outline" onClick={()=>void update(job,job.status!=="PAUSED")}>{job.status==="PAUSED"?"재개":"일시정지"}</Button><Button variant="outline" onClick={()=>void update(job,false)}>일정 저장</Button><Button onClick={()=>void run(job.mode)}>즉시 실행</Button></div>
   <div className="mt-3 space-y-2 text-xs">{job.recent_runs.length?job.recent_runs.map((r:any)=><div key={r.id} className="rounded bg-slate-50 p-2"><p>{r.status} · 생성 {r.matches_created} / 갱신 {r.matches_updated} / 건너뜀 {r.skipped_items} / 마켓 {r.markets_created} / 종료 {r.markets_closed} / 오류 {r.error_count}</p>{r.status==="FAILURE"?<Button variant="link" className="h-auto p-0 text-xs" onClick={()=>void run(job.mode,r.id)}>동일 입력 재시도</Button>:null}</div>):<p>실행 기록 없음</p>}</div>
  </Card>)}
  {message?<p role="status" className="rounded bg-slate-100 p-3 text-sm">{message}</p>:null}
 </section>;
}
