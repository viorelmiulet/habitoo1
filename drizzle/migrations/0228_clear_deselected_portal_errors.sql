UPDATE public.portal_listings l
SET last_error = NULL,
    status = CASE WHEN l.status = 'error' THEN 'withdrawn' ELSE l.status END
FROM public.portal_publications p
WHERE p.organization_id = l.organization_id
  AND p.property_id = l.property_id
  AND p.portal_key = l.portal
  AND p.enabled = false
  AND (l.last_error IS NOT NULL OR l.status = 'error');

UPDATE public.portal_publications
SET last_error = NULL,
    status = CASE WHEN status = 'error' THEN 'disabled' ELSE status END
WHERE enabled = false
  AND (last_error IS NOT NULL OR status = 'error');