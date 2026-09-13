CREATE INDEX IF NOT EXISTS contract_templates_platform_active_kind_idx
  ON public.contract_templates (kind)
  WHERE organization_id IS NULL AND is_active = true;

INSERT INTO public.contract_templates (organization_id, kind, name, body)
SELECT NULL, 'exclusive_representation', 'Contract de reprezentare exclusivă (șablon Habitoo)',
  'Conținutul juridic este randat dinamic din datele contractului.'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.contract_templates
  WHERE organization_id IS NULL
    AND kind = 'exclusive_representation'
    AND is_active = true
);