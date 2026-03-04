-- Add persistent team color for auto-mapped teams (e.g. WBC national teams)
ALTER TABLE public.teams
ADD COLUMN IF NOT EXISTS team_color VARCHAR(7);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'teams_team_color_format_check'
      AND conrelid = 'public.teams'::regclass
  ) THEN
    ALTER TABLE public.teams
    ADD CONSTRAINT teams_team_color_format_check
    CHECK (team_color IS NULL OR team_color ~ '^#[0-9A-F]{6}$');
  END IF;
END $$;

-- Preserve KBO canonical colors from tailwind tokens
UPDATE public.teams
SET team_color = CASE
  WHEN short_name = 'KIA' THEN '#E92020'
  WHEN short_name = 'NC' THEN '#284579'
  WHEN short_name = '키움' THEN '#A5085D'
  WHEN short_name = '두산' THEN '#2A2378'
  WHEN short_name = 'KT' THEN '#221E1F'
  WHEN short_name = '삼성' THEN '#0065B3'
  WHEN short_name = 'SSG' THEN '#CF112E'
  WHEN short_name = '롯데' THEN '#60B0E3'
  WHEN short_name = 'LG' THEN '#C30137'
  WHEN short_name = '한화' THEN '#F37321'
  ELSE team_color
END
WHERE short_name IN ('KIA', 'NC', '키움', '두산', 'KT', '삼성', 'SSG', '롯데', 'LG', '한화');

-- Backfill color for existing rows that still do not have one
DO $$
DECLARE
  v_team_id INTEGER;
  v_color VARCHAR(7);
BEGIN
  FOR v_team_id IN
    SELECT id
    FROM public.teams
    WHERE team_color IS NULL
    ORDER BY id
  LOOP
    LOOP
      v_color := '#' || UPPER(LPAD(TO_HEX((RANDOM() * 16777215)::INTEGER), 6, '0'));
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM public.teams
        WHERE team_color = v_color
      );
    END LOOP;

    UPDATE public.teams
    SET team_color = v_color
    WHERE id = v_team_id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS teams_team_color_unique_idx
ON public.teams(team_color)
WHERE team_color IS NOT NULL;

ALTER TABLE public.teams
ALTER COLUMN team_color SET NOT NULL;
