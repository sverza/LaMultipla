# LAMULTIPLA — M3-C INTEGRITY FIXES

Perimetro: quattro correzioni dell'audit integrato M1–M3-B, su base locale
`40d1bcc249d346b732abc3421b754383436845e3`. Nessun reader prospettico,
pilot, acquisizione o cambiamento della policy operativa.

## Riproduzione e correzioni

| Problema | Evidenza prima della correzione | Comportamento corretto |
|---|---|---|
| F1 — universo | Manifest verificato di 10 fixture, snapshot di 9 fixture/18 board: decisione sintetica positiva con `coverageGaps:0`. La verifica delle sole righe ricevute non vedeva le due righe assenti. | Riconciliazione con **tutte** le fixture del manifest scientifico già validato: fixture assenti/inattese, duplicati per fixture/famiglia, identità e scope discordanti. Il caso 9/10 espone la fixture mancante, due board mancanti e `ANALYSIS_INCOMPLETE`. |
| F2 — namespace | Un'autorità valida raggiunta tramite junction era accettata dal verifier ma rifiutata dal runner. | Entrambi passano dalla stessa `safeDirectory`, senza creazione nel verifier: percorso canonico, directory regolari, nessun link/junction nei componenti controllati; rifiuto anche di catene e attraversamenti. |
| F3 — tempo | Dopo crash su intent, un clock precedente agli input lasciava nuovi `input.json` e `preview.json` prima dell'arresto. | Preflight temporale prima di directory/lock/pubblicazioni; limite monotono derivato anche dagli artifact persistiti. Controllo ripetuto prima di ogni pubblicazione e dopo il relativo hook di test. Input/preview/claim già presenti non vengono riscritti. |
| F4 — diagnostica | Motivi contestuali per singola selezione persi nel riepilogo; comparatore assente non esplicito; board completo e chiuso etichettato anche incompleto. | Motivi distinti di input/gate, ordinati; comparatore `AVAILABLE`/`ABSENT`/`INVALID` e relativo riferimento modello; completezza strutturale separata dalla disponibilità. |

La nuova suite di regressione è stata scritta ed eseguita prima degli interventi:
i primi 10 test fallivano sul codice iniziale. Le riproduzioni usano i validatori
reali e fixture interamente sintetiche, senza sostituire il validatore del journal.
Le ulteriori verifiche portano la nuova suite a 18 test.

## Moduli e funzioni

- `scripts/lib/mm-simulator-v1/universe.mjs`: nuova funzione pura
  `reconcileUniverse`, con contratto `lamultipla-mm-universe-coverage-v1`.
- `probabilities.mjs`: `diagnoseProbabilityBoards` segnala l'universo parziale
  anche quando tutte le righe ricevute sono individualmente corrette.
- `composition.mjs`: `composeSyntheticExploration` propaga l'universo e le
  diagnostiche individuali; un mercato chiuso non implica incompletezza.
- `prototype-analysis.mjs`: `discoverPrototype` e `summarizePrototype`
  conservano copertura, gate e comparatore nella decisione finale.
- `temporal-preflight.mjs`: controllo temporale puro, che riusa finestre e limiti
  già registrati. Nessuna tolleranza nuova, nessuna soglia EV modificata.
- `prototype-store.mjs`: preflight prima degli effetti, limite monotono persistito,
  stesso controllo namespace in runner e verifier, recovery limitato e hash del
  codice aggiornato per includere i nuovi moduli.
- `tests/mm-integrity-m3c.test.mjs`: 18 regressioni deterministiche.
- `tests/mm-simulator-prototype.test.mjs`: rafforzata l'asserzione sul clock
  retrogrado iniziale: l'intera radice resta vuota, anziché verificare soltanto
  l'assenza della decisione.

## Contratti ed evoluzione esplicita

