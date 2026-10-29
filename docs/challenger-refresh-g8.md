# Challenger di aggiornamento dati: prototipo separato G8

Stato: **implementato e testabile su sintetici; bloccato per dati osservati e forecast prospettici**. Nessun modello originale, studio, cutoff o journal è modificato. Nessuna superiorità predittiva è dimostrata.

## Identità e algoritmo

`scripts/lib/challenger-refresh/index.mjs` definisce `goals-v1-data-refresh-research-v1`: è un confronto sull'aggiornamento dei dati, non un nuovo algoritmo. Riusa `fitPoisson` originale con configurazione fissa half-life 365 giorni, ridge 5, rho −0,1, senza ricerca dei parametri. Sono mantenuti finestra di training di quattro anni, almeno 20 incontri per squadra, verifica di convergenza, 40 bootstrap per blocchi settimanali con seed fisso e massimo 10% di repliche non utilizzabili. Gli intervalli percentile sono marginali, non simultanei e non sono prova di calibrazione empirica.

L'identità comprende versione, piano, hash del dataset e hash del codice del prototipo e delle dipendenze di modello. Non cambia gli identificativi dei riferimenti v1/v2. Questo codice non effettua tuning sui risultati G6/G7 o G8.

## API e blocchi prima del fit

- `challengerDraft(plan)` produce una bozza `DRAFT_REQUIRES_APPROVAL`, con eventi futuri, cutoff esplicito e requisiti ancora da autorizzare. Non registra o attiva una coorte.
- `buildRefreshDataset({base,supplement,approval,plan})` costruisce in memoria un dataset misto separato. Non acquisisce dati, non salva file e non modifica input o training originale.
- `runSyntheticRefresh(input)` esegue esclusivamente una prova sintetica: qualsiasi input dichiarato osservato è rifiutato prima del fit. Non esiste una CLI di forecast reale del challenger.

Il dataset originale deve avere provenienza CC0, hash delle righe e snapshot e acquisizione entro il nuovo cutoff. La fonte supplementare deve avere un'approvazione esplicita per training e conservazione privata, identificativo della fonte ed evidenze contrattuali e dell'approvazione referenziate tramite hash. Queste evidenze devono essere verificate da chi prepara l'input: il prototipo non interpreta contratti e non trasforma un campo booleano in un diritto d'uso.

Servono **tutti i 20 risultati G6/G7**: 10 per giornata, con 20 squadre distinte per giornata, manifest riconciliato e hash coerente. Identità fixture, stagione, giornata, casa/trasferta e kickoff devono corrispondere esattamente. Sono ammessi soltanto FT regolamentari conclusi e verificati; tavolino, gare in corso, revisioni conflittuali, duplicati, risultati mancanti e identità ambigue bloccano il dataset. Non esiste fallback silenzioso alla sola base CC0.

Acquisizione, verifica e disponibilità devono precedere il cutoff dichiarato. Un'acquisizione del 21 ottobre non dimostra disponibilità al 1° ottobre. I risultati del target G8 sono esclusi per fixture e per coppia casa/trasferta nella stagione. Quote, prezzi e probabilità implicite sono rifiutati come input. Lo snapshot originale resta separato e il dataset misto non viene etichettato interamente CC0.

## Output sintetico e valutazione futura

La prova restituisce fit, baseline empirica/Poisson, griglie gol, probabilità 1X2, BTTS e totali 1,5/2,5/3,5, bootstrap, intervalli, esclusioni e legami hash. Le repliche fallite restano conteggiate, non sostituite. Un fit non convergente o una squadra con storico insufficiente non ottiene una previsione utilizzabile. Gli esiti sono sempre `eligibleForSelector:false`, stake reale zero e `NOT_EVALUATED_NO_CLAIM_OF_IMPROVEMENT`.

Per un uso prospettico reale occorrono, separatamente: fonte e diritti approvati, prova tecnica e riconciliazione dei 20 risultati, dataset sigillato, nuova coorte/protocollo approvati prima degli eventi eleggibili, autorizzazione al forecast e implementazione revisionata del percorso reale di freeze immutabile. Il runner sintetico non soddisfa questi passaggi. Non è una promessa di challenger pronto per G8.

Il confronto deve essere appaiato ai riferimenti sugli stessi eventi futuri e conservare anche esclusioni, fallimenti e challenger peggiori. G6/G7 usati per sviluppo o training non diventano test indipendenti. Il prototipo non promuove modelli né cambia governance o soglie. G8 non può essere usata per scegliere retroattivamente la configurazione di un suo forecast prospettico.

## Test riproducibili

`node --test tests/challenger-refresh.test.mjs` verifica costruzione deterministica, input immutabili, diritti e provenienza, tutti i 20 risultati, cutoff/leakage, duplicati/revisioni, esclusione dei dati bookmaker, identità/versione, rifiuto di forecast osservati e 40 bootstrap sintetici con intervalli. Non legge dataset o journal privati e non effettua richieste di rete.

Misura locale sintetica del 21 ottobre: 400 righe, 20 squadre, 10 target, fit centrale 23,9 ms; esecuzione completa separata con 40 bootstrap 1,23 s, picco RSS del processo 104,1 MiB. Le 10 voci superano i controlli di storia/incertezza; le eventuali repliche escluse per storico restano conteggiate per evento. Questa misura non rappresenta il tempo su quattro stagioni originali e non misura qualità predittiva o affidabilità della fonte. Report conservato privatamente, senza dati acquisiti.
