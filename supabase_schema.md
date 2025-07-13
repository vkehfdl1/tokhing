-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.games (
  id integer NOT NULL DEFAULT nextval('games_id_seq'::regclass),
  game_date date NOT NULL,
  game_time time without time zone,
  home_team_id integer,
  away_team_id integer,
  home_pitcher character varying,
  away_pitcher character varying,
  home_score integer,
  away_score integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  game_status USER-DEFINED NOT NULL DEFAULT 'SCHEDULED'::"GAME_STATUS",
  CONSTRAINT games_pkey PRIMARY KEY (id),
  CONSTRAINT games_away_team_id_fkey FOREIGN KEY (away_team_id) REFERENCES public.teams(id),
  CONSTRAINT games_home_team_id_fkey FOREIGN KEY (home_team_id) REFERENCES public.teams(id)
);
CREATE TABLE public.predictions (
  id integer NOT NULL DEFAULT nextval('predictions_id_seq'::regclass),
  user_id uuid,
  game_id integer,
  predicted_winner_team_id integer,
  predicted_at timestamp with time zone DEFAULT now(),
  is_settled boolean DEFAULT false,
  points_earned integer DEFAULT 0,
  settled_at timestamp with time zone,
  CONSTRAINT predictions_pkey PRIMARY KEY (id),
  CONSTRAINT predictions_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id),
  CONSTRAINT predictions_predicted_winner_team_id_fkey FOREIGN KEY (predicted_winner_team_id) REFERENCES public.teams(id),
  CONSTRAINT predictions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.teams (
  id integer NOT NULL DEFAULT nextval('teams_id_seq'::regclass),
  name character varying NOT NULL,
  short_name character varying NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT teams_pkey PRIMARY KEY (id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  phone_number character varying NOT NULL,
  username character varying NOT NULL,
  student_number bigint NOT NULL UNIQUE,
  department character varying NOT NULL,
  type character varying NOT NULL,
  favorite_team_id integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_favorite_team_id_fkey FOREIGN KEY (favorite_team_id) REFERENCES public.teams(id)
);