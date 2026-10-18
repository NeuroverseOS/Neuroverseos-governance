/**
 * Canonical JSON, SHA-256 and the fingerprint — what another implementation
 * must reproduce byte for byte. Specified in SPEC.md § 8.
 *
 *   canonicalJson: RFC 8785 (JSON Canonicalization Scheme, JCS): object
 *                  members sorted by key as UTF-16 code units, no whitespace,
 *                  strings and numbers serialised as ECMAScript JSON.stringify
 *                  does (JCS § 3.2.2 cites ES6 Number::toString). Members
 *                  whose value is `undefined` are dropped first (JSON has no
 *                  undefined). Non-finite numbers, lone surrogates in strings
 *                  and non-JSON values (functions, symbols, bigints) are
 *                  refused with a clear error, as JCS requires.
 *   sha256:        FIPS 180-4, pure and synchronous, over bytes.
 *   fingerprint:   SHA-256 over the UTF-8 bytes of the canonical JSON, as 64
 *                  lowercase hex digits. Spec robot-domain-rules/3; the /2
 *                  fingerprint was 64-bit FNV-1a over UTF-16 code units
 *                  (16 hex digits) and is recognised only to be refused.
 */

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export function canonicalJson(value: unknown): string {
  if (value === undefined) throw new Error('canonicalJson: undefined is not a JSON value');
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') throw new Error(`canonicalJson: a ${typeof value} is not a JSON value`);
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`canonicalJson: ${String(value)} is not a JSON number (RFC 8785 § 3.2.2.3)`);
  if (typeof value === 'string') {
    if (LONE_SURROGATE.test(value)) throw new Error('canonicalJson: the string holds a lone surrogate, which is not Unicode text (RFC 8785 § 3.2.2.2 serialises Unicode strings only)');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(v => canonicalJson(v === undefined ? null : v)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    for (const [k] of entries) if (LONE_SURROGATE.test(k)) throw new Error('canonicalJson: an object key holds a lone surrogate');
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// ─── SHA-256 (FIPS 180-4 § 6.2) ──────────────────────────────────────────────

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** SHA-256 of a byte string (FIPS 180-4), as 64 lowercase hex digits. Pure, synchronous, no dependencies. */
export function sha256(message: Uint8Array): string {
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  // Padding (§ 5.1.1): a 1 bit, zeros, then the 64-bit big-endian bit length; total a multiple of 64 bytes.
  const bitLength = message.length * 8;
  const padded = new Uint8Array(Math.ceil((message.length + 9) / 64) * 64);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(padded.length - 4, bitLength >>> 0, false);
  const W = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let t = 0; t < 16; t++) W[t] = view.getUint32(offset + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const T1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const T2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + T1) >>> 0; d = c; c = b; b = a; a = (T1 + T2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return [...H].map(x => x.toString(16).padStart(8, '0')).join('');
}

/** SHA-256 of the UTF-8 encoding of a string. */
export function sha256Utf8(text: string): string {
  return sha256(new TextEncoder().encode(text));
}

/**
 * The /3 fingerprint: SHA-256 over the UTF-8 bytes of `canonicalJson(value)`,
 * 64 lowercase hex digits. It identifies data; it is not a signature (see
 * `signRulebook`). A rulebook's fingerprint is `fingerprint(rulebook without
 * its `fingerprint` and `findings` members)` (SPEC.md § 8.2).
 */
export function fingerprint(value: unknown): string {
  return sha256Utf8(canonicalJson(value));
}

/** Which spec version a fingerprint or digest string belongs to, by its shape; null when it is neither. */
export function fingerprintVersion(value: unknown): 2 | 3 | null {
  if (typeof value !== 'string') return null;
  if (/^[0-9a-f]{64}$/.test(value)) return 3;
  if (/^[0-9a-f]{16}$/.test(value)) return 2;
  return null;
}
