CREATE OR REPLACE FUNCTION public.ai_credit_refund_stale() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE refunded_count integer;
BEGIN
 WITH stale AS (SELECT id FROM public.ai_credit_ledger WHERE status = 'reserved' AND created_at < now() - interval '10 minutes' ORDER BY created_at LIMIT 1000 FOR UPDATE SKIP LOCKED)
 UPDATE public.ai_credit_ledger l SET status = 'refunded', settled_at = now() FROM stale WHERE l.id = stale.id AND l.status = 'reserved';
 GET DIAGNOSTICS refunded_count = ROW_COUNT;
 RETURN refunded_count;
END;
$$;
REVOKE ALL ON FUNCTION public.ai_credit_refund_stale() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_credit_refund_stale() TO service_role;
CREATE INDEX IF NOT EXISTS ai_credit_ledger_reserved_age_idx ON public.ai_credit_ledger(created_at) WHERE status = 'reserved';