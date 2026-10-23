-- Câmpuri noi pentru anunțurile hbsync (toate nullable, fără valori implicite).
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS floors_count integer,
  ADD COLUMN IF NOT EXISTS year_built integer,
  ADD COLUMN IF NOT EXISTS furnished text,
  ADD COLUMN IF NOT EXISTS parking text,
  ADD COLUMN IF NOT EXISTS bca text,
  ADD COLUMN IF NOT EXISTS availability text,
  ADD COLUMN IF NOT EXISTS min_term text,
  ADD COLUMN IF NOT EXISTS plot_area numeric,
  ADD COLUMN IF NOT EXISTS heating text,
  ADD COLUMN IF NOT EXISTS has_lift text,
  ADD COLUMN IF NOT EXISTS building_type text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- updated_at se actualizează la fiecare upsert; retenția de 60 de zile se bazează pe el.
CREATE OR REPLACE FUNCTION public.listings_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listings_touch_updated_at ON public.listings;
CREATE TRIGGER listings_touch_updated_at
  BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.listings_touch_updated_at();

-- Șterge anunțurile ne-reimportate de peste 60 de zile. Returnează câte rânduri a șters.
CREATE OR REPLACE FUNCTION public.purge_old_listings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.listings
  WHERE updated_at < now() - interval '60 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_listings() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_listings() TO service_role;