'use client';

import { useMemo, useState } from 'react';
import {
  buildStats,
  effectiveOdd,
  euro,
  formatDate,
  inferSlipResult,
  isPlayed,
  marketGroup,
  pct,
  PICK_RESULTS,
  Pick,
  pickLabels,
  PickResult,
  quotedOdd,
  Slip,
  slipLabels,
  SlipResult,
  suggestedReturn,
  symbols,
  TrendPoint,
} from './lib/model';

export function Title({ title, meta, action }: { title: string; meta?: string; action?: () => void }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {action ? <button onClick={action}>Apri →</button> : <span>{meta}</span>}
    </div>
  );
}

export function CurrentSlipCard({ slip, onOpen, onImport }: {
  slip?: Slip;
  onOpen: () => void;
  onImport: () => void;
}) {
  if (!slip) {
    return (
      <section className="current-card current-empty">
        <div className="current-kicker"><span>GIORNATA ATTUALE</span><b>Da preparare</b></div>
        <h2>Nessuna schedina per questa stagione</h2>
        <p>Importa il JSON manualmente oppure attendi il prossimo aggiornamento da GitHub.</p>
        <button className="primary" onClick={onImport}>Importa schedina</button>
      </section>
    );
  }

  const resolved = slip.picks.filter((pick) => pick.result !== 'pending').length;
  const wins = slip.picks.filter((pick) => pick.result === 'won').length;
  const pending = slip.picks.length - resolved;
  const progress = resolved / slip.picks.length * 100;
  const state = !isPlayed(slip) ? 'Bozza da confermare' : slip.result === 'pending' ? 'In corso' : slipLabels[slip.result];
  const nextAction = !isPlayed(slip) ? 'Controlla e conferma' : slip.result === 'pending' ? 'Inserisci gli esiti' : 'Apri il riepilogo';

  return (
    <button className={`current-card current-${isPlayed(slip) ? slip.result : 'draft'}`} onClick={onOpen}>
      <div className="current-kicker"><span>GIORNATA ATTUALE · {slip.matchday}</span><b>{state}</b></div>
      <div className="current-main">
        <div>
          <small>{formatDate(slip.date, true)}</small>
          <strong>@ {quotedOdd(slip).toFixed(2)}</strong>
          <span>{slip.picks.length} selezioni · ritorno potenziale {euro(slip.stake * quotedOdd(slip))}</span>
        </div>
        <div className="current-progress" style={{ background: `conic-gradient(var(--lime) ${progress}%, #ffffff24 0)` }}>
          <span>{resolved}/{slip.picks.length}</span>
        </div>
      </div>
      {isPlayed(slip) && (
        <div className="current-results">
          <span><i className="status-dot won" />{wins} vinte</span>
          <span><i className="status-dot pending" />{pending} in attesa</span>
        </div>
      )}
      <div className="current-action"><span>{nextAction}</span><b>→</b></div>
    </button>
  );
}

export function SlipCard({ slip }: { slip: Slip }) {
  return (
    <div className={`slip ${isPlayed(slip) ? slip.result : 'draft'}`}>
      <span>
        <b>GIORNATA {slip.matchday}</b>
        <small>{slip.picks.length} selezioni · {formatDate(slip.date)}</small>
      </span>
      <strong>@ {quotedOdd(slip).toFixed(2)}</strong>
      <em className={isPlayed(slip) ? slip.result : 'draft'}>{isPlayed(slip) ? slipLabels[slip.result] : 'Bozza · non conteggiata'}</em>
    </div>
  );
}

