import {normalizeSeason,sha256} from '../goals/data.mjs';

// Official public repository only. New snapshots never patch the study dataset or forecasts.
export async function refreshDataset({now=new Date(),fetchImpl=fetch,clock=()=>new Date()}={}) {
  const started=new Date(now);if(!Number.isFinite(started.getTime()))throw new Error('Invalid source clock');
  const requests=[];
  const get=async url=>{const response=await fetchImpl(url,{headers:{'User-Agent':'LaMultipla-shadow-public-results'},redirect:'error',signal:AbortSignal.timeout(30000)});
    requests.push({url,status:response.status});if(!response.ok)throw new Error(`Public results HTTP ${response.status}`);return response.text();};
  const metadata=JSON.parse(await get('https://api.github.com/repos/openfootball/football.json/commits/master'));
  if(!/^[a-f0-9]{40}$/.test(metadata.sha))throw new Error('Invalid public source commit');
  const base=`https://raw.githubusercontent.com/openfootball/football.json/${metadata.sha}/`,license=await get(base+'LICENSE.md');
  if(!license.startsWith('CC0 1.0 Universal')||sha256(license)!=='36ffd9dc085d529a7e60e1276d73ae5a030b020313e6c5408593a6ae2af39673')throw new Error('Source license changed; review required');
  const first=started.getUTCFullYear()-(started.getUTCMonth()<6?1:0),rows=[],files=[],audits=[];
  for(let year=first-4;year<=first;year++) {
    const season=`${year}-${String(year+1).slice(-2)}`,relative=season+'/it.1.json',raw=await get(base+relative);
    const normalized=normalizeSeason(JSON.parse(raw),season,started.toISOString());rows.push(...normalized.rows);audits.push(normalized.audit);files.push({path:relative,sha256:sha256(raw)});
  }
  const acquiredAtUtc=new Date(clock()).toISOString();if(Date.parse(acquiredAtUtc)<started.getTime())throw new Error('Source clock moved backwards');
  return {schema:'lamultipla-results-dataset-v1',source:'openfootball/football.json',commit:metadata.sha,sourceCommitAtUtc:metadata.commit?.committer?.date??null,
    acquiredAtUtc,cutoffUtc:started.toISOString(),license:'CC0-1.0',licenseSha256:sha256(license),files,audits,
    rows:rows.sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key)),requests,
    limitation:'Observed now; retrospective source correction and date+48h availability assumption remain'};
}