| Contratto | Compatibilità |
|---|---|
| Snapshot M1 | Invariato. I flag originali e l'assenza degli outcome sono conservati. |
| Diagnostica M2 v1 | Per universo completo resta identica, incluso l'hash canonico. Un universo carente aggiunge un oggetto di evidenza autonomamente versionato `universeCoverage` e forza `PARTIAL_DIAGNOSTIC`: estensione additiva documentata, nessuna riscrittura dei report precedenti. |
| Composizione pura | Nuovo output `lamultipla-mm-synthetic-composition-v2`, con diagnostiche aggiunte. Nessuna conversione silenziosa di output v1 persistiti. |
| Decisione sintetica | Nuovo output `lamultipla-mm-synthetic-prototype-decision-v2`. Le altre buste di persistenza mantengono i propri schemi e collegano per hash l'esatto payload v2. |
| Policy sintetica | Invariata: `mm-m3b-synthetic-v1`, SHA256 `0f06a78f1ea3f0be4bc1482a4131810cf896d150b2299a195ba4d57d9ceb9c29`. |
| Autorità M3-B precedenti | Nessuna migrazione o sovrascrittura. L'impronta del codice è vincolante: il codice M3-C rifiuta una vecchia autorità. Per verificarla si usa la versione originale con cui fu prodotta. Non si crea una seconda autorità per eludere il conflitto. |

La demo M3-B originale è stata verificata con una copia byte per byte delle
sorgenti iniziali; runner e verifier aggiornati l'hanno rifiutata per conflitto
del codice, senza modificare byte o timestamp di file/directory.
Il reader ufficiale M2 ha riletto il journal G8 autentico **senza forecast né
composizione**: risultato canonico identico al report archiviato,
SHA256 `71b03c3e824c301a9d34d6a37c41508e9b83fc62589468fa654f61df5296fbb9`.

## Semantica di copertura e diagnostica

`universeCoverage` espone separatamente fixture attese/ricevute/riconciliate,
board attesi/ricevuti, chiavi mancanti/duplicate, identità discordanti e scope.
`counts.coverageGaps` è un conteggio diagnostico aggregato delle lacune rilevate,
non il numero di partite mancanti; per denominatori e dettagli usare gli oggetti
dedicati. `boardCoverage` distingue completezza e normalizzazione;
`boardAvailability` distingue aperti, chiusi e sconosciuti.

Il manifest autorevole rimane quello verificato dai controlli scientifici M2.
La limitazione attuale a dieci fixture non viene generalizzata: un perimetro
ridotto non viene autorizzato implicitamente. Un futuro manifest ridotto richiede
un contratto e un'approvazione espliciti, fuori da M3-C.

`selectionDiagnostics` conserva motivi di input e gate, stato del gate e ID.
`exclusions` distingue `INPUT` da `SYNTHETIC_GATES`. Il comparatore viene descritto
per board, con identità del modello: `INVALID` significa proiezione o incertezza
non utilizzabile, non un giudizio sulla qualità predittiva. Non è mai fallback DC.
I motivi sono ordinati deterministicamente; nessun campo mancante viene inventato.

## Tempo, replay e recovery

Un'esecuzione nuova o parziale deve essere coerente con tutte le osservazioni
vincolanti e con il massimo timestamp simulato già persistito. Scadenza quote,
forecast, review, calendario e slot progressivo si applicano prima delle nuove
scritture. Kickoff e fine della finestra di review sono scadenze future legittime,
non timestamp di osservazioni da trattare come leakage.

Un replay già completo e verificato è sola lettura e non richiede che le quote
storiche siano ancora fresche. Non calcola una nuova decisione. Se esiste prova
di commit valida ma manca soltanto la ricevuta, è consentita esclusivamente la
ricevuta, anche dopo la finestra; clock invalido o precedente al commit viene
comunque rifiutato prima di scrivere. Senza prova di commit, un recupero scaduto
rimane bloccato. Gli slot di review non vengono azzerati.

I lock e le primitive di scrittura immutabile condivisi non sono stati modificati.
Restano verificati due `BUSY` senza effetti, mutua esclusione multiprocesso,
recupero serializzato e crash prima/dopo ogni fase critica.

