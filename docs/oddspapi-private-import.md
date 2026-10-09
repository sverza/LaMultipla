# OddsPapi: acquisizione privata e analisi

## Decisione architetturale

Il repository e GitHub Pages sono pubblici. L'acquisizione avviene **sul PC Windows** dell'utente, dove i test comunicati del 9 ottobre 2026 hanno ottenuto HTTP 200. Work aveva ottenuto 403/1010; non viene riprovato né aggirato il blocco. Non si configura alcun polling remoto, secret GitHub, workflow di acquisizione o backend a pagamento. GitHub verifica esclusivamente il codice con dati sintetici.

Node >=22.13, endpoint ufficiali v4, bookmaker esatto `bet365.it`, calcio `10`, Serie A `23`. `.local/` è ignorata da Git. Cataloghi, risposte, report, revisioni, contatore e assessment restano qui: non sono importati dal codice Next/Capacitor, non sono in `public/`, non sono artifact CI. I permessi POSIX 0700/0600 sono applicati dove disponibili; su Windows valgono le ACL della cartella e dell'account locale. Usare un checkout personale non condiviso, escludendo `.local` da condivisioni e backup pubblici. `.gitignore` non è un controllo di accesso e `git add -f` lo può scavalcare.

La PWA è attualmente un tracker con EV e storico; **non contiene un modello statistico addestrato e calibrato**. Questo cambiamento realizza il contratto di ingresso e lo screening dei prezzi, senza inventare un modello o probabilità. La costruzione/validazione del modello indipendente resta un'attività distinta.

## Primo utilizzo Windows

1. Scaricare/aggiornare il branch `feature/oddspapi-private-import`; eseguire `npm ci`, `npm test`, `npm run lint`, `npm run build`.
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

I controlli successivi hanno restituito `Authentication error occurred`, `INTERNAL_ERROR` e `An error occurred while fetching user data`. Una richiesta indipendente .NET a `/account` e una a `/bookmakers` hanno ottenuto anch'esse HTTP 500. Il pannello, secondo l'utente, è rimasto a 5/250: la richiesta `/bookmakers` è documentata come conteggiata, ma il consumo osservato non è aumentato. Tutti questi controlli condividevano la lettura della chiave tramite `Read-Host -AsSecureString`. Il test locale con `1234567890` ha poi ricevuto dieci caratteri con un metodo di incolla e uno solo con l'altro; l'utente precisa di aver scambiato i metodi rispetto alle etichette dei prompt. È confermato un problema locale di inserimento, da correggere usando il metodo che restituisce dieci caratteri. La sua responsabilità per i 500 e il funzionamento dell'account restano da confermare con una nuova risposta API valida: nessun prezzo è stato acquisito da questi tentativi.

Se `/account` continua a fallire, non si salta il controllo Free/quota per chiamare direttamente i prezzi. Una pagina di stato operativa non garantisce che ogni endpoint funzioni per ogni account.

### Budget dell'acquisizione

- Ogni acquisizione live consulta `/account` (documentato non conteggiato). Verifica un abbonamento attivo con `price=null/0`, `auto_renew=false`, `valid_until=null`, quota 250 e autorizzazione a `bet365.it` e sport 10. Se il formato/piano cambia, interrompe l'acquisizione. La risposta account contiene la chiave: **non viene salvata**, solo una whitelist dei contatori e permessi.
- Catalogo `/markets?language=en` in cache per 7 giorni: una richiesta conteggiata al rinnovo.
- Batch `/odds-by-tournaments?tournamentIds=23&bookmakers=bet365.it&language=en&verbosity=3`: una richiesta per tutte le partite restituite, poi filtro locale sul manifest. Nessun moltiplicatore per quote, mercati o eventi secondo la documentazione corrente.
- Nessuna chiamata individuale automatica per colmare 1X2: l'esempio comunicato dall'utente ha restituito un prezzo inattivo e vecchio. Un eventuale approfondimento individuale richiede una scelta mirata e un budget separato, non è attivato dal programma.
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

## Diritti, prove e limiti residui

Si usa l'API documentata del proprio account, senza scraping, API private o aggiramenti. La scelta privata evita di redistribuire il catalogo su repository/PWA. **Non equivale a una concessione dei diritti**: conservazione storica indefinita e pubblicazione di quote/selezioni nell'app restano soggette alle condizioni del fornitore e alle incertezze già documentate; non si abilita redistribuzione automatica e non si contatta il fornitore in questa fase.

I test nel repository usano esclusivamente fixture sintetiche dichiarate tali: struttura documentata v4, vari mercati/giocatori/linee/periodi, quote mancanti, flag discordanti, duplicati, parzialità, contatori e rete simulata, isolamento delle credenziali, EV con rimborsi e NO BET. Non dimostrano nuova copertura live né l'accessibilità di GitHub Actions all'API. La copertura reale e le sei corrispondenze sono state comunicate dall'utente; non abbiamo i JSON di quelle acquisizioni per riprodurne qui il parsing. Nessuna chiamata live viene eseguita da questo sviluppo. Il wrapper DPAPI è predisposto per Windows e deve ancora essere eseguito sul PC Windows dell'utente.

Fonti tecniche ufficiali consultate: [quote batch](https://oddspapi.io/en/docs/get-odds-by-tournaments), [quote singole](https://oddspapi.io/us/docs/get-odds), [catalogo](https://oddspapi.io/us/docs/get-markets), [account](https://oddspapi.io/en/docs/get-account), [richieste e quota](https://oddspapi.io/en/docs/requests-and-quota). Nessuna supposizione sul catalogo sostituisce la copertura per evento.

## Esito delle verifiche di sviluppo

- 31 test automatici iniziali superati, anche su Node 22.13.0: normalizzazione, client con rete simulata e flusso CLI offline completo. Sono stati aggiunti 3 test per la diagnostica account isolata, 3 per l'estrazione redatta delle descrizioni d'errore e 1 per il rifiuto dei caratteri di controllo prima della rete o del contatore, per un totale di 38. I test isolano i file in directory temporanee e non usano la chiave o la directory dati reale dell'utente.
- `npm run lint`: nessun errore; un warning preesistente per `combinedPlayedOdd` inutilizzato in `app/components.tsx`.
- Build Next.js/TypeScript/statica riuscita su Node 24 e su Node 22.13.0. Nessun riferimento al client OddsPapi o alla sua chiave nei JavaScript/JSON esportati.
- `git diff --check` superato; feed della sesta giornata e migrazioni storiche invariati; `.local/oddspapi/` ignorata da Git.
- Nessuna chiamata API live dall'ambiente Work, nuova schedina, attività programmata, merge o deploy effettuato dallo sviluppo. Il successivo tentativo Windows dell'utente su `/account` è documentato sopra; non ha acquisito quote.

**Valutazione:** implementazione pronta per revisione e primo collaudo locale con la risposta reale; integrazione in produzione non ancora approvata. Prossimo passo unico: eseguire il wrapper sul PC Windows seguendo la procedura sopra e verificare il report privato risultante. Servono 1–2 richieste conteggiate, non una nuova ricerca dei fornitori.
