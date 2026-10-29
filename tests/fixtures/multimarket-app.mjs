import {syntheticReferenceExploration} from './reference-exploration.mjs';
import {exploreInternational} from '../../scripts/lib/reference-odds/exploratory.mjs';
import {buildMultimarketDisplay,signMultimarketFrame,MM_APPLICATION_ID} from '../../shared/multimarket-experiment.mjs';
import {base64url,keyFingerprint} from '../../shared/private-delivery.mjs';
// The signing key is generated in memory, never an owner's actual key.
export async function syntheticMultimarketApp(root,{now='2026-10-28T22:00:00.000Z'}={}){
 const f=await syntheticReferenceExploration(root),keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),
 spki=base64url(await crypto.subtle.exportKey('spki',keys.publicKey)),keyId=await keyFingerprint(spki),
 trust={schema:'lamultipla-mm-local-test-trust-v1',applicationId:MM_APPLICATION_ID,usage:'SYNTHETIC_ONLY',keyId,spki},
 expiresAtUtc=new Date(Date.parse(now)+30*60000).toISOString();
 const positiveReport=exploreInternational(f.input()),one=f.input();one.slot={id:'SYNTHETIC-ONE-FIXTURE-COMPLETE',fixtureIds:[f.manifest.events[0].fixtureId]};
 const noBetReport=exploreInternational(one);f.data.matches.shift();const incompleteReport=exploreInternational(f.input());
 const reports={simulation:positiveReport,noBet:noBetReport,incomplete:incompleteReport},frames={};
 for(const [name,r]of Object.entries(reports))frames[name]=await signMultimarketFrame(await buildMultimarketDisplay(r,f.manifest,{generatedAtUtc:now}),trust,keys.privateKey,{signedAtUtc:now,expiresAtUtc});
 return {f,keys,trust,frames,reports,now,expiresAtUtc};
}
