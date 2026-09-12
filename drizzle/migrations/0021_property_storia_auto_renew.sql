-- Suprascriere per proprietate a auto-prelungirii Storia.
-- NULL = moștenește setarea agenției (organizations.storia_auto_republish).
-- Toate proprietățile existente rămân pe NULL, deci comportamentul nu se schimbă.
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS storia_auto_renew BOOLEAN;

COMMENT ON COLUMN public.properties.storia_auto_renew IS
  'Suprascriere auto-prelungire Storia: NULL = moștenește setarea agenției, true/false = suprascriere explicită.';