// Shared by Node and the app. No Node imports, network calls or betting authorization.
import {ROUND_STATE_SCHEMA,validateRoundState} from './round-state.mjs';
const fail=message=>{throw new Error('Pacchetto v4 non valido: '+message);};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fields=(v,keys,label)=>{if(!object(v)||Object.keys(v).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(v,k)))fail(label+' contiene campi mancanti o non ammessi');};
const string=v=>typeof v==='string'&&v.length>0&&v.length<=500;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const at=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
const identifier=v=>typeof v==='number'&&Number.isInteger(v)&&v>0||typeof v==='string'&&/^[1-9]\d*$/.test(v);
const number=v=>typeof v==='number'&&Number.isFinite(v);
const probability=v=>number(v)&&v>=0&&v<=1;
const interval=v=>Array.isArray(v)&&v.length===2&&v.every(probability)&&v[0]<=v[1];
const codes=v=>Array.isArray(v)&&v.every(c=>typeof c==='string'&&/^[A-Za-z0-9_]+$/.test(c));
// Capacitor also uses localhost. Native installations are not local browser previews.
export const isLocalExperimentPreview=(hostname,native)=>native===false&&['localhost','127.0.0.1'].includes(hostname);
export async function jsonSha256(value){
  if(!globalThis.crypto?.subtle)fail('verifica SHA256 indisponibile: usare HTTPS o localhost');
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
}
export function isExperimentalInput(v){return object(v)&&(v.schema===ROUND_STATE_SCHEMA||v.schema==='lamultipla-app-decision-v4'||v.schema==='lamultipla-public-decision-receipt-v1'
  ||v.schema==='lamultipla-prospective-envelope-v1'&&['lamultipla-app-decision-v4','lamultipla-public-decision-receipt-v1',ROUND_STATE_SCHEMA].includes(v.payload?.schema));}
