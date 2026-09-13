-- ACP faza 3: versionarea analizelor + starea/sincronizarea surselor de piață.
-- Aditiv: nu se recreează și nu se modifică tabelele existente.

ALTER TABLE public.acp_analyses
  ADD COLUMN IF NOT EXISTS parent_analysis_id uuid REFERENCES public.acp_analyses(id) ON DELETE SET NULL;
ALTER TABLE public.acp_analyses
  ADD COLUMN IF NOT EXISTS root_analysis_id uuid REFERENCES public.acp_analyses(id) ON DELETE SET NULL;
ALTER TABLE public.acp_analyses
  ADD COLUMN IF NOT EXISTS snapshot_at timestamptz;

UPDATE public.acp_analyses SET root_analysis_id = id WHERE root_analysis_id IS NULL;
UPDATE public.acp_analyses SET snapshot_at = COALESCE(last_run_at, created_at) WHERE snapshot_at IS NULL;

CREATE INDEX IF NOT EXISTS acp_analyses_root_idx
  ON public.acp_analyses (root_analysis_id, version DESC);
CREATE INDEX IF NOT EXISTS acp_analyses_parent_idx
  ON public.acp_analyses (parent_analysis_id);

-- Starea fiecărei surse de piață: configurare, sincronizare, erori, lock.
CREATE TABLE IF NOT EXISTS public.market_source_state (
  source text PRIMARY KEY,
  auto_sync boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'idle',
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_run_id uuid,
  running_since timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabelă operațională: se citește și se scrie exclusiv server-side.
GRANT ALL ON public.market_source_state TO service_role;
ALTER TABLE public.market_source_state ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER market_source_state_touch BEFORE UPDATE ON public.market_source_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Lock de concurență: o singură sincronizare activă per sursă.
CREATE OR REPLACE FUNCTION public.market_sync_claim(_source text, _stale_seconds integer DEFAULT 900)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _claimed boolean := false;
BEGIN
  INSERT INTO public.market_source_state (source, status, running_since, last_sync_at)
  VALUES (_source, 'running', now(), now())
  ON CONFLICT (source) DO NOTHING;

  IF FOUND THEN
    RETURN true;
  END IF;

  UPDATE public.market_source_state
     SET status = 'running',
         running_since = now(),
         last_sync_at = now(),
         attempts = attempts + 1
   WHERE source = _source
     AND (running_since IS NULL
          OR running_since < now() - make_interval(secs => GREATEST(_stale_seconds, 60)))
  RETURNING true INTO _claimed;

  RETURN COALESCE(_claimed, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.market_sync_release(
  _source text,
  _ok boolean,
  _error text DEFAULT NULL,
  _run_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.market_source_state
     SET status = CASE WHEN _ok THEN 'idle' ELSE 'error' END,
         running_since = NULL,
         last_error = CASE WHEN _ok THEN NULL ELSE _error END,
         last_success_at = CASE WHEN _ok THEN now() ELSE last_success_at END,
         last_run_id = COALESCE(_run_id, last_run_id),
         attempts = CASE WHEN _ok THEN 0 ELSE attempts END
   WHERE source = _source;
$$;

REVOKE ALL ON FUNCTION public.market_sync_claim(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.market_sync_release(text, boolean, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.market_sync_claim(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.market_sync_release(text, boolean, text, uuid) TO service_role;