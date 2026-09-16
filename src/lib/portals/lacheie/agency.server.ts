/**
 * Operațiile `/agencies/{external_id}` din API-ul La Cheie pentru furnizori CRM.
 * Server-only: folosesc cheia unică de furnizor, fără `X-Agency-External-ID`.
 *
 *  - PUT    → înregistrare (versiune 1) sau reactivare (versiune mai mare);
 *  - GET    → statusul real raportat de portal + versiunea acceptată;
 *  - DELETE → dezactivarea sincronizării și retragerea ofertelor conexiunii.
 */
import { laCheieAgenciesPath } from "./config";
import { laCheieRequest, type LaCheieRequestConfig, type LaCheieResponse } from "./client.server";
import {
  parseLaCheieAgencyBody,
  type LaCheieAgencyProfile,
  type LaCheieAgencyResponse,
} from "./agency";

export type LaCheieAgencyCall = {
  response: LaCheieResponse;
  agency: LaCheieAgencyResponse;
};

function describe(response: LaCheieResponse): LaCheieAgencyCall {
  return { response, agency: parseLaCheieAgencyBody(response.body) };
}

/** Înregistrare sau reactivare: starea completă a agenției, cu versiune. */
export async function putLaCheieAgency(
  config: LaCheieRequestConfig,
  input: { externalId: string; payload: LaCheieAgencyProfile; version: string },
): Promise<LaCheieAgencyCall> {
  return describe(
    await laCheieRequest(config, {
      method: "PUT",
      path: laCheieAgenciesPath(input.externalId),
      scope: "agencies",
      body: input.payload,
      sourceVersion: input.version,
    }),
  );
}

export async function getLaCheieAgency(
  config: LaCheieRequestConfig,
  input: { externalId: string },
): Promise<LaCheieAgencyCall> {
  return describe(
    await laCheieRequest(config, {
      method: "GET",
      path: laCheieAgenciesPath(input.externalId),
      scope: "agencies",
    }),
  );
}

/** Dezactivare: retrage ofertele acestei conexiuni, fără să atingă alte agenții. */
export async function deleteLaCheieAgency(
  config: LaCheieRequestConfig,
  input: { externalId: string; version: string },
): Promise<LaCheieAgencyCall> {
  return describe(
    await laCheieRequest(config, {
      method: "DELETE",
      path: laCheieAgenciesPath(input.externalId),
      scope: "agencies",
      sourceVersion: input.version,
    }),
  );
}
