import { describe, expect, it } from "vitest";
import { transactionPayload, transactionFromProperty } from "./PropertyTransactionFields";

const base = { sale_price: 100, sale_currency: "EUR", rent_price: 500, rent_currency: "RON" };

describe("transactionPayload", () => {
  it("doar vânzare", () => {
    const p = transactionPayload({ ...base, for_sale: true, for_rent: false });
    expect(p).toMatchObject({
      for_sale: true,
      for_rent: false,
      transaction_kind: "sale",
      price: 100,
      currency: "EUR",
      rent_price: null,
      rent_currency: null,
    });
  });

  it("doar închiriere (vânzare debifată) nu forțează vânzarea", () => {
    const p = transactionPayload({ ...base, for_sale: false, for_rent: true });
    expect(p).toMatchObject({
      for_sale: false,
      for_rent: true,
      transaction_kind: "rent",
      price: 500,
      currency: "RON",
      sale_price: null,
      sale_currency: null,
    });
  });

  it("ambele simultan păstrează prețuri și monede distincte", () => {
    const p = transactionPayload({ ...base, for_sale: true, for_rent: true });
    expect(p).toMatchObject({
      for_sale: true,
      for_rent: true,
      sale_price: 100,
      sale_currency: "EUR",
      rent_price: 500,
      rent_currency: "RON",
      transaction_kind: "sale",
    });
  });

  it("niciuna bifată → fallback vânzare", () => {
    const p = transactionPayload({ ...base, for_sale: false, for_rent: false });
    expect(p.for_sale).toBe(true);
    expect(p.for_rent).toBe(false);
  });
});

describe("transactionFromProperty", () => {
  it("citește proprietăți vechi de închiriere", () => {
    const v = transactionFromProperty({ transaction_kind: "rent", price: 600, currency: "EUR" });
    expect(v).toMatchObject({ for_sale: false, for_rent: true, rent_price: 600 });
  });
  it("respectă flagurile noi când există", () => {
    const v = transactionFromProperty({
      for_sale: true,
      for_rent: true,
      sale_price: 1,
      rent_price: 2,
      transaction_kind: "sale",
    });
    expect(v).toMatchObject({ for_sale: true, for_rent: true, sale_price: 1, rent_price: 2 });
  });
});
