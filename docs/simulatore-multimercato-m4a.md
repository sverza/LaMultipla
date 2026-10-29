# M4-A — Reader prospettico e contratti autentici read-only

Base: `8c5bea60a99f435641879a02d66e2f40bc45b71b`, branch
`feature/oddspapi-private-import`. Il termine prospettico descrive il formato dei
forecast congelati leggibili, **non** un'autorizzazione a generarli o usarli in
una decisione. Nessuna attivazione della policy M3-B, pilot o integrazione Android.

## Componenti

Tutti i file applicativi sono nuovi, esterni all'engine scientifico registrato.

| File | Responsabilità |
|---|---|
| `scripts/lib/mm-simulator-v1/read-session.mjs` | Controllo condiviso di percorso, letture con handle `r`, identità del file, hash byte, envelope, JSON senza chiavi duplicate e ricontrollo finale di tutti gli input |
| `scripts/lib/mm-simulator-v1/prospective-archive.mjs` | Coorti riconosciute, scope, contratti di archivio, autorizzazioni distinte per round, validatori scientifici e cronologia del freeze |
| `scripts/lib/mm-simulator-v1/prospective-reader.mjs` | Dispatch G8/futuri round, verifica dei registri e del codice, adapter M1, proiezioni M2, universo M3-C, legami di provenienza e verifier read-only |
| `scripts/multimarket-read.mjs` | CLI manuale autentica; solo `--input`, rapporto su stdout |
| `tests/fixtures/mm-reader.mjs` | Generatore esclusivamente sintetico per i test, separato dal codice applicativo; nessuna ricevuta autentica o forecast futuro reale |
| `tests/mm-prospective-reader.test.mjs` | Test deterministici, filesystem Windows, immutabilità e rifiuti |

Nessuna modifica ai precedenti reader, contratti M1/M2, moduli M3, store, lock,
selettore 1X2, engine, parametri o documenti dei protocolli registrati.

## Contratti versionati

| Schema | Contenuto e vincoli |
|---|---|
| `lamultipla-mm-prospective-reader-input-v1` | `scope:{cohortId,season,round}`, riferimento byte all'archivio/piano, riferimento byte all'input M1. `archive.kind` distingue `G8_REFERENCE_PLAN` da `ROUND_ARCHIVE_V1`; nessun flag di attivazione |
| `lamultipla-mm-frozen-round-index-v1` | Scope e tredici riferimenti ad artifact sigillati, presso il percorso esatto dell'archivio della giornata |
| `lamultipla-reference-round-freeze-approval-v1` | Contratto di lettura di un eventuale consenso già esistente: scope, hash proposta/registrazione coorte/manifest/dataset/studio, revisore, provenienza locale, inizio/scadenza e ambito freeze. M4-A non lo crea né lo approva |
| `lamultipla-reference-round-freeze-intent-v1` | Scope, UTC di avvio, binding e hash di tutti gli input scientifici e delle autorizzazioni |
| `lamultipla-reference-round-freeze-receipt-v1` | Intent, manifest, scope, completamento UTC, riferimenti e hash canonici dei journal v1/v2; nessuna quota o operazione economica nel freeze |
| `lamultipla-mm-authentic-linkage-v1` | Legame ispezionabile coorte → manifest → intent/ricevuta → studio/dataset → entry → grid/bootstrap → RAW/catalogo/report → board/quote → diagnostica M2. Il `sourceKind` distingue sempre autentico locale e test sintetico |
| `lamultipla-mm-prospective-reader-report-v1` | Contenuto stabile e suo hash, osservazione del reader separata, elenco dei riferimenti byte riletti e hash dell'intero rapporto |

L'indice contiene: `proposal`, `cohortApproval`, `roundApproval`, `manifest`,
`calendar`, `dataset`, `studyV1`, `registryDataset`, `studyV2`, `journalV1`,
`journalV2`, `intent`, `receipt`. Ogni riferimento è `{ref,sha256}`: SHA256 dei
**byte**. Gli envelope verificano separatamente il payload; i riferimenti delle
ricevute ai journal sono hash canonici dei payload, non hash del JSON formattato.

La catena conserva ID evento/mercato/outcome, periodo e linea, ID del bookmaker,
pointer RAW/catalogo/report, hash delle entry, configurazioni/temperature e hash
dei parametri, griglie e repliche per entrambi i modelli. Non genera EV o ranking.

## Riconoscimento scientifico e differenze rispetto alla G8

