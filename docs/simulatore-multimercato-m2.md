# Simulatore multimercato v1 — Milestone 2

Diagnostica probabilistica **offline**, limitata a BTTS Sì/No e Over/Under2,5 nei tempi regolamentari. Nessun fit, refit, calibrazione, EV, ranking, probabilità congiunta, composizione, decisione di gioco o invio. Stake reale0 €.

## Moduli nuovi, senza modifiche a M1 o all'engine

| File | Responsabilità |
|---|---|
| `scripts/lib/mm-simulator-v1/probabilities.mjs` | Proiezioni pure dai grid congelati, intervalli descrittivi, binding esatto e diagnostica |
| `scripts/lib/mm-simulator-v1/probability-reader.mjs` | Caricamento locale con lettore ufficiale del freeze e input M1 sigillati |
| `scripts/lib/mm-simulator-v1/probability-report.mjs` | Markdown riproducibile dallo stesso payload JSON, senza mutazioni o rete |
| `scripts/multimarket-probabilities.mjs` | CLI di sola lettura: JSON o Markdown su stdout |
| `tests/mm-simulator-probabilities.test.mjs` | Test sintetici, verificatori reali, complementarità, mapping, anomalie e immutabilità |

Il codice resta fuori da `scripts/lib/engine/`. Non viene modificato alcun algoritmo registrato, contratto M1, selettore1X2, policy operativa, journal, approvazione o coorte.

## Lettura ufficiale del journal autentico

La CLI accetta soltanto un documento privato `lamultipla-mm-probability-input-v1`, con due riferimenti locali `{ref, sha256}`:

- `boardsInput`: il documento M1 che identifica RAW, catalogo, report e binding;
- `referencePlan`: il piano ufficiale già esistente.

I riferimenti si risolvono rispetto al file di input. Tutti i percorsi del caricamento M2 devono essere nel namespace privato `.local`, verificato mediante `privateInput` e percorso reale. La CLI non accetta percorsi diretti a un journal arbitrario né opzioni di acquisizione, freeze, clock/as-of o training.

Il lettore usa **`loadFrozenReference`**, senza chiamare funzioni di freeze o fit. Sono verificati ricevuta/intent esistenti, stato `FROZEN_VERIFIED`, namespace, proposta/approvazione, studi, codice/protocollo registrati, dataset originale, manifest e hash dei journal. La verifica storica dell'atto già compiuto non riapre una finestra scientifica né rende attuali le quote.

M2 confronta inoltre il digest del journal v2 effettivamente restituito con quello indicato dalla ricevuta verificata. I documenti di input vengono ricontrollati al termine della lettura; binding e riferimenti RAW/catalogo/report del board devono coincidere con il documento M1 verificato. Originali e namespace scientifici non sono scritti.

Il lettore ufficiale verifica anche i legami v1 necessari alla ricevuta della coorte: M2 non calcola o pubblica nuove probabilità v1. Il caricamento autentico attuale è quello della serie G8 supportata dal lettore ufficiale; altri protocolli richiederanno un percorso ufficiale corrispondente.

Le funzioni pure dei test sono distinte dal caricamento autentico: dichiarano sempre `STRUCTURAL_ONLY_NOT_A_FREEZE_ATTESTATION`. I test sintetici non ricevono una falsa attestazione `FROZEN_VERIFIED`. Il rapporto esterno del caricamento reale contiene invece l'evidenza del verificatore ufficiale.

## Identità e controlli conservati

M2 rigenera i board attraverso il loader M1, mantenendone tutti i controlli e gli hash. Non legge un JSON normalizzato non verificato come sostituto dei RAW.

Il collegamento quote/forecast richiede stessa stagione, giornata, fixture ID, casa/trasferta, kickoff, famiglia, periodo, linea ed esito. Le sole equivalenze fra nomi ammesse sono quelle della tabella esatta `canonicalTeam` già registrata; vengono conservati nomi di origine, nomi del journal e metodo di riconciliazione. Nessun fuzzy matching o inversione implicita.

Manifest e entry del journal devono corrispondere esattamente. Modelli DC e bivariato mantengono configurazione, temperatura, convergenza e identità del modello congelato. Uno stato entry escluso resta visibile e non diventa automaticamente prospettico/ammissibile.

Le quote devono essere state osservate dopo la generazione del forecast e, nel percorso reale, dopo il completamento verificato del freeze. Timestamp invalidi o contraddizioni M1 escludono il collegamento. Un prezzo G6/G7/G9 non viene associato al journal G8 per somiglianza di squadra.

