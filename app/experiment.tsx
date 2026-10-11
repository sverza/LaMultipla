'use client';
import type {ExperimentalEnvelope} from '../shared/decision-v4.mjs';
import {reasonLabel,stateLabels} from '../shared/decision-v4.mjs';
import type {PrivateDeliveryInfo} from '../shared/private-receiver.mjs';
const percent=(p:number)=>`${(p*100).toFixed(2).replace('.', ',')}%`;
const clock=(v:string)=>new Date(v).toLocaleString('it-IT',{dateStyle:'short',timeStyle:'medium'});
export function ExperimentCard({envelope,deliveryInfo}:{envelope:ExperimentalEnvelope;deliveryInfo?:PrivateDeliveryInfo}){
  const p=envelope.payload,receipt=p.schema==='lamultipla-public-decision-receipt-v1';
  if(receipt)return <article className="experiment-card" data-testid="public-receipt"><div className="eye">{p.sourceData==='synthetic_test'?'DATI SINTETICI · TEST SOFTWARE · ':''}RICEVUTA REDATTA · DATI QUOTE ASSENTI</div><h2>NO BET · giornata {p.matchday}</h2><p>{reasonLabel(p.cause)}</p>{p.shadowCause&&<p>{reasonLabel(p.shadowCause)}</p>}<p>Esito shadow: {p.shadowDecision}. Stake reale: 0 €. Nessuna schedina importata.</p><small>{p.season} · {clock(p.generatedAtUtc)}</small><details><summary>Provenienza della ricevuta</summary><p>Hash locale, senza firma o attestazione temporale esterna.</p><code>{p.decisionSha256}</code></details></article>;
  return <article className="experiment-card" data-testid="experiment-card">
    <div className="eye">{p.sourceData==='synthetic_test'?'DATI SINTETICI · TEST SOFTWARE':'ANALISI SPERIMENTALE PRIVATA'} · {p.final?'CONGELATA':'ANTEPRIMA'}</div>
    <h2>{stateLabels[p.status]} · giornata {p.round.matchday}</h2><small>{p.round.season} · generata {clock(p.generatedAtUtc)}</small>
    <p className="experiment-warning">Uso operativo non autorizzato. Stake reale: 0 €. Questa analisi non può diventare una giocata.</p>
    {deliveryInfo&&<p>Firma del PC verificata · ricevuta {deliveryInfo.sequence}. Scadenza: {clock(deliveryInfo.expiresAtUtc)}.{deliveryInfo.expiredAtReception?' Ricevuta dopo la scadenza: solo archivio storico.':''}</p>}
    {p.shadowCause&&<p data-testid="no-bet-cause"><strong>{reasonLabel(p.shadowCause)}</strong></p>}
    <p>Esaminate: {p.counts.examined??0} · candidate EV: {p.counts.candidates??0} · ammesse: {p.counts.selectionReady??0}.</p>
    {p.selections.map(s=><section className="experiment-selection" key={s.quoteId}>
      <h3>{s.identity.fixture.join(' – ')} · {s.identity.outcome}</h3><p>{s.identity.marketName} · {s.identity.period} · linea {s.identity.line}</p>
      <p>Quota bet365 Italia: <strong>{s.price.toFixed(2)}</strong> · verificata {clock(s.verification.verifiedAtUtc)}</p>
      <p>Probabilità: <strong>{percent(s.forecast.probability)}</strong> · intervallo marginale 95%: {s.forecast.interval95.map(percent).join(' – ')}</p>
      <p>EV puntuale: {percent(s.value.pointEV)} · EV al limite inferiore: {percent(s.value.lowerEV)}</p>
      {s.provider.active===false&&<p>Provider: inattiva. Disponibilità confermata manualmente su bet365.it; flag originale conservato.</p>}
      <details><summary>Identità e verifiche della selezione</summary><p>Kickoff {clock(s.identity.kickoffUtc)} · fixture {s.identity.fixtureId} · bookmaker fixture {s.identity.bookmakerFixtureId}</p><p>Osservazione quota {clock(s.observedAtUtc)}. Origine: {s.verification.origin}.</p><p>Regole verificate {clock(s.settlement.reviewedAtUtc)}.</p><code>{s.quoteId}</code></details>
    </section>)}
    {p.combined&&<section className="experiment-selection"><h3>Combinazione sperimentale</h3>
      <p>Prezzo complessivo osservato: <strong data-testid="observed-combined-price">{p.combined.observedPrice.toFixed(2)}</strong> · verificato {clock(p.combined.verifiedAtUtc)}</p>
      <p>Prodotto diagnostico delle quote: {p.combined.diagnosticOddsProduct.toFixed(2)}. Non è un’offerta del bookmaker.</p>
      <p>Probabilità congiunta: non stimata. Limiti Fréchet: {p.combined.jointProbabilityBounds.map(percent).join(' – ')}.</p>
      <p>Sensibilità alle marginali: {p.combined.jointSensitivityEnvelope.map(percent).join(' – ')}; non è un intervallo congiunto di confidenza.</p>
      <p>EV della combinazione, intervallo condizionato: {p.combined.expectedNetPerUnitBounds.map(percent).join(' – ')}.</p>
      <p>Stake nominale per simulazione: {p.nominalStakeEUR} €. Nessun rendimento o valore congiunto statisticamente validato.</p></section>}
    <details><summary>Audit e motivazioni</summary><ul>{Object.entries(p.exclusions).map(([reason,count])=><li key={reason}>{reasonLabel(reason)}: {count}</li>)}</ul>
      <p>Modello {p.model.version}; cutoff {clock(p.model.trainingCutoffUtc)}; forecast {clock(p.model.forecastGeneratedAtUtc)}.</p>
      <ol>{p.phases.map(s=><li key={s.step}>{s.step}: {s.state.replaceAll('_',' ')}</li>)}</ol>
      <p>SHA256 verifica integrità del file, non l’autenticità delle fonti o la validità statistica.</p>
      <pre>{JSON.stringify({snapshot:envelope.sha256,source:p.source,model:p.model},null,2)}</pre></details>
  </article>;
}
