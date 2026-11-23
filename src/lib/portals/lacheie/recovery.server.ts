/** Releases only image-limit retries; never calls a portal itself. */
export async function recoverLaCheieImageLimitJobs(admin: {
  rpc: (name: "requeue_lacheie_image_limit_jobs", args: { _defer: boolean }) => PromiseLike<{ data: number | null; error: unknown }>;
}): Promise<number> {
  const { data, error } = await admin.rpc("requeue_lacheie_image_limit_jobs", { _defer: false });
  if (error) throw new Error("La Cheie: reluarea anunțurilor blocate de limita pozelor a eșuat.");
  return data ?? 0;
}