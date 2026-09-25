import { describe, expect, it } from "vitest";
import vectors from "../../../shared/pay_test_vectors.json";
import { earnedMinor, type InputMode, type PayBasis } from "@workspace/crewtally-shared/pay";
import { parseAmountToCents, formatCents } from "@workspace/crewtally-shared/money";

describe("protected shared pay vectors", () => {
  for (const vector of vectors.vectors) it(vector.id, () => {
    expect(earnedMinor({
      basis: vector.basis as PayBasis, rateMinor: vector.rate_minor,
      mode: vector.mode as InputMode, portion: vector.portion,
      minutes: vector.minutes, standardDayMinutes: vector.standard_day_minutes,
    })).toBe(vector.earned_minor);
  });
  for (const sample of vectors.invalid) it(`rejects ${sample.basis}/${sample.mode}`, () => {
    expect(() => earnedMinor({
      basis: sample.basis as PayBasis, rateMinor: 24000, mode: sample.mode as InputMode,
      portion: "portion" in sample ? sample.portion : undefined,
      minutes: "minutes" in sample ? sample.minutes : undefined,
      standardDayMinutes: "standard_day_minutes" in sample ? sample.standard_day_minutes : undefined,
    })).toThrow();
  });
  for (const sample of vectors.parse) it(`parses ${sample.input || "<blank>"}`, () => {
    if ("error" in sample) expect(() => parseAmountToCents(sample.input)).toThrow();
    else expect(parseAmountToCents(sample.input)).toBe(sample.cents);
  });
  it("formats integer cents", () => expect(formatCents(124500)).toBe("$1,245.00"));
});