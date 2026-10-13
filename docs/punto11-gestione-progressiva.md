# Punto 11 — gestione progressiva della giornata

Implementazione del 13 ottobre 2026, successiva a `970b6e7`. [Protocollo nuovo](protocollo-analisi-progressive-v1.md). Parametri, protocolli statistici e journal originali non sono migrati.

## Percorso e finestre

`windows-orchestrator.mjs --progressive-once CONFIG` esegue il gestore e poi il pump shadow, anche se config/calendario/analisi vengono rifiutati. `--config-sha256 HASH` vincola la configurazione; gli input aggiornati sono fissati nei singoli piani. Il vecchio XML non cambia implicitamente: `--analysis-once` rifiuta nuove giornate successive alla registrazione con `PROGRESSIVE_CONFIG_REQUIRED_FOR_FUTURE_ROUND`, prima dei producer, ma conserva il pump delle consegne già accodate. `--once` e l'ispezione restano disponibili. Per giornate nuove usare configurazione/runner progressivi, non attivare il task del piano singolo.

Il gestore osserva il calendario con il collector, riconcilia stagione, squadre e fixture con CC0 e manifest ufficialmente riconfermati, calcola i residui e prepara piani versionati. Conferme ufficiali ancora input privati verificati: CC0/provider non le inventano. Tutti i dieci ID restano l'identità della giornata; `screeningFixtureIds` identifica soltanto il sottoinsieme della rivalutazione. Una combinazione può attraversare più giorni.

Finestre dai kickoff UTC, apertura sei ore prima; nuovi producer e selezioni al congelamento richiedono 150 minuti, queue 135, scadenza del trasporto 120 rispetto alla prima selezione. Una proposta completa è finalizzata immediatamente. Il frame scade comunque entro decisione+30 minuti. Questi margini non sono SLA FCM né garanzia di prezzo: le quote devono essere ricontrollate.

Quote distanziate almeno sei ore per giornata; nuove evidenze possono riusare un report entro 30 minuti senza credenziale/richiesta provider. Calendario: cache di un'ora prima del tentativo, controllo di fondo ogni sei ore e verifica fresca per la chiusura. Tick di cinque minuti non significa richiesta provider. Ledger/riserva/lock condivisi. Un intento quote ambiguo blocca nuove quote; alla chiusura la giornata può terminare con l'incompletezza registrata, senza ripetere il tentativo.

## Persistenza e metodologia

`.local/orchestrator/rounds/AAAA-AA-round-NN/` conserva identità, tentativi numerati, piano, copie degli input, intenti/ricevute, forecast/report, decisioni/outcome e pacchetti di stato. Copie pubblicate atomicamente dopo il piano; ripresa ricostruibile dal piano. Storia contigua, hash, clock monotono e documento di protocollo controllati.

Il primo journal scientifico resta nel percorso prospettico originale, prima delle quote. Revisioni nel tentativo, `cohortEligible:false`, riferimento al primo journal; stesso cutoff mensile e algoritmo, nessun risultato target nel training. Evaluation/progressione scientifica rifiutano le revisioni. Tutti i tentativi sono conservati, senza scelta retrospettiva del migliore.

Se il primo forecast manca e il PC arriva tardi: `scientific-missing.json`, senza probabilità o journal retroattivo. Le nuove previsioni sono solo shadow; la lacuna non aumenta copertura/campione.

`shadow.mjs` resta unica autorità. NO BET provvisorio/insufficienza non occupano il finale. Proposta o chiusura NO BET occupano il finale esclusivo comune al percorso precedente. Recupero/outbox idempotente preservano l'identità. Una proposta congelata ma accodata troppo tardi resta archivio, senza nuova scadenza o sostituzione.

## Configurazione e task non attivati

