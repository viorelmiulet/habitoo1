/** Filtrul `?proprietate={id}` din pagina Lead-uri. */
export function leadMatchesPropertyFilter(lead: { property_id: string | null }, propertyId: string | undefined) {
  return !propertyId || lead.property_id === propertyId;
}

/** „Adaugă lead” pornește cu proprietatea din filtru completată. */
export function leadFormForProperty<T extends { property_id: string }>(form: T, propertyId: string | undefined): T {
  return propertyId ? { ...form, property_id: propertyId } : form;
}
