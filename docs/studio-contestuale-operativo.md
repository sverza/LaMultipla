# Studio contestuale — punto 8

Il contesto è un livello della decisione shadow, distinto dal forecast statistico. Non aggiunge punti percentuali alle probabilità, non allarga numericamente gli intervalli e non ricalcola EV o parametri. La forma pesa già indirettamente nel decadimento temporale del modello: non la contiamo una seconda volta. Punto 7 completato sperimentalmente; validazione dei modelli in corso e sviluppo consentito. Punto 9 resta un passaggio successivo.

## Flusso integrato

1. Forecast indipendente e immutabile dal ciclo esistente.
2. Quote, override esatti, EV e intervalli dal motore esistente.
3. Dossier contestuale automatico sullo storico locale: ultimi5/10 risultati,5 casa/trasferta, GF/GA, punti, avversari e limiti dello storico.
4. Note private verificate soltanto per gli incontri candidati: calendario di tutte le competizioni, disponibilità, squalifiche, probabili XI; turnover/cambio allenatore quando documentati.
5. Nuovo gate contestuale prima del selettore. Candidati EV originali conservati; soltanto quelli con contextReady possono entrare nelle combinazioni. Un gate positivo resta una revisione shadow, mai validazione statistica o autorizzazione alla giocata.
6. Congelamento della nuova decisione con contesto/hash/policy; valutazione successiva dei forecast e dei candidati originali, più sottoinsieme contextReady separato. Nessuna modifica delle decisioni precedenti.

Default senza note: forma disponibile, temi mancanti espliciti, nessuna deduzione “nessun infortunio”. Se non ci sono candidati EV non occorre completare80 revisioni per dimostrare assenza di valore. Se ci sono candidati, compilare soltanto le due squadre di ciascun incontro candidato. Le altre possono restare sconosciute. L'intero dossier mantiene comunque le dieci identità della giornata.

I modelli multimercato mantengono eligibleForSelector=false; ora ogni loro record riporta anche contextState. La prontezza contestuale non li abilita automaticamente.

## CLI Windows, nessuna nuova dipendenza

Cartella C:\LaMultipla, Node>=22.13. Git sul branch della PR2, snapshot CC0 locale già acquisito. I seguenti sono esempi separati, con placeholder espliciti per giornate future: non lanciarli per reinterpretare la giornata6 già congelata.

Sintesi storica reale senza partite future, chiavi o rete:

```powershell
& {
    $originalStudy = Get-Content "C:\LaMultipla\.local\model\studies\791e2be8-b0d9-4b5f-a648-3d0610a580be.json" -Raw | ConvertFrom-Json
    $datasetPath = Join-Path "C:\LaMultipla\.local\model\datasets" ($originalStudy.datasetSha256 + ".json")
    node "C:\LaMultipla\scripts\context.mjs" --history --dataset $datasetPath
}
```

Template privato vuoto e dossier per un journal futuro originale:

```powershell
node .\scripts\context.mjs --template --journal "JOURNAL-FUTURO.json"
node .\scripts\context.mjs --build --dataset "DATASET-OSSERVATO.json" --journal "JOURNAL-FUTURO.json" --evidence "NOTE-PRIVATE.json"
node .\scripts\context.mjs --check "DOSSIER.json" --journal "JOURNAL-FUTURO.json"
```

In alternativa --schedule CALENDARIO-FUTURO.json produce il dossier prima del forecast, mantenendo identità/timing. Il template ha80 temi unknown, zero notizie/conferme inventate. --inspect legge un file; --build/--history salvano in .local/context con envelope SHA256 e apertura esclusiva. Niente opzioni as-of, polling, scraping, account o API private.

La pipeline locale può ricevere --context DOSSIER.json oppure --context-evidence NOTE-PRIVATE.json; sono alternative. Senza entrambi genera un dossier league-only e registra i limiti. Nel modo locale il dataset è quello del registry originale; per un dossier aggiornato passare esplicitamente --context costruito con un nuovo snapshot, oppure usare il ciclo con --refresh-data. Quest'ultimo crea un nuovo snapshot CC0, senza riscrivere training/forecast.

Il wrapper protetto esistente accetta -ContextPath oppure -ContextEvidencePath soltanto con -ShadowCycle. Chiave e DPAPI restano invariati. Il contesto non richiede nuove richieste OddsPapi: un solo batch quote come prima, catalogo/cache/riserva invariati. Percorso nuovo del wrapper verificato per codice e contratto, non eseguito su Windows in questa sessione.

## Schema delle evidenze private

