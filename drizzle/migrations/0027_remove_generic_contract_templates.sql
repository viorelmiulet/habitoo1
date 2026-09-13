DELETE FROM public.contract_templates
WHERE organization_id IS NULL
  AND kind IN ('sale_mandate', 'rent_mandate', 'viewing_report');