# Prima prova originale G7: preparazione del 13 ottobre

Preflight locale, nessuna chiamata OddsPapi, rete Firebase, lettura di chiavi, attivazione task o nuovo forecast. Stake reale zero. I file privati precedenti non sono modificati.

## Riscontro calendario e studio

Il manifest locale `.local/shadow/schedules/2026-27-round-07-v1.json` identifica dieci ID distinti e venti squadre. Il [CU 24 del 3 settembre](https://images.legaseriea.it/image/private/fl_attachment/prd/emzdipx98pkg0lgeqgrt.pdf), prima pagina, e la [notizia ufficiale](https://www.legaseriea.it/serie-a/news/quando-si-gioca-anticipi-e-posticipi-fino-alla-12a-giornata) coincidono con squadre/orari del manifest. Copia di ricerca privata, SHA256 `381ea0ea1631d24cfebb93fe19efa2ca7e085b0d61bc42c5ce420339f1ffe78b`. Questo riscontro non certifica assenza di comunicati successivi o nuovi rinvii.

La conferma privata dell'11 ottobre e l'osservazione provider del 10 sono scadute. Nessun timestamp rinnovato artificialmente. Il gestore esige conferma ufficiale entro 24 ore, snapshot provider entro un'ora, hash esatto delle fixture e medesimo timestamp di acquisizione. Prima del ciclo serve riconciliazione fresca CC0/provider; eventuali variazioni richiedono nuovo manifest versionato e revisione umana.

Studio `791e2be8-b0d9-4b5f-a648-3d0610a580be` e dataset `96fa9036ca4375a0176568862ac7c486ccaccd05825aa2fe08cbe55045b0d777`: riproduzione/hash del modello verificati sul PC. Dataset acquisito il 9 ottobre, 4.980 righe, ultimo risultato 20 settembre. Refresh CC0 prima del ciclo necessario; potrebbe confermare soltanto le stesse lacune. Non rifare tuning e non introdurre G6 nel training: cutoff mensile 1 ottobre. [Problema risultati](fonti-risultati-seriea-2026-27.md).

## Finestre realmente disponibili

Primo kickoff 16 ottobre 20:45 Europe/Rome (18:45 UTC), ultima gara 19 ottobre 20:45. Prima finestra dalle **14:45 alle 18:15 italiane** il 16 ottobre, sei ore/150 minuti prima. Avviare all'apertura per lasciare spazio alla revisione, non alle 18:15. Queue richiede almeno135 minuti; ricezione almeno120 e comunque entro30 minuti dalla decisione. Un tentativo con prezzo vecchio non può essere finalizzato o consegnato tardivamente.

Le finestre successive derivano dai dieci kickoff: nessun giorno fisso o promessa di proposta. Considerare tutte le gare residue, anche di giorni diversi. Calcolo/decisione shadow utilizzano solo `shadow.mjs`, modelli/gate esistenti, prezzo combinato effettivo e limiti Fréchet: nessuna opportunità ammissibile significa esito motivato, non errore da compensare abbassando i criteri.

## Configurazione predisposta e input mancanti

```powershell
Set-Location C:\LaMultipla
node scripts/prepare-original-g7.mjs --inspect
node scripts/prepare-original-g7.mjs --prepare
```

Eseguiti sul PC: secondo comando crea esclusivamente un nuovo config privato in `.local/preparation/g7/<hash>/manager-config.private.json`. Schema progressivo, studio/manifest esistenti e maxLegs4; nessun runner lanciato. Ripetizione idempotente con confronto hash, nessuna sostituzione dei piani/XML vecchi. `configSha256` è il digest JSON richiesto da `--config-sha256`, non hash del testo su disco. L'output locale fornisce il percorso concreto.

Sono assenti riferimenti a `contextFile`/`contextEvidenceFile`, `assessmentFile`, `combinedPricesFile`. Config valido non significa analisi completa: serve aggiungere nuovi input privati verificati, poi nuovo config/hash, senza sovrascrivere tentativi già iniziati. Il vecchio XML/piano a finestra di cinque minuti non è il percorso G7.

| Prerequisito | Stato | Preparazione possibile / intervento |
| --- | --- | --- |
| Calendario dieci fixture | Manifest e riscontro CU presenti, conferme scadute | Ricerca di eventuali aggiornamenti ufficiali consentiti; acquisizione provider solo dopo autorizzazione OddsPapi; nuova conferma con evidenza reale |
| Fonte/dataset | Studio valido, CC0 fermo a settembre | Refresh gratuito versionato; audit lacune senza imputazione. Fonte alternativa non ancora ammessa |
| Quote bet365 Italia | Nessun report fresco G7 prodotto | Autorizzazione limitata a calendario/quote, budget condiviso e cache. Non recuperare vecchie quote come attuali |
| Contesto | Nessun input G7 collegato | Dossier point-in-time, fonti/diritti, calendario tutte competizioni, assenze/squalifiche/formazioni e coverage-review. `unknown` resta unknown, niente conferme automatiche dall'assenza di notizie |
| Liquidazione/availability | Assessment mancante | Verifica umana bet365.it delle gambe, identità e report hash; regolamento/versione/hash/90 minuti/recupero, esclusione supplementari e rigori, rinvii/void |
| Prezzo combinato | Mancante | Prezzo reale del ticket con esatti quoteID/hash e timestamp; prodotto delle quote non basta, nessuna giocata reale |
| Una proposta sostenuta | Non dimostrata | Dipende dal selettore e dalla probabilità congiunta delimitata. Non promettere una multipla per far passare l'E2E |
| Canale shadow | Ultimo collaudo v4 positivo il13/10, registrazione corrente non verificata online qui | Nuovo preflight autenticato in prova autorizzata, preservando pairing/firma/outbox/ACK |
| Nuovi stati | Solo codice/regole testati localmente | Autorizzazione deploy delle sole regole cloud, poi build/aggiornamento APK collaudo e test Samsung. Non basta compatibilità delle proposte v4 |
| Task Windows | Nessuno registrato | Non richiesto per primo ciclo manuale. Autorizzazione separata se in futuro si vuole persistenza |

I nuovi stati richiedono `roundStateProtocol:1`; l'ultimo APK attestato sul Samsung è il collaudo v6, che non lo dichiara. Versione corrente e registrazione remota non ricontrollate online in questa fase. Non inviare `app-round-state-v1` al client precedente. Proposte ancora v4, ma il ciclo completo con provvisori e finale NO BET richiede prima regole aggiornate e nuovo client, registrazione/ACK senza perdita degli esperimenti. Configurazione cloud attuale non certificata da questa ricognizione: nessuna lettura di service account/token o deploy effettuato.

## Sequenza prima della prova

1. Il15 eseguire il controllo originale G6 separato, anche con zero settled; non condizionare G7 alla completezza artificiale G6.
2. Risolvere diritti/source-pilot separatamente. Preparare evidenze contestuali e regole prima della finestra; poi verifiche di prezzo legate al report fresco, entro30 minuti, conservando tutti i tentativi.
3. Autorizzare esplicitamente deploy regole e aggiornamento APK collaudo; provare nuovo stato, ricezione/import/ACK e conservazione archivio. Autorizzazione Android/cloud distinta da OddsPapi.
4. Autorizzare un primo ciclo **manuale shadow** con tetto richieste/budget concordato. Controllo calendar provider e riconferma, config privato aggiornato e pin hash, PC/telefono disponibili all'apertura.
5. Solo allora `node scripts/windows-orchestrator.mjs --progressive-once CONFIG --config-sha256 HASH`, con gli argomenti concreti verificati. Questa istruzione non è stata eseguita. Registrare intenti/ricevute, forecast originale G7, esito, consegna e ACK; esito tecnicamente incompleto non è NO BET per mancanza valore.

Non sono necessarie attivazione task, merge main, deploy web o schedine per una prova manuale. Le prove sintetiche dimostrano contratti e recupero, non validazione statistica né esito favorevole su dati originali.

## Controlli della preparazione

11 test nuovi sintetici: isolamento delle fonti, diritti, identità/bytes/tempi, pending/rinvii/a tavolino, conflitti e rettifiche, guardia del15 prima della rete, record con risultati assenti/errore fonte, intent di interruzione, hash originali e rifiuto di replay obsoleto. Suite Windows **263/263**, nessuno skip; lint zero errori (solo warning preesistente `combinedPlayedOdd`), build Next/TypeScript riuscita. Prima esecuzione della suite bloccata da `fake-indexeddb` mancante nel checkout: dipendenze ripristinate dal lockfile con `npm ci`, poi suite completa superata.

CLI originali/studio verificati sul PC, hash G6 invariati. Config G7 accettato da `loadManagerConfig`, senza eseguire gestore/pump. Nessun nuovo check o valutazione G6 reale creato; le date future nei test sono esclusivamente clock sintetici. Nessuna modifica a evaluator, freeze, algoritmo/configurazione gol, protocolli statistici, fixture G6 o file originali. Nessun deploy/regola live/test Samsung eseguito in questa preparazione.
