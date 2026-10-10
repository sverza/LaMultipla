# OddsPapi: acquisizione privata e analisi

> Coordinamento aggiornato, 10 ottobre 2026: [protocollo generale v1](protocollo-generale-v1.md). Le istruzioni storiche restano per riproduzione; il pilot giornata 6 è protetto da nuove analisi. Le decisioni nuove richiedono anche attestazione di liquidazione; uso operativo/pubblicazione restano disabilitati.
**Collaudo Windows del 10 ottobre 2026 completato:** account, acquisizione reale, conferma della giornata, pacchetto di revisione, verifica manuale e analisi privata eseguiti sul PC dell'utente. Valutazione tecnica **APPROVATO CON LIMITAZIONI** per il flusso privato assistito; nessuna approvazione a merge, deploy o pubblicazione. La copertura e i flag del feed richiedono verifica; manca ancora il modello probabilistico indipendente. I risultati dettagliati sono nella sezione "Esito del collaudo operativo".

## Decisione architetturale

Il repository e GitHub Pages sono pubblici. L'acquisizione avviene **sul PC Windows** dell'utente, dove i test comunicati del 9 ottobre 2026 hanno ottenuto HTTP 200. Work aveva ottenuto 403/1010; non viene riprovato né aggirato il blocco. Non si configura alcun polling remoto, secret GitHub, workflow di acquisizione o backend a pagamento. GitHub verifica esclusivamente il codice con dati sintetici.

Node >=22.13, endpoint ufficiali v4, bookmaker esatto `bet365.it`, calcio `10`, Serie A `23`. `.local/` è ignorata da Git. Cataloghi, risposte, report, revisioni, contatore e assessment restano qui: non sono importati dal codice Next/Capacitor, non sono in `public/`, non sono artifact CI. I permessi POSIX 0700/0600 sono applicati dove disponibili; su Windows valgono le ACL della cartella e dell'account locale. Usare un checkout personale non condiviso, escludendo `.local` da condivisioni e backup pubblici. `.gitignore` non è un controllo di accesso e `git add -f` lo può scavalcare.

La PWA è attualmente un tracker con EV e storico; **non contiene un modello statistico addestrato e calibrato**. Questo cambiamento realizza il contratto di ingresso e lo screening dei prezzi, senza inventare un modello o probabilità. La costruzione/validazione del modello indipendente resta un'attività distinta.

## Primo utilizzo Windows

1. Scaricare/aggiornare il branch `feature/oddspapi-private-import`, con Git e Node >=22.13 disponibili. I tre CLI privati usano moduli integrati di Node: per eseguirli non occorrono `npm ci` o una build dell'app. `npm ci`, `npm test`, `npm run lint`, `npm run build` sono le verifiche di sviluppo, da ripetere quando richiesto da modifiche al codice, non a ogni acquisizione.
2. Creare `.local/oddspapi/round.json` con stagione, giornata e intervallo UTC. `toUtc` è esclusivo. Per la scoperta iniziale omettere `fixtureIds`:

```json
{
  "season": "2026/27",
  "matchday": 6,
  "fromUtc": "2026-10-10T00:00:00Z",
  "toUtc": "2026-10-13T00:00:00Z"
}
```

3. Dalla cartella del progetto avviare PowerShell:

```powershell
.\scripts\oddspapi.ps1 -RoundPath .local\oddspapi\round.json
```

La chiave si inserisce **solo nel prompt nascosto sul PC**, mai in chat, nel comando, nel sorgente o in un file JSON. Il wrapper la passa a Node mediante l'ambiente del processo e poi ripristina l'ambiente. Per riuso senza prompt, aggiungere `-SaveKey`: viene conservata cifrata con Windows DPAPI, decifrabile dallo stesso utente sullo stesso PC. Non impostare una policy PowerShell permissiva per aggirare restrizioni amministrative; se il wrapper non è consentito, eseguire Node con una variabile di ambiente configurata in modo sicuro localmente.

