# Prova successiva delle API statistiche — proposta, non autorizzazione

Aggiornamento: la prova PitchAPI è stata successivamente autorizzata dall'utente ed eseguita entro il limite di12 richieste. Esiti e limiti nel [rapporto PitchAPI](pitchapi-prova-diagnostica.md). Le altre proposte sotto rimangono non autorizzate; nessun training o download massivo è autorizzato dalla prova.

Riferimento: [audit21 ottobre2026](api-statistiche-gratuite-audit-2026-10-21.md). Nessuna richiesta autenticata eseguita da questo piano. Nessun forecast, nuovo training, task, consegna o cambiamento di protocollo originale.

## Gate prima di usare una chiave

L'utente sceglie una fonte e registra personalmente un account Free permanente. Verifica piano0€/0$, assenza di carta, rinnovi a pagamento/overage e stagioni accessibili; legge termini. Deve autorizzare fonte, endpoint e massimale precisi. Termini, permessi e accesso sono separati: autorizzare il test non autorizza training o conservazione perpetua. Non inviare mai chiavi in chat. Eventuale installer DPAPI separato dovrà essere preparato/testato prima dell'inserimento locale.

Conservare privatamente ricevuta dell'autorizzazione, versione dei termini, endpoint/parametri senza segreti, intent prima della trasmissione, bytes/hash/time/status e whitelist dei rate-limit. Una richiesta fallita o ambigua non si ripete automaticamente. Niente SDK con retry impliciti, paginazione incontrollata, endpoint odds/predictions o upgrade per aggirare un rifiuto.

## 5DollarFootballAPI — proposta massima3 richieste

