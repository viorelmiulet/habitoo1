-- Rulează într-o tranzacție anulată: trial_90d și agenția nouă primesc 90 de zile.
BEGIN;
DO $$
DECLARE _org uuid; _sa uuid; _exp timestamptz; _trial boolean; _term text;
BEGIN
  SELECT user_id INTO _sa FROM public.user_roles WHERE role = 'superadmin' LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _sa, 'role', 'authenticated')::text, true);
  INSERT INTO public.organizations (name, slug, status) VALUES ('Test 90', 'test-90-' || substr(md5(random()::text),1,6), 'active') RETURNING id INTO _org;
  PERFORM public.set_organization_subscription(_org, 'trial_90d');
  SELECT subscription_expires_at, is_trial INTO _exp, _trial FROM public.organizations WHERE id = _org;
  ASSERT _trial, 'trial_90d trebuie is_trial';
  ASSERT abs(extract(epoch FROM _exp - (now() + interval '90 days'))) < 5, 'expirare +90 zile';
  PERFORM public.set_organization_subscription(_org, '30d');
  SELECT subscription_expires_at, is_trial INTO _exp, _trial FROM public.organizations WHERE id = _org;
  ASSERT NOT _trial AND abs(extract(epoch FROM _exp - (now() + interval '30 days'))) < 5, '30d neschimbat';
  PERFORM public.set_organization_subscription(_org, 'trial_14d');
  SELECT subscription_expires_at INTO _exp FROM public.organizations WHERE id = _org;
  ASSERT abs(extract(epoch FROM _exp - (now() + interval '14 days'))) < 5, 'trial_14d neschimbat';
  RAISE NOTICE 'OK trial_90d';
END $$;
ROLLBACK;
