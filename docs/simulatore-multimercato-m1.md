# Simulatore multimercato v1 — Milestone 1

Stato: contratti e adapter **offline** implementati. Nessun compositore, forecast, EV, ranking, acquisizione, gate scientifico o invio. Il selettore 1X2 e i moduli registrati non sono modificati. Stake reale zero.

## Perimetro esatto

Il profilo OddsPapi `oddspapi-boards-v1` riconosce esclusivamente le identità già riscontrate nei cataloghi archiviati:

| Famiglia interna | ID mercato | Definizione richiesta | Linea RAW → interna | Esiti e ID |
|---|---|---|---|---|
| `BTTS` |104|Both Teams To Score / bothteamsscore / fulltime / non player|0 → null|104 Yes → YES;105 No → NO|
| `TOTAL_GOALS` |1010|Over Under Full Time / totals / fulltime / non player|2.5 →2.5|1010 Over → OVER;1011 Under → UNDER|

Sport10, torneo23, bookmaker **bet365.it**, mercato con due esiti nel catalogo. Non esistono alias fuzzy. O/U1,5 e3,5, altro periodo, bookmaker regionale o ID diverso non entrano implicitamente nella allowlist. I mercati osservati fuori profilo sono riportati in `excludedMarkets`, senza calcolarne probabilità.

## File e responsabilità

- `scripts/lib/mm-simulator-v1/contracts.mjs`: contratti versionati, validatori, hash byte/canonico, disponibilità neutrale e parsing JSON con rifiuto di chiavi duplicate.
- `scripts/lib/mm-simulator-v1/oddspapi.mjs`: unico adapter implementato; verifica degli input, ricostruzione del report mediante il normalizzatore esistente, riconciliazione e board.
- `scripts/multimarket-boards.mjs`: caricamento manuale di soli file locali, output JSON su stdout. Non scrive file e non ha comandi di rete o opzioni di esecuzione scientifica.
- `tests/mm-simulator-boards.test.mjs`: fixture interamente sintetiche, casi negativi, replay, immutabilità e CLI isolata.

Il nuovo codice è esterno a `scripts/lib/engine/`, senza modificarne l'identità registrata. `buildReport`, `fixturesArray`, `catalogArray` e i fingerprint già esistenti sono riutilizzati senza modifiche. La vecchia disponibilità del report è un dato diagnostico: non sostituisce il nuovo controllo rigoroso dei quattro flag.

## Contratti

### Input: `lamultipla-offline-boards-input-v1`

Un documento locale contiene:

- `source.providerId: oddspapi`, `source.bookmaker: bet365.it`;
- `source.raw`, `source.catalog`, `source.report`: ciascuno con `ref` locale e `sha256` dei **byte originali**;
- `bindings`: documento `lamultipla-event-bindings-v1`, competizione `ITA_SERIE_A`, stagione, giornata ed eventi attesi.

Ogni evento contiene `id` interno, `sourceEventId`, `sourceSeasonId`, `kickoffUtc`, `home` e `away`. Ogni squadra ha `id` interno, `sourceId` e nome originale esatto. Gli ID evento interni e del provider sono unici; squadre uguali o invertite non sono accettate. I binding sono espliciti, non dedotti dal nome o dalla posizione di un array.

I percorsi relativi si risolvono rispetto al documento di input; riferimenti URL o con query non sono ammessi. Nessuna credenziale deve comparire nel documento. La CLI non legge vault, account o ledger.

### Output: `lamultipla-market-boards-v1`

Il contratto è indipendente dai nomi dei flag OddsPapi:

- `event`: identità riconciliata; `family`, `period: REGULATION_FULL_TIME`, `line`;
- `observed`: esistenza effettiva del mercato nel RAW;
- `normalization`: VALID / INVALID e motivi;
- `completeness`: COMPLETE / INCOMPLETE / CONFLICT, esiti attesi, presenti e mancanti;
- `availability`: OPEN / CLOSED / UNKNOWN, con segnali neutrali `operatorEnabled`, `operatorUnsuspended`, `marketEnabled`, `outcomesEnabled`;
- `outcomes`: soltanto prezzi effettivamente osservati, etichetta canonica, prezzo valido o null, timestamp distinti, motivi e avvertenze;
- `provenance`: ID di origine e dell'operatore, JSON Pointer al RAW e al catalogo, linea e flag originali. Le particolarità OddsPapi restano qui;
- `source`: riferimenti/hash degli input, timestamp originale di acquisizione, tipo SYNTHETIC o ARCHIVED e modalità del report;
- `canonicalSha256`: fingerprint JSON dell'output escluso il campo hash stesso. Non è lo SHA256 dei byte di un futuro file formattato;
- `scientificEligibility` e `operationalEligibility`: sempre NOT_EVALUATED; `eligibleForOriginalSelector:false`; `appDeliveryAllowed:false`; richieste provider0 e stake reale0.

Un secondo adapter potrebbe produrre lo stesso contratto, ma deve prima documentare e verificare le equivalenze delle proprie identità e disponibilità. Non è stato implementato.

### Significato degli stati

La completezza riguarda esattamente le due identità attese; errori di catalogo restano comunque nella normalizzazione. Può esistere un board completo con mercato chiuso, oppure un board incompleto con flag positivi per le sole quote presenti. OPEN da solo non significa board utilizzabile.

`diagnosticInputReady` è true soltanto se il board è osservato, completo, normalizzato correttamente, con tutti i segnali positivi e nessuna esclusione. **Non significa quota attuale, mercato validato, verifica bet365 completata o selezione ammissibile.**

Gli esiti mancanti non sono aggiunti a `outcomes`; sono elencati soltanto in `completeness.missing`. Un prezzo invalido resta null con il valore originale nella provenienza. `sourceOutcomeIds` conserva anche gli ID RAW che non hanno una quotazione interpretabile.

## Disponibilità e tempo

OddsPapi richiede insieme bookmakerIsActive true, suspended false, marketActive true e active true per ogni selezione. Qualsiasi booleano mancante o di tipo errato resta sconosciuto; almeno un segnale negativo produce CLOSED. Una verifica manuale non può sovrascrivere questi segnali. Il vecchio selettore resta invariato.

Il timestamp di osservazione viene dal report archiviato, non dall'orologio attuale. Timestamp UTC mancanti, non validi o posteriori all'osservazione causano esclusioni. `bookmakerChangedAt:null` resta assenza esplicita di un timestamp opzionale. Il timestamp obbligatorio di cambiamento non viene inventato.

Un cambiamento anteriore di oltre24 ore genera un'avvertenza, **non** prova automaticamente che il prezzo fosse scaduto: changedAt non è observedAt. Ogni board è marcato ARCHIVED_OBSERVATION_ONLY e freshness NOT_EVALUATED. I gate futuri su freschezza attuale, forecast, contesto, liquidazione e ticket non appartengono a M1.

L'adapter verifica hash byte, fingerprint RAW/catalogo dichiarati dal report, replay delle selezioni normalizzate e universo dei binding. La mappa di fixture e la data del report rimangono evidenze archiviate: non certificano da sole una riconferma ufficiale o l'autenticità esterna dell'acquisizione. Il contratto lo dichiara con REFERENCED_ARCHIVE_NOT_EXTERNAL_ATTESTATION. Per questo un input M1 non abilita alcuna operazione scientifica.

## API locale e comando

Funzioni esportate dall'adapter:

- `describeCapabilities()` restituisce una copia del profilo;
- `verifySnapshotBinding({rawBytes,catalogBytes,reportBytes,source,bindings})` controlla gli input;
- `adaptOddsPapi(...)` produce i board senza mutare gli input;
- `verifyNormalizedSnapshot(snapshot,args)` verifica schema/hash e replay contro gli originali, anche se un output alterato è stato rihashato.

Esecuzione manuale, con un documento di input privato già preparato:

```powershell
Set-Location C:\LaMultipla
node scripts/multimarket-boards.mjs --input .local/diagnostics/mm-simulator-m1-20261027/S3-G9-input.private.json
```

Il file citato è stato realmente preparato per la regressione archivistica G9; non è un manifest prospettico. Non cambiare la data degli input per farli apparire freschi. Per una vista sintetica senza scritture:

