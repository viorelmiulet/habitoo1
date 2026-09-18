/**
 * Eșantion capturat de la API-ul real Eurostat (`prc_hpi_q`, geo=RO,
 * unit=I15_Q, purchase=TOTAL), redus la câteva trimestre. Testele nu fac
 * niciun apel live.
 */
export function sampleResponse(values: Record<string, number | null>) {
  const labels = Object.keys(values);
  const index: Record<string, number> = {};
  const label: Record<string, string> = {};
  const value: Record<string, number | null> = {};
  labels.forEach((quarter, position) => {
    index[quarter] = position;
    label[quarter] = quarter;
    value[String(position)] = values[quarter] ?? null;
  });

  return {
    version: "2.0",
    class: "dataset",
    label: "House price index - quarterly data",
    source: "ESTAT",
    updated: "2026-07-02T11:00:00+0200",
    value,
    id: ["freq", "purchase", "unit", "geo", "time"],
    size: [1, 1, 1, 1, labels.length],
    dimension: {
      freq: { label: "Time frequency", category: { index: { Q: 0 }, label: { Q: "Quarterly" } } },
      purchase: {
        label: "Purchases",
        category: { index: { TOTAL: 0, DW_NEW: 0, DW_EXST: 0 }, label: { TOTAL: "Total" } },
      },
      unit: {
        label: "Unit of measure",
        category: { index: { I15_Q: 0 }, label: { I15_Q: "Quarterly index, 2015=100" } },
      },
      geo: {
        label: "Geopolitical entity (reporting)",
        category: { index: { RO: 0 }, label: { RO: "Romania" } },
      },
      time: { label: "Time", category: { index, label } },
    },
  };
}

/** Ultimele patru trimestre observate live pentru seria „Total". */
export const SAMPLE_HPI_TOTAL = sampleResponse({
  "2024-Q3": 155.86,
  "2024-Q4": 158.36,
  "2025-Q1": 161.75,
  "2025-Q2": 162.38,
});
