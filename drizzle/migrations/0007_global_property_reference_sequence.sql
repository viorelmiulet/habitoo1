-- Numerotare globală a referințelor de proprietăți: o singură secvență pentru
-- toată platforma, nu „max + 1” per agenție (vulnerabil la condiții de cursă:
-- doi agenți care salvează simultan puteau primi același număr).
CREATE SEQUENCE IF NOT EXISTS public.property_reference_seq AS BIGINT START WITH 1003 INCREMENT BY 1;

-- Secvența pornește de la maximul folosit + 1, ca referințele istorice să rămână neatinse.
SELECT setval(
  'public.property_reference_seq',
  GREATEST(
    1002,
    COALESCE((SELECT MAX(NULLIF(regexp_replace(reference, '\D', '', 'g'), '')::BIGINT) FROM public.properties), 1002)
  )
);

CREATE OR REPLACE FUNCTION public.next_property_reference()
RETURNS TEXT
LANGUAGE SQL
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'RF-' || nextval('public.property_reference_seq')::TEXT
$$;

GRANT USAGE ON SEQUENCE public.property_reference_seq TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_property_reference() TO authenticated, service_role;