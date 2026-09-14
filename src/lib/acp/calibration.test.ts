/**
 * Teste pentru calibrarea ACP (Stage 7).
 * Observațiile sunt SINTETICE, construite ca să verifice pragurile și
 * plafoanele algoritmului — nu sunt date reale de piață.
 */
import { describe, expect, it } from "vitest";
import {
  ACP_CALIBRATION_CONFIG,
  applyCalibration,
  calculateCalibration,
  calibrationSegmentKey,
  selectCalibrationFactor,
  toCalibrationModel,
  type AcpCalibrationObservation,
} from "./calibration";
import type { AcpSubject } from "./scoring";

function observations(
  count: number,
  ratio: number,
  extra: Partial<AcpCalibrationObservation> = {},
): AcpCalibrationObservation[] {
  return Array.from({ length: count }, () => ({
    estimatedPricePerSqm: 2000,
    observedPricePerSqm: 2000 * ratio,
    city: "Bucuresti",
    propertyType: "apartament",
    rooms: 3,
    ...extra,
  }));
}

const subject: AcpSubject = {
  propertyType: "apartament",
  city: "Bucuresti",
  rooms: 3,
  usableArea: 70,
};

describe("calibrationSegmentKey", () => {
  it("normalizează cheia de segment", () => {
    expect(calibrationSegmentKey({ city: "București", propertyType: "Apartament", rooms: 3 })).toBe(
      calibrationSegmentKey({ city: "bucuresti", propertyType: "apartament", rooms: 3 }),
    );
  });

  it("nu produce cheie fără date complete", () => {
    expect(calibrationSegmentKey({ city: "Cluj", propertyType: null, rooms: 2 })).toBeNull();
  });
});

describe("calculateCalibration", () => {
  it("refuză calibrarea sub pragul minim de observații", () => {
    const result = calculateCalibration(observations(5, 1.05));
    expect(result.status).toBe("insufficient_data");
    expect(result.applied).toBe(false);
    expect(result.factor).toBe(1);
  });

  it("calculează un factor pe date suficiente și consistente", () => {
    const result = calculateCalibration(observations(ACP_CALIBRATION_CONFIG.minSampleSize, 1.06));
    expect(result.status).toBe("ok");
    expect(result.applied).toBe(true);
    expect(result.factor).toBeGreaterThan(1);
    expect(result.factor).toBeLessThan(1.1);
    expect(result.sampleSize).toBe(ACP_CALIBRATION_CONFIG.minSampleSize);
  });

  it("plafonează factorul la deviația maximă admisă", () => {
    const result = calculateCalibration(observations(20, 2));
    const max = 1 + ACP_CALIBRATION_CONFIG.maxFactorDeviationPercent / 100;
    expect(result.factor).toBeLessThanOrEqual(max);
  });

  it("marchează drept nefiabilă o dispersie foarte mare", () => {
    const noisy: AcpCalibrationObservation[] = Array.from({ length: 20 }, (_, i) => ({
      estimatedPricePerSqm: 2000,
      observedPricePerSqm: i % 2 === 0 ? 800 : 4200,
      city: "Bucuresti",
      propertyType: "apartament",
      rooms: 3,
    }));
    const result = calculateCalibration(noisy);
    expect(result.status).toBe("unreliable");
    expect(result.applied).toBe(false);
    expect(result.factor).toBe(1);
  });

  it("ignoră observațiile invalide, dar le raportează", () => {
    const mixed = [
      ...observations(ACP_CALIBRATION_CONFIG.minSampleSize, 1.05),
      { estimatedPricePerSqm: 0, observedPricePerSqm: 2000 },
      { estimatedPricePerSqm: 2000, observedPricePerSqm: null },
    ];
    const result = calculateCalibration(mixed);
    expect(result.observationsReceived).toBe(mixed.length);
    expect(result.sampleSize).toBe(ACP_CALIBRATION_CONFIG.minSampleSize);
  });

  it("nu creează segmente fără volum suficient (evită overfitting)", () => {
    const mixed = [
      ...observations(ACP_CALIBRATION_CONFIG.minSampleSize, 1.05),
      ...observations(2, 1.3, { city: "Cluj", rooms: 2 }),
    ];
    const result = calculateCalibration(mixed);
    const cluj = result.segments.find((s) => s.key.includes("cluj"));
    expect(cluj?.applied ?? false).toBe(false);
  });

  it("este determinist", () => {
    const input = observations(15, 1.04);
    expect(calculateCalibration(input)).toEqual(calculateCalibration(input));
  });
});

describe("applyCalibration", () => {
  const baseline = {
    baselineValue: 100_000,
    baselineMin: 95_000,
    baselineMax: 105_000,
    baselineRecommended: 103_000,
  };

  it("lasă baseline-ul neatins când nu există calibrare", () => {
    const result = applyCalibration({ ...baseline, model: null, subject });
    expect(result.applied).toBe(false);
    expect(result.calibratedValue).toBe(100_000);
    expect(result.baselineValue).toBe(100_000);
    expect(result.calibrationStatus).toBe("not_configured");
  });

  it("aplică factorul păstrând baseline-ul separat", () => {
    const calc = calculateCalibration(observations(ACP_CALIBRATION_CONFIG.minSampleSize, 1.06));
    const model = toCalibrationModel(calc, { version: 1, createdAt: "2026-03-01T00:00:00.000Z" });
    const result = applyCalibration({ ...baseline, model, subject });
    expect(result.applied).toBe(true);
    expect(result.baselineValue).toBe(100_000);
    expect(result.calibratedValue).toBeGreaterThan(100_000);
    expect(result.deltaPercent).toBeGreaterThan(0);
    expect(result.calibrationVersion).toBe(1);
  });

  it("nu aplică un model nefiabil", () => {
    const calc = calculateCalibration(observations(4, 1.2));
    const model = toCalibrationModel(calc, { version: 2, createdAt: "2026-03-01T00:00:00.000Z" });
    const selection = selectCalibrationFactor(model, subject);
    expect(selection.source).toBe("none");
    const result = applyCalibration({ ...baseline, model, subject });
    expect(result.calibratedValue).toBe(result.baselineValue);
  });
});
