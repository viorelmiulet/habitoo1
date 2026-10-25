-- Evaluate the installed SELECT policy; all fixtures/status changes roll back.
-- The managed SQL runner cannot SET ROLE authenticated, so apply the actual
-- installed policy expression to a temporary view, substituting only auth.uid()
-- with the same JWT subject (the managed runner cannot access the auth schema).
-- Run: psql -X -v ON_ERROR_STOP=1 -f tests/sql/listing-comments-read-access.sql
BEGIN;
SELECT p.id AS actor_a, p.organization_id AS org_a
FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id
WHERE p.is_active AND o.status IN ('active','trial') AND o.archived_at IS NULL
ORDER BY p.id LIMIT 1 \gset
SELECT p.id AS actor_b
FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id
WHERE p.is_active AND o.status IN ('active','trial') AND o.archived_at IS NULL
AND p.organization_id <> :'org_a'::uuid
ORDER BY p.id LIMIT 1 \gset
SELECT id AS listing_id FROM public.listings ORDER BY id LIMIT 1 \gset
SELECT gen_random_uuid() AS comment_id \gset
INSERT INTO public.listing_comments(id,listing_id,author_id,author_name,body)
VALUES(:'comment_id',:'listing_id',:'actor_b','RLS test','Cross-agency visibility test');
SELECT set_config('test.comment_id',:'comment_id',true),
       set_config('request.jwt.claim.sub',:'actor_a',true) \gset
DO $$ DECLARE predicate text; BEGIN
 SELECT qual INTO predicate FROM pg_policies WHERE schemaname='public'
  AND tablename='listing_comments' AND cmd='SELECT'
  AND policyname='Agents can read listing comments' AND roles=ARRAY['authenticated']::name[];
 IF predicate IS NULL OR predicate='true' THEN RAISE EXCEPTION 'Missing restricted authenticated policy'; END IF;
 predicate := replace(predicate,'auth.uid()', 'current_setting(''request.jwt.claim.sub'', true)::uuid');
 EXECUTE 'CREATE TEMP VIEW readable_listing_comments AS SELECT * FROM public.listing_comments WHERE ' || predicate;
END $$;

-- Agency A can read a comment authored by agency B.
DO $$ BEGIN
 IF (SELECT count(*) FROM readable_listing_comments WHERE id=current_setting('test.comment_id')::uuid) <> 1 THEN
  RAISE EXCEPTION 'Active agent cannot read the other agency comment';
 END IF;
END $$;

-- Trial agencies retain cross-agency access.
UPDATE public.organizations SET status='trial' WHERE id=:'org_a';
DO $$ BEGIN
 IF (SELECT count(*) FROM readable_listing_comments WHERE id=current_setting('test.comment_id')::uuid) <> 1 THEN
  RAISE EXCEPTION 'Trial agency cannot read comments';
 END IF;
END $$;

-- Suspended agency: no comments, including comments from other agencies.
UPDATE public.organizations SET status='suspended' WHERE id=:'org_a';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM readable_listing_comments) THEN
  RAISE EXCEPTION 'Suspended agency can read comments';
 END IF;
END $$;

-- Inactive profile: no comments even when its agency is active.
UPDATE public.organizations SET status='active' WHERE id=:'org_a';
UPDATE public.profiles SET is_active=false WHERE id=:'actor_a';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM readable_listing_comments) THEN
  RAISE EXCEPTION 'Inactive profile can read comments';
 END IF;
END $$;

-- An active profile with no agency cannot read comments.
UPDATE public.profiles SET is_active=true, organization_id=NULL WHERE id=:'actor_a';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM readable_listing_comments) THEN
  RAISE EXCEPTION 'Profile without an agency can read comments';
 END IF;
END $$;

-- The INSERT policy remains exactly as before.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
  AND tablename='listing_comments' AND policyname='Agents can add own listing comments'
  AND cmd='INSERT' AND with_check='(author_id = auth.uid())') THEN
  RAISE EXCEPTION 'Comment insertion rule changed';
 END IF;
END $$;
ROLLBACK;