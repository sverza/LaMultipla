import {digest} from '../prospective/store.mjs';
import {catalogArray,fixturesArray} from '../odds-report.mjs';
import {quoteSpec} from '../engine/markets.mjs';
const sorted=s=>[...s].sort((a,b)=>String(a).localeCompare(String(b)));
const goalTypes=new Set(['1x2','bothteamsscore','totals','spreads','spreads-european','drawnobet','doublechance','correctscore','exactscore','exactscore-team1','exactscore-team2','teamtotals-team1','teamtotals-team2','oddeven','toscore-team1','toscore-team2','cleansheet-team1','cleansheet-team2','wintonil-team1','wintonil-team2','winningmargin']);
const temporalTypes=new Set(['halftime-fulltime','highestscoringh','highestscoringh-team1','highestscoringh-team2','winfrombehind','firstgoal','lastgoal','2up','toscoreinbh-team1','toscoreinbh-team2','wineitherh-team1','wineitherh-team2','winbothh-team1','winbothh-team2']);
export function familyAssessment(type,period,name=''){
 let family=goalTypes.has(type)?'goals':temporalTypes.has(type)?'goal_timing':type.includes('corners')?'corners':type.includes('bookings')?'bookings':
   type.startsWith('players-')||type.startsWith('playertotals-')?'players':'unclassified';
 if(goalTypes.has(type)&&/corner|booking|card|player/i.test(name))family='unclassified';
 const temporal=period!=='fulltime';
 if(family==='goals'&&temporal)family='goal_timing';
 const common={validation:'No additional market admitted; v1 retrospective only for exact fulltime1X2, prospective gates separate',selector:'Only existing fulltime1X2 can be screened; operational use blocked',
   sourceCandidates:family==='goals'?['Openfootball CC0 original source only; missing results explicit']:['Wyscout2017/18 CC BY4.0 research archive','StatsBomb2015/16 research agreement, restrictions','Current licensed stats feed not yet verified'],
   provenance:'Observed now is not historical availability; no dataset or training automatically adopted',difficulty:family==='goals'?'S/M mapping and validation design; prospective observation separate':'L/XL data, definition, exposure and temporal validation'};
 if(family==='goals')return {...common,family,model:'Fulltime goal grid available; payoff API only for existing specs; score/exact-score/European handicap/odd-even need new external mapping',
   dataset:'Fulltime goals with temporal provenance and exact fixture identities',settlement:'90+stoppage vs overtime; named outcome, line and side; push/quarter/refunds or exact range; actual ticket verification',priority:'B: complete goal-family definitions after inventory approval'};
 if(family==='goal_timing')return {...common,family,model:'No half/time-path model implemented; fulltime grid is insufficient',dataset:'HT/FT plus timed goals, periods, match state; exposure and acquisition/version timestamps',
   settlement:'First/second half, HT/FT path, first/last event, early-payout or win-from-behind semantics cannot be inferred from FT totals',priority:'B2/E: separate temporal models after fulltime family'};
 if(family==='corners')return {...common,family,model:'No corner model; compare hierarchical joint counts, NB/Poisson/underdispersion baselines after data QC',
   dataset:'Home/away corners by match/half, referee/tactics context if justified; event definitions and final corrections',settlement:'Awarded vs taken/repeated corner, period, handicap sign, integer/quarter push, abandoned match',priority:'C: first new statistical family once current licensed data exists'};
 if(family==='bookings')return {...common,family,model:'No card/booking model; yellow counts, rare-red and referee/team effects require separate distributions',
   dataset:'Player/team timed yellow, second-yellow/red, bench/off-field/staff exclusions, referee identity, minutes and corrections',settlement:'Bookings may mean weighted points, not cards; double yellow, red, bench and post-whistle rules must be reconciled',priority:'D: after definition and rights gates'};
 if(family==='players')return {...common,family,model:'No player model; shots count and SOT conditional model, goal hazard/competing risks, assists/cards/fouls/saves require statistic-specific designs',
   dataset:'Persistent player IDs, roles, starters/substitutions, minutes, per-event/per-appearance stats, lineup uncertainty and verified current history',settlement:'Nonstarter/nonappearance voids differ by market; result/incl.overtime cannot be silently changed to fulltime; encoded threshold in outcome may need explicit parser',priority:'E: data/exposure/definition gates before fits'};
 return {...common,family,model:'Unknown semantics: no automatic mapping or probabilities',dataset:'Determine target outcome before evaluating any data source',settlement:'Unverified; exclude until explicit documented definition',priority:'A/E: census and explicit exclusion, no invented mapping'};
}
export function inventoryMarkets({reports,rawSnapshots=[],catalog,now=new Date()}){
 if(!Array.isArray(reports)||!reports.length)throw Error('AUDIT_EXISTING_REPORTS_REQUIRED');
 const definitions=catalogArray(catalog),byId=new Map(),catalogConflicts=new Set();
 for(const d of definitions){const id=String(d.marketId);if(byId.has(id)&&digest(byId.get(id))!==digest(d))catalogConflicts.add(id);else byId.set(id,d);}
 const football=definitions.filter(d=>d.sportId===10),observations=new Map(),groups=new Map(),rawGroups=new Map();
 const key=q=>digest([q.marketType,q.period,q.playerProp,q.marketName]);
 function insert(map,q,observation,fixtureId){
  const k=key(q),g=map.get(k)??{marketType:q.marketType,period:q.period,playerProp:q.playerProp,rows:0,priced:0,active:0,automaticallyMapped:0,identityIssues:0,
    participantIdsPresent:0,playerIdentityPresent:0,fixtures:new Set(),observations:new Set(),marketIds:new Set(),outcomeIds:new Set(),playerKeys:new Set(),names:new Set(),lines:new Set(),outcomes:new Set(),issueCounts:{}};
  g.rows++;g.priced+=Number(Number.isFinite(q.price)&&q.price>1);g.active+=Number(q.active===true);g.automaticallyMapped+=Number(Boolean(quoteSpec(q,null)));
  g.identityIssues+=Number(q.issues?.some(i=>/identity|duplicate|invalid_line/.test(i))??false);
  g.participantIdsPresent+=Number(q.participantIds?.length===2&&q.participantIds.every(v=>v!=null));g.playerIdentityPresent+=Number(q.playerProp===true&&q.playerKey!=='0'&&Boolean(q.playerName));
  g.fixtures.add(fixtureId);g.observations.add(observation);g.marketIds.add(String(q.marketId));g.names.add(q.marketName);g.lines.add(q.line);g.outcomes.add(q.outcome);
  g.outcomeIds.add(String(q.outcomeId));if(q.playerProp)g.playerKeys.add(String(q.playerKey));
  for(const i of q.issues??[])g.issueCounts[i]=(g.issueCounts[i]??0)+1;map.set(k,g);
 }
 for(const {file,report:r} of reports){
  if(r?.schema!=='lamultipla-oddspapi-private-v2'||r.source?.provider!=='OddsPapi'||r.source.bookmaker!=='bet365.it'||r.source.tournamentId!==23||!Array.isArray(r.selections)
    ||!Number.isFinite(Date.parse(r.fetchedAtUtc))||Date.parse(r.fetchedAtUtc)>new Date(now).getTime())throw Error('AUDIT_INVALID_EXISTING_REPORT');
  // Confirmation can change in an offline reinterpretation; observed fixture scope must not become another acquisition.
  const id=digest([r.fetchedAtUtc,r.source.fixturesSha256,r.source.catalogSha256,r.round.season,r.round.matchday,r.coverage.map(c=>c.fixtureId).sort()]);
  const quotePayloadSha256=digest(r.selections.map(q=>[q.quoteId,q.fixtureId,q.marketId,q.outcomeId,q.playerKey,q.marketType,q.marketName,q.period,q.line,q.outcome,q.price,q.active,q.marketActive,q.suspended]));
  const previous=observations.get(id);if(previous){
   if(previous.quotePayloadSha256!==quotePayloadSha256)throw Error('AUDIT_CONFLICTING_REINTERPRETATION');
   previous.files.push(file);previous.derivedStatusVariants.push({mode:r.source.mode,summary:r.summary});continue;
  }
  observations.set(id,{id,files:[file],observedAtUtc:r.fetchedAtUtc,fixtureIds:r.coverage.map(c=>c.fixtureId),fixtureCount:r.coverage.length,
    quotePayloadSha256,
    sourceFixturesSha256:r.source.fixturesSha256,sourceCatalogSha256:r.source.catalogSha256,catalogMatchesCache:r.source.catalogSha256===digest(catalog),
    selections:r.selections.length,mode:r.source.mode,derivedStatusVariants:[{mode:r.source.mode,summary:r.summary}]});
  for(const q of r.selections)insert(groups,q,id,q.fixtureId);
 }
 const rawSeen=new Set(),rawCoverage=new Set();
 for(const {file,fixtures} of rawSnapshots){const rawHash=digest(fixtures);if(rawSeen.has(rawHash))continue;rawSeen.add(rawHash);
  const observation=[...observations.values()].find(o=>o.sourceFixturesSha256===rawHash);if(!observation)throw Error('AUDIT_RAW_SNAPSHOT_HASH_UNBOUND');
  for(const f of fixturesArray(fixtures).filter(f=>f.sportId===10&&f.tournamentId===23)){
   const b=f.bookmakerOdds?.['bet365.it'];if(!b)continue;rawCoverage.add(f.fixtureId);
   for(const [marketId,m] of Object.entries(b.markets??{})){const d=byId.get(marketId),defs=new Map((d?.outcomes??[]).map(o=>[String(o.outcomeId),o.outcomeName]));
    for(const [outcomeId,o] of Object.entries(m.outcomes??{}))for(const [playerKey,p] of Object.entries(o.players??{}))insert(rawGroups,
      {marketType:d?.marketType??'unknown',marketName:d?.marketName??'',period:d?.period??null,playerProp:d?.playerProp??null,line:d?.handicap??null,marketId,outcomeId,
       outcome:defs.get(outcomeId)??'',playerKey,playerName:p.playerName,price:Number(p.price),active:p.active,
       participantIds:[f.participant1Id??null,f.participant2Id??null],issues:(!d||catalogConflicts.has(marketId))?['market_identity_incomplete']:[]},observation.id,f.fixtureId);
   }
  }observation.rawFile=file;
 }
 function finish(map){return [...map.values()].sort((a,b)=>a.marketType.localeCompare(b.marketType)||String(a.period).localeCompare(String(b.period))).map(g=>({
   marketType:g.marketType,period:g.period,playerProp:g.playerProp,observed:true,counts:{rows:g.rows,priced:g.priced,selectionActiveTrue:g.active,
     automaticallyMapped:g.automaticallyMapped,identityIssues:g.identityIssues,participantIdsPresent:g.participantIdsPresent,playerIdentityPresent:g.playerIdentityPresent},
   fixtureCoverage:sorted(g.fixtures),observationIds:sorted(g.observations),marketIds:sorted(g.marketIds),outcomeIds:sorted(g.outcomeIds),playerKeys:sorted(g.playerKeys),marketNames:sorted(g.names),lines:sorted(g.lines),outcomes:sorted(g.outcomes),
   issueCounts:g.issueCounts,mappingState:g.automaticallyMapped?'EXISTING_PARSER_HANDLES_SOME_ROWS':g.marketType==='doublechance'&&g.names.has('Double Chance Full Time')?'EXACT_NAME_MISMATCH_NO_SILENT_ALIAS':
   g.marketType==='spreads'?'MANUAL_SIDE_LINE_MAPPING_REQUIRED':'NOT_AUTOMATICALLY_MAPPED',assessment:familyAssessment(g.marketType,g.period,sorted(g.names).join(' / '))}));}
 const reportMatrix=finish(groups),rawMatrix=finish(rawGroups),observedTypes=sorted(new Set([...reportMatrix,...rawMatrix].map(g=>g.marketType))),catalogTypes=sorted(new Set(football.map(d=>d.marketType)));
 const categoryChecks=[['European handicap','spreads-european'],['Corner handicap','spreads-corners'],['Bookings handicap','spreads-bookings'],
   ['Player offsides','players-offsides'],['Player saves alternate encoding','players-saves'],['Early payout','2up'],['Multigol','multigoal'],['BetBuilder','betbuilder']]
   .map(([category,type])=>({category,marketType:type,observed:observedTypes.includes(type),catalogOnly:catalogTypes.includes(type)&&!observedTypes.includes(type),
     catalogPresent:catalogTypes.includes(type),presenceState:observedTypes.includes(type)?'OBSERVED':catalogTypes.includes(type)?'CATALOG_ONLY_NOT_BET365_AVAILABILITY_PROOF':'NOT_OBSERVED_IN_THESE_INPUTS'}));
 return {schema:'lamultipla-market-inventory-audit-v1',generatedAtUtc:new Date(now).toISOString(),catalogSha256:digest(catalog),catalog:{definitions:definitions.length,footballDefinitions:football.length,
   footballMarketTypes:catalogTypes,conflictingIds:sorted(catalogConflicts)},observations:[...observations.values()],observedMarketTypes:observedTypes,reportMatrix,rawMatrix,categoryChecks,
   counts:{inputReports:reports.length,uniqueAcquisitionObservations:observations.size,duplicateOrReinterpretationReports:reports.length-observations.size,
     reportMarketTypes:new Set(reportMatrix.map(g=>g.marketType)).size,allReturnedBet365MarketTypes:observedTypes.length,reportRows:reportMatrix.reduce((n,g)=>n+g.counts.rows,0),
     rawRows:rawMatrix.reduce((n,g)=>n+g.counts.rows,0),returnedFixtureIdentities:rawCoverage.size,reportAutomaticallyMapped:reportMatrix.reduce((n,g)=>n+g.counts.automaticallyMapped,0)},
   providerRequests:0,decision:null,actualStakeEUR:0,publicationAllowed:false,
   limitations:['Global catalog is not bet365 offer coverage','Identical timestamp/source/round snapshots and offline reinterpretations are not new acquisitions',
     'Historical counts are not current playability; no price or player name exported by this audit','Periods remain distinct; overtime/result never silently fulltime','Grouping is diagnostic and never a settlement mapping or validation']};
}
export function inventoryMarkdown(a){
 const escape=v=>String(v??'unknown').replace(/\|/g,'/').replace(/[\r\n]/g,' ');
 const table=rows=>rows.map(r=>`| ${escape(r.marketType)} / ${escape(r.period)} / ${escape(r.marketNames.join('; '))} | sì | ${r.counts.automaticallyMapped}/${r.counts.rows}; ${escape(r.mappingState)} | ${r.fixtureCoverage.length} fixture | ${escape(r.assessment.model)} | ${escape(r.assessment.dataset)} | ${escape(r.assessment.sourceCandidates.join('; '))} | ${escape(r.assessment.settlement)} | ${escape(r.assessment.validation)} | ${escape(r.assessment.difficulty)} | ${escape(r.assessment.priority)} |`).join('\n');
 const header='| Tipo / periodo | Presenza | Mapping automatico | Copertura | Modello | Dataset | Fonti / condizioni | Liquidazione | Validazione | Difficoltà | Priorità |\n|---|---|---|---|---|---|---|---|---|---|---|';
 return `# Inventario privato delle acquisizioni esistenti\n\n${a.generatedAtUtc}. Nessuna quota corrente, forecast o chiamata provider. Due ambiti separati: report giornata e risposta grezza completa. Nessun market type omesso. Dettagli ID/linee/esiti/hash nel JSON.\n\n${JSON.stringify(a.counts)}\n\n## Report delle giornate\n\n${header}\n${table(a.reportMatrix)}\n\n## Tutti gli incontri restituiti dal provider\n\n${header}\n${table(a.rawMatrix)}\n\n## Categorie non osservate\n\n${a.categoryChecks.map(c=>'- '+c.category+': '+c.presenceState).join('\n')}\n\n## Limiti\n\n${a.limitations.map(t=>'- '+t).join('\n')}\n`;
}