Schema `lamultipla-progressive-manager-config-v1`: `studyFile`, `scheduleFiles`, opzionali `contextFile` oppure `contextEvidenceFile`, `assessmentFile`, `combinedPricesFile`, `maxLegs` 2–6. Tutto dentro `.local`. Fonti legate a hash/timestamp dell'osservazione provider, riferimenti Lega HTTPS e conferma entro 24 ore; provider entro un'ora. Divergenze, nuovi ID e rinvii incerti richiedono revisione.

La configurazione stabilisce le giornate riconfermate ammesse. Per una giornata nuova aggiungere il suo manifest verificato: non è implementato scraping/riconferma automatica dei PDF Lega. Piani e residui delle giornate ammesse sono gestiti automaticamente.

`prepare-windows-task.mjs --progressive-config CONFIG` prepara un nuovo XML disabilitato, pin config, login/tick cinque minuti, privilegi ordinari, limite dieci minuti. Validatore `-TaskKind Progressive`, solo TASK_VALIDATE_ONLY. Nessun task preparato nel checkout principale, registrato o attivato in questa fase.

## Android e compatibilità

Proposte ancora v4, leggibili dall'APK precedente, stake reale zero. Nuovo `lamultipla-app-round-state-v1`: aggiornamenti senza fingere forecast/report, provvisorio, insufficienza, incompletezza o NO BET definitivo. Pacchetto per outcome, non per verifica tecnica. Aggiornamenti provvisori silenziosi; notifica decisiva per proposta/chiusura. Archivio, firma, catena e ACK esistenti.

Capacità opzionale autenticata `roundStateProtocol:1`; il publisher rifiuta nuovi stati se assente. Registrazioni precedenti e backup/pacchetti v4 restano validi. Nessuna rotazione di chiavi/profilo/cursori del Samsung. Regole aggiornate solo nel sorgente, **nessun deploy**. Nuovi stati richiedono regole autorizzate e client compatibile, poi prova di registrazione/import/ACK. Aggiornare prima le regole, poi il client; non inviare schemi nuovi al vecchio APK.

Scaduti solo archivio, senza notifica tardiva. Firma/parser impediscono estensione della scadenza utile. Il tempo di trasporto non certifica disponibilità dei prezzi.

## Verifiche e collaudo originale residuo

21 nuove prove sintetiche: venerdì→sabato, proposta immediata, giorni diversi, NO BET fino alla chiusura, evidenze mancanti, crash dopo ogni ricevuta, restart, DST/rinvii, prezzi alterati/scaduti, queue tardiva, intento ambiguo, coorte immutabile, finale unico, primo avvio tardivo, backup/import/ACK, capacità, task disabilitato, nuovo piano per input cambiati prima delle quote e rifiuto effettivo del runner precedente per giornate nuove. Test importer/calendar precedenti coprono ledger condiviso e quota. Non sono validazione statistica o prove di redditività.

Regole provate solo sull'emulatore demo locale: ruoli, sequenze, finale immutabile, ACK, registrazione legacy/nuova, capacità/campi arbitrari rifiutati. Vecchio emulatore Windows eseguito con JVM in inglese per evitare un difetto della sua diagnostica italiana, senza cambiare locale del PC/prodotto. Nessun progetto reale contattato.

Controlli conclusivi: **252/252 test Node, zero skip**, lint zero errori (un warning preesistente), build Next/TypeScript e `:app:compileDebugJavaWithJavac` superati su Windows. Compilate le classi native aggiornate senza credenziali Firebase, packaging, firma o installazione APK. Le prove strumentali sul Samsung per il nuovo schema/capacità restano separate.

Prima prova originale: manifest/hashes riconfermati dopo il collector, dataset e lacune dichiarate, evidenze contestuali/liquidazione/prezzi riferite al report effettivo, registrazione shadow, finestra utile e autorizzazione specifica a OddsPapi. Nuovi stati: anche client compatibile e collaudo nativo. Nessuna compilazione/installazione di un nuovo APK sul Samsung eseguita qui. Il rischio dell'automazione legacy su main resta separato; il nuovo percorso non la richiama e non scrive il feed pubblico.
