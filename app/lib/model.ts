export type PickResult = 'pending' | 'won' | 'lost' | 'void';
export type SlipResult = PickResult | 'cashout';

export type OddStatus = 'unknown' | 'above-minimum' | 'below-minimum';

export type Pick = {
  id: string;
  match: string;
  market: string;
  /** Quota proposta dal modello. `odd` resta per retrocompatibilità con backup/feed v2. */
  odd: number;
  proposedOdd: number;
  playedOdd?: number;
  minimumOdd?: number;
  oddStatus: OddStatus;
  reasons: string[];
  closingOdd?: number;
  closingSource?: string;
  probability: number;
  confidence: number;
  result: PickResult;
};

export type Slip = {
  id: string;
  season: string;
  matchday: number;
  date: string;
  stake: 3;
  placement: 'draft' | 'played';
  playedOdd?: number;
  /** Maggiorazione/bonus effettivamente riconosciuto dal bookmaker, separato dalle quote. */
  bonusAmount?: number;
  result: SlipResult;
  returnAmount: number;
  notes?: string;
  picks: Pick[];
};

export type TrendPoint = {
  day: number;
  value: number;
  delta: number;
  result: SlipResult;
  slipId: string;
};

export const APP_VERSION = '1.1.0';
export const STAKE = 3 as const;
export const PICK_RESULTS: PickResult[] = ['pending', 'won', 'lost', 'void'];
export const FEED_URL = 'https://sverza.github.io/LaMultipla/latest-slip.json';
export const VERSION_URL = 'https://sverza.github.io/LaMultipla/app-version.json';

export const pickLabels: Record<PickResult, string> = {
  pending: 'In attesa',
  won: 'Vinta',
  lost: 'Persa',
  void: 'Nulla',
};

export const slipLabels: Record<SlipResult, string> = {
  ...pickLabels,
  cashout: 'Cash out',
};

export const symbols: Record<PickResult, string> = {
  pending: '—',
  won: '✓',
  lost: '×',
  void: '○',
};

export const euro = (value: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);

export const pct = (value: number) => `${value.toFixed(1).replace('.', ',')}%`;

export const formatDate = (date: string, long = false) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('it-IT', long
    ? { day: '2-digit', month: 'long', year: 'numeric' }
    : { day: '2-digit', month: 'short' });

export const isPlayed = (slip: Slip) => slip.placement === 'played';

export function normalizeSlip(raw: Partial<Slip>): Slip {
  const validPickResults = new Set<PickResult>(PICK_RESULTS);
  const validSlipResults = new Set<SlipResult>([...PICK_RESULTS, 'cashout']);
  const picks = Array.isArray(raw.picks) ? raw.picks.map((pick, index) => {
    const legacy = pick as Partial<Pick>;
    const proposedOdd = Number(legacy.proposedOdd ?? legacy.odd) || 1;
    const playedOdd = legacy.playedOdd && Number(legacy.playedOdd) > 1 ? Number(legacy.playedOdd) : undefined;
    const minimumOdd = legacy.minimumOdd && Number(legacy.minimumOdd) > 1 ? Number(legacy.minimumOdd) : undefined;
    const oddStatus: OddStatus = !playedOdd || !minimumOdd ? 'unknown' : playedOdd >= minimumOdd ? 'above-minimum' : 'below-minimum';
    return {
      id: legacy.id || String(raw.id || 'slip') + '-pick-' + index,
      match: String(legacy.match || ''),
      market: String(legacy.market || ''),
      odd: proposedOdd,
      proposedOdd,
      playedOdd,
      minimumOdd,
      oddStatus,
      reasons: Array.isArray(legacy.reasons) ? legacy.reasons.map(String).filter(Boolean) : [],
      closingOdd: legacy.closingOdd && Number(legacy.closingOdd) > 1 ? Number(legacy.closingOdd) : undefined,
      closingSource: legacy.closingSource ? String(legacy.closingSource) : undefined,
      probability: Number(legacy.probability) || 1,
      confidence: Math.min(5, Math.max(1, Number(legacy.confidence) || 1)),
      result: validPickResults.has(legacy.result as PickResult) ? legacy.result as PickResult : 'pending',
    };
  }) : [];

  return {
    id: String(raw.id || `${raw.season}-${raw.matchday}-${raw.date}`),
    season: String(raw.season || ''),
    matchday: Number(raw.matchday) || 1,
    date: String(raw.date || new Date().toISOString().slice(0, 10)),
    stake: STAKE,
    placement: raw.placement === 'draft' ? 'draft' : 'played',
    playedOdd: raw.playedOdd && raw.playedOdd > 1 ? Number(raw.playedOdd) : undefined,
    bonusAmount: Math.max(0, Number(raw.bonusAmount) || 0) || undefined,
    result: raw.result && validSlipResults.has(raw.result) ? raw.result : 'pending',
    returnAmount: Math.max(0, Number(raw.returnAmount) || 0),
    notes: String(raw.notes || ''),
    picks,
  };
}

