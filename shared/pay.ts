// Reference implementation of the pay rule. Must match fn_earned in db/schema.sql and
// shared/pay_test_vectors.json. The server is authoritative; the app uses this for previews.
// Integer math only: no floating point touches money.

export type PayBasis = 'DAY' | 'HOUR';
export type InputMode = 'DAY_PORTION' | 'DAY_MINUTES' | 'HOUR_MINUTES' | 'NO_WORK' | 'VOID';

export class PayInputError extends Error {}

/** Portion as a decimal string with at most 4 places, 0 < p <= 1, e.g. "0.5", "0.3333". Returns ten-thousandths. */
export function portionToTenThousandths(portion: string): number {
  if (!/^(0(\.\d{1,4})?|1(\.0{1,4})?)$/.test(portion)) throw new PayInputError('portion must be 0–1 with up to 4 decimals');
  const [whole, frac = ''] = portion.split('.');
  const n = Number(whole) * 10000 + Number((frac + '0000').slice(0, 4));
  if (n <= 0 || n > 10000) throw new PayInputError('portion must be greater than 0 and at most 1');
  return n;
}

/** Round num/den half up (inputs non-negative integers). */
function roundHalfUp(num: number, den: number): number {
  if (!Number.isSafeInteger(num * 2 + den)) throw new PayInputError('amount out of range');
  return Math.floor((2 * num + den) / (2 * den));
}

export function earnedMinor(args: {
  basis: PayBasis; rateMinor: number; mode: InputMode;
  portion?: string | null; minutes?: number | null; standardDayMinutes?: number | null;
}): number {
  const { basis, rateMinor, mode } = args;
  if (!Number.isSafeInteger(rateMinor) || rateMinor <= 0) throw new PayInputError('rate must be a positive integer in cents');
  if (mode === 'NO_WORK' || mode === 'VOID') return 0;
  if (mode === 'DAY_PORTION' && basis === 'DAY') {
    return roundHalfUp(rateMinor * portionToTenThousandths(args.portion ?? ''), 10000);
  }
  const m = args.minutes;
  if (m == null || !Number.isInteger(m) || m < 1 || m > 1440) throw new PayInputError('minutes must be 1–1440');
  if (mode === 'DAY_MINUTES' && basis === 'DAY' && args.standardDayMinutes) {
    return roundHalfUp(rateMinor * m, args.standardDayMinutes);
  }
  if (mode === 'HOUR_MINUTES' && basis === 'HOUR') return roundHalfUp(rateMinor * m, 60);
  throw new PayInputError(`input mode ${mode} not valid for pay basis ${basis}`);
}