Prima del primo accesso, verificare la funzione di incolla della console con una stringa di prova non segreta di dieci caratteri e `Read-Host -AsSecureString`: la proprietà `Length` della SecureString deve essere 10. In alcune console una scorciatoia viene letta come un solo carattere di controllo; usare il metodo di incolla che ha superato il test locale. Il client rifiuta tutti i caratteri di controllo ASCII, incluso quello di Ctrl+V, prima di inviare qualsiasi richiesta, senza imporre un formato o una lunghezza della chiave non documentati. Non usare `-SaveKey` durante questo collaudo.

4. Nel report leggere `coverage` e confrontare partite/orari con la giornata ufficiale. Aggiungere al manifest **dieci `fixtureIds` reali e distinti**, copiati dal report, non dall'esempio. Non servono richieste supplementari: normalizzare offline la risposta appena salvata con lo stesso momento di acquisizione:

```text
npm run odds:import -- --round .local/oddspapi/round.json --fixtures PERCORSO_PRIVATO_FIXTURES --markets PERCORSO_PRIVATO_CATALOGO --observed-at TIMESTAMP_ORIGINALE_UTC
```

I percorsi reali sono sotto `.local/oddspapi/runs/` e `.local/oddspapi/catalogs/`; il report contiene `source.catalogPath` relativo alla directory privata. Gli input offline devono essere risposte vere con momento di acquisizione noto. L'opzione non rende correnti quote vecchie.

Senza IDs, con gare mancanti o conflitti, `round.verified=false`: si conserva il report ma non si promuove alcuna selezione. Le date delimitano la scoperta; non provano da sole la giornata. Il manifest va aggiornato a ogni giornata e in caso di rinvii (intervallo massimo 14 giorni). La stagione è validata rispetto all'intervallo; `seasonId` del provider viene conservato senza inventarne un mapping.

## Strategia di consumo e aggiornamento

### Diagnostica del collaudo reale

Nel primo tentativo comunicato dal PC Windows (10 ottobre 2026, 00:15 circa Europe/Rome), il wrapper è arrivato a `GET /account`, che ha restituito HTTP 500. L'audit locale riportava `billableAttempts=0`; nessun catalogo, contatore di chiamate conteggiate o prezzo era stato acquisito e il lock era rimosso. Questo non è ancora un test della copertura del feed. Il consumo complessivo precedente dell'account non era leggibile, perché la richiesta account era fallita.

Per isolare l'endpoint senza effettuare acquisizioni, il wrapper supporta:

```powershell
.\scripts\oddspapi.ps1 -RoundPath .local\oddspapi\round.json -AccountOnly
```

Il controllo esegue **una sola chiamata non conteggiata a `/account`**, senza retry. Con esito valido salva soltanto la whitelist in `account-status.json` e stampa contatori e permesso player props; non salva la risposta account o la chiave. In caso di errore, `last-failure.json` registra status, formato della risposta e, se desumibile dal JSON, una categoria statica (`authentication`, `quota_or_rate_limit`, `server_error`, `unspecified`). Non registra il corpo originale: `errorDetails` contiene soltanto descrizioni di errore da campi riconosciuti, anche annidati, limitate a sei messaggi da 400 caratteri. Chiave nota (anche codificata), URL, valori di credenziali e token lunghi sono oscurati prima della scrittura. HTTP 500 e HTTP 200 con JSON non valido sono distinti. Spazi esterni o ritorni a capo nella chiave vengono rifiutati prima di trasmetterla: va ricopiata nel prompt locale.

Il successivo controllo account-only comunicato dall'utente ha confermato HTTP 500 con risposta JSON e categoria `unspecified`, ancora senza acquisizioni conteggiate. La classificazione da sola non chiariva la causa: è stata aggiunta l'estrazione redatta delle descrizioni, senza cambiare autenticazione, endpoint o identità del client.

