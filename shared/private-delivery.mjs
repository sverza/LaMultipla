import {parseDecisionEnvelope} from './decision-v4.mjs';

export const FRAME_SCHEMA = 'lamultipla-private-delivery-v1';
export const MAX_FRAME_BYTES = 256 * 1024;
const DOMAIN = 'lamultipla-private-delivery-v1\n';
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const fail = message => {throw new Error(`Consegna privata: ${message}`);};
const keys = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...names].sort().join(',');
const statementKeys = ['schema','channel','keyId','readerUid','applicationId','sequence','previousDeliveryHash',
  'season','matchday','kind','status','envelopeSha256','packageSha256','deliveryId','generatedAtUtc','expiresAtUtc'];
const bytes = value => new TextEncoder().encode(value);
const time = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && new Date(value).toISOString() === value;

// Local protocol serializer: sorted UTF-16 keys, JSON string escaping, finite
// JSON numbers only. Not an implicit claim to implement RFC 8785/JCS.
export function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return fail('valore non JSON nel documento firmato');
}
export function base64url(value) {
  let binary = ''; for (const b of new Uint8Array(value)) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/, '');
}
export function unbase64url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 4096) return fail('codifica non valida');
  const binary = atob(value.replaceAll('-','+').replaceAll('_','/'));
  const result = Uint8Array.from(binary, c => c.charCodeAt(0));
  if (base64url(result) !== value) return fail('codifica non canonica');
  return result;
}
export async function textSha256(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? bytes(value) : value))]
    .map(b => b.toString(16).padStart(2,'0')).join('');
}
export async function keyFingerprint(spki) { return textSha256(unbase64url(spki)); }
export async function deliveryId(s) {
  return textSha256(canonical({channel:s.channel,readerUid:s.readerUid,applicationId:s.applicationId,
    season:s.season,matchday:s.matchday,kind:s.kind,envelopeSha256:s.envelopeSha256}));
}
export function validateStatement(s) {
  if (!keys(s,statementKeys) || s.schema !== 'lamultipla-private-statement-v1'
    || !['synthetic_shadow','shadow'].includes(s.channel) || !uid(s.readerUid)
    || !['it.personale.lamultipla','it.personale.lamultipla.collaudo'].includes(s.applicationId)
    || !hex(s.keyId) || !hex(s.envelopeSha256) || !hex(s.packageSha256) || !hex(s.deliveryId)
    || !Number.isSafeInteger(s.sequence) || s.sequence < 1 || s.sequence > 1000000
    || (s.sequence === 1 ? s.previousDeliveryHash !== null : !hex(s.previousDeliveryHash))
    || !/^\d{4}\/\d{2}$/.test(s.season) || !Number.isInteger(s.matchday) || s.matchday < 1 || s.matchday > 38
    || !['preview','final'].includes(s.kind) || !['simulation','no_bet'].includes(s.status)
    || !time(s.generatedAtUtc) || !time(s.expiresAtUtc)
    || Date.parse(s.expiresAtUtc) <= Date.parse(s.generatedAtUtc)
    || Date.parse(s.expiresAtUtc) - Date.parse(s.generatedAtUtc) > 24*3600000) return fail('manifest non valido');
  if (s.channel === 'shadow' && s.season === '2026/27' && s.matchday <= 6) return fail('pilot originale protetto');
  return s;
}
export async function signDelivery(envelope, options, privateKey) {
  const verified = await parseDecisionEnvelope(envelope), p = verified.payload;
  const packageJson = JSON.stringify(verified);
  const s = {...options,schema:'lamultipla-private-statement-v1',season:p.round.season,matchday:p.round.matchday,
    kind:p.final?'final':'preview',status:p.status,envelopeSha256:verified.sha256,
    generatedAtUtc:p.generatedAtUtc,packageSha256:await textSha256(packageJson)};
  s.deliveryId = await deliveryId(s); validateStatement(s);
  if (s.channel === 'synthetic_shadow' ? p.sourceData !== 'synthetic_test' : p.sourceData === 'synthetic_test') return fail('canale/dati incompatibili');
  const statement = canonical(s);
  const signature = base64url(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,bytes(DOMAIN+statement)));
  const frame = {schema:FRAME_SCHEMA,statement,signature,packageJson};
  if (bytes(JSON.stringify(frame)).length > MAX_FRAME_BYTES) return fail('pacchetto troppo grande');
  return frame;
}
export async function verifyDelivery(frame, trust, {now=new Date(), archiveExpired=false}={}) {
  if (!keys(frame,['schema','statement','signature','packageJson']) || frame.schema !== FRAME_SCHEMA
    || typeof frame.statement !== 'string' || frame.statement.length > 4096 || typeof frame.packageJson !== 'string'
    || bytes(JSON.stringify(frame)).length > MAX_FRAME_BYTES) return fail('involucro non valido');
  const s = validateStatement(JSON.parse(frame.statement));
  if (frame.statement !== canonical(s) || await deliveryId(s) !== s.deliveryId) return fail('manifest non canonico');
  if (s.readerUid !== trust.readerUid || s.applicationId !== trust.applicationId || s.channel !== trust.channel) return fail('destinatario/canale errato');
  const spki = trust.keys?.[s.keyId];
  if (!spki || await keyFingerprint(spki) !== s.keyId) return fail('chiave non attendibile');
  const signature = unbase64url(frame.signature); if (signature.length !== 64) return fail('firma non valida');
  const key = await crypto.subtle.importKey('spki',unbase64url(spki),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  if (!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,signature,bytes(DOMAIN+frame.statement))) return fail('firma non valida');
  if (await textSha256(frame.packageJson) !== s.packageSha256) return fail('contenuto alterato');
  const envelope = await parseDecisionEnvelope(JSON.parse(frame.packageJson)), p = envelope.payload;
  if (envelope.sha256 !== s.envelopeSha256 || p.round.season !== s.season || p.round.matchday !== s.matchday
    || p.generatedAtUtc !== s.generatedAtUtc || p.status !== s.status || (p.final?'final':'preview') !== s.kind
    || (s.channel === 'synthetic_shadow' ? p.sourceData !== 'synthetic_test' : p.sourceData === 'synthetic_test')) return fail('pacchetto/manifest incoerenti');
  const clock = new Date(now).getTime(); if (!Number.isFinite(clock) || Date.parse(s.generatedAtUtc) > clock) return fail('orologio/generazione futura');
  const expired = clock >= Date.parse(s.expiresAtUtc);
  if (expired && !archiveExpired) return fail('consegna scaduta');
  return {frame:structuredClone(frame),statement:s,envelope,expired,deliveryHash:await textSha256(frame.statement)};
}
