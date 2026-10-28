# G10 — international reference fast track

Percorso nuovo e separato dal selettore 1X2, dalla policy sintetica M3-B e dal
freeze G8. Non attiva una policy prospettica né produce decisioni ammissibili.
Le evidenze, il calendario completo e il pacchetto da approvare restano privati
sotto `.local/preparation/g10-fast-track-20261028/`.

## Collegamento implementato

1. `reference-odds/moviodds-offline.mjs` verifica RAW, eventuale gzip, ricevuta,
   timestamp precisi del provider, gruppo/submercato, esiti e sospensioni.
   Una proiezione calendario separata non consulta i campi delle quote; il RAW
   pubblico può contenerli comunque e questa distinzione è dichiarata.
2. `reference-odds/exploratory.mjs` riconcilia il manifest autorevole completo e
   le associazioni **esplicite** dei nomi/ID MoviOdds. Riutilizza il validatore
   CC0 del calendario, le proiezioni delle griglie congelate M2, le finestre
   progressive registrate e i limiti di Fréchet esistenti.
3. Il rapporto espone probabilità DC, comparatore bivariato, intervalli marginali
   bootstrap ed EV marginali descrittivi. Genera sottoinsiemi deterministici di
   2–4 selezioni con fixture e squadre distinte, senza ordinamento economico.
4. `reference-round.mjs` prepara/controlla un archivio di giornata v2 isolato e
   può chiamare i **due freezer originali** solo dopo una successiva approvazione
   esatta e un preflight temporale/evidenziale positivo.
5. `reference-exploration.mjs` rilegge e verifica quell'archivio, ricostruisce i
   board dai RAW al clock reale e richiede una distinta autorizzazione allo slot.
   Stampa un rapporto; non persiste decisioni, non pubblica e non consegna.

Il reader M4-A e il contratto `ROUND_ARCHIVE_V1` restano invariati. L'estensione
v2 usa gli stessi validatori scientifici, ma un calendario con ID MoviOdds nativi:
non converte questi ID in falsi ID OddsPapi. Le fonti CC0 e Lega e il riscontro
MoviOdds restano distinti, con ricevute e hash verificabili localmente.

## Contratti

| Schema | Ruolo |
|---|---|
| `lamultipla-international-reference-boards-v1` | Prezzi internazionali osservati, completezza e disponibilità distinte |
| `lamultipla-movi-round-bindings-v1` | Associazione verificabile di dieci fixture del manifest al provider |
| `lamultipla-international-exploration-v1` | Diagnostica e combinazioni, senza ammissibilità |
| `lamultipla-reference-round-package-v2` | Manifest, coorte, studi, dati e codice fissati tramite riferimenti byte |
| `lamultipla-reference-round-explicit-approval-v2` | Consenso futuro separato, non creato automaticamente |
| `lamultipla-reference-round-execution-evidence-v2` | Riconferme fresche Lega/CC0/MoviOdds, con timestamp reali |
| `lamultipla-reference-round-intent-v2` / `receipt-v2` | Intent prima dei freezer e ricevuta immutabile verificabile |
| `lamultipla-international-reference-approval-v1` | Autorizzazione separata a uno slot di sola diagnostica |

I riferimenti `{ref, sha256}` riguardano i byte; gli altri digest dichiarati
riguardano i payload JSON, secondo le funzioni esistenti. Hash locali non
certificano esternamente un'offerta del bookmaker.

## Confini e temporalità

- `INTERNATIONAL_REFERENCE` non equivale a `ITALIAN_TICKET_VERIFIED`.
  La seconda evidenza assente **non blocca** la shortlist internazionale, ma
  impedisce qualunque ammissione autentica: nessuna policy è attivata qui.
- BTTS Yes/No e O/U 2,5 fulltime sono le sole famiglie proiettate. Il censimento
  1X2 resta separato; nessun nuovo mercato è promosso al selettore.
- Due gruppi nativi concorrenti non vengono fusi o scelti in base al prezzo.
- Tutte le dieci fixture restano nel denominatore. Uno slot esplicito può
  considerare meno eventi; gli altri sono dichiarati non valutati. Una lacuna
  fuori slot resta visibile nella copertura della giornata.