La allowlist autentica v1 riconosce soltanto `reference-g8-20261023-v1`, tramite
la proposta approvata con SHA256
`3d477e4f8c9b9ab5393514af3f8f711443787a3fe4396cc84695dbdb8b696d77`.
Le sue 60 giornate/600 eventi restano invariate. Uno scope deve appartenere a
`plannedRounds`, con dieci eventi: non basta nominare una stagione/giornata.
Una nuova coorte richiederà riconoscimento esplicito e revisione versionata;
il chiamante non può aggiungerla tramite un flag o una allowlist arbitraria.

Per la G8 si conserva integralmente **`loadFrozenReference`**: proposta/consenso,
calendario, cutoff, dataset originale, registri, codice/protocolli, v1/v2,
namespace, intent e ricevuta `FROZEN_VERIFIED`. Il nuovo reader aggiunge una
sessione di controllo dei percorsi e degli input prima/dopo quelle letture.
Non viene rimosso alcun controllo hardcoded nel percorso precedente.
Un indice nel nuovo namespace che pretenda di rappresentare nuovamente G8 viene
rifiutato: quella giornata conserva una sola autorità, quella originale.

Per un round successivo è previsto un archivio distinto:

```text
.local/research-review/cohorts/<cohortId>/rounds/<stagione-con-trattino>/round-NN/
  archive-index.json
  freeze-intent.json
  freeze-receipt.json
  .local/model/prospective/journals/<id-v1-registrato>.json
  .local/model-v2/journals/<id-v2-registrato>.json
```

Sono i percorsi prodotti dalle primitive originali quando applicate al root
isolato del round, non una richiesta di copiare journal nei percorsi G8.
L'indice e la ricevuta devono riferirsi agli stessi percorsi esatti. Spostare un
journal e cambiare soltanto il riferimento non supera il controllo.

**Registrazione della coorte e consenso al freeze di ogni round sono distinti.**
Il consenso del 23 ottobre per G8 non viene esteso a G9. Il nuovo contratto
richiede un'eventuale autorizzazione specifica al round, già registrata prima del
freeze e legata a manifest/dataset/studio esatti. I nuovi schemi sono soltanto
contratti di lettura: non esistono in M4-A writer o comandi per creare nuovi
consensi, indici autentici, freeze o ricevute scientifiche.

Il verificatore dei round successivi riusa i controlli reali di studio/journal,
calendario, fonte originale e finestra. Confronta l'identità del codice registrato
con lo stesso algoritmo canonico dei registry esistenti, su file letti in sicurezza.
La riproduzione v1 originale è verificata con il suo validatore effettivo.
Il cutoff mensile v2 e la conservazione del training originale prima del cutoff
iniziale derivano dal protocollo esistente, non da una policy economica nuova.

Le distribuzioni dei due modelli vengono verificate indipendentemente, incluse
convergenza/configurazione/temperatura, complementi, metadati e griglie bootstrap,
seed registrato e hash. Nessun fallback. Una riga prospettica con distribuzione
invalida o bootstrap insufficiente blocca il caricamento scientifico. Un'esclusione
già congelata e motivata resta visibile come esclusione, non viene ricostruita o
rimossa dal denominatore. Il solo dato mancante non diventa zero.

## Matrice di integrità e completezza

| Livello | Controlli / risultato |
|---|---|
| Scope e coorte | ID riconosciuto, proposta sigillata, stagione/giornata pianificate, consenso pertinente |
| Universo scientifico | Dieci fixture del manifest; entry presenti, assenti, duplicate o estranee; casa/trasferta/kickoff esatti; conteggi e hash coerenti |
| Forecast | Modello/studio/codice/protocollo/dataset e cutoff; tempi precedenti al completamento; distribuzioni e bootstrap verificabili |
| Universo prezzi | Riconciliazione M3-C con il manifest scientifico; fixture/board mancanti, inattesi, duplicati e identità incoerenti espliciti |
| Completezza board | M1: esattamente Yes/No oppure Over/Under della stessa linea 2,5 FT; nessun outcome aggiunto |
| Disponibilità | Quattro segnali provider M1, fail-closed. Un board completo può restare chiuso |
| Calcolabilità | Board proiettabili matematicamente separati dai board disponibili e pronti alla diagnosi marginale completa |
| Uso futuro | Sempre `NOT_AUTHORIZED`: nessuna eredità della policy sintetica o promozione operativa/scientifica |

