CREATE TABLE public.market_listing_enrichments (
  market_listing_id uuid PRIMARY KEY REFERENCES public.market_listings(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','failed')),
  input_hash text NOT NULL,
  provider text,
  model text,
  prompt_version text NOT NULL,
  enriched_at timestamptz NOT NULL DEFAULT now(),
  complex_name text,
  complex_confidence numeric,
  condition text CHECK (condition IS NULL OR condition IN ('bloc_nou','finisat','semifinisat','renovat','de_renovat')),
  condition_confidence numeric,
  real_property_type text,
  real_property_type_confidence numeric,
  rooms numeric,
  rooms_confidence numeric,
  floor integer,
  floor_confidence numeric,
  price_suspect boolean,
  price_suspect_confidence numeric,
  price_suspect_reason text,
  attempts integer NOT NULL DEFAULT 1,
  error_code text,
  cost_usd numeric
);
GRANT ALL ON public.market_listing_enrichments TO service_role;
ALTER TABLE public.market_listing_enrichments ENABLE ROW LEVEL SECURITY;
CREATE INDEX market_listing_enrichments_enriched_at_idx ON public.market_listing_enrichments (enriched_at DESC);

CREATE TABLE public.acp_enrich_state (
  id text PRIMARY KEY,
  lease_owner uuid,
  lease_until timestamptz,
  paused_reason text,
  paused_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.acp_enrich_state TO service_role;
ALTER TABLE public.acp_enrich_state ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.acp_enrich_acquire(_owner uuid, _ttl_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ok boolean;
BEGIN
  INSERT INTO public.acp_enrich_state (id, lease_owner, lease_until, updated_at)
  VALUES ('acp_enrich', _owner, now() + make_interval(secs => _ttl_seconds), now())
  ON CONFLICT (id) DO UPDATE
    SET lease_owner = EXCLUDED.lease_owner, lease_until = EXCLUDED.lease_until, updated_at = now()
    WHERE acp_enrich_state.lease_until IS NULL OR acp_enrich_state.lease_until < now()
  RETURNING true INTO _ok;
  RETURN coalesce(_ok, false);
END $$;

CREATE OR REPLACE FUNCTION public.acp_enrich_release(_owner uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.acp_enrich_state SET lease_until = NULL, lease_owner = NULL, updated_at = now()
  WHERE id = 'acp_enrich' AND lease_owner = _owner;
$$;

CREATE OR REPLACE FUNCTION public.acp_enrich_pending(_limit integer, _newest boolean)
RETURNS SETOF public.market_listings LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.* FROM public.market_listings l
  LEFT JOIN public.market_listing_enrichments e ON e.market_listing_id = l.id
  WHERE l.status = 'active' AND (e.market_listing_id IS NULL OR (e.status = 'failed' AND e.attempts < 3))
  ORDER BY CASE WHEN _newest THEN l.first_seen_at END DESC NULLS LAST,
           CASE WHEN NOT _newest THEN l.first_seen_at END ASC NULLS LAST
  LIMIT greatest(1, least(_limit, 200));
$$;

REVOKE ALL ON FUNCTION public.acp_enrich_acquire(uuid, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.acp_enrich_release(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.acp_enrich_pending(integer, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acp_enrich_acquire(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.acp_enrich_release(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.acp_enrich_pending(integer, boolean) TO service_role;