I controlli successivi hanno restituito `Authentication error occurred`, `INTERNAL_ERROR` e `An error occurred while fetching user data`. Una richiesta indipendente .NET a `/account` e una a `/bookmakers` hanno ottenuto anch'esse HTTP 500. Il pannello, secondo l'utente, è rimasto a 5/250: la richiesta `/bookmakers` è documentata come conteggiata, ma il consumo osservato non è aumentato. Tutti questi controlli condividevano la lettura della chiave tramite `Read-Host -AsSecureString`. Il test locale con `1234567890` ha poi ricevuto dieci caratteri con un metodo di incolla e uno solo con l'altro; l'utente precisa di aver scambiato i metodi rispetto alle etichette dei prompt. Usando il metodo che riceve tutti i caratteri, il successivo controllo account ha ottenuto HTTP 200, seguito dall'acquisizione reale riuscita. Questo ha risolto il blocco di autenticazione nel percorso collaudato. Il client ora rifiuta i caratteri di controllo prima della rete; non assume che qualsiasi 500 futuro abbia questa stessa causa.

Se `/account` continua a fallire, non si salta il controllo Free/quota per chiamare direttamente i prezzi. Una pagina di stato operativa non garantisce che ogni endpoint funzioni per ogni account.

### Budget dell'acquisizione

- Ogni acquisizione live consulta `/account` (documentato non conteggiato). Verifica un abbonamento attivo con `price=null/0`, `auto_renew=false`, `valid_until=null`, quota 250 e autorizzazione a `bet365.it` e sport 10. Se il formato/piano cambia, interrompe l'acquisizione. La risposta account contiene la chiave: **non viene salvata**, solo una whitelist dei contatori e permessi.
- Catalogo `/markets?language=en` in cache per 7 giorni: una richiesta conteggiata al rinnovo.
- Batch `/odds-by-tournaments?tournamentIds=23&bookmakers=bet365.it&language=en&verbosity=3`: una richiesta per tutte le partite restituite, poi filtro locale sul manifest. Nessun moltiplicatore per quote, mercati o eventi secondo la documentazione corrente.
- Nessuna chiamata individuale automatica per colmare 1X2: un prezzo marcato inattivo non viene promosso. Il confronto manuale ha confermato anche un caso giocabile nell'app ma inattivo nel feed; un `changedAt` vecchio descrive l'ultima variazione, non dimostra un prezzo sbagliato. Un eventuale approfondimento individuale richiede una scelta mirata e un budget separato, non è attivato dal programma.
- Tetto prudenziale **200 tentativi conteggiati negli ultimi 31 giorni**, e `request_count` account + tentativi dell'esecuzione <200 prima di inviare. Il limite locale è conservativo, non assume un reset il primo del mese; il contatore provider è condiviso anche con altri client. Si mantiene una riserva di almeno 50 sul piano 250, salvo consumi esterni concorrenti che il PC non può conoscere in tempo reale. Massimo 15 richieste conteggiate per esecuzione; normalmente 1–2.
- Contatore scritto prima della trasmissione, inclusi timeout/HTTP errori. Lock contro concorrenza nello stesso checkout, scritture atomiche, contatori corrotti bloccanti, cooldown di almeno 1,1 secondi tra chiamate. **Non eseguire contemporaneamente da altri checkout o client**. 403/429/5xx/timeout/non-JSON fermano il run, senza retry/proxy/alterazione di identità.
- `last-failure.json` conserva endpoint, parametri senza chiave, timestamp e stato HTTP. Un errore non aggiorna `latest.json`; il report precedente rimane datato e non diventa attuale. Dopo un crash, controllare che Node sia terminato prima di rimuovere `import.lock`; non resettare `quota.json` per aggirare la riserva.

Proposta sostenibile: una acquisizione al giorno (31 batch + circa 5 cataloghi = circa 36 richieste/31 giorni), più un aggiornamento mirato prima della revisione finale per ogni giornata. La quota basta per tutte le dieci partite insieme; il requisito di quote recenti non implica polling continuo. Le revisioni offline non consumano richieste.

