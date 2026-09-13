ALTER TABLE public.organizations
  ADD COLUMN legal_representative text,
  ADD COLUMN legal_representative_title text;

CREATE SEQUENCE public.contract_number_seq START WITH 1001;
GRANT USAGE, SELECT ON SEQUENCE public.contract_number_seq TO authenticated;
GRANT ALL ON SEQUENCE public.contract_number_seq TO service_role;

CREATE OR REPLACE FUNCTION public.next_contract_number()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'CTR-' || lpad(nextval('public.contract_number_seq')::text, 6, '0')
$$;

REVOKE ALL ON FUNCTION public.next_contract_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_contract_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_contract_number() TO service_role;

CREATE UNIQUE INDEX contracts_org_contract_number_uidx
  ON public.contracts (organization_id, ((data->>'contractNumber')))
  WHERE NULLIF(data->>'contractNumber', '') IS NOT NULL;