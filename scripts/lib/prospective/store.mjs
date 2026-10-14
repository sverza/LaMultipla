import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sha256 } from '../goals/data.mjs';

export const digest = value => sha256(JSON.stringify(value));
export function envelope(payload) {
  return { schema: 'lamultipla-prospective-envelope-v1', sha256: digest(payload), payload };
}
export function verifyEnvelope(value) {
  if (value?.schema !== 'lamultipla-prospective-envelope-v1' || value.sha256 !== digest(value.payload)) {
    throw new Error('Snapshot hash mismatch');
  }
  return value.payload;
}
export async function readSnapshot(filename) {
  return verifyEnvelope(JSON.parse(await fs.readFile(filename, 'utf8')));
}
export async function writeExclusive(filename, payload) {
  const value = envelope(payload), serialized = JSON.stringify(value, null, 2) + '\n';
  if (/"(?:api_key|apiKey|password|authorization)"\s*:/i.test(serialized)
      || (process.env.ODDSPAPI_API_KEY && serialized.includes(process.env.ODDSPAPI_API_KEY))) throw new Error('Credential field refused');
  await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = filename + '.' + randomUUID() + '.tmp';
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    await handle.writeFile(serialized); await handle.sync(); await handle.close(); handle = null;
    // Atomic publication with no overwrite, including competing processes (NTFS supports hard links).
    await fs.link(temporary, filename);
  } finally {
    if (handle) await handle.close();
    await fs.rm(temporary, { force: true });
  }
  return value.sha256;
}
