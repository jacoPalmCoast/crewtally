// Money helpers. Amounts are integer cents. Parsing uses string/integer math only.

/** Parse a user-typed USD amount ("1,245.50", "$240") to cents. Throws on invalid, negative, or >2 decimals. */
export function parseAmountToCents(input: string): number {
  const s = input.trim().replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('Enter an amount like 240 or 240.50');
  const [whole, frac = ''] = s.split('.');
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents)) throw new Error('Amount is too large');
  return cents;
}

/** Format cents for display. Display only — never parse the result back. */
export function formatCents(cents: number, locale = 'en-US', currency = 'USD'): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  const w = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(whole);
  return `${sign}${currency === 'USD' ? '$' : ''}${w}.${frac}`;
}
