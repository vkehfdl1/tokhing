# 운영자 대시보드 설정

## 보안 모델

관리자 페이지는 더 이상 `NEXT_PUBLIC_ADMIN_PASSWORD_HASH` 또는
`sessionStorage`를 보안 경계로 사용하지 않습니다.

- 운영자 계정: `admin_operators`
- 역할: `OWNER`, `OPERATOR`, `VIEWER`
- 세션: 무작위 토큰을 해시해 `admin_sessions`에 저장하고, 브라우저에는
  `HttpOnly`, `SameSite=Strict` 쿠키만 저장
- 비밀번호: 서버에서 salt를 포함한 scrypt 해시로 저장
- 중요 작업: 최근 10분 이내 비밀번호 재인증 필요
- 감사: 로그인, 로그아웃, 재인증, 운영자 변경, 관리자 RPC 성공·실패를
  `admin_audit_logs`에 기록
- 관리자 전용 RPC: `anon`과 일반 `authenticated` 역할의 직접 실행 권한 제거

`SUPABASE_SERVICE_ROLE_KEY`는 서버 전용입니다. `NEXT_PUBLIC_` 접두사를 붙이거나
클라이언트 번들에 전달하면 안 됩니다.

## 로컬 설정

운영 데이터베이스를 사용하지 않고 로컬 Supabase에서만 검증합니다.

```bash
supabase start
npm run db:reset:local
npm run dev:local
```

`db:reset:local`이 로컬 전용 샘플 데이터를 넣습니다.

- 어드민 비밀번호: `OwnerPass!234` (`/admin`에서 아이디 입력 없이 사용)
- 일반 회원: `2024001` / `01012345678`
- 일반 회원: `2024002` / `01087654321`
- 일반 회원: `2024003` / `01011112222`
- Supabase Studio: `http://127.0.0.1:54323`

샘플 OWNER를 쓰지 않고 빈 DB에 직접 생성할 때만
`admin:bootstrap:local`을 사용합니다. 이 명령은 `supabase status -o env`에서
얻은 `127.0.0.1` URL과 로컬 service-role key만 사용합니다.

## 기존 운영 환경의 최초 OWNER 이관

1. 검토된 배포 절차로 `20260802000036_admin_operator_auth.sql`을 적용합니다.
2. 서버 환경에 다음 값을 설정합니다.

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
   ```

3. 배포 담당자가 보안 터미널에서 프로젝트 ref를 다시 확인한 뒤 한 번만
   bootstrap 스크립트를 실행합니다.

   ```bash
   ADMIN_BOOTSTRAP_CONFIRM=CREATE_INITIAL_OWNER \
   ADMIN_BOOTSTRAP_PROJECT_REF=<project-ref> \
   ADMIN_BOOTSTRAP_USERNAME=<owner-id> \
   ADMIN_BOOTSTRAP_DISPLAY_NAME='<owner-name>' \
   ADMIN_BOOTSTRAP_PASSWORD='<temporary-strong-password>' \
   npx tsx scripts/bootstrap-admin.ts
   ```

4. 스크립트는 운영자가 이미 한 명이라도 있으면 중단합니다.
5. 최초 OWNER는 `/admin`에서 로그인한 뒤 즉시 비밀번호를 변경합니다.
6. bootstrap용 환경변수와 셸 기록에 남을 수 있는 임시 비밀번호를 제거합니다.
7. 기존 `NEXT_PUBLIC_ADMIN_PASSWORD_HASH`는 삭제합니다.

이 절차는 자동 배포 훅에 넣지 않습니다. 최초 OWNER 생성은 명시적 확인값과
프로젝트 ref가 모두 일치할 때만 한 번 수행합니다.

## 역할

### OWNER

- 운영자 추가, 역할 변경, 활성화·비활성화
- 임시 비밀번호 재설정
- 모든 일반 운영 작업

마지막 활성 OWNER는 역할을 낮추거나 비활성화할 수 없습니다.

### OPERATOR

- 운영자 목록 조회
- 일반 운영 작업
- 감사 로그 조회

### VIEWER

- 운영자 목록과 허용된 읽기 화면 조회
- 변경 작업 불가

## 세션과 비밀번호

- 비활성화된 운영자의 기존 세션은 즉시 무효화됩니다.
- OWNER가 임시 비밀번호를 재설정하면 기존 세션이 무효화됩니다.
- 본인 비밀번호 변경 시 현재 비밀번호를 확인하고 다른 세션을 무효화합니다.
- 중요 작업 전에 대시보드의 `재인증`을 사용합니다.
- `로그아웃`은 서버 세션을 폐기하고 쿠키를 제거합니다.

## 검증

```bash
npm run test:unit -- --run tests/admin/issue-36.test.ts
npm run test:db
npx playwright test tests/e2e/admin-ops.spec.ts --grep "@issue-36"
npm run build:local
```

모든 명령은 로컬 Supabase가 실행 중이어야 하며, 테스트 설정은 loopback URL이
아니면 즉시 실패합니다.
