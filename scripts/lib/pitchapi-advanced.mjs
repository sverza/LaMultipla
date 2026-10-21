// Diagnostic contract only. No forecasting, training, or selector dependency.
export const PITCH_ADVANCED_VERSION='pitchapi-team-advanced-review-v1';
const groups=[];
function group(name,rows,{origin='EVENT_DERIVED',scope='TEAM_AND_PLAYER',markets=['goals','shots']}={}){
 for(const [key,type,unit,definition,extra={}] of rows)groups.push({path:name?name+'.'+key:key,type,unit,definition,origin,scope,markets,
  endpoint:'GET /v1/matches/{id}/advanced',documented:true,observed:false,requiredForComplete:true,
  missingPolicy:'PRESERVE_NULL_AND_OMISSION_NEVER_IMPUTE_ZERO',prematchPolicy:'PRIOR_MATCH_ONLY_OBSERVED_BEFORE_FORECAST_CUTOFF',...extra});
}
group('',[['actions','integer','actions','Azioni nel flusso convertito, inclusi carry sintetici; non tocchi grezzi.']]);
group('possession_value',[
 ['xt_total','number','probability_delta_sum','Somma del valore spaziale delle progressioni riuscite; griglia 16×12.'],
 ['vaep_total','number','probability_delta_sum','Valore azioni con orizzonte delle successive 10 azioni; convenzione segno da chiarire.'],
 ['vaep_offensive','number','probability_delta_sum','Variazione della probabilità di segnare entro 10 azioni.'],
 ['vaep_defensive','number','probability_delta_sum','Componente rischio entro 10 azioni; non reinterpretare il segno.'],
 ['pv_total','number','probability_delta_sum','Valore con orizzonte 10 secondi e stato delle ultime tre azioni; baseline non esposta.'],
 ['pv_offensive','number','probability_delta_sum','Componente offensiva su 10 secondi.'],
 ['pv_defensive','number','probability_delta_sum','Componente difensiva su 10 secondi; segno/baseline da chiarire.']
],{origin:'PROVIDER_MODEL',markets:['goals','shots','corners']});
group('passing',[
 ['passes','integer','count','Passaggi tentati inclusi cross; esclusi throw-in, corner e punizioni.'],
 ['pass_accuracy','number','percent','Passaggi riusciti / tentati, inclusi cross; null senza tentativi.'],
 ['progressive_passes','integer','count','Passaggi riusciti open play dai due terzi offensivi: distanza dalla porta ridotta almeno del 25%.'],
 ['progressive_pass_distance','number','metres','Riduzione della distanza dalla porta sui soli passaggi progressivi.'],
 ['passes_into_box','integer','count','Passaggi riusciti dall’esterno all’interno dell’area, inclusi cross.'],
 ['key_passes','integer','count','Passaggi seguiti da tiro del compagno, anche gol, attraversando eventuali carry.'],
 ['assists','integer','count','Ultimo passaggio prima del gol, flag della fonte.',{origin:'SOURCE_EVENT_FLAG'}],
 ['through_balls','integer','count','Passaggi filtranti identificati dal qualificatore del provider.',{origin:'SOURCE_EDITORIAL_QUALIFIER'}],
 ['crosses','integer','count','Cross open play; sottoinsieme di passes, non corner/punizioni.'],
 ['switches','integer','count','Passaggi completati con spostamento laterale almeno 36,6 m.']
],{markets:['goals','corners','shots']});
group('carrying',[
 ['carries','integer','count','Spostamenti sintetizzati >5 m fra azioni consecutive della stessa squadra.'],
 ['carry_distance','number','metres','Somma spostamenti rettilinei, non distanza effettivamente corsa.'],
 ['progressive_carries','integer','count','Guadagni verso porta: 30 m nella propria metà, 15 attraversandola, 10 nella metà avversaria.'],
 ['progressive_carry_distance','number','metres','Somma guadagni verso porta dei carry; arretramenti non negativi.'],
 ['carries_into_final_third','integer','count','Carry che attraversano x=70 dall’esterno.'],
 ['carries_into_box','integer','count','Carry dall’esterno all’area avversaria.'],
 ['take_ons','integer','count','Tentativi di superare l’avversario in possesso.',{origin:'SOURCE_EVENT'}],
 ['take_ons_won','integer','count','Take-on riusciti mantenendo il possesso.',{origin:'SOURCE_EVENT'}],
 ['miscontrols','integer','count','Controlli errati con perdita; esclusi autogol sullo stesso tipo interno.',{origin:'EVENT_DERIVED'}],
 ['dispossessed','integer','count','Perdite contro avversario senza take-on né cattivo controllo.',{origin:'EVENT_DERIVED'}]
],{origin:'SYNTHETIC_ACTION_DERIVED',markets:['goals','corners','shots','fouls','cards']});
group('creation',[
 ['sca','integer','count','Fino a due azioni offensive prima del tiro, fermandosi al limite del possesso.'],
 ['gca','integer','count','Analogo SCA per tiri conclusi in gol.'],
 ['chances_created','integer','count','Alias numerico di passing.key_passes; non sommare.'],
 ['second_assists','integer','count','Contributo precedente all’assist/opportunità; definizione giudiziale, non ogni gol.'],
 ...['pass_live','pass_dead','take_on','shot','foul_drawn','defensive'].map(k=>['sca_breakdown.'+k,'integer','count',{
  pass_live:'SCA da passaggi in gioco.',pass_dead:'SCA da riprese: punizioni, corner, rimesse, kickoff, rinvii.',
  take_on:'SCA da dribbling.',shot:'SCA da tiro precedente/ribattuta.',foul_drawn:'SCA da fallo subito: attribuito solo alla squadra.',defensive:'SCA da recupero difensivo.'
 }[k],k==='foul_drawn'?{scope:'TEAM_ONLY'}:{}]),
 ['xag','number','expected_goals_sum','xG dei tiri effettivamente creati da passaggi; esclusi rigori. Non xA.',{origin:'SHOT_MODEL_JOIN'}]
]);
group('defending',[
 ['tackles','integer','count','Contrasti a terra che sottraggono il pallone.'],
 ['interceptions','integer','count','Intercetti inclusi passaggi bloccati nella conversione.'],
 ['blocks','integer','count','Tiri diretti in porta bloccati da giocatori di movimento; esclusi da PPDA.'],
 ['clearances','integer','count','Allontanamenti senza destinatario; esclusi da PPDA.'],
 ['duels_won','integer','count','Duelli vinti a terra e aerei.'],
 ['aerials','integer','count','Duelli aerei disputati; esclusi colpi di testa non contesi.'],
 ['aerials_won','integer','count','Duelli aerei vinti.'],
 ...[
  ['ppda','number','ratio','Passaggi avversari / azioni difensive nella zona dichiarata; null con denominatore vuoto.'],
  ['opponent_passes','integer','count','Numeratore PPDA nella sola zona di pressing.'],
  ['defensive_actions','integer','count','Denominatore PPDA: falli, tackle, intercetti/passaggi bloccati, challenge nella zona.'],
  ['challenges','integer','count','Tentativi falliti di fermare un dribbling; dal flusso grezzo.'],
  ['avg_defensive_action_x','number','metres','x media di tackle, intercetti, falli e clearances; non altezza linea difensiva.'],
  ['high_turnovers','integer','count','Possessi iniziati entro 40 m dalla porta avversaria.'],
  ['counterpress_regains_5s','integer','count','Recuperi entro 5 s di orologio dalla perdita; non misura di pressione.'],
  ['ball_recovery_time','number','seconds','Tempo medio di recupero in gioco effettivo; null senza episodi.'],
  ['press_zone_fraction','number','fraction','Frazione della zona PPDA; documentata nella descrizione, assente nell’esempio.',{requiredForComplete:false}]
 ].map(([k,t,u,d,e={}])=>[k,t,u,d,{...e,scope:'TEAM_ONLY'}])
],{markets:['goals','shots','fouls','cards']});
group('territory',[
 ['possession_pct','number','percent','Quota delle consegne tentate: passaggi, cross e riprese; non tempo di possesso.'],
 ['field_tilt','number','percent','Quota di attività nell’ultimo terzo; algoritmo preciso non specificato.'],
 ['final_third_entries','integer','count','Passaggi/carry che attraversano x=70 verso l’attacco.'],
 ['box_entries','integer','count','Ingressi nell’area rettangolare 16,5×40,32 m.'],
 ['avg_action_x','number','metres','x iniziale media non ponderata delle azioni.'],
 ['possession_method','string','label','Metodo dichiarato pass_share, non possesso cronologico.',{requiredForComplete:false}]
],{scope:'TEAM_ONLY',markets:['goals','corners','shots']});
group('tempo',[
 ['passes_per_sequence','number','passes_per_sequence','Media passaggi nelle sequenze open play; null senza sequenze.'],
 ['sequence_time','number','seconds','Durata media sequenze open play.'],
 ['direct_speed','number','metres_per_second','Progresso verso porta / durata della sequenza.'],
 ['buildup_attacks','integer','count','Sequenze open play con almeno 10 passaggi concluse con tiro o tocco in area.'],
 ['direct_attacks','integer','count','Sequenze dalla propria metà che coprono almeno metà distanza verso porta e finiscono con tiro/tocco in area.']
],{scope:'TEAM_ONLY',markets:['goals','corners','shots','fouls','cards']});
export const PITCH_ADVANCED_METRICS=Object.freeze(groups.map(m=>Object.freeze(m)));
export const PITCH_ADVANCED_GROUPS=['possession_value','passing','carrying','creation','defending','territory','tempo'];
const get=(obj,path)=>path.split('.').reduce((v,k)=>v!=null&&typeof v==='object'&&Object.hasOwn(v,k)?v[k]:undefined,obj);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const numeric=v=>typeof v==='number'&&Number.isFinite(v);
const signed=m=>m.path.startsWith('possession_value.');