export function SeasonMap({ slips, onOpen }: { slips: Slip[]; onOpen: (slip: Slip) => void }) {
  const byDay = new Map(slips.map((slip) => [slip.matchday, slip]));
  return (
    <div className="season-map-card">
      <div className="season-map">
        {Array.from({ length: 38 }, (_, index) => {
          const day = index + 1;
          const slip = byDay.get(day);
          const status = !slip ? 'empty' : !isPlayed(slip) ? 'draft' : slip.result;
          return (
            <button
              key={day}
              className={status}
              disabled={!slip}
              onClick={() => slip && onOpen(slip)}
              aria-label={slip ? `Giornata ${day}: ${status === 'draft' ? 'bozza' : slipLabels[slip.result]}` : `Giornata ${day}: non presente`}
            >
              {day}
            </button>
          );
        })}
      </div>
      <div className="map-legend">
        <span><i className="won" />Vinta</span>
        <span><i className="lost" />Persa</span>
        <span><i className="pending" />In corso</span>
        <span><i className="draft" />Bozza</span>
      </div>
    </div>
  );
}

export function TrendChart({ points, maxDrawdown, onOpen }: {
  points: TrendPoint[];
  maxDrawdown: number;
  onOpen: (id: string) => void;
}) {
  const [range, setRange] = useState<'5' | '10' | 'all'>('all');
  const [selected, setSelected] = useState<number | null>(null);
  if (!points.length) {
    return <div className="chart-empty"><span>⌁</span><b>Il grafico nascerà qui</b><small>Segna l’esito della prima schedina.</small></div>;
  }

  const count = range === 'all' ? points.length : Number(range);
  const visible = points.slice(-count);
  const baseline = visible[0].value - visible[0].delta;
  const values = [baseline, ...visible.map((point) => point.value), 0];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const valueRange = max - min || 6;
  const toX = (index: number) => 36 + index * (292 / Math.max(1, visible.length));
  const toY = (value: number) => 136 - (value - min) / valueRange * 96;
  const coordinates = [{ x: 36, y: toY(baseline) }, ...visible.map((point, index) => ({ x: toX(index + 1), y: toY(point.value) }))];
  const path = coordinates.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const selectedPoint = selected === null ? visible.at(-1)! : visible[selected];

  return (
    <div className="trend-wrap">
      <div className="chart-controls" aria-label="Intervallo del grafico">
        {([['5', '5'], ['10', '10'], ['all', 'Tutte']] as const).map(([value, label]) => (
          <button key={value} className={range === value ? 'active' : ''} onClick={() => { setRange(value); setSelected(null); }}>{label}</button>
        ))}
      </div>
      <div className="trend-card">
        <svg viewBox="0 0 360 172" role="img" aria-label="Profitto cumulativo per giornata">
          <title>Profitto cumulativo per giornata</title>
          <line x1="36" y1={toY(0)} x2="340" y2={toY(0)} className="zero-line" />
          <text x="5" y="18" className="axis-label">{euro(max)}</text>
          <text x="5" y="154" className="axis-label">{euro(min)}</text>
          <path d={path} className={visible.at(-1)!.value >= 0 ? 'trend-line positive-line' : 'trend-line negative-line'} />
          {coordinates.slice(1).map((coordinate, index) => (
            <g
              key={visible[index].slipId}
              className="chart-point"
              onClick={() => setSelected(index)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => event.key === 'Enter' && setSelected(index)}
            >
              <circle cx={coordinate.x} cy={coordinate.y} r={selected === index ? 7 : 5} className={visible[index].result === 'won' ? 'point-win' : visible[index].result === 'lost' ? 'point-loss' : 'point-neutral'} />
              <text x={coordinate.x} y="164" textAnchor="middle" className="day-label">G{visible[index].day}</text>
            </g>
          ))}
        </svg>
        <button className="trend-value" onClick={() => onOpen(selectedPoint.slipId)}>
          <small>G{selectedPoint.day} · {selectedPoint.delta >= 0 ? '+' : ''}{euro(selectedPoint.delta)}</small>
          <b className={selectedPoint.value >= 0 ? 'pos-text' : 'neg-text'}>{selectedPoint.value >= 0 ? '+' : ''}{euro(selectedPoint.value)}</b>
          <span>Apri giornata →</span>
        </button>
      </div>
      <div className="chart-insights">
        <span><small>Massimo</small><b>{euro(Math.max(...points.map((point) => point.value)))}</b></span>
        <span><small>Minimo</small><b>{euro(Math.min(...points.map((point) => point.value)))}</b></span>
        <span><small>Max discesa</small><b>{euro(maxDrawdown)}</b></span>
      </div>
    </div>
  );
}

