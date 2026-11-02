WITH ordered AS (
  SELECT id, row_number() OVER (
    PARTITION BY property_id
    ORDER BY is_primary DESC NULLS LAST, position ASC NULLS LAST, created_at ASC, id ASC
  ) - 1 AS new_pos
  FROM public.property_images
)
UPDATE public.property_images pi SET position = o.new_pos
FROM ordered o WHERE o.id = pi.id AND pi.position IS DISTINCT FROM o.new_pos;

CREATE OR REPLACE FUNCTION public.property_images_sync_primary(_property_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY position ASC NULLS LAST, created_at ASC, id ASC) = 1 AS should_be
    FROM public.property_images WHERE property_id = _property_id
  )
  UPDATE public.property_images pi SET is_primary = r.should_be
  FROM ranked r WHERE r.id = pi.id AND pi.is_primary IS DISTINCT FROM r.should_be;
$$;
REVOKE ALL ON FUNCTION public.property_images_sync_primary(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.property_images_primary_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Inner updates come from the sync itself; do not recurse.
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF TG_OP IN ('DELETE','UPDATE') THEN PERFORM public.property_images_sync_primary(OLD.property_id); END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND (TG_OP = 'INSERT' OR NEW.property_id IS DISTINCT FROM OLD.property_id) THEN
    PERFORM public.property_images_sync_primary(NEW.property_id);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER property_images_primary_first
AFTER INSERT OR DELETE OR UPDATE OF position, is_primary, property_id ON public.property_images
FOR EACH ROW EXECUTE FUNCTION public.property_images_primary_trigger();

UPDATE public.property_images pi SET is_primary = (pi.id = f.id)
FROM (SELECT DISTINCT ON (property_id) property_id, id FROM public.property_images
      ORDER BY property_id, position ASC NULLS LAST, created_at ASC, id ASC) f
WHERE f.property_id = pi.property_id AND pi.is_primary IS DISTINCT FROM (pi.id = f.id);