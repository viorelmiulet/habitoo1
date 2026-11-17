CREATE TABLE public.seo_indexnow_receipts (url text PRIMARY KEY, revision text NOT NULL, sent_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.seo_indexnow_receipts TO service_role;
ALTER TABLE public.seo_indexnow_receipts ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.seo_indexnow_lock (id boolean PRIMARY KEY DEFAULT true, held_until timestamptz NOT NULL DEFAULT '-infinity', CHECK (id));
GRANT ALL ON public.seo_indexnow_lock TO service_role;
ALTER TABLE public.seo_indexnow_lock ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.seo_indexnow_claim() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE claimed boolean;
BEGIN
 INSERT INTO public.seo_indexnow_lock(id,held_until) VALUES(true,now()+interval '30 seconds') ON CONFLICT(id) DO UPDATE SET held_until=excluded.held_until WHERE seo_indexnow_lock.held_until<now() RETURNING true INTO claimed;
 RETURN coalesce(claimed,false);
END; $$;
REVOKE ALL ON FUNCTION public.seo_indexnow_claim() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.seo_indexnow_claim() TO service_role;