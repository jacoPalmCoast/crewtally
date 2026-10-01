import * as Crypto from 'expo-crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function base64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 !== undefined) out += ALPHABET[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 !== undefined) out += ALPHABET[b2 & 63];
  }
  return out;
}

/**
 * rawNonce: 32 random bytes, base64url (43 chars: the API contract requires this form).
 * hashedNonce: SHA-256 of the rawNonce string as lowercase hex, which is what
 * the server compares with the identity token's nonce claim.
 */
export async function createNoncePair(): Promise<{ rawNonce: string; hashedNonce: string }> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const rawNonce = base64Url(bytes);
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
  return { rawNonce, hashedNonce };
}
