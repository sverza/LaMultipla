# Collaudo privato Windows — punto 10

Revisione 1, 11 ottobre2026. Questo è un percorso guidato: **un comando per turno, risultato esaminato prima del successivo**. Non eseguire in blocco l'intera guida. Nessuna acquisizione della sesta giornata, trigger, pubblicazione o giocata.

## Prima fase: aggiornamento e prova app

1. Leggere `git -C "C:\LaMultipla" status --short --branch`. Controllare branch e modifiche locali prima di pull; non cancellare o stashing automatico di dati dell'utente.
2. Solo su branch corretto e situazione verificata: pull `--ff-only` del branch `feature/oddspapi-private-import`. Poi verificare il commit e Node ≥ 22.13. Non eseguire merge.
3. Eseguire `node "C:\LaMultipla\scripts\app-v4-selftest.mjs"`. Usa esclusivamente dati sintetici, non API. Genera file con nome/hash stabili, verifica un file identico già esistente senza riscriverlo. Questo passo è da fare sul PC solo se non già completato lì: le prove nel container non attestano il PC.
4. Avviare l'app locale da `C:\LaMultipla` con `npm run dev -- --hostname 127.0.0.1`. Usare un profilo browser di prova separato; non importare backup sintetici nel browser personale contenente le giocate.
5. Aprire l'URL localhost stampato, scheda Esperimento, importare i file sintetici indicati dal selftest. Verificare MULTIPLA SIMULATA, DATI SINTETICI, prezzo osservato1,40 distinto dal prodotto1,44, NO BET motivato, assenza conferma giocata e stake reale0. Riavvio pagina deve preservare l'archivio.
6. Esportazione/ripristino v4 e compatibilità v3: soltanto nel profilo di prova. Su Android: file picker, import, SHA/WebCrypto, persistenza e condivisione backup devono essere verificati su dispositivo/build di prova autorizzata. Nessun APK di produzione viene rilasciato da questa fase.

## Seconda fase: giornata futura reale

Scegliere una giornata **successiva alla6**, ancora interamente pre-kickoff. Non presumere numero/date/fixtureIDs: verificare calendario ufficiale, identificativi provider disponibili e dieci eventi distinti. I manifest reali restano privati; non riciclare quelli sintetici o il manifest del pilot.

| Passaggio | Evidenza necessaria prima del successivo |
|---|---|
| Inventario locale read-only | Studio originale registrato, dataset e baseline, eventuali forecast già esistenti, report/cache e quota residua; evitare scansioni/stampa di chiavi |
| Calendario | Manifest `lamultipla-prospective-schedule-v1` con stagione/giornata, URL ufficiale e 10 eventi fixtureId/home/away/kickoffUTC; round con finestra/fixtureIDs coerenti |
| Storico/forecast | Dataset aggiornato a commitCC0 con disponibilità temporale; codice registrato invariato; freeze prima delle quote, SHA/timestamp riportati e mai sostituiti |
| Quote | Riutilizzare cache/report freschi **successivi al forecast** se esistono; altrimenti una sola acquisizione batch protetta dal budget usando wrapper già collaudato. Nessun nuovo test generico OddsPapi |
| Anteprima | `shadow --cycle ... --preview` per forecast/quote oppure modalità locale `--journal ... --report ... --study ... --preview`; verificare prima i parametri con `--help` |
| Contesto/liquidazione | Evidenze reali solo sulle candidate, identità/report/timestamp/revisore, nessun campo compilato per presunzione; attestazioni scadute non riutilizzate |
| Combinazione | Solo se esistono≥ 2 candidate ammesse: osservare prezzo reale/disponibilità e verificare quote IDs esatte. Zero selezioni aggiunte per ottenere una multipla |
| Freeze | Ultima verifica entro 30 minuti e prima del buffer 5 minuti; un solo finale per giornata. Se il tempo scade, nuova versione/anteprima, nessuna retrodatazione |
| Replay/consegna | `decision --audit` poi `--app-package` con gli input esatti stampati dai passaggi precedenti; verificare SHA e import nella sezione Esperimento |
| Esito | NO BET è un esito valido del collaudo; i dodici stati audit sono espliciti, alcune fasi di risultato restano WAITING_RESULTS |

I comandi concreti con percorsi e opzioni vengono costruiti **dopo** avere letto gli output del PC, non con nomi o ID inventati. Se la fonte non fornisce calendario/dati aggiornati il collaudo si ferma al controllo pertinente, senza fare comunque una chiamata a pagamento. Una richiesta nel piano gratuito consuma quota: budget0€ non significa chiamate illimitate.

## Attività separata dal 15 ottobre

Valutare il journal originale `2026-27-round-06-goals-v1-b630b78`, SHA `6500cb65e321568c033bfec90e90fee97b43b6fb489f07e9daf4b15adc3a9070`, baseline SHA `199386b326542ab68d7f7f18c80ac1b691f9e335db40a9c00070f552076d9990`. Seguire [validazione prospettica v1](validazione-prospettica-v1.md): inspect, acquisizione risultati verificati, evaluate e progress separati, mai nuovi forecast o quote del pilot. `decision --obligations` segnala lo stato, senza promemoria automatico. Nessuna automazione viene attivata.
