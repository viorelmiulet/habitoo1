-- Versiunea motorului determinist cu care a fost calculată analiza.
-- Analizele existente rămân pe versiunea 1 și se reproduc identic.
ALTER TABLE public.acp_analyses
  ADD COLUMN IF NOT EXISTS engine_version integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.acp_analyses.engine_version IS
  'Versiunea motorului ACP folosită la calcul (1 = fără ajustare în timp, 2 = ajustare în timp cu indicele national).';