export function Ring({ value, label, detail }: { value: number; label: string; detail: string }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className="ring-card">
      <div className="ring" style={{ background: `conic-gradient(var(--green) ${safe}%, var(--ring-track) 0)` }}><span>{pct(value)}</span></div>
      <div><small>WIN RATE</small><strong>{label}</strong><span>{detail}</span></div>
    </div>
  );
}

export function PlacementPanel({ slip, onToggle, onOdd }: {
  slip: Slip;
  onToggle: (odd?: number) => void;
  onOdd: (odd: number) => void;
}) {
  const suggested = slip.picks.reduce((total, pick) => total * pick.odd, 1);
  const [odd, setOdd] = useState(quotedOdd(slip).toFixed(2).replace('.', ','));
  const value = Number(odd.replace(',', '.'));
  const invalid = !Number.isFinite(value) || value <= 1;
  return (
    <div className={`placement-panel ${isPlayed(slip) ? 'played' : 'draft'}`}>
      <div className="placement-head">
        <span><small>{isPlayed(slip) ? 'SCHEDINA GIOCATA' : 'BOZZA NON CONTEGGIATA'}</small><strong>{isPlayed(slip) ? 'Stake attivo: 3 €' : 'Conferma dopo averla giocata'}</strong></span>
        <b>{isPlayed(slip) ? '✓' : '✦'}</b>
      </div>
      <label><span>Quota totale realmente giocata</span><small>Suggerita: {suggested.toFixed(2)}</small></label>
      <div className="odd-field"><span>@</span><input inputMode="decimal" value={odd} onChange={(event) => setOdd(event.target.value)} aria-invalid={invalid} /></div>
      {isPlayed(slip) ? (
        <div className="placement-actions">
          <button className="secondary" disabled={invalid} onClick={() => onOdd(value)}>Salva quota</button>
          <button className="link" onClick={() => onToggle()}>Riporta in bozza</button>
        </div>
      ) : <button className="primary wide" disabled={invalid} onClick={() => onToggle(value)}>Conferma come giocata</button>}
    </div>
  );
}

export function PickResultControl({ pick, disabled, onChange }: {
  pick: Pick;
  disabled: boolean;
  onChange: (result: PickResult) => void;
}) {
  const fair = 100 / pick.probability;
  const value = (pick.odd * pick.probability / 100 - 1) * 100;
  return (
    <article className={`pick-card ${pick.result} ${disabled ? 'disabled' : ''}`}>
      <div className="pick-main">
        <b>{symbols[pick.result]}</b>
        <span>
          <strong>{pick.match}</strong>
          <small>{pick.market} · quota {pick.odd.toFixed(2)}</small>
          <small>Equa {fair.toFixed(2)} · Value {value >= 0 ? '+' : ''}{pct(value)} · {'●'.repeat(pick.confidence)}{'○'.repeat(5 - pick.confidence)}</small>
        </span>
        <em>{pickLabels[pick.result]}</em>
      </div>
      <div className="pick-options" role="group" aria-label={`Esito ${pick.match}`}>
        {PICK_RESULTS.map((result) => (
          <button key={result} className={pick.result === result ? `active ${result}` : ''} disabled={disabled} onClick={() => onChange(result)}>{pickLabels[result]}</button>
        ))}
      </div>
    </article>
  );
}

