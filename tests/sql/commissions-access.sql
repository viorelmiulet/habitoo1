-- Commission RLS: agent own-only, admin allocations read-only for agents,
-- admin full access in own agency, other agency sees nothing. Rolls back.
-- Run: psql -X -v ON_ERROR_STOP=1 -f tests/sql/commissions-access.sql
BEGIN;
SELECT r.user_id AS admin_id, r.organization_id AS org_a FROM public.user_roles r
 JOIN public.organizations o ON o.id=r.organization_id JOIN public.profiles p ON p.id=r.user_id
 WHERE r.role='agency_admin' AND o.status IN ('active','trial') AND o.archived_at IS NULL AND p.organization_id=r.organization_id
 AND p.is_active AND NOT EXISTS (SELECT 1 FROM public.user_roles s WHERE s.user_id=r.user_id AND s.role='superadmin')
 ORDER BY r.user_id LIMIT 1 \gset
-- Two plain agents placed in agency A for this transaction only (rolled back).
SELECT array_agg(id) AS agents FROM (SELECT id FROM public.profiles x
 WHERE NOT EXISTS (SELECT 1 FROM public.user_roles y WHERE y.user_id=x.id AND y.role IN ('agency_admin','superadmin'))
 ORDER BY id LIMIT 2) t \gset
SELECT (:'agents'::uuid[])[1] AS agent1, (:'agents'::uuid[])[2] AS agent2 \gset
ALTER TABLE public.profiles DISABLE TRIGGER USER;
UPDATE public.profiles SET organization_id=:'org_a', is_active=true WHERE id IN (:'agent1',:'agent2');
ALTER TABLE public.profiles ENABLE TRIGGER USER;
SELECT p.id AS other_user FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id
 WHERE o.status IN ('active','trial') AND o.archived_at IS NULL AND p.organization_id<>:'org_a'
 AND NOT EXISTS (SELECT 1 FROM public.user_roles y WHERE y.user_id=p.id AND y.role='superadmin') ORDER BY p.id LIMIT 1 \gset

CREATE TEMP TABLE ids(k text, id uuid); GRANT ALL ON ids TO authenticated;
SELECT set_config('test.agent2', :'agent2', true);
SET LOCAL ROLE authenticated;

-- agent1 adds own; cannot add for agent2
SELECT set_config('request.jwt.claims', json_build_object('sub',:'agent1','role','authenticated')::text, true);
INSERT INTO ids SELECT 'own', id FROM (INSERT INTO public.commissions(organization_id,agent_id,transaction_kind,property_type,payer,agency_commission,agent_amount)
 VALUES(:'org_a',:'agent1','sale','apartment','buyer',1000,400) RETURNING id) x;
DO $$ BEGIN
 BEGIN INSERT INTO public.commissions(organization_id,agent_id,transaction_kind,property_type,payer)
   VALUES(current_setting('test.org', true)::uuid, gen_random_uuid(),'sale','apartment','buyer'); RAISE EXCEPTION 'x';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='x' THEN RAISE EXCEPTION 'agent inserted for someone else'; END IF; END;
END $$;
DO $$ BEGIN
 BEGIN EXECUTE format('INSERT INTO public.commissions(organization_id,agent_id,transaction_kind,property_type,payer) VALUES(%L,%L,''sale'',''apartment'',''buyer'')',
   (SELECT organization_id FROM public.commissions LIMIT 1), current_setting('test.agent2'));
   RAISE EXCEPTION 'x';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='x' THEN RAISE EXCEPTION 'agent1 inserted for agent2'; END IF; END;
END $$;

-- admin allocates to agent1 and adds one for agent2
SELECT set_config('request.jwt.claims', json_build_object('sub',:'admin_id','role','authenticated')::text, true);
INSERT INTO ids SELECT 'alloc', id FROM (INSERT INTO public.commissions(organization_id,agent_id,transaction_kind,property_type,payer)
 VALUES(:'org_a',:'agent1','rent','apartment','owner') RETURNING id) x;
INSERT INTO ids SELECT 'a2', id FROM (INSERT INTO public.commissions(organization_id,agent_id,transaction_kind,property_type,payer)
 VALUES(:'org_a',:'agent2','sale','house','seller') RETURNING id) x;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.commissions c JOIN ids USING(id))<>3 THEN RAISE EXCEPTION 'admin does not see all'; END IF;
 UPDATE public.commissions SET notes='admin edit' WHERE id IN (SELECT id FROM ids);
 IF (SELECT count(*) FROM public.commissions WHERE notes='admin edit')<>3 THEN RAISE EXCEPTION 'admin cannot edit all'; END IF;
 IF NOT (SELECT allocated_by_admin FROM public.commissions WHERE id=(SELECT id FROM ids WHERE k='alloc')) THEN RAISE EXCEPTION 'allocation flag missing'; END IF;
END $$;

-- agent1: sees own + allocated, not agent2; can edit own only
SELECT set_config('request.jwt.claims', json_build_object('sub',:'agent1','role','authenticated')::text, true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.commissions WHERE id=(SELECT id FROM ids WHERE k='a2')) THEN RAISE EXCEPTION 'agent sees another agent'; END IF;
 IF (SELECT count(*) FROM public.commissions c JOIN ids USING(id))<>2 THEN RAISE EXCEPTION 'agent does not see own+allocated'; END IF;
 UPDATE public.commissions SET notes='agent' WHERE id IN (SELECT id FROM ids);
 DELETE FROM public.commissions WHERE id IN (SELECT id FROM ids WHERE k<>'own');
 IF (SELECT notes FROM public.commissions WHERE id=(SELECT id FROM ids WHERE k='alloc'))<>'admin edit' THEN RAISE EXCEPTION 'agent edited allocation'; END IF;
 IF (SELECT notes FROM public.commissions WHERE id=(SELECT id FROM ids WHERE k='own'))<>'agent' THEN RAISE EXCEPTION 'agent cannot edit own'; END IF;
 IF (SELECT count(*) FROM public.commissions c JOIN ids USING(id))<>2 THEN RAISE EXCEPTION 'agent deleted allocation'; END IF;
END $$;

-- other agency sees nothing
SELECT set_config('request.jwt.claims', json_build_object('sub',:'other_user','role','authenticated')::text, true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.commissions c JOIN ids USING(id)) THEN RAISE EXCEPTION 'other agency sees commissions'; END IF;
END $$;
SELECT 'commissions access OK' AS result;
ROLLBACK;