export function parseSlip(raw: unknown): Slip {
  if (!raw || typeof raw !== 'object') throw new Error('Il JSON deve contenere un oggetto.');
  const source = raw as Record<string, unknown>;
  const selections = source.selections;
  if (!Array.isArray(selections) || selections.length < 1 || selections.length > 6) {
    throw new Error('Servono da 1 a 6 selezioni.');
  }

  const season = String(source.season || '');
  const date = String(source.date || '');
  const matchday = Number(source.matchday);
  if (!season || !/^\d{4}\/\d{2}$/.test(season) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Controlla stagione e data. La stagione deve essere come 2026/27.');
  }
  if (!Number.isInteger(matchday) || matchday < 1 || matchday > 38) {
    throw new Error('La giornata deve essere compresa tra 1 e 38.');
  }

  const picks = selections.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Selezione ${index + 1}: dati mancanti.`);
    const selection = item as Record<string, unknown>;
    const odd = Number(selection.odd);
    const probability = Number(selection.probability);
    const confidence = Number(selection.confidence);
    if (!selection.match || !selection.market || odd <= 1 || probability <= 0 || probability > 100) {
      throw new Error(`Selezione ${index + 1}: partita, mercato, quota o probabilità non validi.`);
    }
    if (!Number.isInteger(confidence) || confidence < 1 || confidence > 5) {
      throw new Error(`Selezione ${index + 1}: la fiducia deve essere da 1 a 5.`);
    }
    return {
      id: crypto.randomUUID(),
      match: String(selection.match),
      market: String(selection.market),
      odd,
      proposedOdd: odd,
      oddStatus: 'unknown' as OddStatus,
      reasons: [],
      probability,
      confidence,
      result: 'pending' as PickResult,
    };
  });

  return {
    id: `${season}-${matchday}-${date}`,
    season,
    matchday,
    date,
    stake: STAKE,
    placement: 'draft',
    result: 'pending',
    returnAmount: 0,
    notes: String(source.notes || ''),
    picks,
  };
}

export function proposedOdd(pick: Pick) {
  return pick.proposedOdd || pick.odd;
}

export function actualPickOdd(pick: Pick) {
  return pick.playedOdd && pick.playedOdd > 1 ? pick.playedOdd : proposedOdd(pick);
}

export function fairOdd(pick: Pick) {
  return pick.probability > 0 ? 100 / pick.probability : 0;
}

export function expectedValue(odd: number, probability: number) {
  return (odd * probability / 100 - 1) * 100;
}

export function proposedEV(pick: Pick) {
  return expectedValue(proposedOdd(pick), pick.probability);
}

export function playedEV(pick: Pick) {
  return expectedValue(actualPickOdd(pick), pick.probability);
}

export function closingLineValue(pick: Pick) {
  if (!pick.closingOdd || pick.closingOdd <= 1) return undefined;
  return (actualPickOdd(pick) / pick.closingOdd - 1) * 100;
}

export function combinedPlayedOdd(slip: Slip) {
  return slip.picks.reduce((total, pick) => total * actualPickOdd(pick), 1);
}

export function quotedOdd(slip: Slip) {
  return slip.playedOdd && slip.playedOdd > 1 ? slip.playedOdd : slip.placement === 'played' ? combinedPlayedOdd(slip) : slip.picks.reduce((total, pick) => total * proposedOdd(pick), 1);
}

export function effectiveOdd(slip: Slip) {
  const voidFactor = slip.picks
    .filter((pick) => pick.result === 'void')
    .reduce((total, pick) => total * actualPickOdd(pick), 1);
  return Math.max(1, quotedOdd(slip) / voidFactor);
}

export function inferSlipResult(slip: Slip): PickResult {
  if (slip.picks.some((pick) => pick.result === 'lost')) return 'lost';
  if (slip.picks.some((pick) => pick.result === 'pending')) return 'pending';
  if (slip.picks.every((pick) => pick.result === 'void')) return 'void';
  return 'won';
}

export function baseReturn(slip: Slip, result = inferSlipResult(slip)) {
  if (result === 'won') return +(slip.stake * effectiveOdd(slip)).toFixed(2);
  if (result === 'void') return slip.stake;
  return 0;
}

export function suggestedReturn(slip: Slip, result = inferSlipResult(slip)) {
  if (result === 'won') return +(baseReturn(slip, result) + (slip.bonusAmount || 0)).toFixed(2);
  if (result === 'void') return slip.stake;
  return 0;
}

export function marketGroup(raw: string) {
  const value = raw.trim().toUpperCase();
  if (/DRAW NO BET|\bDNB\b/.test(value)) return 'Draw no bet';
  if (/HANDICAP|AH[ +-]/.test(value)) return 'Handicap';
  if (/OVER|UNDER/.test(value)) return 'Over / Under';
  if (/NO GOL|GOAL|GOL|BTTS/.test(value)) return 'Gol / No Gol';
  if (/DOPPIA|\b1X\b|\bX2\b|\b12\b/.test(value)) return 'Doppia chance';
  if (/1X2|ESITO FINALE|^\s*[12X]\s*$/.test(value)) return '1X2';
  if (/COMBO|\+/.test(value)) return 'Combinata';
  return raw.trim() || 'Altro';
}

export function buildStats(slips: Slip[]) {
  const placed = slips.filter(isPlayed);
  const settled = placed.filter((slip) => slip.result !== 'pending');
  const decisive = settled.filter((slip) => slip.result === 'won' || slip.result === 'lost');
  const pending = placed.filter((slip) => slip.result === 'pending');
  const settledStake = settled.length * STAKE;
  const returns = settled.reduce((total, slip) => total + slip.returnAmount, 0);
  const profit = returns - settledStake;
  const picks = placed.flatMap((slip) => slip.picks);
  const settledPicks = picks.filter((pick) => pick.result === 'won' || pick.result === 'lost');
  const wonPicks = settledPicks.filter((pick) => pick.result === 'won').length;
  const wonCount = decisive.filter((slip) => slip.result === 'won').length;
  const lostCount = decisive.filter((slip) => slip.result === 'lost').length;
  const odds = placed.map(quotedOdd);
  const values = picks.map(proposedEV);
  const playedValues = picks.map(playedEV);
  const clvValues = picks.map(closingLineValue).filter((value): value is number => value !== undefined);
  const chronological = settled.slice().sort((a, b) => a.date.localeCompare(b.date) || a.matchday - b.matchday);
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const trend: TrendPoint[] = chronological.map((slip) => {
    const delta = slip.returnAmount - STAKE;
    cumulative += delta;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
    return { day: slip.matchday, value: cumulative, delta, result: slip.result, slipId: slip.id };
  });
  const recent = decisive.slice().sort((a, b) => b.date.localeCompare(a.date) || b.matchday - a.matchday);
  const streakResult = recent[0]?.result;
  const firstDifferent = recent.findIndex((slip) => slip.result !== streakResult);
  const streak = streakResult ? (firstDifferent === -1 ? recent.length : firstDifferent) : 0;

  return {
    stake: placed.length * STAKE,
    settledStake,
    atRisk: pending.length * STAKE,
    returns,
    profit,
    roi: settledStake ? profit / settledStake * 100 : 0,
    win: decisive.length ? wonCount / decisive.length * 100 : 0,
    hit: settledPicks.length ? wonPicks / settledPicks.length * 100 : 0,
    registered: placed.length,
    drafts: slips.length - placed.length,
    played: settled.length,
    pending: pending.length,
    wonCount,
    lostCount,
    wonPicks,
    lostPicks: settledPicks.length - wonPicks,
    totalPicks: picks.length,
    avgOdd: odds.length ? odds.reduce((total, odd) => total + odd, 0) / odds.length : 0,
    avgPicks: placed.length ? picks.length / placed.length : 0,
    avgValue: values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0,
    avgPlayedValue: playedValues.length ? playedValues.reduce((total, value) => total + value, 0) / playedValues.length : 0,
    avgClv: clvValues.length ? clvValues.reduce((total, value) => total + value, 0) / clvValues.length : undefined,
    clvSamples: clvValues.length,
    best: chronological.length ? Math.max(...chronological.map((slip) => slip.returnAmount - STAKE)) : 0,
    worst: chronological.length ? Math.min(...chronological.map((slip) => slip.returnAmount - STAKE)) : 0,
    maxDrawdown,
    trend,
    streak,
    streakResult,
  };
}

export function compareVersions(remote: string, local: string) {
  const a = remote.split('.').map(Number);
  const b = local.split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