export function Settlement({ slip, onSettle }: {
  slip: Slip;
  onSettle: (result: SlipResult, amount?: number) => void;
}) {
  const inferred = inferSlipResult(slip);
  const expected = suggestedReturn(slip, inferred === 'pending' ? 'won' : inferred);
  const [amount, setAmount] = useState(slip.result === 'pending' ? '' : String(slip.returnAmount).replace('.', ','));
  const parsed = amount.trim() === '' ? undefined : Number(amount.replace(',', '.'));
  const invalid = parsed !== undefined && (!Number.isFinite(parsed) || parsed < 0);
  const mismatch = inferred !== 'pending' && slip.result !== 'pending' && slip.result !== 'cashout' && inferred !== slip.result;
  const incomplete = inferred === 'pending' && slip.result !== 'pending' && slip.result !== 'cashout';
  const submit = (result: SlipResult) => {
    if (result === 'cashout' && parsed === undefined) return;
    onSettle(result, parsed);
  };

  return (
    <div className="settlement-card">
      <div className="settlement-title"><span><small>CHIUSURA MULTIPLA</small><strong>{slip.result === 'pending' ? 'Inserisci il risultato finale' : `Registrata: ${slipLabels[slip.result]}`}</strong></span><b className={slip.result}>{slip.result === 'pending' ? '…' : slipLabels[slip.result]}</b></div>
      {inferred !== 'pending' && (
        <div className={`result-suggestion ${mismatch ? 'warning' : ''}`}>
          <span><small>{mismatch ? 'ESITI NON COERENTI' : 'SUGGERIMENTO AUTOMATICO'}</small><strong>{slipLabels[inferred]} · ritorno {euro(suggestedReturn(slip, inferred))}</strong></span>
          <button onClick={() => onSettle(inferred, suggestedReturn(slip, inferred))}>Applica</button>
        </div>
      )}
      {incomplete && (
        <div className="result-suggestion warning">
          <span><small>ESITI INCOMPLETI</small><strong>La multipla è chiusa, ma alcune selezioni risultano ancora in attesa.</strong></span>
        </div>
      )}
      <label htmlFor="actual-return"><span>Ritorno effettivo</span><small>Totale accreditato da bet365</small></label>
      <div className="return-field"><span>€</span><input id="actual-return" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={expected.toFixed(2).replace('.', ',')} aria-invalid={invalid} /></div>
      <p>Le selezioni nulle vengono escluse dalla quota effettiva ({effectiveOdd(slip).toFixed(2)}). Inserisci manualmente l’importo per cash out, bonus o casi particolari.</p>
      <div className="settle four-results">
        <button disabled={invalid} onClick={() => submit('lost')}>Persa</button>
        <button disabled={invalid} onClick={() => submit('void')}>Nulla</button>
        <button disabled={invalid || parsed === undefined} onClick={() => submit('cashout')}>Cash out</button>
        <button disabled={invalid} className="primary" onClick={() => submit('won')}>Vinta</button>
      </div>
    </div>
  );
}

export function PerformanceBreakdown({ picks, matchdays }: { picks: Pick[]; matchdays: number }) {
  const closed = picks.filter((pick) => pick.result === 'won' || pick.result === 'lost');
  const summarize = (getLabel: (pick: Pick) => string) => {
    const map = new Map<string, { label: string; total: number; wins: number }>();
    closed.forEach((pick) => {
      const label = getLabel(pick);
      const row = map.get(label) || { label, total: 0, wins: 0 };
      row.total += 1;
      if (pick.result === 'won') row.wins += 1;
      map.set(label, row);
    });
    return [...map.values()].sort((a, b) => b.total - a.total || b.wins / b.total - a.wins / a.total);
  };
  const markets = summarize((pick) => marketGroup(pick.market));
  const confidence = summarize((pick) => `Fiducia ${pick.confidence}/5`).sort((a, b) => Number(b.label[8]) - Number(a.label[8]));
  return (
    <>
      <Title title="Cosa sta funzionando" meta={`${closed.length} selezioni chiuse`} />
      {!closed.length ? <div className="analysis-empty">Segna gli esiti per vedere il rendimento per mercato e fiducia.</div> : (
        <div className="breakdown">
          <div className="breakdown-card"><div className="breakdown-head"><strong>Per mercato</strong><small>Hit rate</small></div>{markets.map((row) => <AnalysisRow key={row.label} {...row} />)}</div>
          <div className="breakdown-card"><div className="breakdown-head"><strong>Per fiducia</strong><small>Hit rate</small></div>{confidence.map((row) => <AnalysisRow key={row.label} {...row} />)}</div>
          <p className="sample-note">{matchdays < 8 ? 'Dati ancora indicativi: diventano più affidabili dopo circa 8–10 giornate.' : `Basato su ${closed.length} selezioni concluse.`}</p>
        </div>
      )}
    </>
  );
}

