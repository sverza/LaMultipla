import { SafeError } from './safe-error.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {privateLock} from './private/process-lock.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PRIVATE_DIR = path.join(ROOT, '.local/oddspapi');

export async function loadJson(filename) {
  try { return JSON.parse(await fs.readFile(filename, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') throw error;
    // JSON parser errors can include fragments of confidential input.
    throw new SafeError('File JSON privato illeggibile o non valido');
  }
}

export async function optionalJson(filename) {
  try { return await loadJson(filename); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function saveJson(filename, value) {
  const serialized = JSON.stringify(value, null, 2) + '\n';
  const secret = process.env.ODDSPAPI_API_KEY;
  if (/"(?:api_key|apiKey|password|authorization)"\s*:/i.test(serialized)
      || (secret && serialized.includes(secret))) throw new SafeError('Scrittura rifiutata: possibile credenziale');
  await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = filename + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temporary, serialized, { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, filename);
  } finally { await fs.rm(temporary, { force: true }); }
}

export async function withLock(directory, operation) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  // Preserve unknown locks left by older versions: their owner cannot be
  // established safely. New runs use the existing PID-owned crash-safe lock.
  try{await fs.stat(path.join(directory,'import.lock'));throw new SafeError('Importazione già in corso o lock residuo: verificare il processo prima di rimuoverlo');}
  catch(e){if(e.code!=='ENOENT')throw e;}
  try{return await privateLock(directory,operation);}catch(e){
    if(e.message==='Produttore privato già in esecuzione')throw new SafeError('Importazione già in corso');throw e;
  }
}