Per una futura esecuzione automatica locale, dopo avere verificato manualmente il primo run e salvato la chiave con DPAPI, Windows Task Scheduler può eseguire lo stesso wrapper una volta al giorno, con l'utente che ha cifrato la chiave, `-RoundPath` assoluto e directory di lavoro del checkout. Se il PC è spento il dato non si aggiorna. **Questa modifica non crea né cambia attività programmate**. Il piano gratuito resta una condizione del fornitore, non una garanzia perpetua.

## Normalizzazione, copertura e anomalie

`lamultipla-oddspapi-private-v2` conserva, per ogni prezzo: fixture/partecipanti/inizio/stato, bookmaker e ID interni, mercato/periodo/linea/esito, ID/nome giocatore, prezzo decimale, flag originali nullable, `changedAt`, `bookmakerChangedAt`, momento della lettura, anomalie e ID deterministico. Cataloghi conservati per hash e risposta raw privata consentono di riprodurre un report dopo il rinnovo della cache. SHA-256 è una traccia di integrità, non una certificazione del bookmaker.

Il parser accetta l'oggetto singolo documentato, array anche annidati, wrapper `fixtures/data` e mappe di oggetti fixture. Rifiuta formati sconosciuti senza trattarli come risultati vuoti. Identici duplicati si deduplicano; duplicati in conflitto e cataloghi ambigui richiedono revisione. Le definizioni sconosciute non sono inventate; quote non numeriche restano record bloccati con `price=null`. I mercati non vengono limitati a 1X2: le famiglie sono quelle effettivamente presenti nella risposta.

| Caso | Trattamento |
|---|---|
| `active=true`, identità/flag coerenti, timestamp valido e recente | `candidate`, solo dichiarazione del provider |
| `marketActive=false` o ignoto, selezione attiva | `review`, prezzo conservato; può superare lo screening solo dopo verifica manuale esatta e regole di liquidazione |
| `active=false`, bookmaker sospeso/inattivo, evento iniziato/live | `blocked`, mai usato per riparare un buco |
| Stato selezione ignoto | `review`, non idoneo allo screening |
| `changedAt` vecchio/ignoto/futuro | `review`; non è una prova di sincronizzazione o necessariamente un prezzo errato |
| `Bookings` | Etichetta originale conservata; nessuna equivalenza automatica con numero cartellini |
| Player props | ID giocatore + nome obbligatori per revisione utile; linea e periodo non vengono uniti |
| Multigol/Bet Builder/combinazioni | Importati solo se presenti realmente; nessun prezzo/probabilità combinato fabbricato |
| 1X2 incompleto | Elenco esiti mancanti per fixture; nessun prezzo stimato, recuperato dallo storico o de-vig su lavagna incompleta |

Il link bookmaker viene utilizzato solo se HTTPS sul dominio `bet365.it` o suo sottodominio; un link non italiano viene scartato. Slug e link non certificano tutta la lavagna: il campione di sei prezzi corrispondenti è il test **comunicato dall'utente**, non un nuovo confronto effettuato da Work.

## Passaggio operativo all'analisi

1. Importare il report privato nel proprio flusso di analisi (file locale, oppure allegato scelto manualmente in Work). Esaminare `coverage`, `marketFamilies`, `anomalies` e selezioni: la copertura generale di `/markets` non prova la disponibilità di una famiglia su una partita.
2. Scegliere quote ID da approfondire su qualsiasi mercato:

```text
npm run odds:review -- --report REPORT_PRIVATO --quote-ids ID1,ID2
```

Produce un pacchetto privato con selezioni complete e `assessment` vuoto, massimo 30 record per revisione. Non riempie probabilità, validazioni, contesto o verifiche con dati fittizi. Compilare i campi con evidenze reali.

