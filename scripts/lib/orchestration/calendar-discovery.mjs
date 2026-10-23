import {canonicalTeam,sha256} from '../goals/data.mjs';
export const CALENDAR_LICENSE_SHA256='36ffd9dc085d529a7e60e1276d73ae5a030b020313e6c5408593a6ae2af39673';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)
  &&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const name=value=>typeof value==='string'&&value===value.trim()&&value.length>0&&value.length<=100&&!/[\u0000-\u001f]/.test(value);
function utcInstant(value){
  if(typeof value!=='string')return null;
  const match=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?(?:Z|\+00:00)$/.exec(value);
  if(!match||!Number.isFinite(Date.parse(value)))return null;
  const iso=match[1]+'.'+(match[2]??'').padEnd(3,'0')+'Z';
  return new Date(value).toISOString()===iso?iso:null;
}
const dateTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function italianTime(utc){const p=Object.fromEntries(dateTime.formatToParts(new Date(utc)).map(v=>[v.type,v.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};}
export function calendarSeason(now){const at=new Date(now);if(!Number.isFinite(at.getTime()))fail('CALENDAR_CLOCK_INVALID');
  const year=at.getUTCFullYear()-(at.getUTCMonth()<6?1:0);return `${year}/${String(year+1).slice(-2)}`;}
export function validatePublicCalendar(source,{now=new Date()}={}){
  const at=new Date(now).getTime(),observed=Date.parse(source?.fetchedAtUtc),season=calendarSeason(now);
  if(source?.schema!=='lamultipla-calendar-public-source-v1'||source.source!=='openfootball/football.json'
    ||source.license!=='CC0-1.0'||source.licenseSha256!==CALENDAR_LICENSE_SHA256||!/^[a-f0-9]{40}$/.test(source.commit)
    ||!Number.isFinite(observed)||observed>at||at-observed>86400000||typeof source.body!=='string'||source.body.length>1024*1024
    ||sha256(source.body)!==source.bodySha256||source.path!==season.replace('/','-')+'/it.1.json')fail('CALENDAR_PUBLIC_SOURCE_INVALID');
  let data;try{data=JSON.parse(source.body);}catch{fail('CALENDAR_PUBLIC_SOURCE_INVALID');}
  if(data?.name!==`Italian Serie A ${season}`||!Array.isArray(data.matches)||data.matches.length<10||data.matches.length>500)fail('CALENDAR_PUBLIC_SOURCE_INVALID');
  const rows=[],pairs=new Set();
  for(const m of data.matches){
    if(!/^Matchday ([1-9]|[12]\d|3[0-8])$/.test(m.round)||!name(m.team1)||!name(m.team2)||!validDate(m.date)
      ||m.date<season.slice(0,4)+'-07-01'||m.date>=String(Number(season.slice(0,4))+1)+'-07-01')fail('CALENDAR_PUBLIC_FIXTURE_INVALID');
    const home=canonicalTeam(m.team1),away=canonicalTeam(m.team2),key=home+'\n'+away;
    if(!name(home)||!name(away))fail('CALENDAR_TEAM_IDENTITY_INVALID');
    if(home===away||pairs.has(key))fail('CALENDAR_PUBLIC_FIXTURE_AMBIGUOUS');pairs.add(key);
    const fulltime=Array.isArray(m.score)?m.score:m.score?.ft;
    if(fulltime!==undefined&&fulltime!==null&&(!Array.isArray(fulltime)||fulltime.length!==2||fulltime.some(g=>!Number.isInteger(g)||g<0||g>30)))fail('CALENDAR_PUBLIC_SCORE_INVALID');
    rows.push({home,away,date:m.date,time:m.time,matchday:Number(m.round.slice(9)),scored:m.score!==undefined&&m.score!==null,fulltimeScored:fulltime!==undefined&&fulltime!==null});
  }
  return {season,rows};
}
// Provider supplies the UTC instant; the CC0 source independently supplies
// season/round and Italian wall date/time. Never infer a missing time or ID.
export function discoverCalendar(source,fixtures,{now=new Date()}={}){
  const {season,rows}=validatePublicCalendar(source,{now}),at=new Date(now).getTime();
  if(!Array.isArray(fixtures)||fixtures.length>2000)fail('CALENDAR_PROVIDER_RESPONSE_INVALID');
  const metadata=[],ids=new Set(),pairs=new Set(),groups=new Map(),excluded=[];
  const reject=reason=>excluded.push({reason});
  for(const f of fixtures){
    if(!f||typeof f!=='object'||Array.isArray(f)||'bookmakerOdds' in f||'markets' in f||'odds' in f)fail('CALENDAR_ODDS_BEFORE_FORECAST_REFUSED');
    if(typeof f.fixtureId!=='string'||!/^id\d{1,30}$/.test(f.fixtureId)||f.sportId!==10||f.tournamentId!==23
      ||!name(f.participant1Name)||!name(f.participant2Name)||!Number.isInteger(f.statusId)||f.statusId<0||f.statusId>3
      ||!utcInstant(f.startTime)
      ||f.seasonId!==undefined&&f.seasonId!==null&&(!Number.isInteger(f.seasonId)||f.seasonId<1)
      ||f.updatedAt!==undefined&&(typeof f.updatedAt!=='string'||!Number.isFinite(Date.parse(f.updatedAt))||Date.parse(f.updatedAt)>at))fail('CALENDAR_PROVIDER_FIXTURE_INVALID');
    if(ids.has(f.fixtureId))fail('CALENDAR_PROVIDER_FIXTURE_AMBIGUOUS');ids.add(f.fixtureId);
    const record={fixtureId:f.fixtureId,home:canonicalTeam(f.participant1Name),away:canonicalTeam(f.participant2Name),
      kickoffUtc:utcInstant(f.startTime),statusId:f.statusId,seasonId:f.seasonId??null,updatedAt:f.updatedAt??null};metadata.push(record);
    if(!name(record.home)||!name(record.away)||record.home===record.away)fail('CALENDAR_TEAM_IDENTITY_INVALID');
    if(record.statusId===3){reject('PROVIDER_CANCELLED');continue;}
    if(record.statusId!==0||Date.parse(record.kickoffUtc)<=at+5*60000){reject('ALREADY_STARTED_OR_TOO_LATE');continue;}
    const pair=record.home+'\n'+record.away;
    if(pairs.has(pair))fail('CALENDAR_PROVIDER_FIXTURE_AMBIGUOUS');pairs.add(pair);
    const match=rows.find(r=>r.home===record.home&&r.away===record.away);
    if(!match){reject('NO_INDEPENDENT_ROUND_IDENTITY');continue;}
    if(season==='2026/27'&&match.matchday<=6){reject('PROTECTED_ORIGINAL_PILOT');continue;}
    const wall=italianTime(record.kickoffUtc);
    if(match.scored||!/^([01]\d|2[0-3]):[0-5]\d$/.test(match.time)||wall.date!==match.date||wall.time!==match.time){reject('SOURCE_TIME_OR_RESULT_CONFLICT');continue;}
    const values=groups.get(match.matchday)??[];values.push(record);groups.set(match.matchday,values);
  }
  const rounds=[];
  for(const [matchday,values] of groups){
    const publicRound=rows.filter(r=>r.matchday===matchday),teams=values.flatMap(f=>[f.home,f.away]);
    if(values.length!==10||publicRound.length!==10||new Set(teams).size!==20
      ||new Set(values.map(v=>v.seasonId)).size!==1){reject('INCOMPLETE_OR_AMBIGUOUS_ROUND');continue;}
    const events=values.sort((a,b)=>a.kickoffUtc.localeCompare(b.kickoffUtc)||a.fixtureId.localeCompare(b.fixtureId))
      .map(({fixtureId,home,away,kickoffUtc})=>({fixtureId,home,away,kickoffUtc}));
    rounds.push({season,matchday,events,firstKickoffUtc:events[0].kickoffUtc,lastKickoffUtc:events.at(-1).kickoffUtc});
  }
  rounds.sort((a,b)=>a.firstKickoffUtc.localeCompare(b.firstKickoffUtc));
  const missingResults=rows.filter(r=>!r.fulltimeScored&&Date.parse(r.date)+48*3600000<=at);
  const missingByRound=missingResults.reduce((counts,r)=>{counts[r.matchday]=(counts[r.matchday]??0)+1;return counts;},{});
  return {schema:'lamultipla-calendar-discovery-v1',observedAtUtc:new Date(now).toISOString(),season,rounds,excluded,
    verification:'CC0_PROVIDER_CROSS_CHECK',officiallyReconfirmed:false,
    publicLastScoredDate:rows.filter(r=>r.fulltimeScored).map(r=>r.date).sort().at(-1)??null,
    publicMissingAvailableResults:missingResults.length,roundsMissingPublicResults:Object.entries(missingByRound).map(([matchday,events])=>({matchday:Number(matchday),events})),
    comparisonTimeZone:'Europe/Rome',publicCommit:source.commit,publicBodySha256:source.bodySha256,providerFixtures:metadata,
    limitation:'Cross-check CC0/provider; not a new official Lega verification. No forecast, odds or model authorization.'};
}
