ALTER TABLE public.portal_publish_jobs ADD COLUMN ofera_intent text CHECK (ofera_intent IS NULL OR ofera_intent IN ('activate','resend'));
CREATE OR REPLACE FUNCTION public.start_portal_publish_jobs(_org uuid, _property uuid, _actor uuid, _superadmin boolean, _sync_existing boolean, _jobs jsonb)
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _keys text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.properties WHERE id = _property AND organization_id = _org) THEN RAISE EXCEPTION 'property not in organization'; END IF;
  PERFORM public.close_stale_portal_publish_jobs(_org);
  WITH ins AS (
    INSERT INTO public.portal_publish_jobs (organization_id, property_id, portal_key, enabled, promoted, imobiliare_promotions, imobiliare_mode, sync_existing, requested_by, superadmin, ofera_intent)
    SELECT _org, _property, x.portal_key, x.enabled, x.promoted, x.imobiliare_promotions, x.imobiliare_mode, _sync_existing, _actor, _superadmin, CASE WHEN x.portal_key = 'ofera' THEN x.ofera_intent ELSE NULL END
    FROM jsonb_to_recordset(coalesce(_jobs,'[]')) AS x(portal_key text, enabled boolean, promoted boolean, imobiliare_promotions jsonb, imobiliare_mode text, ofera_intent text)
    ON CONFLICT (property_id, portal_key) WHERE status IN ('queued','running') DO NOTHING RETURNING portal_key)
  SELECT coalesce(array_agg(portal_key), '{}') INTO _keys FROM ins;
  IF cardinality(_keys) > 0 THEN PERFORM public.portal_publish_arm(); END IF;
  RETURN _keys;
END; $$;
REVOKE ALL ON FUNCTION public.start_portal_publish_jobs(uuid, uuid, uuid, boolean, boolean, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_portal_publish_jobs(uuid, uuid, uuid, boolean, boolean, jsonb) TO service_role;