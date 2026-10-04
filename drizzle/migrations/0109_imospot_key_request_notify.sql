ALTER TABLE public.portal_activation_requests
  ADD COLUMN IF NOT EXISTS provider_notify_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_notify_error text;
COMMENT ON COLUMN public.portal_activation_requests.provider_notify_required IS 'Set on approvals made after the provider-notification feature; older approvals never send.';

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin manages platform settings" ON public.platform_settings
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());