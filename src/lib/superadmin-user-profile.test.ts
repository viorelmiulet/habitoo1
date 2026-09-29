import { describe, expect, it, vi } from "vitest";
import { applyProfileUpdateEmailFirst, emailChanged } from "./superadmin-user-profile";

describe("applyProfileUpdateEmailFirst", () => {
  it("schimbă întâi emailul de login, apoi profilul", async () => {
    const order: string[] = [];
    await applyProfileUpdateEmailFirst({
      emailChanged: true,
      updateAuthEmail: async () => (order.push("auth"), { error: null }),
      updateProfile: async () => (order.push("profile"), { error: null }),
    });
    expect(order).toEqual(["auth", "profile"]);
  });

  it("dacă emailul de login eșuează, profilul rămâne neschimbat și eroarea apare", async () => {
    const updateProfile = vi.fn(async () => ({ error: null }));
    await expect(
      applyProfileUpdateEmailFirst({
        emailChanged: true,
        updateAuthEmail: async () => ({ error: { message: "email deja folosit" } }),
        updateProfile,
      }),
    ).rejects.toThrow("Emailul de autentificare nu a putut fi schimbat: email deja folosit");
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("fără schimbare de email nu atinge loginul", async () => {
    const updateAuthEmail = vi.fn(async () => ({ error: null }));
    await applyProfileUpdateEmailFirst({
      emailChanged: false,
      updateAuthEmail,
      updateProfile: async () => ({ error: null }),
    });
    expect(updateAuthEmail).not.toHaveBeenCalled();
  });

  it("emailChanged ignoră majusculele și emailul gol", () => {
    expect(emailChanged("A@x.ro", "a@x.ro")).toBe(false);
    expect(emailChanged(null, "a@x.ro")).toBe(false);
    expect(emailChanged("b@x.ro", "a@x.ro")).toBe(true);
  });
});