L'ID fixture del journal corrente è quello riconciliato dal protocollo originale. Un eventuale altro fornitore richiederà una mappa esplicita verso tale identità: non si scambiano ID fra provider. Nessun secondo adapter è stato aggiunto.

## Probabilità e complementarità

Sono riutilizzate `settlementProbabilities` e le funzioni di quantile esistenti. Per ogni modello, dalla sua griglia congelata:

- BTTS Sì: celle con gol casa>0 e gol ospite>0; No: celle complementari;
- Over2,5: celle con somma gol>=3; Under2,5: somma gol<=2.

I due esiti di ogni famiglia sono proiettati separatamente dalla stessa griglia e ne viene controllata la somma. Tolleranza numerica dichiarata: **1e-8**, sia per la centrale sia per ogni replica utilizzata. Non si rinormalizzano grid anomali, non si applicano temperature nuove e non si ricalibrano probabilità.

Griglie assenti, non quadrate, negative, non finite o con massa/complementi incoerenti non producono probabilità. Le quattro probabilità sono indipendenti dal valore delle quote. DC e bivariato sono mostrati separatamente: nessuna scelta del modello migliore per partita, media o sostituzione automatica.

## Bootstrap congelato e intervalli descrittivi

Sono usate soltanto le repliche già memorizzate. Requisiti: almeno40 repliche dichiarate, metadati coerenti, numero memorizzato pari a repliche meno fallimenti, indicatore sufficiente positivo, fallimenti non oltre10% e almeno90% di campioni validi. Una griglia memorizzata ma invalida blocca l'intervallo; non viene nascosta come successo o ricostruita.

I quantili2,5/97,5 sono quelli del metodo esistente `floor(q*(n-1))` sugli ordinamenti delle probabilità bootstrap. Con40 campioni gli indici sono0 e38. Sono **intervalli marginali descrittivi**, non simultanei, non una garanzia di copertura prospettica o profitto.

I complementi sono verificati nelle probabilità centrali e in ogni replica. Gli estremi degli intervalli, calcolati separatamente con quantili discreti, non devono necessariamente essere complementari fra loro. Una centrale esterna all'intervallo è segnalata, senza allargarlo per includerla.

Se mancano bootstrap o metadati sufficienti, la probabilità centrale può restare disponibile ma `interval95` è null, con motivo esplicito. Dato mancante non diventa zero. Ogni modello riporta campioni dichiarati/memorizzati/validi, fallimenti, seed, errore massimo di complementarità, hash di grid e bootstrap.

## Stati e significato dell'output

I contratti M1 restano invariati. Vengono aggiunti:

- `lamultipla-mm-probability-diagnostic-v1`: payload puro, con board, record di quote realmente osservate, proiezioni per modello, esclusioni e provenienza;
- `lamultipla-mm-probability-report-v1`: rapporto del loader ufficiale, evidenze di freeze e riferimenti/hash degli input;
- `lamultipla-mm-probability-input-v1`: i due riferimenti privati sopra descritti.

Ogni payload ha un digest canonico escluso il proprio campo `canonicalSha256`. Gli hash byte dei file formattati, quando salvati, sono distinti. Il report non inserisce un nuovo timestamp di forecast: conserva quelli autentici e resta riproducibile. L'orario effettivo della prova diagnostica è registrato separatamente nelle evidenze private.

La proiezione M2 viene effettuata successivamente sul grid già congelato. Non viene retrodatata come una nuova analisi o registrazione prospettica per mercato. Il renderer controlla gli hash del rapporto e del payload prima di visualizzarli e non modifica gli oggetti ricevuti.

| Caso | Esito diagnostico |
|---|---|
| Board completo e OPEN | Probabilità e intervalli se forecast compatibile; ammissibilità scientifica non conferita |
| Board completo ma CLOSED/UNKNOWN | Probabilità consultabili se identità e timestamp validi; flag ed esclusioni M1 preservati |
| Board incompleto, con sola lacuna di copertura | Record soltanto degli esiti quotati; proiezioni del modello separate da prezzi mancanti; diagnostica parziale |
| Identità, prezzo o timestamp invalidi / outcome in conflitto | Collegamento escluso e probabilità attribuite alla quota null |
| Nessun forecast della stessa giornata | Nessuna associazione a un altro journal; motivi espliciti |
| Centrale valida, bootstrap insufficiente | Probabilità puntuale consultabile, intervallo null e diagnostica parziale |
| Tutto calcolabile | Validazione comunque `PROSPECTIVE_VALIDATION_PENDING`; nessuna selezione autorizzata |