`scientificCoverage.complete` descrive la corrispondenza manifest/record; i campi
`prospectiveFixtures` e `frozenExcludedFixtureIds` espongono separatamente le
previsioni e le esclusioni. `priceUniverseCoverage` mantiene i denominatori attesi
e le lacune M3-C. Nessun subset ridotto viene inferito come autorizzato.
Nel riepilogo prezzi `matchedFixtures` conta l'intersezione degli ID, non una
validazione da sola: identità discordanti restano in `identityMismatches` e
impediscono `complete:true` anche se tutti gli ID sono presenti.

I dati originali del provider sono verificati per byte e replay del normalizzatore
M1. **Non sono certificati esternamente**: gli hash locali non provano da soli
origine remota, disponibilità sul sito del bookmaker o UTC indipendente. Anche
una registrazione locale di consenso non è una firma esterna del revisore.
Il rapporto dichiara questi limiti e non è una credenziale di ammissione.

## Filesystem, replay e tempo

Reader e verifier riusano `assertReadNamespace`: root canonico, namespace `.local`,
componenti regolari e nessuna junction/symlink ammessa. I file del codice pubblico
sono un insieme esplicito separato, non percorsi scelti dall'input. Ogni handle è
aperto `r`; inode/device, dimensioni, mtime, percorso e hash vengono ricontrollati.
Gli input sono riletti prima di restituire il rapporto. Nessun lock, mkdir, cache,
checkpoint o recovery viene creato dal reader. Un archivio parziale è rifiutato,
non riparato. I test confrontano file e timestamp prima/dopo anche nei rifiuti.

Non è una difesa contro la sostituzione malevola dell'intero PC e di tutte le sue
radici di fiducia. Le garanzie sono di integrità locale verificabile e coerenza
degli artifact riconosciuti, senza dichiarazioni di certificazione esterna.

Sono distinti cutoff, generazione forecast, completamento freeze, osservazione
quote, ultimo cambiamento prezzo ed esecuzione reale del reader. Le età sono
descrittive rispetto ai riferimenti esistenti di 24h/30min: anche quando rientrano
in tali limiti non autorizzano una decisione. `changedAt` non è osservazione o
prova di sincronizzazione. Prezzo attuale sempre null.

L'hash `contentSha256` è riproducibile e non contiene l'ora della consultazione.
`reportSha256` include invece anche l'ispezione effettiva. Nei test futuri il
tempo simulato è un campo separato dall'UTC reale del reader; il risultato resta
`SYNTHETIC_ARCHIVE_STRUCTURE_VERIFIED`, mai un freeze autentico.

`verifyProspectiveDiagnostic` rilegge gli stessi input e verifica contenuto,
fonti, hash, flag di sicurezza e coerenza dell'ispezione. Non rinnova scadenze,
non rigenera probabilità e non persiste decisioni. G8 letta oggi rimane storica.

## Consultazione e prove

Unico comando applicativo, su un input privato esplicitamente predisposto:

```powershell
Set-Location C:\LaMultipla
node scripts/multimarket-read.mjs --input .local/diagnostics/mm-m4a-reader-20261027/g8-input.private.json
```

Il comando mostra esclusivamente l'archivio G8 già congelato. Non accetta opzioni
clock/as-of, synthetic, acquisizione, freeze, composizione o scrittura output.
Non è il comando per eseguire una giornata futura. Il sandbox ha un entry point
separato, richiede sorgenti/identità/namespace esplicitamente sintetici e non è
raggiungibile tramite la CLI autentica cambiando un flag.

Evidenze private in `.local/diagnostics/mm-m4a-reader-20261027/`:
`g8-complete.private.json`, `synthetic-future.private.json`, `demo-summary.private.json`,
log dei test e baseline di integrità. Nessun payload privato va nel commit.

La demo sintetica G9 ha 10 fixture, 20 board completi/aperti e 40 selezioni.
La seconda lettura conserva contenuto e timestamp di file/directory.
La G8 autentica ha 10 fixture scientifiche, 20 board completi, uno disponibile,
20 proiettabili e 40 selezioni; le 80 probabilità dei due modelli restano identiche
al rapporto M2 originale. La diagnostica M2 conserva SHA256
`f7e193ce526c102d3d1b72391298c2b2e6723c19f815a12e3827722512ffd075`.
Le quote G8 sono `EXPIRED_FOR_OPERATIONAL_USE`, senza nuovo screening.
Anche l'autorità sintetica M3-C precedente resta verificata con i suoi hash.
La disponibilità qui è quella dei flag nello snapshot storico, non un'offerta
attuale verificata sul sito del bookmaker.

