// Local display contract, deliberately separate from v4 slips and cloud frames.
// This first extension imports SYNTHETIC signed artifacts only.
import {canonical,textSha256,keyFingerprint,base64url,unbase64url} from './private-delivery.mjs';
export const MM_APP_SCHEMA='lamultipla-mm-app-experiment-v1';
export const MM_FRAME_SCHEMA='lamultipla-mm-local-signed-frame-v1';
export const MM_APPLICATION_ID='it.personale.lamultipla';
export const MM_LABELS=Object.freeze({MULTIPLA_ESPLORATIVA:'MULTIPLA ESPLORATIVA',NO_BET_ESPLORATIVO:'NO BET ESPLORATIVO',ANALYSIS_INCOMPLETE:'ANALYSIS_INCOMPLETE'});
const DOMAIN='lamultipla-mm-local-synthetic-display-v1\n',fail=m=>{throw Error('Multimercato: '+m);};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const time=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const fields=(o,n)=>{if(!object(o)||Object.keys(o).sort().join()!==[...n].sort().join())fail('campi del contratto non validi');};
const interval=v=>Array.isArray(v)&&v.length===2&&v.every(p=>Number.isFinite(p)&&p>=0&&p<=1)&&v[0]<=v[1];
export function multimarketStatus(report){
 if(report?.state==='ANALYSIS_INCOMPLETE')return 'ANALYSIS_INCOMPLETE';
 const slot=report?.slot?.fixtureIds,boards=report?.boardStates?.filter(b=>b.withinSlot);
 if(!Array.isArray(slot)||!slot.length||boards?.length!==slot.length*2||new Set(boards.map(b=>b.fixtureId+':'+b.family)).size!==boards.length
  ||boards.some(b=>!slot.includes(b.fixtureId)||b.reasons.length||b.structuralCompleteness!=='COMPLETE'||b.comparator.state!=='AVAILABLE')
  ||report.counts?.truncated!==false||report.exclusions?.length!==0)fail('perimetro incompleto, nessun NO BET completo');
 if(report?.state==='INTERNATIONAL_EXPLORATORY_SHORTLIST'&&report.combinations?.length)return 'MULTIPLA_ESPLORATIVA';
 if(report?.state==='COMPLETE_SLOT_NO_COMBINATIONS'&&report.counts?.truncated===false&&report.combinations?.length===0
  &&report.exclusions?.length===0&&report.boardStates?.filter(b=>b.withinSlot).every(b=>b.reasons.length===0&&b.comparator.state==='AVAILABLE'))return 'NO_BET_ESPLORATIVO';
 return fail('stato o completezza non dimostrati');
}
export async function buildMultimarketDisplay(report,manifest,{generatedAtUtc=new Date().toISOString()}={}){
 if(report?.sourceKind!=='SYNTHETIC_TEST_ONLY'||!manifest?.events?.every(e=>/synthetic/i.test(e.home)&&/synthetic/i.test(e.away)))fail('solo artifact sintetici espliciti');
 const {canonicalSha256,...content}=report;
 if(canonicalSha256!==await textSha256(JSON.stringify(content))||report.provenance.manifestSha256!==await textSha256(JSON.stringify(manifest)))fail('hash origine discordante');
 const payload={schema:MM_APP_SCHEMA,id:canonicalSha256,status:multimarketStatus(report),generatedAtUtc,sourceKind:'SYNTHETIC_TEST_ONLY',
  applicationId:MM_APPLICATION_ID,round:{season:manifest.season,matchday:manifest.matchday},slot:structuredClone(report.slot),
  manifest:structuredClone(manifest),fixtures:structuredClone(manifest.events),report:structuredClone(report),actualStakeEUR:0,operationallyApproved:false,scientificallyValidated:false};
 validateMultimarketDisplay(payload);return {schema:'lamultipla-mm-display-envelope-v1',sha256:await textSha256(JSON.stringify(payload)),payload};
}
export function validateMultimarketDisplay(p){
 fields(p,['schema','id','status','generatedAtUtc','sourceKind','applicationId','round','slot','manifest','fixtures','report','actualStakeEUR','operationallyApproved','scientificallyValidated']);
 const r=p.report;
 if(p.schema!==MM_APP_SCHEMA||!hash(p.id)||p.sourceKind!=='SYNTHETIC_TEST_ONLY'||p.applicationId!==MM_APPLICATION_ID||!time(p.generatedAtUtc)
  ||p.actualStakeEUR!==0||p.operationallyApproved!==false||p.scientificallyValidated!==false
  ||r?.schema!=='lamultipla-international-exploration-v1'||r.sourceKind!=='SYNTHETIC_TEST_ONLY'||r.actualStakeEUR!==0
  ||r.operationallyApproved!==false||r.scientificallyValidated!==false||r.authenticDecisionAllowed!==false||r.appDeliveryAllowed!==false
  ||r.provenance?.source?.provider!=='MoviOdds'||r.provenance.source.bookmaker!=='bet365'||r.provenance.source.jurisdiction!=='INTERNATIONAL_UNSPECIFIED_NOT_ITALIAN_ATTESTATION'
  ||p.status!==multimarketStatus(r)||p.id!==r.canonicalSha256)fail('origine, stato o sicurezza non validi');
 if(p.manifest?.schema!=='lamultipla-prospective-schedule-v1'||p.manifest.season!==p.round.season||p.manifest.matchday!==p.round.matchday
  ||JSON.stringify(p.manifest.events)!==JSON.stringify(p.fixtures)||!Array.isArray(p.fixtures)||p.fixtures.length!==10||new Set(p.fixtures.map(e=>e.fixtureId)).size!==10
  ||!p.fixtures.every(e=>/synthetic/i.test(e.home)&&/synthetic/i.test(e.away)&&Number.isFinite(Date.parse(e.kickoffUtc)))
  ||p.round.season!==r.scope.season||p.round.matchday!==r.scope.round||JSON.stringify(p.slot)!==JSON.stringify(r.slot)
  ||r.universe?.expectedFixtures!==10||!Array.isArray(p.slot.fixtureIds)||!p.slot.fixtureIds.length
  ||new Set(p.slot.fixtureIds).size!==p.slot.fixtureIds.length||p.slot.fixtureIds.some(id=>!p.fixtures.some(f=>f.fixtureId===id)))fail('universo o slot discordanti');
 if(!Array.isArray(r.records)||r.records.length>1000||!Array.isArray(r.combinations)||r.combinations.length>20000
  ||new Set(r.records.map(x=>x.id)).size!==r.records.length||new Set(r.combinations.map(x=>x.id)).size!==r.combinations.length)fail('record duplicati o limiti non validi');
 for(const x of r.records){const f=p.fixtures.find(f=>f.fixtureId===x.fixture?.fixtureId);
  if(!f||JSON.stringify(f)!==JSON.stringify(x.fixture)||!['BTTS','TOTAL_GOALS'].includes(x.family)||x.period!=='REGULATION_FULL_TIME'
   ||x.line!==(x.family==='BTTS'?null:2.5)||!(x.family==='BTTS'?['YES','NO']:['OVER','UNDER']).includes(x.outcome)
   ||x.internationalReferencePrice!==null&&(!Number.isFinite(x.internationalReferencePrice)||x.internationalReferencePrice<=1)
   ||x.operationallyApproved!==false||x.actualStakeEUR!==0)fail('mercato o prezzo non valido');
  for(const k of ['dc','bivariate']){const m=x.models?.[k];if(!m||m.probability!==null&&(!Number.isFinite(m.probability)||m.probability<0||m.probability>1)
    ||m.interval95!==null&&!interval(m.interval95))fail('probabilità non valida');}
 }
 for(const c of r.combinations){const legs=c.selectionIds?.map(id=>r.records.find(x=>x.id===id));
  if(!Array.isArray(legs)||legs.length<2||legs.length>4||legs.some(x=>!x||!x.referenceComputable)
   ||new Set(legs.map(x=>x.fixture.fixtureId)).size!==legs.length||new Set(legs.flatMap(x=>[x.fixture.home,x.fixture.away])).size!==legs.length*2
   ||c.jointProbability!==null||c.actualCombinedPrice!==null||c.verifiedCombinedEV!==null||c.combinedPriceState!=='NOT_VERIFIED'
   ||c.productLabel!=='THEORETICAL_PRODUCT_NOT_AN_OFFERED_TICKET_PRICE'||c.admissible!==false||c.actualStakeEUR!==0
   ||!interval(c.frechetBounds)||!interval(c.marginalIntervalSensitivityBounds)||c.simultaneousInterval!==false
   ||Math.abs(c.theoreticalSinglesProduct-legs.reduce((v,x)=>v*x.internationalReferencePrice,1))>1e-8)fail('combinazione non verificabile');
  const probabilities=legs.map(x=>x.models.dc.probability),bounds=[Math.max(0,probabilities.reduce((s,p)=>s+p,0)-legs.length+1),Math.min(...probabilities)];
  if(bounds.some((v,i)=>Math.abs(v-c.frechetBounds[i])>1e-8))fail('limiti Fréchet incoerenti');
 }
 return p;
}
export async function parseMultimarketEnvelope(e){
 fields(e,['schema','sha256','payload']);if(e.schema!=='lamultipla-mm-display-envelope-v1'||!hash(e.sha256)||e.sha256!==await textSha256(JSON.stringify(e.payload)))fail('hash envelope alterato');
 validateMultimarketDisplay(e.payload);const {canonicalSha256,...body}=e.payload.report;
 if(canonicalSha256!==await textSha256(JSON.stringify(body))||e.payload.report.provenance.manifestSha256!==await textSha256(JSON.stringify(e.payload.manifest)))fail('report o manifest alterato');
 return structuredClone(e);
}
export async function validateMultimarketTrust(t){
 fields(t,['schema','applicationId','usage','keyId','spki']);
 if(t.schema!=='lamultipla-mm-local-test-trust-v1'||t.applicationId!==MM_APPLICATION_ID||t.usage!=='SYNTHETIC_ONLY'||!hash(t.keyId)||await keyFingerprint(t.spki)!==t.keyId)fail('chiave di collaudo non valida');
 await crypto.subtle.importKey('spki',unbase64url(t.spki),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);return structuredClone(t);
}
export async function signMultimarketFrame(envelope,trust,privateKey,{signedAtUtc=new Date().toISOString(),expiresAtUtc}={}){
 const t=await validateMultimarketTrust(trust),e=await parseMultimarketEnvelope(envelope);
 const statement={schema:MM_FRAME_SCHEMA,keyId:t.keyId,applicationId:t.applicationId,usage:t.usage,envelopeSha256:e.sha256,signedAtUtc,expiresAtUtc};
 if(!time(signedAtUtc)||!time(expiresAtUtc)||Date.parse(expiresAtUtc)<=Date.parse(signedAtUtc)||Date.parse(expiresAtUtc)-Date.parse(signedAtUtc)>86400000
  ||Date.parse(e.payload.generatedAtUtc)>Date.parse(signedAtUtc)||new TextEncoder().encode(JSON.stringify(e)).length>2*1024*1024)fail('tempi o dimensioni del pacchetto non validi');
 const statementJson=canonical(statement),signature=base64url(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,new TextEncoder().encode(DOMAIN+statementJson)));
 return {schema:MM_FRAME_SCHEMA,statementJson,signature,envelope:e};
}
export async function verifyMultimarketFrame(f,trust,{now=new Date(),archiveExpired=false}={}){
 fields(f,['schema','statementJson','signature','envelope']);const t=await validateMultimarketTrust(trust);
 if(f.schema!==MM_FRAME_SCHEMA||typeof f.statementJson!=='string'||f.statementJson.length>3000||new TextEncoder().encode(JSON.stringify(f)).length>2*1024*1024)fail('frame non valido o troppo grande');
 const s=JSON.parse(f.statementJson);fields(s,['schema','keyId','applicationId','usage','envelopeSha256','signedAtUtc','expiresAtUtc']);
 if(s.schema!==MM_FRAME_SCHEMA||s.applicationId!==t.applicationId||s.keyId!==t.keyId||s.usage!==t.usage||canonical(s)!==f.statementJson
  ||!time(s.signedAtUtc)||!time(s.expiresAtUtc)||Date.parse(s.expiresAtUtc)<=Date.parse(s.signedAtUtc)||Date.parse(s.expiresAtUtc)-Date.parse(s.signedAtUtc)>86400000
  ||Date.parse(s.signedAtUtc)>new Date(now).getTime()||!Number.isFinite(new Date(now).getTime()))fail('destinatario o clock non valido');
 const key=await crypto.subtle.importKey('spki',unbase64url(t.spki),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,unbase64url(f.signature),new TextEncoder().encode(DOMAIN+f.statementJson)))fail('firma non valida');
 const e=await parseMultimarketEnvelope(f.envelope);if(s.envelopeSha256!==e.sha256||Date.parse(e.payload.generatedAtUtc)>Date.parse(s.signedAtUtc))fail('firma/envelope discordanti');
 const expired=new Date(now).getTime()>=Date.parse(s.expiresAtUtc);if(expired&&!archiveExpired)fail('frame scaduto');
 return {frame:structuredClone(f),envelope:e,statement:s,expired,frameSha256:await textSha256(canonical(f))};
}
