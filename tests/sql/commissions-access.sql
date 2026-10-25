-- Commission RLS: agents see/edit only their own, admin allocations are
-- read-only for agents, the agency admin sees/edits everything in the agency,
-- another agency sees nothing. Fixtures move two profiles into agency A
-- inside the transaction; everything rolls back.
-- Run as a privileged role able to SET ROLE authenticated.
BEGIN;
DO $$
DECLARE
  org_a uuid; admin_id uuid; agent1 uuid; agent2 uuid; other_user uuid;
  own_id uuid; alloc_id uuid; a2_id uuid; n int; failed boolean;
BEGIN
  SELECT r.user_id, r.organization_id INTO admin_id, org_a FROM public.user_roles r
   JOIN public.organizations o ON o.id=r.organization_id JOIN public.profiles p ON p.id=r.user_id
   WHERE r.role='agency_admin' AND o.status IN ('active','trial') AND o.archived_at IS NULL
     AND p.organization_id=r.organization_id AND p.is_active
     AND NOT EXISTS (SELECT 1 FROM public.user_roles s WHERE s.user_id=r.user_id AND s.role='superadmin')
   ORDER BY r.user_id LIMIT 1;
  SELECT id INTO agent1 FROM public.profiles x WHERE id<>admin_id AND NOT EXISTS (
    SELECT 1 FROM public.user_roles y WHERE y.user_id=x.id AND y.role IN ('superadmin','agency_admin')) ORDER BY id LIMIT 1;
  SELECT id INTO agent2 FROM public.profiles x WHERE id NOT IN (admin_id, agent1) AND NOT EXISTS (
    SELECT 1 FROM public.user_roles y WHERE y.user_id=x.id AND y.role IN ('superadmin','agency_admin')) ORDER BY id LIMIT 1;
  UPDATE public.profiles SET organization_id=org_a, is_active=true WHERE id IN (agent1, agent2);
  SELECT p.id INTO other_user FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id
   WHERE o.status IN ('active','trial') AND o.archived_at IS NULL AND p.organization_id<>org_a AND p.is_active
     AND NOT EXISTS (SELECT 1 FROM public.user_roles y WHERE y.user_id=p.id AND y.role='superadmin')
   ORDER BY p.id LIMIT 1;
  IF org_a IS NULL OR agent1 IS NULL OR agent2 IS NULL OR other_user IS NULL THEN RAISE EXCEPTION 'fixtures missing'; END IF;

  EXECUTE 'SET LOCAL ROLE authenticated';

  -- agent1 adds own commission; cannot add one for agent2
  PERFORM set_config('request.jwt.claims', json_build_object('sub',agent1,'role','authenticated')::text, true);
  INSERT INTO public.commissions(organization_id,agent_id,transaction_kind,property_type,payer,agency_commission,agent_amount)
   VALUES(org_a,agent1,'sale','apartment','buyer',1000,400) RETURNING id INTO own_id;
  failed := false;
  BEGIN
    INSERT INTO public.commissions(organization_id,agent_id,transaction_kind,property_type,payer) VALUES(org_a,agent2,'sale','apartment','buyer');
  EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'agent inserted for another agent'; END IF;

  -- admin allocates to agent1 and adds one for agent2; sees and edits all
  PERFORM set_config('request.jwt.claims', json_build_object('sub',admin_id,'role','authenticated')::text, true);
  INSERT INTO public.commissions(organization_id,agent_id,transaction_kind,property_type,payer)
   VALUES(org_a,agent1,'rent','apartment','owner') RETURNING id INTO alloc_id;
  INSERT INTO public.commissions(organization_id,agent_id,transaction_kind,property_type,payer)
   VALUES(org_a,agent2,'sale','house','seller') RETURNING id INTO a2_id;
  SELECT count(*) INTO n FROM public.commissions WHERE id IN (own_id,alloc_id,a2_id);
  IF n<>3 THEN RAISE EXCEPTION 'admin sees % of 3', n; END IF;
  UPDATE public.commissions SET notes='admin edit' WHERE id IN (own_id,alloc_id,a2_id);
  GET DIAGNOSTICS n = ROW_COUNT; IF n<>3 THEN RAISE EXCEPTION 'admin edited % of 3', n; END IF;

  -- agent1: own + allocated visible; agent2's hidden; allocation read-only
  PERFORM set_config('request.jwt.claims', json_build_object('sub',agent1,'role','authenticated')::text, true);
  IF EXISTS (SELECT 1 FROM public.commissions WHERE id=a2_id) THEN RAISE EXCEPTION 'agent sees another agent'; END IF;
  SELECT count(*) INTO n FROM public.commissions WHERE id IN (own_id,alloc_id); IF n<>2 THEN RAISE EXCEPTION 'agent sees % of own+allocated', n; END IF;
  UPDATE public.commissions SET notes='agent' WHERE id IN (own_id,alloc_id,a2_id);
  GET DIAGNOSTICS n = ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'agent updated % rows, expected only own', n; END IF;
  DELETE FROM public.commissions WHERE id IN (alloc_id,a2_id);
  GET DIAGNOSTICS n = ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'agent deleted % protected rows', n; END IF;

  -- other agency sees nothing
  PERFORM set_config('request.jwt.claims', json_build_object('sub',other_user,'role','authenticated')::text, true);
  IF EXISTS (SELECT 1 FROM public.commissions WHERE id IN (own_id,alloc_id,a2_id)) THEN RAISE EXCEPTION 'other agency sees commissions'; END IF;

  RAISE NOTICE 'commissions access OK';
END $$;
ROLLBACK;
