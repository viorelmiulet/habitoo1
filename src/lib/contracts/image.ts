/**
 * Pregătirea fotografiei actului înainte de trimitere la citirea automată.
 *
 * Pozele de telefon au adesea câțiva MB și 4000 px pe latura lungă — mult peste
 * ce este necesar pentru citirea unui buletin. Redimensionăm la 1600 px și
 * recomprimăm JPEG la calitate 0,85, astfel încât cererea rămâne mică și rapidă.
 * Formatele pe care browserul nu le poate decoda (HEIC/HEIF de pe iPhone, în
 * majoritatea browserelor) produc un mesaj clar, nu o eroare generică.
 */

export const MAX_IMAGE_EDGE = 1600;
export const IMAGE_QUALITY = 0.85;

export type PreparedImage = {
  base64: string;
  mimeType: string;
  bytes: number;
};

const HEIC = /^image\/(heic|heif)/i;

function isHeic(file: File) {
  return HEIC.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* revenim la <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode"));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

export async function prepareIdImage(file: File): Promise<PreparedImage> {
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    throw new Error(
      isHeic(file)
        ? "Formatul HEIC (iPhone) nu poate fi citit de browser. Setează camera pe „Cea mai compatibilă” sau trimite o poză JPG."
        : "Nu am putut deschide imaginea. Folosește o poză JPG, PNG sau WEBP.",
    );
  }

  const width = "width" in bitmap ? bitmap.width : 0;
  const height = "height" in bitmap ? bitmap.height : 0;
  if (!width || !height) throw new Error("Imaginea pare goală. Fotografiază actul din nou.");

  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browserul nu poate procesa imaginea. Completează datele manual.");
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
  const base64 = dataUrl.split(",")[1] ?? "";
  if (base64.length < 200) throw new Error("Imaginea nu a putut fi procesată. Încearcă din nou.");

  return {
    base64,
    mimeType: "image/jpeg",
    bytes: Math.floor((base64.length * 3) / 4),
  };
}
