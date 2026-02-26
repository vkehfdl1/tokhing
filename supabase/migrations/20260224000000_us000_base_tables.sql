-- US-000: 기본 테이블 생성 (teams, users, games, predictions)
-- 이 테이블들은 원래 Supabase 대시보드에서 수동 생성됨
-- 로컬 개발 환경(supabase start → db reset)을 위해 마이그레이션으로 추출

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ENUM: 경기 상태
DO $$ BEGIN
  CREATE TYPE public."GAME_STATUS" AS ENUM (
    'SCHEDULED',
    'IN_PROGRESS',
    'FINISHED',
    'CANCELED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1) teams
CREATE TABLE IF NOT EXISTS public.teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  short_name VARCHAR(10) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) users
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(255) NOT NULL,
  username VARCHAR(50) NOT NULL,
  student_number BIGINT NOT NULL UNIQUE,
  department VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  favorite_team_id INTEGER NOT NULL REFERENCES public.teams(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3) games
CREATE TABLE IF NOT EXISTS public.games (
  id SERIAL PRIMARY KEY,
  game_date DATE NOT NULL,
  game_time TIME,
  home_team_id INTEGER REFERENCES public.teams(id),
  away_team_id INTEGER REFERENCES public.teams(id),
  home_pitcher VARCHAR(100),
  away_pitcher VARCHAR(100),
  home_score INTEGER,
  away_score INTEGER,
  game_status public."GAME_STATUS" NOT NULL DEFAULT 'SCHEDULED',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4) predictions (레거시 예측 시스템)
CREATE TABLE IF NOT EXISTS public.predictions (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  game_id INTEGER REFERENCES public.games(id),
  predicted_winner_team_id INTEGER REFERENCES public.teams(id),
  predicted_at TIMESTAMPTZ DEFAULT NOW(),
  is_settled BOOLEAN DEFAULT FALSE,
  points_earned INTEGER DEFAULT 0,
  settled_at TIMESTAMPTZ,
  CONSTRAINT predictions_user_id_game_id_key UNIQUE (user_id, game_id)
);
