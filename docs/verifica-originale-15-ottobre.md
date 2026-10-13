# Valutazione originale G6 — 15 ottobre 2026

Procedura separata dalle revisioni shadow. Journal `2026-27-round-06-goals-v1-b630b78`, SHA256 `6500cb65e321568c033bfec90e90fee97b43b6fb489f07e9daf4b15adc3a9070`; baseline compatibile Inter–Parma SHA256 `199386b326542ab68d7f7f18c80ac1b691f9e335db40a9c00070f552076d9990`. Non rigenerare, ritoccare timestamp o sostituire questi file.

Verifica della fonte pubblica il 13 ottobre alle 19:01 UTC (21:01 Europe/Rome): commit `e6744429ee395bc86f247348c6184bb08d4eb361`, ultimo FT 20 settembre, otto risultati G6 mancanti secondo data+48h. Gli ultimi due non avevano ancora superato la soglia. [Fonte fissata](https://github.com/openfootball/football.json/blob/e6744429ee395bc86f247348c6184bb08d4eb361/2026-27/it.1.json). Download fresco non equivale a completezza.

1. Dal 15 ottobre Europe/Rome, inventario read-only e verifica degli hash originali, senza correggerli per ottenere corrispondenza.
2. Con il CLI prospettico esistente acquisire una **nuova** osservazione CC0: commit, licenza, hash, raccolta, righe utilizzabili e lacune. Non sovrascrivere osservazioni precedenti; non serve OddsPapi.
3. `node scripts/prospective-readiness.mjs --journal JOURNAL --results OSSERVAZIONE --baseline BASELINE`, con file privati reali dentro `.local`. Sono placeholder: localizzare prima i file. Controllo read-only di originali e baseline, revisioni rifiutate, settled/pending espliciti.
4. Valutare nella data prevista sul campione realmente osservato con il CLI già presente e output esclusivo nuovo. Mercato soltanto con baseline originale compatibile. Pending non successi/sconfitte: conservarne ID e motivi. Se tutti mancano, registrare zero settled e dieci pending, senza posticipare per ottenere un campione migliore.
5. Osservazioni/valutazioni successive versionate. Revisioni o rimozioni della fonte richiedono controllo; forecast e baseline non cambiano. Fonte alternativa soltanto dopo studio separato di provenienza temporale, diritti e protocollo.

La carenza impedisce scoring completo e rende parziali forma/storico aggiornati. Cutoff e assunzioni di disponibilità invariati: nessun dato imputato. Nessun trigger, promemoria automatico o valutazione privata reale eseguita durante questa implementazione.