export function advancedMetricState(team,metric){
 let value=team;const walked=[];
 for(const key of metric.path.split('.')){
  if(value===null)return {state:'NULL',nullAt:walked.join('.')};
  if(!plain(value)||!Object.hasOwn(value,key))return {state:'OMITTED',omittedAt:[...walked,key].join('.')};
  value=value[key];walked.push(key);
 }
 if(value===undefined)return {state:'OMITTED'};
 if(value===null)return {state:'NULL'};
 const valid=metric.type==='string'?value==='pass_share':numeric(value)
  &&(metric.type!=='integer'||Number.isSafeInteger(value))&&(signed(metric)||value>=0)
  &&(metric.unit!=='percent'||value<=100)&&(metric.unit!=='fraction'||value<=1)
  &&(!metric.path.endsWith('_x')||value<=105);
 return valid?{state:value===0?'ZERO':'VALUE',value}:{state:'SEMANTIC_ERROR',value};
}
function leaves(obj,prefix=''){
 if(!plain(obj))return [prefix];
 return Object.entries(obj).flatMap(([key,value])=>leaves(value,prefix?prefix+'.'+key:key));
}
export function reviewPitchAdvanced({fixture,status,body,observedAtUtc}){
 const at=Date.parse(observedAtUtc),kick=Date.parse(fixture?.time_utc);
 if(!Number.isFinite(at)||!Number.isFinite(kick)||kick>=at||fixture.status!=='finished')throw Error('PITCH_ADVANCED_SAMPLE_NOT_COMPLETED');
 const result={schema:PITCH_ADVANCED_VERSION,fixtureId:fixture.id,observedAtUtc,kickoffUtc:fixture.time_utc,
  originalAvailableAtUtc:null,sourceModelVersion:null,period:'FULL_MATCH_PERIOD_NOT_EXPLICIT',trainingEligible:false,teams:[],issues:[]};
 if(status===404&&body?.error?.code==='ANALYTICS_UNAVAILABLE'&&!Object.hasOwn(body,'data'))return {...result,classification:'ANALYTICS_UNAVAILABLE',canContinue:true};
 if(status!==200||!plain(body?.data)||Object.hasOwn(body,'error'))return {...result,classification:'HTTP_OR_APPLICATION_ERROR',canContinue:false};
 const data=body.data,expected=[fixture.home_team,fixture.away_team];
 const unknownDataFields=Object.keys(data).filter(k=>!['match_id','teams'].includes(k));
 if(unknownDataFields.length)result.unknownDataFields=unknownDataFields;
 if(data.match_id!==fixture.id||!Array.isArray(data.teams)||data.teams.length!==2||data.teams.some((t,i)=>t?.team?.id!==expected[i].id||t?.team?.name!==expected[i].name))return {...result,classification:'IDENTITY_ERROR',canContinue:false};
 for(const [index,team] of data.teams.entries()){
  const side=index?'away':'home',issues=[];
  if(Object.hasOwn(team,'side')&&team.side!==side)issues.push('SIDE_CONFLICT');
  for(const group of PITCH_ADVANCED_GROUPS)if(Object.hasOwn(team,group)&&team[group]!==null&&!plain(team[group]))issues.push('GROUP_NOT_OBJECT:'+group);
  if(get(team,'creation.sca_breakdown')!==undefined&&get(team,'creation.sca_breakdown')!==null&&!plain(get(team,'creation.sca_breakdown')))issues.push('SCA_BREAKDOWN_NOT_OBJECT');
  const cells=PITCH_ADVANCED_METRICS.map(m=>({path:m.path,...advancedMetricState(team,m)}));
  const value=p=>{const c=cells.find(c=>c.path===p);return c&&['VALUE','ZERO'].includes(c.state)&&numeric(c.value)?c.value:null;};
  for(const [a,b] of [['passing.crosses','passing.passes'],['passing.progressive_passes','passing.passes'],['carrying.take_ons_won','carrying.take_ons'],['defending.aerials_won','defending.aerials']])if(value(a)!==null&&value(b)!==null&&value(a)>value(b))issues.push('SUBSET_CONFLICT:'+a);
  if(value('passing.key_passes')!==null&&value('creation.chances_created')!==null&&value('passing.key_passes')!==value('creation.chances_created'))issues.push('CHANCES_ALIAS_CONFLICT');
  const breakdown=PITCH_ADVANCED_METRICS.filter(m=>m.path.startsWith('creation.sca_breakdown.')).map(m=>value(m.path));
  if(breakdown.every(v=>v!==null)&&value('creation.sca')!==null&&breakdown.reduce((a,b)=>a+b,0)!==value('creation.sca'))issues.push('SCA_BREAKDOWN_CONFLICT');
  if(value('defending.defensive_actions')===0&&value('defending.ppda')!==null)issues.push('PPDA_DEFINED_WITH_ZERO_DENOMINATOR');
  if(value('defending.defensive_actions')>0&&value('defending.opponent_passes')!==null&&value('defending.ppda')!==null&&Math.abs(value('defending.ppda')-value('defending.opponent_passes')/value('defending.defensive_actions'))>0.02)issues.push('PPDA_RATIO_CONFLICT');
  if(value('passing.passes')===0&&value('passing.pass_accuracy')!==null)issues.push('PASS_ACCURACY_DEFINED_WITH_ZERO_DENOMINATOR');
  const known=new Set([...PITCH_ADVANCED_METRICS.map(m=>m.path),'team.id','team.name','side']);
  const unknownFields=leaves(team).filter(p=>!known.has(p)&&!PITCH_ADVANCED_GROUPS.includes(p)&&p!=='creation.sca_breakdown');
  const decomposition=Object.fromEntries(['vaep','pv'].map(prefix=>{
   const [total,off,def]=['total','offensive','defensive'].map(k=>value('possession_value.'+prefix+'_'+k));
   return [prefix,[total,off,def].every(v=>v!==null)?{total,offensive:off,defensive:def,residualAdd:total-off-def,residualSubtract:total-off+def,interpretation:'WITHHELD_DOCUMENTATION_SIGN_BASELINE_AMBIGUITY'}:null];
  }));
  result.teams.push({side,teamId:team.team.id,cells,unknownFields,decomposition,issues});
 }
 result.issues=result.teams.flatMap(t=>t.issues.map(code=>({side:t.side,code})));
 const semantic=result.issues.length||result.teams.some(t=>t.cells.some(c=>c.state==='SEMANTIC_ERROR'));
 const complete=!unknownDataFields.length&&result.teams.every(t=>!t.unknownFields.length&&t.cells.every(c=>!PITCH_ADVANCED_METRICS.find(m=>m.path===c.path).requiredForComplete||['VALUE','ZERO'].includes(c.state)));
 return {...result,classification:semantic?'SEMANTIC_ERROR':complete?'VALID_COMPLETE':'VALID_PARTIAL',canContinue:!semantic};
}