Il file ha schema lamultipla-context-evidence-v1, arrays sources/facts/reviews/calendar. IDs univoci. Non accetta prezzi/probabilità, corpi degli articoli o HTML. La cartella privata è ignorata da Git: non copiarne contenuti nella PR, app o storico.

| Oggetto | Campi necessari e significato |
|---|---|
| Source | id, URL HTTPS pubblico, authority club/league/editorial/calendar/other, team per club, competition per fonte squalifiche, scope men_first_team, authorityVerified=true attestato dal revisore, reviewedBy/reviewedAtUtc. URL generico non dimostra ufficialità. |
| Rights | mode private_selective_fact_notes, basis testuale della valutazione della fonte, automatedExtraction=false, publicationAllowed=false. Un campo JSON non concede una licenza né prova da solo la liceità: la fonte va controllata prima di riportare fatti. |
| Fact | id, fixtureId, team, category, competition ITA_SERIE_A, sourceId, capturedAtUtc, statusAsOfUtc, publishedAtUtc se noto, data. Identità/timestamp non sono inferiti da un titolo. |
| Injury / suspension data | playerId stabile e playerName, status out/doubtful/available/unknown. Solo disponibilità sportiva pubblicamente documentata, niente diagnosi. Squalifiche da fonte ufficiale della competizione, applicabilità al match verificata. |
| Lineup data | kind probable/confirmed, players con11 id/name distinti. Confermata richiede fonte club/lega verificata; una probabile resta incerta e richiede presa visione esplicita. Identificativi privati stabili con origine documentata se manca un ID provider. |
| Calendar fact data | kickoffUtc e status scheduled/postponed/cancelled riferiti esattamente alla partita. Divergenze rispetto al forecast bloccano il nuovo gate; non correggono il forecast. |
| Turnover data | kind reported_expected/confirmed_changes/unknown; confirmed_changes richiede changes0..11 e comparedFixtureId. È una descrizione verificata, non un impatto in percentuale. |
| Coach / other data | note breve parafrasata<=240 caratteri, fonte e presa visione delle incertezze. Nessuna copia dell'articolo. |
| Review | id, fixtureId, team, category, status checked, sourceIds effettivamente controllati, reviewer, reviewedAtUtc. Dubbio/assenza/XI probabile/turnover richiedono uncertaintyAcknowledged e uncertaintyNote. Nessuna notizia non equivale ad assenza certa. |
| Calendar coverage review | category calendar, allCompetitionsChecked, windowFromUtc<=kickoff−14giorni, windowToUtc>=kickoff+7giorni e fonti controllate. Completezza attestata dal revisore, non verificata automaticamente contro un universo sconosciuto. |
| Calendar record | id, fixtureId indipendente, competition, home/away, kickoffUtc, status scheduled/finished/postponed/cancelled, sourceId,capturedAtUtc; endedAtUtc solo se fine realmente verificata. Le nazionali dei singoli giocatori non sono inferite dal calendario del club. |

Freshness: injuries24h, squalifiche168h, probabili XI24h, XI confermato2h, calendario24h, dataset osservato<=72h. Un articolo vecchio non diventa recente cambiando capturedAt: statusAsOf resta vecchio. Pubblicazione ignota resta null dichiarata. Controllo ricalcolato al momento della decisione, senza fidarsi del campo ready salvato. Minimo5min prima del kickoff. Assenze, contraddizioni, rinvii, fonte/squadra sbagliata o calendario parziale mantengono motivi visibili.

Ore fra kickoff e riposo effettivo sono campi distinti. Le sole date CC0 producono giorni dalle date Serie A: actualRestHours resta null. Conteggi calendario parziali sono limiti inferiori; soglia72h è un avviso da riconoscere, non una relazione statistica stimata.

## Valutazione e automazione

Il programma non ha ancora una coorte di contesto reale osservata prospetticamente: nessun miglioramento log-loss/Brier/profitto è attribuibile a queste informazioni. Si raccoglieranno coverage/missingness, revisioni, ritardi, fonti e candidati prima/dopo revisione. Eventuali coefficienti richiedono dati point-in-time, ablation e una nuova versione/coorte, separata dai test già consumati e dal v2 in corso. Intervalli di probabilità non diventano intervalli sull'impatto degli infortuni.

È una pipeline invocabile, non un servizio in background. La sospensione autorizzata del vecchio audit non interrompe un monitor nuovo già programmato: quel collegamento non risultava esistente. I comandi di cattura risultati/valutazione/progressione rimangono disponibili, anche per il journal originale dal15/10, ma devono essere invocati; nessun trigger nuovo installato. Nessun accesso o modifica a Task Scheduler del PC. Il successivo punto 9 potrà aggiornare il protocollo complessivo dopo questo incremento, senza cambiare snapshot passati.