```powershell
$mmBoards = node scripts/multimarket-boards.mjs --input .local/diagnostics/mm-simulator-m1-20261027/S3-G9-input.private.json | ConvertFrom-Json
$mmBoards.boards | Select-Object family, line, diagnosticInputReady, @{n='completezza';e={$_.completeness.state}}, @{n='flag';e={$_.availability.state}}
```

Nessun comando di acquisizione, screening o invio è stato aggiunto. Errori della CLI sono sanitizzati; i valori di credenziali eventualmente presenti in un input sbagliato non sono stampati dalla diagnostica di errore.

## Regressione storica

Tre RAW originali, rispettivi cataloghi e sei gruppi di10 fixture: G6/G7 osservati il9 e10 ottobre, G8/G9 osservati il23 ottobre. Totale120 board, ciascuno verificato anche con replay identico e confronto indipendente dei flag RAW. I report di reinterpretazione necessari per le giornate fuori dallo scope originario sono salvati esclusivamente nel namespace diagnostico nuovo, con la data di osservazione originale dichiarata come tale; non rappresentano nuove acquisizioni o decisioni prospettiche.

| Osservazione | Giornata | BTTS completi e OPEN | O/U2,5 completi e OPEN |
|---|---:|---:|---:|
| S1,9 ottobre |6|10/10|10/10|
| S1,9 ottobre |7|10/10|7/10|
| S2,10 ottobre |6|10/10|10/10|
| S2,10 ottobre |7|10/10|5/10|
| S3,23 ottobre |8|0/10|1/10|
| S3,23 ottobre |9|10/10|6/10|

In questi campioni tutti i board delle due famiglie sono presenti e completi. Le differenze di disponibilità coincidono con i flag originali; nessun esito è stato completato artificialmente. Non sono dati correnti né una prova di valore. Le avvertenze sui cambiamenti vecchi restano visibili separatamente.

Evidenze diagnostiche, log e controllo di integrità sono privati sotto `.local/diagnostics/mm-simulator-m1-20261027/`. Nessuna risposta o quota reale è inclusa nei test versionati.

## Verifiche del 27 ottobre 2026

- 20 test dedicati superati, con casi negativi deterministici e verifica della CLI senza alterazioni dei file di input.
- 120 board storici in sei gruppi G6–G9, confronto con i flag e prezzi RAW, ripetizione deterministica e prove private separate. Nessun provider contattato.
- Suite completa finale: **498/498**, con `node --test --test-concurrency=1 tests/*.test.mjs`. Il parallelismo tra file è disabilitato, non le prove concorrenti interne.
- Un'esecuzione completa precedente in parallelo ha registrato497/498: il test preesistente `final freeze is one per round across policies and concurrent writers; previews stay separate` ha osservato zero writer accettati invece di uno. Lo stesso test isolato e l'intera suite in serie sono passati; altre esecuzioni complete in parallelo erano passate. Causa intermittente non determinata, componente relativo invariato. Nessun controllo attenuato o test saltato per ottenere il risultato.
- Lint:0 errori; un avviso preesistente su `combinedPlayedOdd` in `app/components.tsx`, file non modificato. Build Next.js superata.
- Controllo prima/dopo di hash byte, dimensioni e date di modifica su5.721 file distinti: nessuna differenza. Inclusi originali scientifici, journal/ricevute G8, approvazioni e archivi provider già censiti.
- Nessuna modifica a file esistenti; cinque nuovi file M1. Nessuna API, decisione autentica, forecast, refit, acquisizione, consegna, deploy o attivazione automatica.

## Limiti e passo successivo

M1 non risolve la copertura mancante del provider e non sostituisce la validazione predittiva. Usa solo i due market ID verificati; un futuro cambiamento del catalogo produce un'esclusione, non un nuovo alias automatico. L'output non è un pacchetto Android v4.

La Milestone2 richiederà una nuova autorizzazione: lettura dei journal congelati, proiezioni e intervalli già previsti, verifiche di equivalenza e diagnostica probabilistica separata. Non è stata iniziata. Modello primario, soglie di composizione, policy prospettica, ticket e invio restano decisioni successive.
