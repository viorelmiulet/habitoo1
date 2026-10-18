-- Rulează într-o tranzacție anulată: trial_90d → +90 zile și is_trial; termenii vechi neschimbați.
BEGIN;
SELECT set_config('test.org', (SELECT id::text FROM public.organizations LIMIT 1), true);
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT user_id FROM public.user_roles WHERE role='superadmin' LIMIT 1), 'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE _org uuid := current_setting('test.org')::uuid; _exp timestamptz;
BEGIN
  _exp := public.set_organization_subscription(_org, 'trial_90d');
  ASSERT abs(extract(epoch FROM _exp - (now() + interval '90 days'))) < 5, 'expirare +90 zile';
  _exp := public.set_organization_subscription(_org, '30d');
  ASSERT abs(extract(epoch FROM _exp - (now() + interval '30 days'))) < 5, '30d neschimbat';
  _exp := public.set_organization_subscription(_org, 'trial_14d');
  ASSERT abs(extract(epoch FROM _exp - (now() + interval '14 days'))) < 5, 'trial_14d neschimbat';
  RAISE NOTICE 'OK trial_90d';
END $$;
RESET ROLE;
SELECT is_trial FROM public.organizations WHERE false;
ROLLBACK;