Gli stati complessivi sono `COMPLETE_OFFLINE_DIAGNOSTIC`, `PARTIAL_DIAGNOSTIC` e `NO_COMPATIBLE_DIAGNOSTIC_INPUT`. COMPLETE descrive la consultazione forense: non significa quota disponibile, previsione validata o schedina pronta. Nessun caso viene trasformato in NO BET o MULTIPLA.

Per ogni record: identità e prezzo **STORICO — NON OFFERTA ATTUALE**, `currentPrice:null`, timestamp/provenienza, disponibilità, completezza, stato entry congelata, probabilità e intervalli separati, versioni/configurazioni, hash modello/studio/dataset/grid/repliche, motivi e limitazioni. Il digest dei parametri è quello dell'intero oggetto modello già congelato, non di un nuovo fit.

## Consultazione manuale

Input realmente predisposto per il journal autentico G8 e il relativo snapshot quote, nel nuovo namespace diagnostico:

```powershell
Set-Location C:\LaMultipla
node scripts/multimarket-probabilities.mjs --input .local/diagnostics/mm-simulator-m2-20261027/g8-input.private.json
node scripts/multimarket-probabilities.mjs --input .local/diagnostics/mm-simulator-m2-20261027/g8-input.private.json --markdown
```

La CLI legge e scrive soltanto su stdout; non crea ricevute scientifiche o file. Per conservare rapporti usare un nuovo percorso privato, senza sovrascrivere gli originali. Nessun risultato di partita successivo viene letto per scegliere i mercati; l'universo è quello dei20 board BTTS/O2,5 G8.

La prova reale ha abbinato10 eventi,20 board,40 selezioni e80 probabilità, su DC e bivariato con40 bootstrap ciascuno. I19 board chiusi rimangono tali:10 BTTS e9 O/U2,5; uno solo aveva i flag OPEN nell'osservazione originale. Non sono quote attuali.

Il rapporto autentico e i risultati numerici rimangono soltanto sotto `.local/diagnostics/mm-simulator-m2-20261027/`, fuori Git. Esempio matematico **sintetico**, usato dai test: P(BTTS Sì)=50%, No=50%, Over2,5=30%, Under2,5=70%. Non è una previsione reale.

## Test e limiti

I test dedicati coprono proiezioni esatte, complementi, quantili, griglie/repliche mancanti o invalide, incoerenza dei metadati, identità, periodi/linee e flag M1, quote duplicate, timestamp, disallineamento di giornate, indipendenza dai prezzi, hash, replay e rendering senza mutazioni. Il lettore reale rifiuta freeze assente o parziale; non viene sostituito da un mock positivo.

Verifiche effettive del 27 ottobre2026:

- 15 test M2 superati;35/35 insieme ai20 test M1, rieseguiti anche alla ripresa del lavoro.
- Suite completa parallela:513/513. Suite completa seriale:512/513, con il solo fallimento intermittente preesistente `final freeze is one per round across policies and concurrent writers; previews stay separate` in `tests/decision.test.mjs` (zero writer accettati invece di uno). Lo stesso test isolato è passato. Causa non determinata; componente e assert invariati, nessun test saltato e nessuna attenuazione dei controlli.
- Lint senza errori; resta il solo avviso preesistente su `combinedPlayedOdd` in `app/components.tsx`. Build Next.js superata. I controlli finali dei file nuovi non modificano questi componenti.
- Prova autentica tramite il lettore ufficiale:20 board,40 quote storiche e80 probabilità, ripetizione JSON identica e corrispondenza fra CLI e renderer Markdown. Il file di output non viene importato in alcun journal, screening o archivio Android.
- Rapporti privati di consultazione: `g8-report.private.json` e `g8-report.private.md` sotto `.local/diagnostics/mm-simulator-m2-20261027/`. Le versioni intermedie di sviluppo sono conservate separatamente, senza sovrascritture.
- Hash byte, dimensione e ultima modifica confrontati su5.726 file originali e di controllo: nessuna differenza, inclusi M1, modelli, studi, dati, journal, ricevute/approvazioni G8 e selettore1X2.

Nessuna validazione predittiva viene raggiunta con questa milestone: `validatedMarkets:[]` resta invariato. M2 non misura log-loss, Brier, calibrazione o redditività e non utilizza risultati successivi per retuning. L'eventuale instabilità del test concorrente preesistente viene annotata nelle evidenze, senza modificarne il componente o attenuarne gli assert.

Prima di M3 servono autorizzazione distinta e revisione della policy esplorativa: modello primario/criteri, gate contestuali e di liquidazione, budget di ricerca, una selezione per fixture, limiti di dipendenza e verifica del ticket reale. Non è stato implementato alcuno di questi componenti né avviata M3.
