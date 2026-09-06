CREATE OR REPLACE FUNCTION public.site_feed_record_visit(
  _org uuid,
  _property uuid,
  _views integer,
  _source text,
  _occurred_on date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.site_feed_visits (organization_id, property_id, views, source, occurred_on)
  VALUES (_org, _property, GREATEST(COALESCE(_views, 0), 0), _source, COALESCE(_occurred_on, (now() AT TIME ZONE 'utc')::date))
  ON CONFLICT (organization_id, property_id, occurred_on, coalesce(source, ''))
  DO UPDATE SET views = public.site_feed_visits.views + GREATEST(COALESCE(_views, 0), 0),
                updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.site_feed_record_visit(uuid, uuid, integer, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.site_feed_record_visit(uuid, uuid, integer, text, date) FROM anon;
REVOKE ALL ON FUNCTION public.site_feed_record_visit(uuid, uuid, integer, text, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.site_feed_record_visit(uuid, uuid, integer, text, date) TO service_role;