3. Il contratto di assessment richiede: hash del report; modello/versione, `probabilitySource="independent_model"`, `methodologyArtifact`, `validatedMarketTypes` corrispondenti al mercato valutato, cutoff di addestramento, riferimento alla validazione (`outOfSample=true`, `evaluatedAtUtc`) e sua metrica/campione; revisione delle dipendenze; per quota, probabilità dei cinque esiti di liquidazione `win/halfWin/push/halfLoss/loss` in [0,1] con somma 1, momento della stima, regole di liquidazione verificate, assenze, forma, calendario, contesto tattico e fonti. Per player props servono anche formazione/minuti attesi. La dichiarazione di calibrazione viene registrata, **non certificata automaticamente**: vanno esaminati l'artefatto, la validità fuori campione e la calibrazione per mercato.
4. Prima della revisione finale, verificare su bet365 Italia partita/periodo/linea/esito/giocatore e prezzo esatto. Compilare `manualVerification` con `domain="bet365.it"`, stesso `quoteId`, `observedPrice` e `verifiedAtUtc`. Se il prezzo differisce, aggiornare l'acquisizione e l'assessment; non dichiarare uguali prezzi diversi. Si richiedono lettura feed e verifica manuale non più vecchie di 30 minuti (policy prudenziale locale, non frequenza del provider).
5. Eseguire:

```text
npm run odds:analyze -- --report REPORT_PRIVATO --assessment PACCHETTO_REVISIONE_PRIVATO
```

Senza assessment o con evidenze mancanti, esito **NO_BET**. EV usa il rendimento di liquidazione, incluso rimborso e mezze vincite/perdite asiatiche; `inversePrice` è solo un riferimento di prezzo e non una probabilità del modello. Con EV positivo e controlli superati, l'esito è **REVIEW_REQUIRED**, mai una schedina. Il programma non seleziona automaticamente sei gambe, non moltiplica probabilità o quote correlate e non crea JSON destinati all'app.

La selezione finale richiede un'analisi congiunta delle dipendenze, valutazione delle incertezze del modello e una decisione esplicita, con possibilità NO BET. Poi si usa il formato di bozza già accettato dal tracker, conservando quota proposta e quota giocata separatamente. Il limite resta una multipla per giornata, massimo sei selezioni e massimo 3 euro. **L'adattatore non gestisce la cassa né conosce altre giocate già eseguite**; quei vincoli devono essere controllati nella decisione finale. La pubblicazione su `latest-slip.json` richiede approvazione e avviene separatamente: nessun programma qui scrive in `public/` o IndexedDB.

## Sesta giornata e storico

Il commit `72667e319f5005fc2b60989fede48ec21a4d9777` dell'8 ottobre 2026 pubblica la bozza della sesta giornata. La cronologia disponibile del feed non contiene un successivo ritiro. Il contesto Work recuperato riporta invece una successiva discussione NO BET e una proposta da considerare errore metodologico. Non sono informazioni sufficienti a stabilire autonomamente la decisione definitiva o una giocata reale. `public/latest-slip.json`, migrazioni e risultati storici restano invariati; nessuna rettifica è applicata.

## Esito del collaudo operativo

Evidenze: output dei comandi eseguiti dall'utente in `C:\LaMultipla`, Node 24.19.0, codice al commit `3d42847`. Nessuna chiamata live effettuata da Work; JSON raw, prezzi, chiave e pacchetti privati non sono copiati nel repository pubblico.

### A. Esito

**RIUSCITO per l'intera pipeline privata**, dalla lettura della chiave al report di analisi. La disponibilità effettiva di ogni quota e l'idoneità statistica di una selezione restano verifiche distinte.

### B. Acquisizione e consumo