export function validateDecisionV4(p){
  fields(p,['schema','id','round','generatedAtUtc','status','mode','sourceData','delivery','actualStakeEUR','nominalStakeEUR','operational',
    'source','model','selections','combined','shadowCause','reasonCodes','exclusions','counts','phases','final'],'root');
  if(p.schema!=='lamultipla-app-decision-v4'||!string(p.id)||p.mode!=='experimental'||!['simulation','no_bet'].includes(p.status)
    ||p.delivery!=='private_local'||p.actualStakeEUR!==0||![0,3].includes(p.nominalStakeEUR)||typeof p.final!=='boolean'
    ||!['synthetic_test','local_original_artifacts','unspecified'].includes(p.sourceData)||!at(p.generatedAtUtc))fail('stato sperimentale obbligatorio; approvazione e giocata disabilitate');
  if(p.sourceData!=='synthetic_test'&&Date.parse(p.generatedAtUtc)>Date.now())fail('decisione reale con timestamp futuro');
  fields(p.round,['season','matchday'],'giornata');
  if(!/^\d{4}\/\d{2}$/.test(p.round.season)||!Number.isInteger(p.round.matchday)||p.round.matchday<1||p.round.matchday>38)fail('giornata');
  fields(p.operational,['decision','cause','authorized','publicationAllowed'],'operativo');
  if(p.operational.decision!=='NO_BET'||p.operational.cause!=='MODEL_NOT_AUTHORIZED'||p.operational.authorized!==false||p.operational.publicationAllowed!==false)fail('nessuna autorizzazione al gioco/pubblicazione');
  fields(p.source,['decisionSha256','journalSha256','reportSha256','studySha256','assessmentSha256','generalProtocolVersion'],'provenienza');
  if(Object.entries(p.source).some(([k,v])=>k==='generalProtocolVersion'?!string(v):!hash(v)))fail('hash provenienza');
  fields(p.model,['version','status','codeSha256','datasetSha256','protocolSha256','trainingCutoffUtc','forecastGeneratedAtUtc'],'modello');
  if(!string(p.model.version)||p.model.status!=='experimental_not_operational'||!hash(p.model.codeSha256)||!hash(p.model.datasetSha256)||!hash(p.model.protocolSha256)
    ||!at(p.model.trainingCutoffUtc)||!at(p.model.forecastGeneratedAtUtc)||Date.parse(p.model.trainingCutoffUtc)>Date.parse(p.model.forecastGeneratedAtUtc)
    ||Date.parse(p.model.forecastGeneratedAtUtc)>Date.parse(p.generatedAtUtc)||Date.parse(p.generatedAtUtc)-Date.parse(p.model.forecastGeneratedAtUtc)>24*3600000)fail('modello/cutoff');
  if(!codes(p.reasonCodes)||p.shadowCause!==null&&!codes([p.shadowCause]))fail('motivazioni');
  for(const key of ['counts','exclusions'])if(!object(p[key])||Object.entries(p[key]).some(([k,v])=>!/^[A-Za-z0-9_]+$/.test(k)||!Number.isInteger(v)||v<0))fail('conteggi');
  if(!Array.isArray(p.phases)||p.phases.length!==12||p.phases.some((x,i)=>!object(x)||Object.keys(x).some(k=>!['step','state'].includes(k))||x.step!==i+1||!string(x.state)))fail('audit fasi');
  if(!Array.isArray(p.selections)||p.status==='no_bet'&&(p.selections.length||p.combined!==null||p.nominalStakeEUR!==0||!p.shadowCause)
    ||p.status==='simulation'&&(p.selections.length<2||p.selections.length>6||p.nominalStakeEUR!==3||p.shadowCause!==null))fail('selezioni/stake/esito');
  const ids=new Set(),fixtures=new Set(),teams=new Set();
  for(const s of p.selections){
    fields(s,['quoteId','identity','price','observedAtUtc','changedAtUtc','provider','verification','settlement','forecast','value','reasonCodes'],'selezione');
    if(!hash(s.quoteId)||ids.has(s.quoteId)||!number(s.price)||s.price<=1||!at(s.observedAtUtc)||s.changedAtUtc!==null&&!at(s.changedAtUtc))fail('quota/identità');ids.add(s.quoteId);
    const i=s.identity;
    fields(i,['fixtureId','fixture','participantIds','kickoffUtc','tournamentId','seasonId','bookmakerFixtureId','marketId','marketName','marketType','period','line','playerKey','playerName','outcomeId','outcome'],'identità');
    if(!string(i.fixtureId)||fixtures.has(i.fixtureId)||!Array.isArray(i.fixture)||i.fixture.length!==2||i.fixture.some(t=>!string(t)||teams.has(t))
      ||i.fixture[0]===i.fixture[1]||!Array.isArray(i.participantIds)||i.participantIds.length!==2||i.participantIds.some(id=>!Number.isInteger(id)||id<=0)
      ||!at(i.kickoffUtc)||i.tournamentId!==23||!Number.isInteger(i.seasonId)||!string(String(i.bookmakerFixtureId??''))
      ||!identifier(i.marketId)||!identifier(i.outcomeId)||i.marketType!=='1x2'||i.marketName!=='Full Time Result'
      ||i.period!=='fulltime'||i.line!==0||i.playerKey!=='0'||i.playerName!==null||!['1','X','2'].includes(i.outcome))fail('identità completa 1X2 richiesta');
    fixtures.add(i.fixtureId);i.fixture.forEach(t=>teams.add(t));
    fields(s.provider,['active','marketActive','bookmakerIsActive','suspended'],'provider');
    if(typeof s.provider.active!=='boolean'||s.provider.marketActive!==true||s.provider.bookmakerIsActive!==true||s.provider.suspended!==false)fail('flag provider');
    fields(s.verification,['state','domain','origin','verifiedAtUtc','verificationSha256','observedPrice'],'verifica');const v=s.verification;
    if(v.domain!=='bet365.it'||v.origin!=='manual_bet365_it'||!at(v.verifiedAtUtc)||!hash(v.verificationSha256)||v.observedPrice!==s.price
      ||v.state!==(s.provider.active?'manually_available':'manually_available_provider_inactive'))fail('disponibilità');
    fields(s.settlement,['verificationSha256','reviewedAtUtc','rulesUrl'],'liquidazione');
    if(!hash(s.settlement.verificationSha256)||!at(s.settlement.reviewedAtUtc)||!string(s.settlement.rulesUrl)||Date.parse(s.settlement.reviewedAtUtc)>Date.parse(p.generatedAtUtc)||Date.parse(p.generatedAtUtc)-Date.parse(s.settlement.reviewedAtUtc)>7*86400000)fail('liquidazione');
    fields(s.forecast,['entrySha256','probabilities1X2','intervals95','probability','interval95'],'forecast');const f=s.forecast;
    if(!hash(f.entrySha256)||!Array.isArray(f.probabilities1X2)||f.probabilities1X2.length!==3||!f.probabilities1X2.every(probability)
      ||Math.abs(f.probabilities1X2.reduce((a,b)=>a+b,0)-1)>1e-9||!Array.isArray(f.intervals95)||f.intervals95.length!==3||!f.intervals95.every(interval)
      ||f.probabilities1X2.some((v,k)=>v<f.intervals95[k][0]||v>f.intervals95[k][1])
      ||f.probability!==f.probabilities1X2[['1','X','2'].indexOf(i.outcome)]||JSON.stringify(f.interval95)!==JSON.stringify(f.intervals95[['1','X','2'].indexOf(i.outcome)]))fail('probabilità/CI');
    fields(s.value,['pointEV','lowerEV','upperEV'],'EV');
    if(s.value.pointEV<.05||s.value.lowerEV<.02||f.interval95[1]-f.interval95[0]>.25||!Object.values(s.value).every(number)||Math.abs(s.value.pointEV-(s.price*f.probability-1))>1e-9
      ||Math.abs(s.value.lowerEV-(s.price*f.interval95[0]-1))>1e-9||Math.abs(s.value.upperEV-(s.price*f.interval95[1]-1))>1e-9||!codes(s.reasonCodes))fail('EV');
    const generated=Date.parse(p.generatedAtUtc),observed=Date.parse(s.observedAtUtc),verified=Date.parse(v.verifiedAtUtc);
    if(observed<Date.parse(p.model.forecastGeneratedAtUtc)||observed>generated||generated-observed>30*60000||verified<observed||verified>generated
      ||generated-verified>30*60000||generated>=Date.parse(i.kickoffUtc)-5*60000)fail('timestamp/pre-match');
  }
  if(p.status==='simulation'){
    const c=p.combined;fields(c,['observedPrice','verifiedAtUtc','verificationSha256','diagnosticOddsProduct','jointProbability','jointConfidenceInterval',
      'jointProbabilityBounds','jointSensitivityEnvelope','expectedNetPerUnitBounds','dependenceMethod','statisticallyValidated'],'combinazione');
    if(!number(c.observedPrice)||c.observedPrice<=1||!at(c.verifiedAtUtc)||!hash(c.verificationSha256)||!number(c.diagnosticOddsProduct)
      ||Math.abs(c.diagnosticOddsProduct-p.selections.reduce((v,s)=>v*s.price,1))>1e-9||c.jointProbability!==null||c.jointConfidenceInterval!==null
      ||c.dependenceMethod!=='frechet_arbitrary_dependence'||c.statisticallyValidated!==false||!interval(c.jointProbabilityBounds)||!interval(c.jointSensitivityEnvelope)
      ||c.expectedNetPerUnitBounds?.[0]<.05||!Array.isArray(c.expectedNetPerUnitBounds)||c.expectedNetPerUnitBounds.length!==2||!c.expectedNetPerUnitBounds.every(number))fail('prezzo osservato/bounds');
    if(p.selections.some(s=>Date.parse(c.verifiedAtUtc)<Date.parse(s.verification.verifiedAtUtc))||Date.parse(c.verifiedAtUtc)>Date.parse(p.generatedAtUtc)
      ||Date.parse(p.generatedAtUtc)-Date.parse(c.verifiedAtUtc)>30*60000)fail('timestamp prezzo combinato');
    const bounds=a=>[Math.max(0,a.reduce((x,y)=>x+y,0)-a.length+1),Math.min(...a)];
    const point=bounds(p.selections.map(s=>s.forecast.probability));
    const sensitive=[bounds(p.selections.map(s=>s.forecast.interval95[0]))[0],bounds(p.selections.map(s=>s.forecast.interval95[1]))[1]];
    if(point.some((v,i)=>Math.abs(v-c.jointProbabilityBounds[i])>1e-9)||sensitive.some((v,i)=>Math.abs(v-c.jointSensitivityEnvelope[i])>1e-9)
      ||sensitive.some((v,i)=>Math.abs(c.observedPrice*v-1-c.expectedNetPerUnitBounds[i])>1e-9))fail('bounds di dipendenza/EV incoerenti');
  }
  return p;
}
export async function parseDecisionEnvelope(input){
  fields(input,['schema','sha256','payload'],'envelope');
  if(input.schema!=='lamultipla-prospective-envelope-v1'||!hash(input.sha256)||input.sha256!==await jsonSha256(input.payload))fail('hash snapshot');
  if(input.payload?.schema===ROUND_STATE_SCHEMA)validateRoundState(input.payload);else validateDecisionV4(input.payload);
  return structuredClone(input);
}
export function assertNotPlayable(){fail('simulazioni e NO BET non possono diventare giocate; autorizzazione operativa assente');}
export const stateLabels=Object.freeze({simulation:'MULTIPLA SIMULATA',no_bet:'NO BET',draft:'Bozza',approved:'Approvata',played:'Giocata effettiva'});
const reasons={MODEL_NOT_AUTHORIZED:'Modello sperimentale: uso operativo non autorizzato.',INSUFFICIENT_DATA:'Dati insufficienti o quote non verificabili.',
  NO_VALUE:'Nessun valore positivo nelle selezioni con dati utilizzabili.',UNCERTAIN_VALUE:'Valore puntuale positivo, ma non abbastanza robusto all’incertezza.',
  CONTEXT_REVIEW_REQUIRED:'Informazioni contestuali da verificare.',SELECTION_REVIEW_REQUIRED:'Liquidazione o revisione umana ancora necessarie.',
  COMBINATION_EVIDENCE_INSUFFICIENT:'Prezzo e disponibilità della combinazione non verificati.',JOINT_VALUE_NOT_DEMONSTRATED:'Valore congiunto non dimostrato dai limiti di dipendenza.',
  NOT_ENOUGH_DISTINCT_OPPORTUNITIES:'Meno di due opportunità distinte ammesse.',DEPENDENT_OR_REPEATED_EVENTS:'Eventi ripetuti o dipendenti esclusi.',SEARCH_BUDGET_EXCEEDED:'Ricerca combinazioni incompleta: nessuna proposta selezionata.',
  settlement_rules_not_verified:'Regole di liquidazione non verificate.',context_review_required:'Revisione contestuale necessaria.',human_exclusion:'Esclusione umana motivata.',human_review_required:'Revisione umana richiesta.'};
