CREATE TABLE public.site_feed_visit_events (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  identity_key text NOT NULL,
  event_id text NOT NULL CHECK (length(event_id) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, identity_key, event_id)
);
GRANT ALL ON public.site_feed_visit_events TO service_role;
ALTER TABLE public.site_feed_visit_events ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.site_feed_visit_events IS 'Server-only durable visit receipts. Portal identity survives token rotation; no automatic expiry so old retries remain idempotent.';
CREATE OR REPLACE FUNCTION public.site_feed_record_visit_event(
  _org uuid, _property uuid, _views integer, _source text, _occurred_on date, _identity text, _event_id text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE claimed integer;
BEGIN
  IF _identity IS NULL OR length(_identity) NOT BETWEEN 1 AND 240 OR _event_id IS NULL OR length(_event_id) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid visit event identity';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.properties WHERE id = _property AND organization_id = _org) THEN
    RAISE EXCEPTION 'Property does not belong to organization';
  END IF;
  INSERT INTO public.site_feed_visit_events (organization_id, identity_key, event_id)
  VALUES (_org, _identity, _event_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS claimed = ROW_COUNT;
  IF claimed = 0 THEN RETURN true; END IF;
  PERFORM public.site_feed_record_visit(_org, _property, _views, _source, _occurred_on);
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.site_feed_record_visit_event(uuid, uuid, integer, text, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_feed_record_visit_event(uuid, uuid, integer, text, date, text, text) TO service_role;