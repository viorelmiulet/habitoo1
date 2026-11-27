import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/integrations/supabase/types';
import { readCompleteRows } from '@/lib/site-feed/complete-read.server';

type Development = Pick<Tables<'developments'>, 'organization_id' | 'created_by' | 'assigned_to'>;
export type DevelopmentContact = Pick<Tables<'profiles'>, 'id' | 'organization_id' | 'full_name' | 'email' | 'phone' | 'avatar_url' | 'is_active' | 'public_profile_hidden'>;
const CONTACT_COLUMNS = 'id,organization_id,full_name,email,phone,avatar_url,is_active,public_profile_hidden' as const;

/** One contact rule, optionally using a preloaded batch; assigned-agent fallback retains its existing eligibility. */
export async function resolveDevelopmentContact(db: SupabaseClient<Database>, development: Development, profiles?: DevelopmentContact[]): Promise<DevelopmentContact | null> {
  const ids = [...new Set([development.created_by, development.assigned_to].filter((id): id is string => Boolean(id)))];
  if (!ids.length) return null;
  const candidates = profiles ?? await readCompleteRows((from, to) => db.from('profiles').select(CONTACT_COLUMNS)
    .eq('organization_id', development.organization_id).in('id', ids).order('id').range(from, to));
  const local = candidates.filter(profile => profile.organization_id === development.organization_id);
  const creator = local.find(profile => profile.id === development.created_by && profile.is_active === true);
  return creator ?? local.find(profile => profile.id === development.assigned_to) ?? null;
}

/** Batched reads, keeping the contact decision solely in resolveDevelopmentContact. */
export async function readDevelopmentContacts(db: SupabaseClient<Database>, developments: (Development & { id: string })[]): Promise<Map<string, DevelopmentContact | null>> {
  const ids = [...new Set(developments.flatMap(d => [d.created_by, d.assigned_to]).filter((id): id is string => Boolean(id)))];
  const orgs = [...new Set(developments.map(d => d.organization_id))];
  const profiles: DevelopmentContact[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    profiles.push(...await readCompleteRows((from, to) => db.from('profiles').select(CONTACT_COLUMNS)
      .in('organization_id', orgs).in('id', chunk).order('id').range(from, to)));
  }
  const contacts = await Promise.all(developments.map(async d => [d.id, await resolveDevelopmentContact(db, d, profiles)] as const));
  return new Map(contacts);
}
