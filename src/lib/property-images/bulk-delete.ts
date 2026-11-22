/** Ștergerea mai multor fotografii: o singură operație pe server, apoi fișiere și portaluri. */
export type BulkDeletePorts = {
  deleteRows: (propertyId: string, imageIds: string[]) => Promise<string[]>;
  removeFiles: (paths: string[]) => Promise<void>;
  loadProperty: (propertyId: string) => Promise<{ organizationId: string; publishStatus: string | null } | null>;
  enqueuePortalUpdates: (organizationId: string, propertyId: string) => Promise<void>;
};

export const MAX_BULK_IMAGE_DELETE = 200;

export async function bulkDeletePropertyImages(ports: BulkDeletePorts, propertyId: string, imageIds: string[]) {
  const ids = [...new Set(imageIds)];
  if (ids.length === 0) throw new Error("Selectează cel puțin o fotografie.");
  // Drepturile și apartenența pozelor se verifică în RPC; refuz total la orice nepotrivire.
  const paths = await ports.deleteRows(propertyId, ids);
  let fileWarning: string | null = null;
  if (paths.length) {
    try { await ports.removeFiles(paths); } catch { fileWarning = "Unele fișiere nu au putut fi șterse din stocare."; }
  }
  const property = await ports.loadProperty(propertyId);
  let portalsQueued = false;
  if (property && property.publishStatus === "published") {
    await ports.enqueuePortalUpdates(property.organizationId, propertyId);
    portalsQueued = true;
  }
  return { deleted: ids.length, portalsQueued, fileWarning };
}
