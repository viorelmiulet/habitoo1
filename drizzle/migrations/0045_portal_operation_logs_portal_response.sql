ALTER TABLE public.portal_operation_logs
  ADD COLUMN IF NOT EXISTS portal_response jsonb;

COMMENT ON COLUMN public.portal_operation_logs.portal_response IS
  'Corpul brut al raspunsului portalului (sanitizat de secrete), pentru diagnostic: error.code, error.message, error.fields.';