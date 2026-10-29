import {parseExperimentalEnvelope,isExperimentalInput} from './decision-v4.mjs';
// A separate database leaves all legacy slips, migrations and financial statistics untouched.
export const EXPERIMENT_DATABASE='lamultipla-experiments';
const STORE='snapshots';
export const EXPERIMENT_DATABASE_VERSION=2;
export function upgradeExperimentDatabase(db){
  for(const name of [STORE,'private-deliveries','private-cursors','private-finals'])
    if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'});
}
async function open(){return new Promise((resolve,reject)=>{
  const req=indexedDB.open(EXPERIMENT_DATABASE,EXPERIMENT_DATABASE_VERSION);req.onupgradeneeded=()=>upgradeExperimentDatabase(req.result);
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});}
async function entries(){const db=await open();try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE),req=tx.objectStore(STORE).getAll();let records=[];
  req.onsuccess=()=>{records=req.result;};tx.oncomplete=()=>resolve(records);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
});}finally{db.close();}}
export async function readExperiments(){return Promise.all((await entries()).map(r=>parseExperimentalEnvelope(r.envelope)));}
export async function mergeExperiments(inputs){
  // Parse every item before beginning writes: bad backup/item cannot cause a partial import.
  const parsed=await Promise.all(inputs.map(parseExperimentalEnvelope));const records=[...new Map(parsed.map(r=>[r.sha256,r])).values()];const db=await open();
  try{await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
    for(const envelope of records){const req=store.get(envelope.sha256);req.onsuccess=()=>{if(!req.result)store.add({id:envelope.sha256,envelope});};}
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}return records;
}
export async function addExperiment(input){return (await mergeExperiments([input]))[0];}
export async function parseBackup(input){
  if(!input||input.app!=='seriea-multipla'||!Array.isArray(input.slips)||input.slips.some(s=>!s||typeof s!=='object'||isExperimentalInput(s)||s.mode==='experimental'))throw new Error('Backup non riconosciuto o analisi inserite nello storico.');
  if(input.experiments!==undefined&&(input.version!==4||!Array.isArray(input.experiments)))throw new Error('Sezione sperimentale del backup non valida.');
  const experiments=await Promise.all((input.experiments??[]).map(parseExperimentalEnvelope));
  return {slips:structuredClone(input.slips),preferences:structuredClone(input.preferences??{}),experiments};
}
export async function makeBackup({slips,preferences,experiments,exportedAt}){
  const value={app:'seriea-multipla',version:4,exportedAt,preferences:structuredClone(preferences),slips:structuredClone(slips),experiments:structuredClone(experiments)};
  await parseBackup(value);return value;
}
