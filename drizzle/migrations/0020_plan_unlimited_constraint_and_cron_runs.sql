-- 1. Planurile: acceptăm exact basic | pro | unlimited, cu migrarea istoricelor.
UPDATE public.organizations SET plan = 'unlimited' WHERE plan IN ('business', 'enterprise');
UPDATE public.agency_registration_requests SET requested_plan = 'unlimited'
  WHERE requested_plan IN ('business', 'enterprise');

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_plan_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_plan_check CHECK (plan = ANY (ARRAY['basic'::text, 'pro'::text, 'unlimited'::text]));

ALTER TABLE public.agency_registration_requests
  DROP CONSTRAINT IF EXISTS agency_registration_requests_requested_plan_check;
ALTER TABLE public.agency_registration_requests
  ADD CONSTRAINT agency_registration_requests_requested_plan_check
  CHECK (requested_plan IS NULL OR requested_plan = ANY (ARRAY['basic'::text, 'pro'::text, 'unlimited'::text]));

-- 2. Jurnalul minim al rulărilor verificării zilnice.
CREATE TABLE IF NOT EXISTS public.subscription_cron_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL DEFAULT true,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);

GRANT SELECT ON public.subscription_cron_runs TO authenticated;
GRANT ALL ON public.subscription_cron_runs TO service_role;
ALTER TABLE public.subscription_cron_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_cron_runs_select ON public.subscription_cron_runs;
CREATE POLICY subscription_cron_runs_select ON public.subscription_cron_runs
  FOR SELECT TO authenticated USING (public.is_superadmin());

CREATE INDEX IF NOT EXISTS subscription_cron_runs_ran_at_idx
  ON public.subscription_cron_runs (ran_at DESC);

-- 3. Verificarea zilnică rulează direct în bază; HTTP-ul rămâne doar pentru emailuri.
CREATE OR REPLACE FUNCTION public.subscription_cron_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _res jsonb;
  _run uuid;
  _token text;
  _grace jsonb;
BEGIN
  BEGIN
    _res := public.subscription_enforce_daily();
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.subscription_cron_runs (ok, result, error)
    VALUES (false, '{}'::jsonb, SQLERRM)
    RETURNING id INTO _run;
    RETURN jsonb_build_object('ok', false, 'run_id', _run, 'error', SQLERRM);
  END;

  _grace := coalesce(_res -> 'grace', '[]'::jsonb);

  INSERT INTO public.subscription_cron_runs (ok, result)
  VALUES (true, _res)
  RETURNING id INTO _run;

  IF jsonb_array_length(_grace) > 0 THEN
    _token := public.cron_nonce_issue('subscriptions');
    PERFORM net.http_post(
      url := 'https://crm.habitoo.ro/api/public/cron/subscriptions',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-nonce', _token),
      body := jsonb_build_object('emailsOnly', true, 'grace', _grace)
    );
  END IF;

  RETURN _res || jsonb_build_object('ok', true, 'run_id', _run);
END;
$$;

GRANT EXECUTE ON FUNCTION public.subscription_cron_tick() TO service_role;
