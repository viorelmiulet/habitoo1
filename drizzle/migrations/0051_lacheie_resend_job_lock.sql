-- Blocarea unui job de retrimitere La Cheie: două rulări simultane ale
-- worker-ului nu mai pot procesa același job, iar o limitare (429) amână jobul.
ALTER TABLE public.lacheie_resend_jobs
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS lacheie_resend_jobs_ready_idx
  ON public.lacheie_resend_jobs (created_at)
  WHERE status IN ('queued', 'running');

GRANT SELECT ON public.lacheie_resend_jobs TO authenticated;
GRANT ALL ON public.lacheie_resend_jobs TO service_role;

-- Preluarea atomică: reușește o singură dată cât timp blocarea este valabilă.
CREATE OR REPLACE FUNCTION public.claim_lacheie_resend_job(_job_id uuid, _ttl_seconds integer)
RETURNS SETOF public.lacheie_resend_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.lacheie_resend_jobs
     SET locked_until = now() + make_interval(secs => greatest(_ttl_seconds, 1))
   WHERE id = _job_id
     AND status IN ('queued', 'running')
     AND (locked_until IS NULL OR locked_until < now())
     AND (next_attempt_at IS NULL OR next_attempt_at <= now())
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION public.release_lacheie_resend_job(_job_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.lacheie_resend_jobs SET locked_until = NULL WHERE id = _job_id;
$$;

REVOKE ALL ON FUNCTION public.claim_lacheie_resend_job(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_lacheie_resend_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_lacheie_resend_job(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_lacheie_resend_job(uuid) TO service_role;