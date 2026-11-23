/** URL-ul public al pozei agentului pentru Storia `contact.photo` (pur). */
export type AgentPhotoProfile = { id?: string | null; avatar_url?: string | null; public_profile_hidden?: boolean | null; is_active?: boolean | null };

export function agentPhotoPath(profileId: string): string {
  return `/api/public/sites/v1/agent-photo/${profileId}`;
}

/** null când agentul nu are poză, e inactiv sau are profilul public ascuns. */
export function storiaAgentPhotoUrl(baseUrl: string, profile: AgentPhotoProfile | null | undefined): string | null {
  if (!profile?.id || !profile.avatar_url?.trim()) return null;
  if (profile.public_profile_hidden === true || profile.is_active === false) return null;
  return `${baseUrl.replace(/\/+$/, "")}${agentPhotoPath(profile.id)}`;
}
