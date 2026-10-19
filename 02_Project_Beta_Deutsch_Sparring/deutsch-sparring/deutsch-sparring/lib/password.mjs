// Passwords are never stored. We store a scrypt "fingerprint" (hash) + a random salt.
// scrypt is built into Node (no extra package). It is slow and memory-hungry on purpose,
// so guessing passwords from a stolen database would take a very long time.
// .mjs so the scripts in scripts/ can use the same code as the app.
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

// cost settings, written into every hash ("scrypt$16$8$1$<hex>") so they can be raised later
const LOG_N = 16; // N = 65536 → 64 MB memory per check, ~0.1–0.2 s
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 256 * 1024 * 1024;

function derive(password, saltHex, logN, r, p) {
  return new Promise((resolve, reject) => {
    scrypt(
      String(password).normalize('NFC'),
      Buffer.from(saltHex, 'hex'),
      KEYLEN,
      { N: 2 ** logN, r, p, maxmem: MAXMEM },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, LOG_N, R, P);
  return { hash: `scrypt$${LOG_N}$${R}$${P}$${key.toString('hex')}`, salt };
}

const DUMMY_SALT = '00'.repeat(16);

// true/false. A missing user (hash = null) costs the same work, so the answer time gives
// nothing away.
export async function verifyPassword(password, hash, salt) {
  const m = /^scrypt\$(\d{1,2})\$(\d{1,2})\$(\d{1,2})\$([0-9a-f]{128})$/.exec(String(hash || ''));
  const valid = m && Number(m[1]) >= 14 && Number(m[1]) <= 17 && Number(m[2]) >= 1 && Number(m[2]) <= 16
    && Number(m[3]) >= 1 && Number(m[3]) <= 4 && /^[0-9a-f]{32}$/.test(String(salt || ''));
  if (!valid) {
    await derive(password, DUMMY_SALT, LOG_N, R, P);
    return false;
  }
  const expected = Buffer.from(m[4], 'hex');
  const actual = await derive(password, salt, Number(m[1]), Number(m[2]), Number(m[3]));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
