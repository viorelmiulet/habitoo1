-- Un singur comutator: portalurile activate trimit efectiv către portal.
UPDATE public.portal_connections
SET settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('allow_live', true),
    updated_at = now()
WHERE activated = true
  AND coalesce((settings->>'allow_live')::boolean, false) = false;

-- Simetric: portalurile dezactivate nu rămân cu trimiteri reale pornite.
UPDATE public.portal_connections
SET settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('allow_live', false),
    updated_at = now()
WHERE activated = false
  AND coalesce((settings->>'allow_live')::boolean, false) = true;