export const reasonLabel=code=>reasons[code]??String(code).replaceAll('_',' ');
export function validatePublicReceipt(p){
  fields(p,['schema','available','id','season','matchday','generatedAtUtc','decision','cause','shadowDecision','shadowCause','modelVersion','policyVersion',
    'decisionSha256','status','actualStakeEUR','publicationAuthorized','sourceData'],'ricevuta');
  if(p.schema!=='lamultipla-public-decision-receipt-v1'||p.available!==false||!string(p.id)||!/^\d{4}\/\d{2}$/.test(p.season)
    ||!Number.isInteger(p.matchday)||p.matchday<1||p.matchday>38||!at(p.generatedAtUtc)||p.decision!=='NO_BET'||p.cause!=='MODEL_NOT_AUTHORIZED'
    ||!['NO_BET','MULTIPLA_SIMULATA'].includes(p.shadowDecision)||p.shadowCause!==null&&!codes([p.shadowCause])||!string(p.modelVersion)
    ||!string(p.policyVersion)||!hash(p.decisionSha256)||p.status!=='experimental_not_authorized'||p.actualStakeEUR!==0||p.publicationAuthorized!==false
    ||!['synthetic_test','local_original_artifacts','unspecified'].includes(p.sourceData))fail('ricevuta NO BET redatta');
  return p;
}
export async function parseExperimentalEnvelope(input){
  if(input?.schema==='lamultipla-prospective-envelope-v1'&&['lamultipla-app-decision-v4',ROUND_STATE_SCHEMA].includes(input.payload?.schema))return parseDecisionEnvelope(input);
  if(input?.schema==='lamultipla-prospective-envelope-v1'){
    fields(input,['schema','sha256','payload'],'envelope ricevuta');
    if(!hash(input.sha256)||input.sha256!==await jsonSha256(input.payload))fail('hash ricevuta');
    validatePublicReceipt(input.payload);return structuredClone(input);
  }
  validatePublicReceipt(input);return {schema:'lamultipla-prospective-envelope-v1',sha256:await jsonSha256(input),payload:structuredClone(input)};
}
