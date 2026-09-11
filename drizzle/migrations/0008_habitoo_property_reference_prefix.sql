-- Prefix nou „HB-”, cu secvența globală pornită de la 1001. Referințele
-- istorice „RF-xxxx” rămân neatinse: prefixul diferit exclude coliziunile.
SELECT setval('public.property_reference_seq', 1000, false);

CREATE OR REPLACE FUNCTION public.next_property_reference()
RETURNS TEXT
LANGUAGE SQL
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'HB-' || nextval('public.property_reference_seq')::TEXT
$$;

-- Unicitate garantată de bază pentru referințele generate de acum înainte.
-- Index parțial, ca duplicatele istorice „RF-” să nu blocheze constrângerea.
CREATE UNIQUE INDEX IF NOT EXISTS properties_reference_hb_unique
  ON public.properties (reference)
  WHERE reference LIKE 'HB-%';