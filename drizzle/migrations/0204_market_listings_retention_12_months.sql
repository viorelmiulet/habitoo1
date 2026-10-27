-- Retenția datelor de piață ACP: 14 zile nevăzut => inactive; > 365 zile => șters.
CREATE OR REPLACE FUNCTION public.market_listings_lifecycle(_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inactivated integer := 0;
  _deleted integer := 0;
  _batch integer;
BEGIN
  WITH changed AS (
    UPDATE public.market_listings
       SET status = 'inactive',
           disappeared_at = COALESCE(disappeared_at, last_seen_at),
           status_changes = COALESCE(status_changes, 0) + 1,
           updated_at = _now
     WHERE status = 'active'
       AND last_seen_at < _now - interval '14 days'
    RETURNING id
  ), sources AS (
    UPDATE public.market_listing_sources s
       SET is_active = false
      FROM changed c
     WHERE s.market_listing_id = c.id
    RETURNING 1
  )
  SELECT count(*) INTO _inactivated FROM changed;

  LOOP
    DELETE FROM public.market_listings
     WHERE id IN (
       SELECT id FROM public.market_listings
        WHERE last_seen_at < _now - interval '365 days'
        LIMIT 5000
     );
    GET DIAGNOSTICS _batch = ROW_COUNT;
    _deleted := _deleted + _batch;
    EXIT WHEN _batch < 5000;
  END LOOP;

  RETURN jsonb_build_object('inactivated', _inactivated, 'deleted', _deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.market_listings_lifecycle(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.market_listings_lifecycle(timestamptz) TO service_role;

COMMENT ON FUNCTION public.market_listings_lifecycle(timestamptz) IS
  'ACP market data retention: unseen 14 days -> inactive (disappeared_at = last_seen_at); last_seen_at older than 365 days -> deleted. Runs nightly.';