function AnalysisRow({ label, wins, total }: { label: string; wins: number; total: number }) {
  const value = total ? wins / total * 100 : 0;
  return <div className="analysis-row"><div><span>{label}</span><small>{wins}/{total}</small><b>{pct(value)}</b></div><i><b style={{ width: `${value}%` }} /></i></div>;
}

export function Calibration({ picks }: { picks: Pick[] }) {
  const closed = picks.filter((pick) => pick.result === 'won' || pick.result === 'lost');
  if (!closed.length) return null;
  const rows = [5, 4, 3, 2, 1].map((confidence) => {
    const items = closed.filter((pick) => pick.confidence === confidence);
    const expected = items.length ? items.reduce((total, pick) => total + pick.probability, 0) / items.length : 0;
    const actual = items.length ? items.filter((pick) => pick.result === 'won').length / items.length * 100 : 0;
    return { confidence, expected, actual, total: items.length };
  }).filter((row) => row.total);
  return (
    <><Title title="Previsione vs realtà" meta="Calibrazione" /><div className="calibration-card">{rows.map((row) => (
      <div className="calibration-row" key={row.confidence}>
        <div><strong>Fiducia {row.confidence}/5</strong><small>{row.total} selezioni</small></div>
        <span><small>Stimata {pct(row.expected)}</small><i><b style={{ width: `${row.expected}%` }} /></i></span>
        <span><small>Reale {pct(row.actual)}</small><i className="actual"><b style={{ width: `${row.actual}%` }} /></i></span>
      </div>
    ))}</div></>
  );
}

export function SeasonComparison({ current, previous, previousSeason }: {
  current: ReturnType<typeof buildStats>;
  previous: ReturnType<typeof buildStats>;
  previousSeason: string;
}) {
  return (
    <div className="comparison-card">
      <div><small>CONFRONTO CON {previousSeason}</small><strong>{current.profit - previous.profit >= 0 ? '+' : ''}{euro(current.profit - previous.profit)} di profitto</strong></div>
      <span><small>ROI</small><b className={current.roi - previous.roi >= 0 ? 'pos-text' : 'neg-text'}>{current.roi - previous.roi >= 0 ? '+' : ''}{pct(current.roi - previous.roi)}</b></span>
      <span><small>Hit rate</small><b className={current.hit - previous.hit >= 0 ? 'pos-text' : 'neg-text'}>{current.hit - previous.hit >= 0 ? '+' : ''}{pct(current.hit - previous.hit)}</b></span>
    </div>
  );
}

export function RemoteSummary({ text }: { text: string }) {
  const data = useMemo(() => {
    try {
      const raw = JSON.parse(text) as Record<string, unknown>;
      return { matchday: String(raw.matchday || '—'), picks: Array.isArray(raw.selections) ? raw.selections as Record<string, unknown>[] : [] };
    } catch {
      return null;
    }
  }, [text]);
  if (!data) return <div className="analysis-empty">Anteprima non disponibile.</div>;
  return (
    <div className="remote-summary">
      <div><span><small>GIORNATA</small><b>{data.matchday}</b></span><span><small>SELEZIONI</small><b>{data.picks.length}</b></span></div>
      {data.picks.map((pick, index) => <p key={index}><b>{index + 1}</b><span><strong>{String(pick.match || '')}</strong><small>{String(pick.market || '')} · @{Number(pick.odd).toFixed(2)}</small></span></p>)}
    </div>
  );
}