- Quote massimo 30 minuti dall'osservazione, conferma del gruppo verificata
  separatamente. `changedAt` vecchio non implica da solo prezzo scaduto.
- Il calendario mantiene fonti indipendenti: Lega e CC0 entro 24 ore, identità
  provider entro 60 minuti. L'osservazione corrente dei prezzi comprende anche
  le identità delle fixture e non rinnova le due fonti indipendenti.
- Forecast massimo 24 ore **al momento della diagnostica**. Nessun timestamp
  viene rinnovato. Serve una finestra progressiva già aperta e ogni selezione
  deve precedere il proprio kickoff di oltre 150 minuti.
- Gli intervalli bootstrap sono marginali, non simultanei. Il punto centrale
  DC fuori dal proprio intervallo esclude il dato; nessun fallback bivariato.
- Fréchet inferiore zero resta zero. Probabilità congiunta puntuale e EV
  combinato verificato restano null. Il prodotto delle singole è soltanto
  `THEORETICAL_PRODUCT_NOT_AN_OFFERED_TICKET_PRICE`.
- I limiti 20.000 combinazioni/100.000 nodi sono budget di diagnostica;
  troncamento significa incompletezza, non NO BET globale. Nessuna soglia EV
  della policy M3-B è attivata per rendere ammissibile una combinazione.
- Contesto e regole italiane non osservati restano esplicitamente non verificati.
  Gli output non costituiscono istruzioni di gioco. Stake sempre zero.

## Freeze futuro: effetti da approvare

Il percorso originale non è un semplice caricamento di parametri: esegue il
fit protocollare e i bootstrap registrati. V1 esegue 41 fit; v2 ne esegue 83,
incluso il riferimento v1. Nessun fit su dati reali è eseguito in questa attività.
Il consenso futuro deve autorizzare esplicitamente questi calcoli congelati,
senza retuning, nuovi parametri o nuove fonti di risultati.

Per G10 il cutoff dell'intera giornata rimane **1 ottobre 2026 UTC**, derivato
dal mese del primo kickoff; non passa al 1 novembre per le gare successive.
La finestra originale è **31 ottobre, 09:00 ≤ Europe/Rome <12:30**.
Il completamento, non il solo avvio, deve avvenire entro la chiusura esclusiva.

Il writer usa lock Windows, pubblicazione esclusiva, intent e input immutabili.
Un recupero deve conservare gli stessi input ed essere ancora autorizzato e in
finestra. Un archivio completato viene soltanto verificato. Il verifier controlla
anche che la ricevuta non risulti pubblicata oltre la scadenza; spostamenti o
ripristini che ne cambino le evidenze locali richiedono revisione.

## Stato e verifiche

La demo di collegamento è interamente sintetica: adapter → universo → griglie
congelate di test → probabilità → 112 combinazioni → replay identico. Il caso
9/10 produce `ANALYSIS_INCOMPLETE`. Nessuna demo è un forecast G10 autentico.
I test comprendono prezzi stale, board mancanti/sospesi, identità, incertezza,
budget, finestre CET, consensi mancanti e junction reali del filesystem.
Verifica finale Windows: **36/36** dedicati MoviOdds/G10; **670/670** in serie
e **670/670** in parallelo, senza skip. Lint exit0 (un warning preesistente) e
build statica exit0. Replay G8 M2/M4 identico; replay MoviOdds storico identico.
Il guard blocca le connessioni esterne: ha registrato un lookup metadati Next
verso il registro npm durante la build, interamente bloccato; nessun tentativo
verso provider applicativi. Dipendenze invariate. Dettagli e
verifiche d'integrità sono registrati privatamente nel rapporto di consegna.

Originali scientifici, M1–M4-B versionati, policy 1X2, G8, Android, lock e
dipendenze non vengono modificati. Nessun push, deploy, API OddsPapi/PitchAPI,
nuovo forecast autentico, attivazione automatica o scommessa.
