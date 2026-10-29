'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {MM_LABELS,type VerifiedMultimarket} from '../shared/multimarket-experiment.mjs';
import {readMultimarketExperiments,readMultimarketTrust,importMultimarketTrust,importMultimarketFrame,exportMultimarketBackup,restoreMultimarketBackup} from '../shared/multimarket-store.mjs';
import {exportBackupFile} from './lib/native';
const pct=(v:number|null)=>v===null?'non disponibile':(v*100).toFixed(2).replace('.',',')+'%';
const utc=(v:string)=>new Date(v).toLocaleString('it-IT',{timeZone:'Europe/Rome',dateStyle:'short',timeStyle:'medium'});
export function MultimarketCard({value}:{value:VerifiedMultimarket}){
 const [all,setAll]=useState(false),p=value.envelope.payload,r=p.report;
 const selected=r.records.filter(x=>p.slot.fixtureIds.includes(x.fixture.fixtureId));
 return <article className="experiment-card" data-testid="multimarket-card">
  <div className="eye">MULTIMERCATO · DATI SINTETICI FIRMATI · COLLAUDO</div>
  <h2>{MM_LABELS[p.status]} · giornata {p.round.matchday}</h2>
  {p.status==='NO_BET_ESPLORATIVO'&&<p>Nessuna combinazione costruibile nel perimetro completo dichiarato. Non è un giudizio sulle partite fuori slot o sul valore di gioco.</p>}
  <p>Stake reale: <strong>0 €</strong>. Uso operativo non autorizzato. Nessuna giocata registrata.</p>
  <p>{p.round.season} · slot {p.slot.id} · {p.slot.fixtureIds.length} di {r.universe.expectedFixtures} partite.
   {!r.wholeRoundEvaluated&&' La giornata completa non è stata valutata.'}</p>
  <p>Firma locale verificata · creazione pacchetto {utc(p.generatedAtUtc)}.{value.expired?' Pacchetto scaduto: soltanto archivio.':''}</p>
  <p>Clock artificiale del collaudo: {utc(r.evaluatedAtUtc)}. I prezzi seguenti sono sintetici, non offerte attuali.</p>
  <p>Prezzo effettivo del ticket: <strong data-testid="mm-ticket-status">NON VERIFICATO</strong>. Fonte di riferimento: bet365 internazionale, nessuna attestazione bet365 Italia.</p>
  <p>{r.counts.referenceSelections} selezioni diagnostiche · {r.counts.combinations} combinazioni · ricerca {r.counts.truncated?'troncata':'non troncata'}.</p>
  {selected.map(s=><section className="experiment-selection" key={s.id}>
   <h3>{s.fixture.home} – {s.fixture.away}</h3>
   <p>{s.family==='BTTS'?'Goal / No Goal':'Over / Under 2,5'} · {s.outcome} · tempo regolamentare.</p>
   <p>Quota internazionale di collaudo: {s.internationalReferencePrice?.toFixed(2)??'assente'} · osservazione di test {utc(s.observedAtUtc)}.</p>
   <p>DC-v2: {pct(s.models.dc.probability)} · intervallo marginale: {s.models.dc.interval95?.map(pct).join(' – ')??'assente'}.</p>
   <p>Bivariato-v2: {pct(s.models.bivariate.probability)} · EV marginale DC descrittivo: {pct(s.models.dc.marginalEV)}.</p>
   {s.exclusions.length>0&&<p>Esclusioni: {s.exclusions.join(' · ')}</p>}
  </section>)}
  {(all?r.combinations:r.combinations.slice(0,10)).map(c=><section className="experiment-selection" key={c.id}>
   <h3>Combinazione esplorativa · {c.fixtureIds.length} partite distinte</h3>
   <ul>{c.selectionIds.map(id=>{const s=r.records.find(x=>x.id===id)!;return <li key={id}>{s.fixture.home} – {s.fixture.away}: {s.family==='BTTS'?'BTTS':'O/U 2,5'} {s.outcome}</li>;})}</ul>
   <p>Prodotto teorico delle singole: <strong data-testid="mm-theoretical-product">{c.theoreticalSinglesProduct.toFixed(2)}</strong>. Non è un prezzo offerto.</p>
   <p>Probabilità congiunta puntuale: non stimata. Limiti Fréchet: {c.frechetBounds.map(pct).join(' – ')}.</p>
   <p>EV combinato verificato: non disponibile. Combinazione non ammissibile all’uso operativo.</p>
  </section>)}
  {r.combinations.length>10&&<button className="secondary wide" onClick={()=>setAll(v=>!v)}>{all?'Mostra le prime 10':'Mostra tutte le '+r.combinations.length+' combinazioni'}</button>}
  <details><summary>Copertura, esclusioni e provenienza</summary>
   <p>Fixture mancanti: {r.universe.missingFixtureIds.join(', ')||'nessuna'}.</p>
   <ul>{[...new Set([...r.exclusions,...r.boardStates.filter(b=>b.withinSlot).flatMap(b=>b.reasons)])].map(code=><li key={code}>{code}</li>)}</ul>
   <p>Intervalli marginali non simultanei; nessuna validazione di profitto. Ticket italiano e contesto non attestati.</p>
   <pre>{JSON.stringify({envelope:value.envelope.sha256,firma:value.statement.keyId,model:r.provenance.modelVersion,
    journal:r.provenance.journalSha256,studio:r.provenance.studySha256,quote:r.provenance.boardsSha256},null,2)}</pre>
  </details>
 </article>;
}
export function MultimarketExperiments(){
 const [items,setItems]=useState<VerifiedMultimarket[]>([]),[message,setMessage]=useState(''),[keys,setKeys]=useState(0),trustInput=useRef<HTMLInputElement>(null),frameInput=useRef<HTMLInputElement>(null),backupInput=useRef<HTMLInputElement>(null);
 const load=useCallback(async()=>{setKeys((await readMultimarketTrust()).length);setItems(await readMultimarketExperiments());},[]);
 useEffect(()=>{let active=true;void Promise.all([readMultimarketTrust(),readMultimarketExperiments()]).then(([trust,values])=>{
  if(active){setKeys(trust.length);setItems(values);}
 }).catch(()=>{if(active)setMessage('Archivio multimercato non verificabile. Nessuna modifica allo storico.');});return ()=>{active=false;};},[]);
 const read=async(file:File,trust:boolean)=>{try{if(file.size>2*1024*1024)throw Error('File oltre il limite di 2 MB');const input=JSON.parse(await file.text());
  if(trust){await importMultimarketTrust(input);setMessage('Chiave pubblica abilitata soltanto al collaudo sintetico. Nessun pairing cloud modificato.');}
  else{const r=await importMultimarketFrame(input);setMessage(r.reused?'Pacchetto già presente; nessun duplicato.':'Firma verificata e archivio locale aggiornato. Stake reale zero.');}await load();
 }catch(e){setMessage(e instanceof Error?e.message:'Importazione non riuscita');}};
 const backup=async()=>{try{const data=await exportMultimarketBackup();await exportBackupFile(JSON.stringify(data,null,2),'lamultipla-multimarket-synthetic-backup.json');
 }catch{setMessage('Esportazione multimercato non riuscita; archivio conservato.');}};
 const restore=async(file:File)=>{try{if(file.size>8*1024*1024)throw Error('Backup troppo grande');await restoreMultimarketBackup(JSON.parse(await file.text()));await load();setMessage('Archivio multimercato ripristinato senza sostituzioni. Storico giocate invariato.');}
 catch{setMessage('Backup non verificabile; archivio conservato.');}};
 return <section data-testid="multimarket-section"><div className="settings-card experiment-import"><h2>Multimercato · collaudo locale firmato</h2>
  <p>Estensione separata dai pacchetti v4 e dalle schedine. Accetta soltanto dati sintetici firmati; importazione autentica e consegna cloud non attivate.</p>
  <p>Chiavi pubbliche di collaudo: {keys}. Il file della chiave non contiene password.</p>
  <button className="secondary wide" onClick={()=>trustInput.current?.click()}>Carica chiave pubblica di collaudo</button>
  <input ref={trustInput} hidden type="file" accept=".json" data-testid="mm-key-file" onChange={e=>{const f=e.target.files?.[0];if(f)void read(f,true);e.target.value='';}} />
  <button className="primary wide" onClick={()=>frameInput.current?.click()}>Importa multimercato firmato</button>
  <input ref={frameInput} hidden type="file" accept=".json" data-testid="mm-frame-file" onChange={e=>{const f=e.target.files?.[0];if(f)void read(f,false);e.target.value='';}} />
  <button className="secondary wide" onClick={()=>void backup()}>Esporta archivio multimercato</button>
  <button className="secondary wide" onClick={()=>backupInput.current?.click()}>Ripristina archivio multimercato</button>
  <input ref={backupInput} hidden type="file" accept=".json" data-testid="mm-backup-file" onChange={e=>{const f=e.target.files?.[0];if(f)void restore(f);e.target.value='';}} />
  {message&&<p role="status" data-testid="mm-message">{message}</p>}
 </div>{items.map(item=><MultimarketCard key={item.envelope.sha256} value={item} />)}</section>;
}