Registrazione personale: [signup](https://5dollarfootballapi.com/signup), piano **Free**, non trial o Pro. Leggere [termini](https://5dollarfootballapi.com/terms). Chiedere tramite [contatto ufficiale](https://5dollarfootballapi.com/contact) chiarimento su Serie A Free rispetto a `plan:pro` nel report qualità, identità12/3405541143, snapshot immutabili e diritti di conservazione/training/refit dopo cessazione. Nessun messaggio inviato dall'agente.

Tre ID già osservati nelle demo, senza bisogno di una ricerca aggiuntiva:

| Caso | Richiesta futura, base `https://api.5dollarfootballapi.com` | Esito da verificare |
|---|---|---|
| G6 | `GET /v1/fixtures/423767734?include=stats,events` | Torino–Udinese12/10/2026, identità/FT/HT, stats/eventi reali nel Free |
| G7 | `GET /v1/fixtures/3625798766?include=stats,events` | Parma–Torino19/10/2026, stessa verifica |
| Storica | `GET /v1/fixtures/308830042?include=stats,events` |7/01/2026, fuori dai tre mesi: probabile limite di piano, non dati garantiti |

La terza può legittimamente essere negata: registrare il limite, **non** recuperare lo storico aggirandolo attraverso altre API o upgrade. Le pagine pubbliche non sono una licenza per estrarre massivamente anni di dati. Se la prima evidenzia un blocco di piano/diritti, fermarsi e non consumare le altre. Header credenziale soltanto in memoria. Anche con tutti200, verificare `success`, errori e null. Nessun player endpoint documentato: non inventarlo.

## PitchAPI — proposta massima12 richieste iniziali

Pagina [chiave](https://pitchapi.dev/get-api-key); completamento del signup non collaudato. Prima chiedere o ottenere termini dati applicabili: automazione privata, training/refit, snapshot e durata, upstream/ridistribuzione. Non basta la gratuità dichiarata o la licenza del software client.

1. Una `/v1/leagues`: individuare identità esatta Serie A, paese e stagioni; mai usare un ID dimostrativo Premier League.
2. Una `/v1/leagues/{id}/matches?season=2026/2027&status=played`: trovare G6/G7 con fixture, squadre e kickoff esatti dei manifest. Una per una stagione storica elencata. Se nessuna2026/27, interrompere per l'obiettivo attuale.
3. Per un incontro G6, uno G7 e uno storico: `/v1/matches/{id}/stats`, `/events`, `/players`, tre richieste ciascuno. Totale massimo3+9=12. Valutare campo/periodo/ID e contatori realmente restituiti.
4. Lineups e shots/advanced sono prove ulteriori: **non incluse** nel massimale iniziale; nuova autorizzazione per qualsiasi ampliamento. Intervallo e endpoint dichiarati non certificano la presenza di xG/minuti in ogni gara.

## API-Football — proposta massima16 richieste

Account personale [Free diretto](https://dashboard.api-football.com/register), senza carta o RapidAPI. [Guida ufficiale](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide), [termini](https://www.api-football.com/terms). Confermare con il fornitore training/retention e ambito privato sperimentale con confronto quote/stake0; non confondere la clausola betting con una licenza.

Base documentata `https://v3.football.api-sports.io`. `/leagues` serve a verificare Serie A/Italia e stagioni/capacità. Non fissare l'ID soltanto da una pagina di un concorrente: verificarlo nella risposta o negli ID ufficiali del dashboard. Una richiesta di metadati e massimo tre liste fixture, G6/G7 e una giornata storica consentita. Per ciascuno dei tre incontri: quattro richieste `/fixtures/statistics?fixture=ID`, `/fixtures/events`, `/fixtures/lineups`, `/fixtures/players` con lo stesso parametro fixture. Massimo4+12=16.

Il calendario stagionale e i flag di copertura non dimostrano l'entitlement Free: deve passare la prima richiesta fixture2026. Anno non ammesso,403/429 o errore nel body → stop, nessun tentativo automatico di stagioni alternative. Non usare una versione RapidAPI con carta/overage o account multipli. I quattro endpoint player/evento non vanno chiamati se i flag e il piano non li ammettono. Il403 dei documenti dal PC resta una verifica separata dall'eventuale accesso autenticato all'API.

## Scheda di riconciliazione e qualità

La prima prova non alimenta un modello. Produce una scheda privata per ogni risposta:

- ID fonte fixture/squadra/player, competizione, stagione, giornata, casa/trasferta, UTC e durata; alias espliciti versionati, nessun fuzzy matching. Un postponement con nuovo ID va collegato tramite evidenza, non sostituito silenziosamente.
- URL, acquisizione effettiva, hash bytes, versione schema e `sourceUpdatedAt` soltanto se realmente fornito. Il kickoff non è una data di osservazione. Disponibilità storica del dato non dedotta dall'acquisizione odierna.
- Stato FT regolamentare, HT, riserve amministrative/awarded e revisioni; gara non conclusa o punteggio mancante pending. Valori0 restano0, null/omissione/errori restano distinti.
- Per campo: unità, periodo, squadra/giocatore, valore osservato, null/omesso/non supportato/non applicabile/ambiguo; origine nella risposta e definizione del target. Non forzare percentuali o somme fra layer differenti.
- Numeratore osservati, denominatore di eventi eleggibili, missing count/percentuale, motivi e copertura per stagione/fonte. Se non possediamo la popolazione attesa, il tasso stagionale resta NC. Tre esempi selezionati non stimano la completezza della lega.
- Player: ID stabile e appartenenza al momento della gara, ruolo, titolarità/sub, minuti, falli fatti/subiti, tiro/SOT e scorer/assist/own-goal. I nomi liberi non bastano; giocatore non comparso non equivale a zero tiri con90min.
- Contraddizioni: quarantena con entrambe le osservazioni; nessuna media e nessuna preferenza automatica. Fonti con upstream comune/ignoto non sono conferme indipendenti.

Controlli di coerenza: non negatività, limiti ragionevoli, FT/HT compatibili, casa/trasferta invariati, SOT≤tiri solo con definizioni coerenti, possesso compatibile con arrotondamenti, secondi gialli/rossi secondo tassonomia. Le somme eventi non sono ground truth se il feed omette eventi o adotta definizioni diverse. La rettifica di un tiro in corner deve creare una revisione, non riscrivere uno snapshot.

## Dati indispensabili per famiglia di mercato

| Mercato | Target indispensabile | Feature utili, non universalmente necessarie | Storico / modello attuale / prospettiva |
|---|---|---|---|
|1X2|FT regolamentare, identità/tempi|Risultati precedenti; xG/assenze soltanto per challenger|Originale CC0 disponibile; goals-v1/DC/bivariato esistono. Nuove statistiche non richieste al riferimento.|
|BTTS, O/U, gol squadra|Gol FT separati home/away|Forma e storico gol; xG eventualmente|Griglie esistenti, mapping FT; validazione per target ancora distinta.|
|Handicap/DC/DNB|Differenza/esito gol FT, linea/payoff/rimborsi|Come famiglia gol|Matematica esistente; nuova fonte non risolve l'evidenza AH o la validazione.|
|Corner squadra/totali/handicap|Corner conteggiati per lato/periodo e refertazione|Avversario, ritmo, casa/trasferta; tiri/possesso opzionali|Storico recente verificato assente; nessun modello attivo. Prima candidate QC e backtest temporale, poi prospettiva.|
|Cartellini/bookings|Gialli, secondo giallo, rossi diretti, periodo e regole staff/panchina|Arbitro, squadre, ruolo/esposizione|Conteggi non intercambiabili; modello e campione dedicati, rare-event calibration.|
|Falli|Commessi per target squadra/player e periodo|Arbitro, ruolo, esposizione; subiti se disponibili|Nessun dataset corrente ammesso o modello. Non richiedere xG per definire il target falli.|
|Marcatori|ID autore, gol/own-goal/rigori, partecipazione/minuti e regole|Start/minuti previsti, ruolo, tiri/xG storici|Nessun modello attuale. G6/G7 senza player non bastano.|
|Tiri giocatore|Tentativi secondo definizione, ID/minuti/ruolo|Volumi storici, lineup probabile, avversario|Nuovo modello di conteggio/esposizione; minuti futuri non sono feature nota.|
|SOT giocatore|Tiri nello specchio coerenti con bookmaker, ID/esposizione|Tiri/qualità/ruolo storici|Modello condizionale/congiunto da sviluppare; blocked/last-defender da chiarire.|
|Parate portiere|Parate attribuite al portiere, minuti, sostituzioni|SOT avversari ed esposizione prevista|Nuovo modello; non definire automaticamente parate=SOT−gol.|
|Assist e altre statistiche player|Autore e definizione ufficiale di refertazione|Passaggi/occasioni storiche se ammessi|Nessun mercato promosso; offerta effettiva va prima verificata nel catalogo.|

Per le nuove famiglie, storico gratuito utilizzabile: **non ancora certificato**. I tre esempi non sono un training set. Vecchi eventi2017/18 possono aiutare sviluppo separato, non certificano trasferibilità al2026/27. Le feature possibili non diventano obbligatorie solo perché un provider le offre.

## Sostenibilità: scenari di quota, non attivazioni

-5Dollar: circa10 chiamate aggregate per dieci gare, più eventuale lista. Una seconda osservazione per correzioni raddoppia il volume; richiede futura autorizzazione. Nessun polling. Limite storico rimane anche se avanzano richieste.
-API-Football: una lista più10×3 per stats/eventi/player ≈31; con lineups ≈41. Un'intera stagione da380 gare richiede almeno1.141 chiamate per tre sottoendpoint, **almeno12 giorni a100/giorno**, solo se la stagione è davvero Free. Non usare account multipli. Con quattro sottoendpoint almeno1.521/16giorni. Non è una promessa di completamento o accessibilità.
-Pitch: contingente nominale assente non significa che sia lecito un bulk; restano fair use, diritti e osservazione di stabilità. Spegnere retry automatici SDK per la prova delimitata.

La futura combinazione più plausibile è fonteA originale per i protocolli congelati, supplemento squadra Free verificato, fonte player autorizzata distinta e archivi aperti per sviluppo separato. Ogni overlay mantiene hash/fonte/definizione; non si costruisce un dataset misto fingendolo interamente CC0. Mancano ancora diritti e osservazioni sufficienti per scegliere questa combinazione come produzione.

Nessuna dipendenza del freeze G8 da queste prove. L'eventuale nuovo modello richiede dataset autorizzato/versionato, cutoff esplicito, sviluppo e validazione temporale, registrazione prima degli eventi futuri e approvazione. Nessuna speranza di completare questi gate viene trasformata in previsione retroattiva o scadenza inventata.