export function summarizePitchAdvanced(samples,{season,scope=null}){
 const selected=samples.filter(s=>s.season===season&&(scope===null||s.scope===scope));
 const states=['VALUE','ZERO','NULL','OMITTED','SEMANTIC_ERROR','RESPONSE_UNAVAILABLE','NOT_OBSERVED'];
 const cells=selected.flatMap(s=>['home','away'].flatMap(side=>PITCH_ADVANCED_METRICS.map(m=>({fixtureId:s.fixture.id,side,path:m.path,
  state:s.review?s.review.teams.find(t=>t.side===side)?.cells.find(c=>c.path===m.path)?.state??'RESPONSE_UNAVAILABLE':'NOT_OBSERVED'}))));
 const matrix=PITCH_ADVANCED_METRICS.map(m=>({path:m.path,denominator:selected.length*2,counts:Object.fromEntries(states.map(state=>[state,cells.filter(c=>c.path===m.path&&c.state===state).length]))}));
 const groupCoverage=PITCH_ADVANCED_GROUPS.map(group=>({group,denominator:selected.length*2,
  numericCompleteTeams:selected.flatMap(s=>s.review?.teams??[]).filter(t=>PITCH_ADVANCED_METRICS.filter(m=>m.path.startsWith(group+'.')&&m.requiredForComplete).every(m=>['VALUE','ZERO'].includes(t.cells.find(c=>c.path===m.path)?.state))).length}));
 return {schema:'lamultipla-pitchapi-advanced-coverage-v1',season,scope,plannedMatches:selected.length,observedMatches:selected.filter(s=>s.review).length,
  classifications:Object.fromEntries([...new Set(selected.map(s=>s.review?.classification??'NOT_OBSERVED'))].map(k=>[k,selected.filter(s=>(s.review?.classification??'NOT_OBSERVED')===k).length])),
  matrix,groupCoverage,populationCoverageInferred:false,trainingEligible:false};
}
