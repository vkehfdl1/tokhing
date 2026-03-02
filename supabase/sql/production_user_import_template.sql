-- Production user import template
-- 1) Replace VALUES rows with real users.
-- 2) favorite_team_short_name is optional; if missing, fallback_team_id will be used.
-- 3) Initial password hash is SHA-256(phone_number), password_changed = FALSE.

WITH source_users (
  student_number,
  username,
  phone_number,
  department,
  favorite_team_short_name
) AS (
  VALUES
    -- (2025001, '홍길동', '01012341234', '컴퓨터공학과', 'KIA')
    -- Add real rows here.
    (NULL::BIGINT, NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR)
),
cleaned_users AS (
  SELECT
    student_number,
    username,
    phone_number,
    department,
    NULLIF(favorite_team_short_name, '') AS favorite_team_short_name
  FROM source_users
  WHERE student_number IS NOT NULL
),
resolved_users AS (
  SELECT
    gen_random_uuid() AS id,
    c.student_number,
    c.username,
    c.phone_number,
    c.department,
    'member'::VARCHAR AS type,
    COALESCE(t.id, 1) AS favorite_team_id,
    encode(digest(c.phone_number::TEXT, 'sha256'), 'hex') AS password_hash,
    FALSE AS password_changed
  FROM cleaned_users c
  LEFT JOIN public.teams t
    ON UPPER(t.short_name) = UPPER(COALESCE(c.favorite_team_short_name, ''))
)
INSERT INTO public.users (
  id,
  student_number,
  username,
  phone_number,
  department,
  type,
  favorite_team_id,
  password_hash,
  password_changed
)
SELECT
  id,
  student_number,
  username,
  phone_number,
  department,
  type,
  favorite_team_id,
  password_hash,
  password_changed
FROM resolved_users
ON CONFLICT (student_number) DO UPDATE
SET
  username = EXCLUDED.username,
  phone_number = EXCLUDED.phone_number,
  department = EXCLUDED.department,
  favorite_team_id = EXCLUDED.favorite_team_id,
  password_hash = EXCLUDED.password_hash,
  password_changed = EXCLUDED.password_changed,
  updated_at = NOW();