## Demo e verifiche

Evidenze locali private nella cartella
`.local/diagnostics/mm-m3c-integrity-20261027/`:

- `regression-before.private.log`: riproduzioni iniziali fallite come atteso.
- `integration.private.log`: 95/95 test, inclusi i 77 precedenti e i 18 nuovi.
- `synthetic-demo.private.json`: ciclo completo, verifica e replay identici;
  file e timestamp delle directory invariati durante il replay.
- `compatibility.private.json`: verifica del vecchio codice e del report G8.
- `full-suite-serial.private.log`: **573/573**, 331,62 secondi.
- `full-suite-parallel.private.log`: **573/573**, 90,49 secondi.
- `lint.private.log`: exit 0; soltanto il warning preesistente su
  `combinedPlayedOdd` in `app/components.tsx:9`.
- `build.private.log`: Next.js/TypeScript/export statico completati, exit 0.
- `integrity-after.private.json`: 5.750 file precedenti confrontati per byte,
  dimensione e timestamp; 5.745 invariati, soltanto i cinque file preesistenti
  del diff autorizzato modificati, zero violazioni.

Nessun test saltato, disabilitato o ritentato fino al successo. La regressione
completa cresce da 555 a 573 test per i 18 nuovi casi; il gruppo di integrazione
da 77 a 95. Ambiente: Windows x64, Node v24.19.0. La suite Windows preesistente
mantiene 2.000 acquisizioni consecutive e 600 tentativi fra sei processi:
nessuna sovrapposizione nelle sezioni critiche. Nessun incremento di stress.

Comandi riproducibili, tutti eseguiti dal root del repository:

```powershell
node --test tests/mm-integrity-m3c.test.mjs tests/mm-simulator-boards.test.mjs tests/mm-simulator-probabilities.test.mjs tests/mm-simulator-composition.test.mjs tests/mm-simulator-prototype.test.mjs tests/lock-failfast-contract.test.mjs
node --test --test-concurrency=1 tests/*.test.mjs
node --test tests/*.test.mjs
node node_modules/eslint/bin/eslint.js app scripts tests next.config.ts capacitor.config.ts --ignore-pattern dist --ignore-pattern .next --ignore-pattern out --ignore-pattern android
$env:NEXT_TELEMETRY_DISABLED='1'
node node_modules/next/dist/bin/next build
```

La demo completa ha 10/10 fixture, 20 board completi, 4 aperti e 16 chiusi;
`SYNTHETIC_FINAL_VERIFIED` e decisione sintetica registrata. La demo carente ha
9/10 fixture e 18 board: due lacune, fixture assente esplicita e
`ANALYSIS_INCOMPLETE`, senza selezione finale. È solo una prova sintetica.

## Limiti e prossimo intervento

Non cambia la validazione scientifica: `validatedMarkets` non viene promosso,
nessuna probabilità congiunta puntuale, intervalli marginali non simultanei,
limite inferiore Fréchet zero conservato e prezzo reale non sostituito dal
prodotto delle quote. Tutti gli output sono sintetici/esplorativi, non approvati
operativamente, con stake reale zero.

Il prossimo reader prospettico richiede un incarico distinto: generalizzazione
del caricamento ufficiale e del manifest di giornata, verifiche autentiche di
freeze e provenienza, policy prospettica separata e approvata e test di rifiuto
degli input sintetici. Nessun pilot è avviato da queste correzioni.

Gli originali, G8, screening 0001, approvazioni, policy, selettore 1X2, lock
condiviso, archivio PitchAPI e contratti Android non sono stati modificati.
Nessuna API, acquisizione, nuovo forecast/refit, consegna o deploy. Nessun push:
la CI remota non viene avviata; la PR esistente non viene modificata. Eventuali
file locali non correlati vengono preservati e non inclusi nel commit.

**M3-C COMPLETE — INTEGRITY VERIFIED**
