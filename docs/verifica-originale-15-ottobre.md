# Valutazione originale G6 — 15 ottobre 2026

Procedura separata dalle revisioni shadow. Journal `2026-27-round-06-goals-v1-b630b78`, SHA256 `6500cb65e321568c033bfec90e90fee97b43b6fb489f07e9daf4b15adc3a9070`; baseline compatibile Inter–Parma SHA256 `199386b326542ab68d7f7f18c80ac1b691f9e335db40a9c00070f552076d9990`. Non rigenerare, ritoccare timestamp o sostituire questi file.

Verifica della fonte pubblica il 13 ottobre alle 19:01 UTC (21:01 Europe/Rome): commit `e6744429ee395bc86f247348c6184bb08d4eb361`, ultimo FT 20 settembre, otto risultati G6 mancanti secondo data+48h. Gli ultimi due non avevano ancora superato la soglia. [Fonte fissata](https://github.com/openfootball/football.json/blob/e6744429ee395bc86f247348c6184bb08d4eb361/2026-27/it.1.json). Download fresco non equivale a completezza.

1. Dal 15 ottobre Europe/Rome, inventario read-only e verifica degli hash originali, senza correggerli per ottenere corrispondenza.
2. Con il CLI prospettico esistente acquisire una **nuova** osservazione CC0: commit, licenza, hash, raccolta, righe utilizzabili e lacune. Non sovrascrivere osservazioni precedenti; non serve OddsPapi.
3. `node scripts/prospective-readiness.mjs --journal JOURNAL --results OSSERVAZIONE --baseline BASELINE`, con file privati reali dentro `.local`. Sono placeholder: localizzare prima i file. Controllo read-only di originali e baseline, revisioni rifiutate, settled/pending espliciti.
4. Valutare nella data prevista sul campione realmente osservato con il CLI già presente e output esclusivo nuovo. Mercato soltanto con baseline originale compatibile. Pending non successi/sconfitte: conservarne ID e motivi. Se tutti mancano, registrare zero settled e dieci pending, senza posticipare per ottenere un campione migliore.
5. Osservazioni/valutazioni successive versionate. Revisioni o rimozioni della fonte richiedono controllo; forecast e baseline non cambiano. Fonte alternativa soltanto dopo studio separato di provenienza temporale, diritti e protocollo.

La carenza impedisce scoring completo e rende parziali forma/storico aggiornati. Cutoff e assunzioni di disponibilità invariati: nessun dato imputato. Nessun trigger, promemoria automatico o valutazione privata reale eseguita durante questa implementazione.

## Preparazione effettiva sul PC — 13 ottobre

`C:\LaMultipla` verificato sul branch della PR2. File originali localizzati, envelope/hash e tutte le dieci entry verificati in sola lettura; baseline compatibile e legata all'entry Inter–Parma. Journal generato il10/10 alle06:22:04.963 UTC, cutoff 1 ottobre. Directory results/evaluations non ancora presenti: nessuna valutazione originale attestata oggi.

Un nuovo wrapper circoscritto evita i placeholder e registra anche un controllo incompleto:

```powershell
Set-Location C:\LaMultipla
node scripts/original-g6-check.mjs --inspect
# Eseguire soltanto dal 15 ottobre Europe/Rome:
node scripts/original-g6-check.mjs --record
```

`--inspect` è locale/read-only, verifica gli hash originali anche dopo la scadenza senza scoring. `--record` controlla la data reale prima di qualsiasi lettura/rete/scrittura: bloccato prima del14/10 22:00 UTC. Nessuna opzione CLI per simulare un'altra data. Il rifiuto è stato verificato sul PC il13, nessun intent G6 creato.

Dal15: intent esclusivo, acquisizione gratuita CC0 fissata a commit/licenza, copie esatte metadata/LICENSE/JSON, envelope osservazione e valutazione tramite **l'evaluator originale invariato**. Baseline solo quella compatibile fissata, hash byte dei due originali ricontrollati prima dello scoring; anomalie bloccano. Controllo in `.local/model/prospective/checks/<journalId>/<uuid>/check.json`, valutazione nel percorso prospettico usuale, link/hash fra gli output. Non sovrascrive né ricostruisce forecast, quote o baseline.

Se CC0 ancora privo di G6: zero settled/dieci pending, metriche sul campione effettivamente osservato, record della data. Se rete/licenza/parser falliscono: `CHECK_RECORDED_SOURCE_UNAVAILABLE`, pending per fonte indisponibile e **nessuna valutazione scientifica fittizia**. Verificare il record e il motivo; un crash lascia l'intent senza check completo, non attestazione di esecuzione riuscita. Nuova esecuzione produce nuova osservazione/controllo, non cancella la precedente. Copie parziali/intent conservati per audit.

Ora esiste riscontro ufficiale per tutte le dieci gare nel CU47 del13 ottobre, ma non è stato importato come CC0 o usato per scoring. [Ricognizione, termini e confine supplementare](fonti-risultati-seriea-2026-27.md). Mancante nella fonte originaria e inesistente in assoluto sono concetti diversi. L'eventuale valutazione supplementare richiede scelta metodologica separata e diritti verificati; il controllo originale del15 resta obbligatorio anche pending.
