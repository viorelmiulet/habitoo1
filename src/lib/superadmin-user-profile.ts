// Ordinea sigură la editarea unui profil de către superadmin:
// întâi emailul de login, apoi profilul — ca să nu rămână profilul cu un email pe care loginul nu îl are.

export type ProfileUpdateSteps = {
  emailChanged: boolean;
  updateAuthEmail: () => Promise<{ error: { message: string } | null }>;
  updateProfile: () => Promise<{ error: { message: string } | null }>;
};

export async function applyProfileUpdateEmailFirst(steps: ProfileUpdateSteps): Promise<void> {
  if (steps.emailChanged) {
    const { error } = await steps.updateAuthEmail();
    if (error) {
      throw new Error(`Emailul de autentificare nu a putut fi schimbat: ${error.message}`);
    }
  }
  const { error } = await steps.updateProfile();
  if (error) throw new Error(error.message);
}

export function emailChanged(next: string | null, previous: string | null): boolean {
  return Boolean(next) && next!.toLowerCase() !== (previous ?? "").toLowerCase();
}

export const AVATAR_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
