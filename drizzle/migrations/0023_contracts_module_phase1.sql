-- Modul Contracte, etapa 1: șabloane, contracte, părți semnatare, tokenuri de semnare, documente.

CREATE TABLE public.contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  name text NOT NULL,
  body text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  source_template_id uuid REFERENCES public.contract_templates(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contract_templates_org_idx ON public.contract_templates (organization_id, kind);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_templates TO authenticated;
GRANT ALL ON public.contract_templates TO service_role;
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "templates_select" ON public.contract_templates FOR SELECT TO authenticated
  USING (organization_id IS NULL OR organization_id = public.current_org() OR public.is_superadmin());
CREATE POLICY "templates_insert" ON public.contract_templates FOR INSERT TO authenticated
  WITH CHECK (
    (organization_id IS NOT NULL AND organization_id = public.current_org() AND public.is_org_admin())
    OR (organization_id IS NULL AND public.is_superadmin())
  );
CREATE POLICY "templates_update" ON public.contract_templates FOR UPDATE TO authenticated
  USING (
    (organization_id = public.current_org() AND public.is_org_admin()) OR public.is_superadmin()
  )
  WITH CHECK (
    (organization_id = public.current_org() AND public.is_org_admin()) OR public.is_superadmin()
  );
CREATE POLICY "templates_delete" ON public.contract_templates FOR DELETE TO authenticated
  USING ((organization_id = public.current_org() AND public.is_org_admin()) OR public.is_superadmin());

CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.contract_templates(id) ON DELETE SET NULL,
  kind text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  body text NOT NULL DEFAULT '',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  price numeric,
  currency text DEFAULT 'EUR',
  commission text,
  duration_days integer,
  document_path text,
  signed_document_path text,
  sent_at timestamptz,
  signed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contracts_org_idx ON public.contracts (organization_id, created_at DESC);
CREATE INDEX contracts_property_idx ON public.contracts (property_id);
CREATE INDEX contracts_contact_idx ON public.contracts (contact_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contracts_select" ON public.contracts FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR (organization_id = public.current_org() AND (created_by = auth.uid() OR public.is_org_admin()))
  );
CREATE POLICY "contracts_insert" ON public.contracts FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org() AND created_by = auth.uid());
CREATE POLICY "contracts_update" ON public.contracts FOR UPDATE TO authenticated
  USING (organization_id = public.current_org() AND (created_by = auth.uid() OR public.is_org_admin()))
  WITH CHECK (organization_id = public.current_org());
CREATE POLICY "contracts_delete" ON public.contracts FOR DELETE TO authenticated
  USING (organization_id = public.current_org() AND (created_by = auth.uid() OR public.is_org_admin()));

CREATE OR REPLACE FUNCTION public.can_access_contract(_contract_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contracts c
     WHERE c.id = _contract_id
       AND (
         public.is_superadmin()
         OR (c.organization_id = public.current_org() AND (c.created_by = auth.uid() OR public.is_org_admin()))
       )
  );
$$;

