// Gives a student a new password when they forgot theirs.
//
//   node scripts/reset-password.mjs <username>
//
// Prints a new random password ONCE – give it to the student. The old password stops working
// and the student is logged out on all devices.
// Needs DATABASE_URL (or POSTGRES_URL) – in the environment or in .env.local.
import { randomInt } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { migrate, databaseUrl } from '../lib/schema.mjs';
import { hashPassword } from '../lib/password.mjs';

try {
  process.loadEnvFile?.('.env.local');
} catch {}

const username = String(process.argv[2] || '').trim();
if (!username) {
  console.error('Usage: node scripts/reset-password.mjs <username>');
  process.exit(1);
}
const url = databaseUrl();
if (!url) {
  console.error('No database address found. Put DATABASE_URL=… into .env.local (see docs/security-accounts.md).');
  process.exit(1);
}

// easy to read aloud: no 0/O, 1/l/I
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const newPassword = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

const sql = neon(url);
await migrate(sql);
const { hash, salt } = await hashPassword(newPassword);
const rows = await sql.query(
  'UPDATE users SET password_hash = $1, salt = $2 WHERE lower(username) = lower($3) RETURNING username',
  [hash, salt, username],
);
if (!rows.length) {
  console.error(`No account with the username "${username}".`);
  process.exit(1);
}
console.log(`New password for ${rows[0].username}: ${newPassword}`);
console.log('Give it to the student. It is not saved anywhere and will not be shown again.');
