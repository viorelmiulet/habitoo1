CREATE TABLE public.listing_image_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  source_url text NOT NULL,
  position integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed')),
  attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  stored_url text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, source_url)
);
GRANT ALL ON public.listing_image_jobs TO service_role;
ALTER TABLE public.listing_image_jobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX listing_image_jobs_pending_idx ON public.listing_image_jobs (created_at, position) WHERE status = 'pending';
COMMENT ON TABLE public.listing_image_jobs IS 'Queue copying private-listing photos into listing-images after the listing upsert; service role only.';

CREATE OR REPLACE FUNCTION public.claim_listing_image_jobs(_batch_size integer, _lease_seconds integer)
RETURNS SETOF public.listing_image_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  update public.listing_image_jobs
     set status = 'failed', last_error = coalesce(last_error, 'Întrerupt la ultima încercare.'), locked_until = null, updated_at = now()
   where status = 'pending' and attempts >= 2 and (locked_until is null or locked_until < now());
  return query
  update public.listing_image_jobs j
     set locked_until = now() + make_interval(secs => greatest(_lease_seconds, 1)),
         attempts = j.attempts + 1,
         updated_at = now()
   where j.id in (
     select id from public.listing_image_jobs
      where status = 'pending' and attempts < 2
        and (locked_until is null or locked_until < now())
      order by created_at, position
      limit greatest(least(_batch_size, 50), 1)
      for update skip locked
   )
  returning j.*;
end;
$$;

-- Înlocuiește URL-ul original cu cel stabil, pe aceeași poziție, doar dacă anunțul îl mai conține.
CREATE OR REPLACE FUNCTION public.listing_image_replace(_job_id uuid, _stored_url text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  j public.listing_image_jobs;
  replaced boolean := false;
begin
  select * into j from public.listing_image_jobs where id = _job_id for update;
  if not found then return false; end if;
  update public.listings l
     set images = (
       select array_agg(case when u = j.source_url then _stored_url else u end order by ord)
         from unnest(l.images) with ordinality as t(u, ord)
     )
   where l.id = j.listing_id and j.source_url = any(l.images);
  replaced := found;
  update public.listing_image_jobs
     set status = 'done', stored_url = _stored_url, last_error = null, locked_until = null, updated_at = now()
   where id = _job_id;
  return replaced;
end;
$$;

REVOKE ALL ON FUNCTION public.claim_listing_image_jobs(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.listing_image_replace(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_listing_image_jobs(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.listing_image_replace(uuid, text) TO service_role;