CREATE TABLE public.contract_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role text NOT NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  address text,
  birth_date date,
  id_issued_on date,
  id_issuer text,
  cnp_enc text,
  id_series_enc text,
  id_number_enc text,
  sign_order integer NOT NULL DEFAULT 1,
  signed_at timestamptz,
  signature_path text,
  signature_ip text,
  signature_user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contract_parties_contract_idx ON public.contract_parties (contract_id, sign_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_parties TO authenticated;
GRANT ALL ON public.contract_parties TO service_role;
ALTER TABLE public.contract_parties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parties_select" ON public.contract_parties FOR SELECT TO authenticated
  USING (public.can_access_contract(contract_id));
CREATE POLICY "parties_insert" ON public.contract_parties FOR INSERT TO authenticated
  WITH CHECK (public.can_access_contract(contract_id) AND organization_id = public.current_org());
CREATE POLICY "parties_update" ON public.contract_parties FOR UPDATE TO authenticated
  USING (public.can_access_contract(contract_id))
  WITH CHECK (public.can_access_contract(contract_id));
CREATE POLICY "parties_delete" ON public.contract_parties FOR DELETE TO authenticated
  USING (public.can_access_contract(contract_id));

CREATE TABLE public.contract_signature_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  party_id uuid NOT NULL REFERENCES public.contract_parties(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contract_tokens_contract_idx ON public.contract_signature_tokens (contract_id);

GRANT SELECT ON public.contract_signature_tokens TO authenticated;
GRANT ALL ON public.contract_signature_tokens TO service_role;
ALTER TABLE public.contract_signature_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tokens_select" ON public.contract_signature_tokens FOR SELECT TO authenticated
  USING (public.can_access_contract(contract_id));

CREATE TABLE public.contract_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'draft',
  storage_path text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contract_documents_contract_idx ON public.contract_documents (contract_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.contract_documents TO authenticated;
GRANT ALL ON public.contract_documents TO service_role;
ALTER TABLE public.contract_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contract_documents_select" ON public.contract_documents FOR SELECT TO authenticated
  USING (public.can_access_contract(contract_id));
CREATE POLICY "contract_documents_insert" ON public.contract_documents FOR INSERT TO authenticated
  WITH CHECK (public.can_access_contract(contract_id) AND organization_id = public.current_org());
CREATE POLICY "contract_documents_delete" ON public.contract_documents FOR DELETE TO authenticated
  USING (public.can_access_contract(contract_id));

CREATE TRIGGER contracts_touch BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER contract_templates_touch BEFORE UPDATE ON public.contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Șabloane implicite Habitoo (nivel platformă). Conținutul juridic real se înlocuiește ulterior.
INSERT INTO public.contract_templates (organization_id, kind, name, body) VALUES
(NULL, 'sale_mandate', 'Mandat de vânzare (șablon Habitoo)',
'CONTRACT DE MANDAT DE VÂNZARE

Nr. {{contract.numar}} din data {{contract.data}}

1. PĂRȚILE
Agenția: {{agentie.denumire}}, {{agentie.denumire_legala}}, CUI {{agentie.cui}}, Registrul Comerțului {{agentie.registru}}, cu sediul în {{agentie.adresa}}, telefon {{agentie.telefon}}, email {{agentie.email}}, reprezentată de {{agent.nume}}.

Proprietar: {{client.nume}}, CNP {{client.cnp}}, act de identitate seria {{client.serie}} nr. {{client.numar}}, eliberat de {{client.emitent}} la data {{client.data_eliberarii}}, domiciliat în {{client.adresa}}, telefon {{client.telefon}}, email {{client.email}}.

2. OBIECTUL CONTRACTULUI
Proprietarul acordă agenției mandatul de a intermedia vânzarea imobilului: {{proprietate.titlu}}, referință {{proprietate.referinta}}, situat în {{proprietate.adresa}}, {{proprietate.localitate}}, {{proprietate.judet}}, cu suprafața de {{proprietate.suprafata}} mp, {{proprietate.camere}} camere.

3. PREȚUL
Prețul de vânzare solicitat este de {{contract.pret}} {{contract.moneda}}.

4. COMISIONUL
Comisionul agenției este de {{contract.comision}}, datorat la momentul perfectării tranzacției.

5. DURATA
Prezentul contract este valabil {{contract.durata}} zile de la data semnării.

6. CLAUZE FINALE
Textul complet al clauzelor se completează de agenție conform propriului model.'),
(NULL, 'rent_mandate', 'Mandat de închiriere (șablon Habitoo)',
'CONTRACT DE MANDAT DE ÎNCHIRIERE

Nr. {{contract.numar}} din data {{contract.data}}

1. PĂRȚILE
Agenția: {{agentie.denumire}}, CUI {{agentie.cui}}, cu sediul în {{agentie.adresa}}, reprezentată de {{agent.nume}}.
Proprietar: {{client.nume}}, CNP {{client.cnp}}, act de identitate seria {{client.serie}} nr. {{client.numar}}, domiciliat în {{client.adresa}}, telefon {{client.telefon}}.

2. OBIECTUL CONTRACTULUI
Proprietarul acordă agenției mandatul de a intermedia închirierea imobilului {{proprietate.titlu}} (referință {{proprietate.referinta}}), situat în {{proprietate.adresa}}, {{proprietate.localitate}}.

3. CHIRIA
Chiria solicitată este de {{contract.pret}} {{contract.moneda}} pe lună.

4. COMISIONUL
Comisionul agenției este de {{contract.comision}}.

5. DURATA
Mandatul este valabil {{contract.durata}} zile de la data semnării.

6. CLAUZE FINALE
Textul complet al clauzelor se completează de agenție conform propriului model.'),
(NULL, 'viewing_report', 'Proces-verbal de vizionare (șablon Habitoo)',
'PROCES-VERBAL DE VIZIONARE

Nr. {{contract.numar}} din data {{contract.data}}

Agenția {{agentie.denumire}}, CUI {{agentie.cui}}, reprezentată de agentul {{agent.nume}}, a prezentat astăzi, {{contract.data}}, imobilul {{proprietate.titlu}} (referință {{proprietate.referinta}}), situat în {{proprietate.adresa}}, {{proprietate.localitate}}, {{proprietate.judet}}.

Client: {{client.nume}}, CNP {{client.cnp}}, act de identitate seria {{client.serie}} nr. {{client.numar}}, telefon {{client.telefon}}, email {{client.email}}.

Prețul comunicat: {{contract.pret}} {{contract.moneda}}. Comision agenție: {{contract.comision}}.

Clientul confirmă că imobilul i-a fost prezentat de agenție și că datele mai sus menționate sunt corecte.');