- Account Free validato dal preflight: limite 250, consumo prima dell'acquisizione 5, player props consentiti. La whitelist esclude la chiave e verifica accesso al calcio e al bookmaker italiano.
- `/account`, `/markets?language=en` e `/odds-by-tournaments?tournamentIds=23&bookmakers=bet365.it&language=en&verbosity=3`: tutti HTTP 200 nel run riuscito.
- Osservazione: `2026-10-09T22:49:40.959Z`, cioè 10 ottobre 2026 alle 00:49:40.959 Europe/Rome. Questo è il momento della risposta osservata; `changedAt` resta l'ultima modifica dichiarata dal provider, non una frequenza di sincronizzazione verificata.
- Registro locale: due tentativi conteggiati, soltanto catalogo e batch. Il controllo account, la rielaborazione, la revisione e l'analisi non hanno consumato quota. Consumo complessivo atteso 7/250 e residuo stimato 243: non è stata comunicata una lettura del contatore provider successiva al run, quindi non lo si certifica come nuovo saldo API.
- 20 eventi restituiti, 10 nell'intervallo, 14.414 record, 14.397 prezzi validi, 13.068 selezioni attive e 1.346 inattive. Tutte le selezioni bloccate di questo run sono inattive; 17 record hanno anche un prezzo non valido e 1.286 un vecchio timestamp di variazione.
- Confermati i dieci ID del turno dopo confronto delle coppie di squadre con [Insights ufficiali Serie A 2026/27, giornata 6](https://en.legaseriea.it/serie-a/news/insights-matchday-6). Gli orari del feed non sono stati certificati tutti separatamente. La rielaborazione offline mantiene risposta raw e momento originale: `roundVerified=true`, 12.226 `candidate`, 842 `review`, 1.346 `blocked`, zero richieste. Le 842 revisioni dipendono esclusivamente dalle regole Bookings non verificate.

### C. Copertura osservata

I numeri seguenti sono selezioni con prezzo valido e `active=true` nelle dieci gare, anche su periodi e linee diversi. Non misurano lavagne complete né disponibilità nell'app di ogni record.

| Famiglia richiesta | Evidenza nella risposta reale |
|---|---|
| 1X2 | 69 selezioni tra i periodi; 1X2 fulltime completo secondo i flag solo in 4/10 gare |
| Doppia chance / rimborso in caso di parità | 17 / 13 selezioni attive |
| Under/Over gol | 360 selezioni attive |
| Multigol | Nessuna famiglia Multigol identificata nella copertura osservata; copertura generale non dimostrata |
| Gol squadra | 138 selezioni team 1 e 147 team 2; presenti anche gol esatti per squadra |
| Handicap asiatico | 12 selezioni attive; etichetta `Asian Handicap`, periodo fulltime, osservate anche linee a quarti |
| Totali asiatici | Non verificati specificamente; un catalogo generico di totali non basta a confermarli |
| Corner | Totali, totali squadra e 1X2 corner presenti |
| Cartellini / falli | Bookings da verificare per liquidazione; player cards e falli commessi dal giocatore presenti. Totali falli di squadra/partita non verificati |
| Tiri / marcatori / statistiche giocatore | Tiri, tiri in porta, marcatori anytime/primo/ultimo, gol, assist, tackle e parate presenti |
| Combinazioni / Bet Builder Max | Nessuna copertura specifica identificata nel run; nessun prezzo combinato costruito |

Lo slug `bet365.it`, l'autorizzazione account e il filtro della risposta sono confermati. I campioni conservano gli ID evento del bookmaker; `fixtureUrl` è null negli esempi esaminati. Non sono stati ottenuti un catalogo bookmaker autenticato riuscito o una verifica live degli alias/cloni in questo collaudo: il confronto dei prezzi offre una conferma limitata al campione, non una certificazione dell'intero feed.

### D. Confronto manuale

L'utente ha confrontato su bet365 Italia sei selezioni fulltime di Genoa-Fiorentina e Inter-Parma: entrambe segnano, Over gol e Over corner, conservati con linea, quota e ID nel pacchetto privato. Alle 01:00 Europe/Rome del 10 ottobre, **6/6 coincidevano** con l'acquisizione delle 00:49:40. La verifica è stata registrata a `2026-10-09T23:00:00Z`, con precisione al minuto indicata dall'utente.

Ulteriore riscontro: l'esito 1 di Inter-Parma era giocabile nell'app al prezzo contenuto nel record API, che però risultava `active=false` e con ultima variazione del 30 settembre. Il parser conserva correttamente i dati; il flag non rappresenta la disponibilità nell'app in questo caso. Il programma continua a bloccare il record, senza trasformare una verifica umana in una presunta selezione API attiva. Il timestamp vecchio, da solo, non dimostra che il prezzo sia errato.

### E. Analisi e diritti

Creato un pacchetto delle sei selezioni e una copia privata con le verifiche manuali, senza inventare probabilità o contesto. Analisi eseguita il 9 ottobre alle `23:04:10.994Z`: `NO_BET`, 14.414 record esaminati, sei schede di assessment, zero selezioni idonee alla revisione finale, EV null. `withEstimates=6` conta le schede, non sei stime probabilistiche valide.

Nessun errore di collegamento dell'assessment al report o di verifica manuale esatta sulle sei selezioni. Le ragioni globali sono esclusivamente dipendenze non revisionate e assenza di evidenze del modello indipendente. Le ragioni per selezione riguardano validazione del mercato, regole di liquidazione, contesto, momento della stima e probabilità mancanti. Il risultato verifica il blocco operativo; non misura la qualità di un modello che ancora non esiste.

Il collaudo tecnico non concede diritti ulteriori: conservazione indefinita e visualizzazione/pubblicazione nell'app restano da chiarire secondo le condizioni del fornitore. Nessun catalogo o prezzo reale è redistribuito dal repository o dalla PWA. Il wrapper con prompt è stato eseguito sul PC; `-SaveKey`/DPAPI, esecuzione non assistita, durata e affidabilità su più acquisizioni non sono ancora collaudati.

### F. Decisione e G. Prossimo passo

**APPROVATO CON LIMITAZIONI come valutazione tecnica del flusso privato assistito a costo zero.** È riproducibile sul PC con account Free, batch, manifest del turno e controllo umano dei prezzi. Rimangono parzialità dell'1X2 secondo i flag, discordanza del flag di disponibilità, Bookings, mercati non dimostrati e diritti non chiariti. Nessuna approvazione a integrazione permanente o pubblicazione; serve la decisione esplicita dell'utente.

Prossimo passo unico: definire il protocollo del modello probabilistico indipendente, con dati gratuiti di cui verificare i diritti, valutazione temporale fuori campione, calibrazione e confronto con una baseline. Iniziare dai mercati gol derivabili dalla distribuzione dei risultati (1X2, Under/Over e BTTS); estendere ad altre famiglie solo dopo validazione dedicata. Non derivare le probabilità dalle quote OddsPapi.

## Diritti, prove e limiti residui

Si usa l'API documentata del proprio account, senza scraping, API private o aggiramenti. La scelta privata evita di redistribuire il catalogo su repository/PWA. **Non equivale a una concessione dei diritti**: conservazione storica indefinita e pubblicazione di quote/selezioni nell'app restano soggette alle condizioni del fornitore e alle incertezze già documentate; non si abilita redistribuzione automatica e non si contatta il fornitore in questa fase.

I test nel repository usano esclusivamente fixture sintetiche dichiarate tali: struttura documentata v4, vari mercati/giocatori/linee/periodi, quote mancanti, flag discordanti, duplicati, parzialità, contatori e rete simulata, isolamento delle credenziali, EV con rimborsi e NO BET. Non dimostrano nuova copertura live né l'accessibilità di GitHub Actions all'API. Il collaudo reale del PC è verificato tramite gli output e il confronto manuale comunicati dall'utente; i JSON completi restano sul PC e non sono stati riprodotti in Work. Nessuna chiamata live viene eseguita da questo sviluppo. L'input protetto del wrapper è collaudato; il salvataggio DPAPI resta da provare.

Fonti tecniche ufficiali consultate: [quote batch](https://oddspapi.io/en/docs/get-odds-by-tournaments), [quote singole](https://oddspapi.io/us/docs/get-odds), [catalogo](https://oddspapi.io/us/docs/get-markets), [account](https://oddspapi.io/en/docs/get-account), [richieste e quota](https://oddspapi.io/en/docs/requests-and-quota). Nessuna supposizione sul catalogo sostituisce la copertura per evento.

## Esito delle verifiche di sviluppo

- 31 test automatici iniziali superati, anche su Node 22.13.0: normalizzazione, client con rete simulata e flusso CLI offline completo. Sono stati aggiunti 3 test per la diagnostica account isolata, 3 per l'estrazione redatta delle descrizioni d'errore e 1 per il rifiuto dei caratteri di controllo prima della rete o del contatore, per un totale di 38. I test isolano i file in directory temporanee e non usano la chiave o la directory dati reale dell'utente.
- `npm run lint`: nessun errore; un warning preesistente per `combinedPlayedOdd` inutilizzato in `app/components.tsx`.
- Build Next.js/TypeScript/statica riuscita su Node 24 e su Node 22.13.0. Nessun riferimento al client OddsPapi o alla sua chiave nei JavaScript/JSON esportati.
- `git diff --check` superato; feed della sesta giornata e migrazioni storiche invariati; `.local/oddspapi/` ignorata da Git.
- Nessuna chiamata API live dall'ambiente Work, nuova schedina, attività programmata, merge o deploy effettuato dallo sviluppo. L'acquisizione reale e il passaggio completo all'analisi privata sono stati eseguiti sul PC Windows dell'utente e documentati sopra. Il suo `git status --short` finale non ha prodotto output: nessuna modifica tracciata nel checkout durante il collaudo.

**Valutazione:** collaudo completo riuscito sul PC Windows; flusso privato assistito tecnicamente approvato con limitazioni. Modello indipendente, diritti di pubblicazione e integrazione in produzione restano da completare/approvare. Il prossimo passo è il protocollo del modello, senza ripetere l'acquisizione appena verificata o modificare schedine e storico.

## Disponibilità su due livelli (revisione successiva al collaudo)

Il report conserva i flag originali. Lo screening aggiunge `availability.provider` e uno stato distinto: `provider_active_unverified`, `reserved_observation`, `manually_available`, `manually_available_provider_inactive` o `manually_unavailable`. Una conferma negativa blocca anche una quota attiva. Nessuna conferma cambia `active`, `marketActive`, `changedAt` o la classificazione del report originale.

Il pacchetto di revisione contiene ora un template `lamultipla-bet365-verification-v2`. Compilare **soltanto dopo il controllo reale**: `availability="available"` o `"unavailable"`, prezzo osservato, timestamp UTC, identificativo del revisore e descrizione dell'evidenza. Origine `manual_bet365_it`, dominio italiano, hash del report e identità completa (evento, bookmakerFixtureId, mercato, periodo, linea, giocatore ed esito) devono coincidere. Prezzi differenti richiedono nuova acquisizione/revisione: non si riscrive il prezzo importato.

La verifica positiva esatta può superare `active=false`, anche con un timestamp di ultima variazione vecchio. Rimangono obbligatori report e verifica freschi (30 minuti), evento futuro prematch, bookmaker attivo e non sospeso, identità, prezzo valido, liquidazione, contesto e probabilità indipendenti validate. Non supera sospensioni del bookmaker o difetti d'identità. Una quota inattiva non confermata rimane osservazione con riserva. Le vecchie attestazioni senza identità completa restano compatibili solo con quote già attive. Audit: snapshot provider, attestazione completa e relativo SHA256 nello screening; legame anche a report e assessment.

`NO_BET` include ora `noBetCause`: `INSUFFICIENT_EVIDENCE` quando mancano controlli/evidenze; `NO_VALUE` solo quando tutte le selezioni con assessment hanno superato gli altri controlli e manca esclusivamente EV positivo. Nessuna proposta automatica.
