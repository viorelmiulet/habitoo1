import features from "@/assets/public-photos/functionalitati.webp.asset.json";
import featuresOg from "@/assets/public-photos/functionalitati-og.jpg.asset.json";
import acp from "@/assets/public-photos/acp.webp.asset.json";
import acpOg from "@/assets/public-photos/acp-og.jpg.asset.json";
import pricing from "@/assets/public-photos/preturi.webp.asset.json";
import pricingOg from "@/assets/public-photos/preturi-og.jpg.asset.json";
import about from "@/assets/public-photos/despre.webp.asset.json";
import aboutOg from "@/assets/public-photos/despre-og.jpg.asset.json";
import blog from "@/assets/public-photos/blog.webp.asset.json";
import blogOg from "@/assets/public-photos/blog-og.jpg.asset.json";
import contact from "@/assets/public-photos/contact.webp.asset.json";
import contactOg from "@/assets/public-photos/contact-og.jpg.asset.json";
import { SITE_URL } from "./public-identity";

export const publicPagePhotos = {
  features: { src: features.url, ogImage: `${SITE_URL}${featuresOg.url}`, alt: "Mâini lucrând la un laptop cu grafice într-un birou modern de agenție, cu vedere spre blocuri rezidențiale." },
  acp: { src: acp.url, ogImage: `${SITE_URL}${acpOg.url}`, alt: "Plan de apartament și tabletă cu grafice de prețuri pe o masă, lângă o fereastră spre blocuri rezidențiale moderne." },
  pricing: { src: pricing.url, ogImage: `${SITE_URL}${pricingOg.url}`, alt: "Chei de apartament cu breloc auriu pe un birou luminos, lângă un dosar și o ceașcă de cafea." },
  about: { src: about.url, ogImage: `${SITE_URL}${aboutOg.url}`, alt: "Echipă de agenți văzută din spate, discutând în fața unei ferestre mari cu vedere spre oraș." },
  blog: { src: blog.url, ogImage: `${SITE_URL}${blogOg.url}`, alt: "Laptop, carnet de notițe și cafea pe o masă într-un apartament luminos, cu vedere spre clădiri rezidențiale." },
  contact: { src: contact.url, ogImage: `${SITE_URL}${contactOg.url}`, alt: "Colț primitor de agenție cu birou și telefon, lângă o ușă deschisă spre un hol luminos." },
} as const;

export type PublicPagePhoto = (typeof publicPagePhotos)[keyof typeof publicPagePhotos];

export function publicPhotoHead(photo: PublicPagePhoto) {
  return { ogImage: photo.ogImage, preloadImage: photo.src };
}