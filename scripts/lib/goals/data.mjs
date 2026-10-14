import { createHash } from 'node:crypto';
export const SOURCE_COMMIT = 'e6744429ee395bc86f247348c6184bb08d4eb361';
export const sha256 = text => createHash('sha256').update(text).digest('hex');
const aliases = {
  'Inter': 'FC Internazionale Milano', 'Inter Milano': 'FC Internazionale Milano',
  'Juventus': 'Juventus FC', 'Juventus Turin': 'Juventus FC',
  'Atalanta': 'Atalanta BC', 'Hellas Verona': 'Hellas Verona FC',
  'Bologna FC': 'Bologna FC 1909', 'SS Lazio': 'Lazio Roma', 'Lazio Rome': 'Lazio Roma',
  'Parma FC': 'Parma Calcio 1913', 'Parma Calcio': 'Parma Calcio 1913',
  'Sassuolo Calcio': 'US Sassuolo Calcio', 'Sampdoria': 'UC Sampdoria',
};
export const canonicalTeam = name => aliases[name] ?? name;
export function normalizeSeason(input, season, cutoffUtc) {
  const expected = `Italian Serie A ${season.slice(0, 4)}/${season.slice(5)}`;
  if (input.name !== expected || !Array.isArray(input.matches) || !Number.isFinite(Date.parse(cutoffUtc))) throw new Error('Invalid competition/season/cutoff');
  const rows = [], skipped = [], seen = new Map();
  for (const m of input.matches) {
    if (typeof m.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(m.date)
        || !Number.isFinite(Date.parse(m.date)) || new Date(m.date).toISOString().slice(0,10) !== m.date
        || m.date < `${season.slice(0,4)}-07-01` || m.date >= `${Number(season.slice(0,4))+1}-${season === '2019-20' ? '09-01' : '07-01'}`
        || typeof m.team1 !== 'string' || !m.team1.trim() || typeof m.team2 !== 'string' || !m.team2.trim()) throw new Error('Invalid fixture identity/date');
    const home = canonicalTeam(m.team1), away = canonicalTeam(m.team2), key = `${season}:${home}:${away}`;
    if (home === away) throw new Error('Same team');
    const score = Array.isArray(m.score) ? m.score : m.score?.ft;
    const availableAtUtc = new Date(Date.parse(m.date) + 48*3600000).toISOString();
    if (!score) { skipped.push({key, reason:'missing_result'}); continue; }
    if (!Array.isArray(score) || score.length !== 2 || score.some(g => !Number.isInteger(g) || g < 0 || g > 30)) throw new Error('Invalid goals');
    const row = { key, season, date:m.date, home, away, goals:score, availableAtUtc };
    if (seen.has(key)) { if (JSON.stringify(row) !== JSON.stringify(seen.get(key))) throw new Error('Conflicting duplicate fixture'); continue; }
    seen.set(key,row);
    if (Date.parse(availableAtUtc) >= Date.parse(cutoffUtc)) { skipped.push({key, reason:'result_not_available_at_cutoff'}); continue; }
    rows.push(row);
  }
  return {rows:rows.sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key)),
    audit:{season, fixtures:input.matches.length, results:rows.length, skipped}};
}
export function trainingBefore(rows, cutoffUtc) {
  const end = Date.parse(cutoffUtc), start = end - 4*365.25*86400000;
  if (!Number.isFinite(end)) throw new Error('Invalid training cutoff');
  return rows.filter(r => Date.parse(r.availableAtUtc) < end && Date.parse(r.date) >= start);
}