## Limiti delle prove e prerequisiti successivi

La prima preparazione dei test ha evidenziato errori del generatore sintetico
(intervallo UTC omesso, poi elenco quote di nove ID dove il vecchio report richiede
dieci ID). Sono stati corretti nel solo helper; i validatori produttivi non sono
stati attenuati. Le lacune dei prezzi restano confrontate contro le dieci fixture
scientifiche, senza inventare la decima risposta.

L'account Windows restituisce `EPERM` creando symlink a file. Non sono stati
cambiati privilegi o impostazioni: le prove Windows usano junction reali,
concatenate, verso destinazioni esterne e collocate anche al posto di un file.
Esercitano la medesima condizione `isSymbolicLink`/percorso reale non ammesso.
Il ramo POSIX dei test usa symlink a file, ma non viene dichiarato eseguito su
questo PC. Nessuna assertion saltata, nessun mock filesystem al loro posto.

## Esito delle verifiche del 27 ottobre 2026

| Verifica finale | Esito |
|---|---|
| Test M4-A dedicati | **28/28**, incluse sorgenti scientifiche sconosciute, modelli extra e unica autorità G8 |
| Regressione completa seriale | **601/601**, 358,96s; `full-suite-serial-contract.private.log` |
| Regressione completa parallela | **601/601**, 103,23s; `full-suite-parallel.private.log` |
| Lint finale | Exit 0; solo warning preesistente `combinedPlayedOdd`, `app/components.tsx:9` |
| Build finale | Next.js/TypeScript/export statico completati, exit 0 |
| Integrità | **5.979/5.979** file preesistenti invariati per hash byte, dimensione e mtime; nessuna modifica consentita/necessaria agli originali |
| Replay | G8 verificata tramite reader/verifier; payload M2 identico. Demo futura sintetica con contenuto e file/mtime identici al replay |

La baseline passa da 573 a 601 test per i 28 casi aggiunti. Nessun test
preesistente modificato o disabilitato; nessuno skip o failure nelle due suite
finali. Windows x64, Node v24.19.0. I test multiprocesso esistenti mantengono
sei processi/600 tentativi e zero sovrapposizioni delle sezioni critiche; sono
conservati i due BUSY controllati e il recupero serializzato.

Le esecuzioni seriali intermedie 600/600 e 601/601 sono conservate nei log di
sviluppo; non sostituiscono la suite finale dopo la chiusura del contratto. Il
gruppo di integrazione M1–M3-C è incluso integralmente nella regressione finale.
Le prime failure del generatore/test Windows descritte sopra restano nei log,
senza cancellazioni o aumento di timeout per ottenere un esito positivo.

Comandi effettivamente eseguiti dal root:

```powershell
node --test tests/mm-prospective-reader.test.mjs
node --test --test-concurrency=1 tests/*.test.mjs
node --test tests/*.test.mjs
node node_modules/eslint/bin/eslint.js app scripts tests next.config.ts capacitor.config.ts --ignore-pattern dist --ignore-pattern .next --ignore-pattern out --ignore-pattern android
$env:NEXT_TELEMETRY_DISABLED='1'
node node_modules/next/dist/bin/next build
```

Diff limitato a sette file nuovi: tre moduli, CLI, due file di test/fixture e
questo documento. I file locali non correlati sono preservati ed esclusi dal
commit. Nessun push o CI remota avviata; la PR esistente non viene modificata.

Prima di M4-B/pilot servono ancora: approvazione di un universo futuro e del
relativo freeze; produzione autentica degli artifact del nuovo contratto tramite
un percorso ufficiale separatamente autorizzato e collaudato; eventuale policy
prospettica distinta, review reali e quote fresche autorizzate; collegamento a un
compositore autentico con persistenza/budget/recovery propri. Non basta cambiare
`synthetic:false` nella policy M3-B. Il reader non acquisisce questi permessi.
Per il pilot occorrerà inoltre verificare ricevute/ledger dell'acquisizione quote
e legare il codice del reader al codice decisionale autorizzato: gli hash e il
replay locali dei file, da soli, non certificano l'osservazione remota dei prezzi.

Nessuna modifica al selettore 1X2 o ai contratti Android. Nessuna API, nuovo
forecast/refit/freeze, attivazione di coorte, pilot, decisione autentica, invio,
deploy, merge o push. Stake reale 0 €.

**M4-A COMPLETE — PROSPECTIVE READER READY**
