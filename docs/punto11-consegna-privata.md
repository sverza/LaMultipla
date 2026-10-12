# Punto 11 — motore Windows e consegna privata a costo zero

Aggiornamento del 13 ottobre 2026. **Consegna privata sintetica PC → Samsung collaudata: upload autenticato, notifica in background, import v4 nell’archivio Esperimento e ACK al PC.** L’utente ha configurato il progetto cloud personale e abilitato esplicitamente la ricezione nell’APK di collaudo. PR #2 in bozza; nessun rilascio/deploy di produzione, schedina reale o task Windows persistente attivato. Stake reale 0 €.

Il ciclo di analisi di ogni giornata non è ancora autonomo: orchestratore Windows, pianificazione e raccolta automatica delle evidenze restano da completare. Il CLI di collaudo sul PC è ancora manuale. DPAPI, accesso Windows, contratto v4, firme nel vero runtime Android e trasporto cloud sono collaudati; telefono inizialmente offline, PC spento dopo upload, consegna fra reti diverse e recupero dopo riavvio restano prove distinte da eseguire. Dettagli in [ricezione Android](punto11-ricezione-android.md).

## Dove eseguire il motore

| Opzione | Dati e credenziali | Costo/vincoli | Valutazione |
|---|---|---|---|
| PC Windows dell'utente | File privati e credenziali già locali | Hardware/rete esistenti; acceso, sveglio e connesso prima dei kickoff | Scelta proposta per il primo ciclo |
| Runner GitHub ospitato, repo privato | Nuovi trasferimenti autorizzati e credenziali dedicate; DPAPI del PC non trasferibile | GitHub Free: 2.000 minuti/mese, 500 MB artefatti secondo quote del conto; verificare piano/pagamento | Alternativa se il PC non è disponibile |
| Runner sul PC per repo pubblico | Macchina persistente con segreti esposta ai workflow | Sconsigliato dalla documentazione di sicurezza GitHub | Escluso dalla proposta |

GitHub pubblico conserva sorgenti, documentazione redatta e CI software. Il runner ospitato non legge automaticamente `C:\LaMultipla`, né la chiave OddsPapi del PC. Nessun dataset/report privato nei log o artefatti Actions. Le quote di un repo privato non garantiscono spazio/minuti disponibili nell'account; verificare il consumo condiviso e impedire addebiti.

L'utente autorizza sviluppo e collaudo dell'orchestratore e preparazione della configurazione Task Scheduler. Registrazione/attivazione di task persistenti richiedono la sua autorizzazione finale. La preparazione del task resta da implementare; vecchio trigger sospeso separato.

### Ripartenza dopo spegnimento

L'utente conferma che il PC può restare acceso spesso. Prevedere, dopo sviluppo/collaudo e autorizzazione, avvio al suo accesso Windows e recupero delle esecuzioni perse ancora valide. Non richiedere terminale aperto o USB del telefono; DPAPI resta legata alla stessa identità Windows.

All'avvio: leggere stato persistente e orologio, attendere rete se assente, ottenere lock di singola esecuzione, verificare calendario/scadenze e riprendere il primo passaggio incompleto. Forecast congelati e finali esistenti non sono rigenerati; consegne in outbox riutilizzano ID e byte. Dati scaduti non sono riutilizzati come freschi. Se kickoff/buffer sono trascorsi, nessuna analisi pre-partita retroattiva: stato tecnico analisi non completata e successiva valutazione solo degli artefatti già congelati. Una giornata già iniziata non diventa un ciclo completo nuovo per le sole gare residue.

Il recupero previsto non è una funzione già installata. Oggi dopo un riavvio non c'è un motore automatico da riattivare; il collaudo manuale riprende dal suo checkpoint. L'APK statico può aprirsi e mostrare gli esperimenti offline senza server PC; il server locale serve soltanto al percorso PWA di laboratorio.

## Trasporto privato scelto

Progetto personale dedicato **Firebase Spark**, senza Blaze/metodo di pagamento; Authentication senza SMS, Firestore Standard, FCM. Documentazione verificata: Firestore 1 GiB archiviato, 10 GiB/mese uscita, 50.000 letture e 20.000 scritture/giorno; FCM senza costo. Escludere Cloud Functions, Cloud Run, Cloud Storage, backup e TTL gestiti che richiedono fatturazione. Hosting PWA HTTPS da autorizzare separatamente, nessun deploy ora.

Limiti applicativi proposti: payload serializzato massimo 256 KiB; un finale e massimo otto anteprime per giornata; due dispositivi; target massimo 100 letture/50 scritture al giorno. Nessun polling illimitato. Escludere il grande campo JSON dagli indici. 38 giornate × nove payload da 256 KiB occupano circa 86 MiB prima di indici, ricevute e risultati: misurare il totale. In caso di quota esaurita, segnalare mancata consegna senza abilitare un servizio a pagamento.

Costo incrementale servizi zero entro i limiti; hardware/elettricità/connessione già posseduti restano a carico dell'utente. Nessuna garanzia di disponibilità continua o consegna entro una scadenza.

## Diritti e artefatti ammessi

I termini OddsPapi vietano rivendita, riconfezionamento o redistribuzione dei dati come prodotto autonomo e impongono chiave personale. L'11 ottobre l'utente riferisce di avere già chiarito con il provider il giorno precedente: uso privato e senza distribuzione pubblica/a pagamento consentito. **Il percorso privato procede sulla conferma riportata dall'utente**, senza chiedere di ripetere il contatto; il testo originale della risposta non è stato acquisito nella sessione.

Nessun dato reale è stato trasferito da questo studio. Nessun contatto inviato al provider per conto dell'utente. Il chiarimento non viene esteso alla pubblicazione di quote, report, dati o ricevute reali sul repository pubblico. Una ricevuta pubblica redatta resta eventuale, soggetta a chiarimento del suo specifico contenuto e autorizzazione di pubblicazione; non è necessaria per la consegna privata all'app.

| Artefatto | Destinazione prevista dopo chiarimento/autorizzazione |
|---|---|
| Chiave OddsPapi, firma e token produttore | PC, DPAPI legata all'utente; mai app/repo/log |
| Cache, report integrale, prove contestuali, originali | Archivio e backup privati sul PC |
| Pacchetto v4 minimizzato e involucro firmato | Solo destinatario autenticato nel cloud privato, nell'uso privato confermato dall'utente |
| Token dispositivo e ACK | Percorso privato del destinatario |
| Ricevuta pubblica redatta | Opzionale, allowlist/revisione e autorizzazione specifica; default `publicationAuthorized: false` |

Pubblicare un blob cifrato su GitHub non rientra automaticamente nella conferma dell'uso privato. Il pacchetto corrente mantiene `private_local`: nuovo trasporto esterno senza inventare un valore già supportato dal contratto v4.

## Autenticazione e autenticità

Due identità Firebase Auth dedicate: produttore sul PC e lettore nell'app. Firestore REST con ID token Auth, sottoposto a Security Rules: UID ammessi esplicitamente, nessun accesso anonimo, produttore ai soli percorsi previsti, lettore alle sole proprie consegne/token/ACK con campi limitati. Rinnovo token senza stamparli, credenziali produttore protette sul PC.

FCM richiede credenziale server distinta, protetta sul PC, permessi ristretti all'invio e nessun accesso Firestore. Le chiamate Firestore OAuth/service account bypassano le Security Rules e usano IAM: non trattare Admin SDK come un lettore sottoposto alle regole. La chiave client Firebase da sola non autorizza accesso ai dati.

Involucro versionato implementato in `shared/private-delivery.mjs`, esterno al pacchetto v4:

| Campi firmati | Vincolo |
|---|---|
| `schema`, `keyId`, `channel` | Versione esplicita, test/produzione separati |
| `readerUid`, `applicationId` | UID lettore e identificativo app previsti |
| `season`, `matchday`, `kind`, `status` | Stagione/giornata; anteprima/finale; simulation/no_bet. Risultati fuori da questo protocollo iniziale |
| `sequence`, `previousDeliveryHash` | Sequenza monotona del canale, predecessore vincolato |
| `deliveryId`, `envelopeSha256`, `packageSha256` | ID deterministico da destinatario/canale/app/giornata/tipo/hash pacchetto, indipendente dalla firma; hash anche dei byte JSON trasportati |
| `generatedAtUtc`, `expiresAtUtc` | Tempi firmati, mai retrodatati |
| `signature` | ECDSA P-256/SHA-256; raw `r || s`, 64 byte, base64url |

Firma su `lamultipla-private-delivery-v1\n` seguito dai byte UTF-8 di `statement`. Serializer locale esplicito: chiavi ordinate UTF-16, escaping JSON, numeri JSON finiti; non dichiarato RFC 8785. `statement` deve coincidere con la serializzazione canonica. Il contenuto completo di `packageJson` è vincolato da `packageSha256`; il parser v4 ne controlla anche SHA e semantica. Test Node/WebCrypto superati e due test strumentali dell’intero verificatore superati sul Samsung. Chiave pubblica incorporata in build verificata o abbinata tramite fingerprint dal PC: non fidarsi di una chiave scaricata dal medesimo feed. Privata sul PC. Rotazione/revoca restano da implementare; nessuna chiave nuova proveniente dal feed viene accettata automaticamente. Il primo percorso supporta una sola chiave attiva, abbinata fuori banda.

Il solo SHA corrente rileva alterazioni, non autentica il produttore. La firma non certifica accuratezza dei dati o tempo esterno del forecast. Node/WebCrypto e verificatore nativo Android collaudati; ricezione nell’archivio WebView APK e ACK confermati con dati sintetici. Trasporto PWA non collaudato. Gli adapter usano chiavi sintetiche; la chiave del PC abbinato è generata e conservata soltanto nel vault DPAPI privato.

## Finale unico e recupero

Percorsi implementati: `users/{readerUid}/channels/{channel}/events/{sequence}`, `head/current`, `finals/{season-matchday}`, `devices/{deviceId}`, `acks/{deviceId}`. Documento ruoli `users/{readerUid}/access/config`, modificabile solo dal proprietario in console. Outbox locale persistente prima della rete. Commit REST atomico con precondizioni crea evento/finale e aggiorna testa: confronto sul predecessore, sequenza +1, finale solo se assente. Regole `getAfter` vincolano documenti collegati. Produttore ordinario non può cancellare/sostituire un finale.

Retry riusa consegna già sigillata e ID; stesso ID con byte diversi è errore. Modifica pre-finale → nuova anteprima. Rettifica post-finale → protocollo distinto, senza sostituzione silenziosa.

Dopo commit cloud, FCM invia manifest firmato e firma (senza pacchetto): niente quote, credenziali o dossier nella notifica. App scarica autenticata, verifica firma/destinatario/hash/tempi/sequenza, poi parser v4 e import Esperimento. Import e cursore salvati atomicamente. Deduplicazione SHA attuale mantenuta; da sola non impedisce due finali diversi della stessa giornata.

ID restituito da FCM significa invio accettato, non ricevuto sul telefono. TTL entro scadenza; push perso/duplicato/fuori ordine gestito recuperando testa e consegne mancanti in ordine all'apertura/ritorno online. Consegna scaduta solo archivio storico, mai nuova proposta utilizzabile. ACK distinto da invio e import.

Database esperimenti aggiornato da v1 a v2 conservando `snapshots` e aggiungendo `private-deliveries`, `private-cursors`, `private-finals`. Import verificato e cursore/finale in una sola transazione. Backup v4 mantiene il formato attuale e l'import additivo: nessun token, chiave o cursore nel backup. Restore vecchio non fa arretrare un cursore già presente. Dopo cancellazione dati app: nuovo abbinamento e replay remoto completo in ordine; il backup da solo non è una prova di autenticità del mittente. Migrazione/deduplicazione collaudate con fake-indexeddb; sul Samsung recupero delle prime due consegne confermato senza nuovo login, poi terza consegna importata con ACK. Backup dopo la nuova ricezione resta da verificare.

## APK principale e PWA

APK: implementati ricezione FCM, verifica nativa della firma e download differito con WorkManager, archivio cifrato con Android Keystore, importazione v4 e ACK all’apertura. APK di collaudo compilato/installato, abbinamento e ricezione privata abilitati dall’utente; primo arrivo FCM in background, import e ACK verificati. Package di produzione non aggiornato. Non viene registrato lavoro periodico: soltanto richieste singole dopo abilitazione esplicita, avviso firmato o recupero. Provare permessi notifiche, app chiusa, Doze, offline, token ruotato, force-stop. Piano gratuito non garantisce tempestività.

PWA: HTTPS, Push API, permesso, VAPID. Integrare FCM nello stesso service worker, evitando registrazioni concorrenti sullo scope. Fissare SDK e API della versione: guida consultata presenta registrazione FID e deprecazione `getToken`. PWA aggiuntiva; prova locale offline non attesta push web o hosting produzione.

## Ciclo e scadenze

| Fase | Controllo/artefatto |
|---|---|
| Calendario | Fonte ufficiale osservata, dieci fixture/ID provider coerenti; variazioni pre-freeze versionate |
| Storico | Nuovo snapshot CC0, commit/hash/licenza e disponibilità date+48h; originali preservati |
| Forecast | Codice/parametri registrati, cutoff mensile invariato, freeze completato prima quote entro 24h; nessun tuning ripetuto |
| Quote | Quota corrente, riuso se idoneo oppure batch limitato dopo forecast; età entro 30min |
| EV | Input esatti prezzi/probabilità/intervalli; mercati v2 non validati esclusi dal selettore |
| Contesto | Fonti/tempi/revisore; calendario/infortuni/formazioni entro 24h, squalifiche 168h; formazioni confermate 2h, secondo policy |
| Selettore | Gate contesto/liquidazione/prezzo italiano singolo e combinato; assenze esplicite |
| Decisione | Ultimo controllo entro 30min, buffer 5min pre-kickoff; finale unico, replay, pacchetto v4 |
| Consegna | Outbox/firma/upload autenticato, verifica app, import Esperimento, ACK; zero giocate |
| Risultati | Nuovi snapshot post-gara verificati, identità esatta; rinvii/conflitti pending, valutazione append-only |

Modello attuale `operationallyApproved: false`: NO BET operativo / MODEL_NOT_AUTHORIZED, eventuale shadow MULTIPLA_SIMULATA. Nessuna proposta diventa giocata. Verifiche umane non eliminate; senza evidenze i gate restano chiusi.

Le verifiche manuali previste dal codice vigente riguardano le candidate: fonti di calendario/infortuni/squalifiche/formazioni e incertezze, disponibilità e prezzo italiano osservati, regole di liquidazione e prezzo della combinazione quando applicabile. Regole con validità massima sette giorni; prezzi entro trenta minuti. La raccolta automatica di fonti e un dossier preparato dal software possono ridurre lavoro, ma non equivalgono alle attestazioni manuali attualmente richieste. Eliminare il revisore comporta un protocollo nuovo, fonti/accessi affidabili, trattamento dei conflitti e prove prospettiche; non cambiare silenziosamente le policy congelate. Obiettivo finale autonomo conservato, stato attuale semiautomatico.

PC spento/pipeline interrotta non producono una decisione v4 verificata. App deve indicare analisi assente/non completata e bloccare uso; non fabbricare un NO BET del motore da timeout. Eventuale stato tecnico separato firmato da progettare, distinto dalla decisione valida. Limite concreto rispetto all'obiettivo di ricevere sempre una decisione automaticamente.

Prima prova candidata: settima giornata, primo kickoff registrato 16 ottobre ore 18:45 UTC. Riconfermare calendario; non congelare l'11 ottobre fuori finestra. Storico aggiornato non cambia cutoff mensile 1 ottobre. Journal originale dal 15 ottobre: valutazione separata obbligatoria e manuale.

## Implementazione e prove eseguite

| Componente | Stato concreto |
|---|---|
| Firma/verifica e contratto | `shared/private-delivery.mjs`: firma ECDSA, destinatario/app/canale, hash esatti, tempi, parser v4; 256 KiB massimo |
| Outbox | `scripts/lib/private/outbox.mjs`: file esclusivi, chain contigua, riuso dopo crash, finale unico, esclusione tra processi e recupero lock del processo terminato |
| Trasporto REST | `shared/private-cloud.mjs`: Auth ID token, URL HTTPS fissi, timeout 15s, commit atomico/CAS, deduplicazione, ACK e registrazione dispositivo |
| Ricezione/archivio | `shared/private-receiver.mjs`: import e cursore atomici, recupero in ordine fino a 16 eventi per chiamata (max32), rifiuto rollback/finale successivo, scaduti solo archivio |
| Sessione | `shared/private-auth.mjs`: accesso/rinnovo, identità attesa, rinnovo serializzato, persistenza delegata ad archivio sicuro; errori senza token |
| Archivio Windows | `windows-vault.mjs`: DPAPI CurrentUser, comandi PowerShell statici, segreti solo in pipe memoria; **collaudo Windows superato sul PC dell’utente** |
| CLI | `scripts/private-delivery.mjs`: associazione sintetica, esportazione profilo privata, login senza echo/password in argomenti, accodamento e flush senza job. Prima associazione consentita soltanto all'APK di collaudo/canale sintetico |
| Regole cloud | `private-cloud/firestore.rules`: produttore/lettore separati, niente anonimi, chain/head atomici, finale immutabile, ACK legato a evento; **emulatore locale superato**; regole applicate dall’utente al proprio progetto privato |
| APK/FCM | UI, Android Keystore, FCM HTTP v1, download differito e notifica implementati; **build APK, test strumentali e prima consegna sintetica in background superati sul Samsung**; offline e PC spento ancora da verificare |
| Orchestratore/Task Scheduler | Stato completo delle fasi, scadenze, riconoscimento calendario, pianificazione login+PC acceso **ancora da implementare** |
| Contesto/risultati | Raccolta automatica autorizzata, revisione mirata e monitoraggio nuove giornate **ancora da completare** |

17 nuovi test Node in `tests/private-delivery.test.mjs`: migrazione DB v1, simulazione, NO BET, firme/alterazioni, destinatari, data futura/scadenza, crash dopo scrittura e dopo commit remoto, lock tra processi, recupero lock terminato, finale unico, telefono offline/push fallito, ACK perso, recupero mentre il PC è spento simulato, backup v4, chain/rollback, rinnovo Auth e assenza di fallback DPAPI in chiaro su Linux. Gli scenari PC/telefono spento usano adapter sintetici, non attestano una consegna reale. `fake-indexeddb` è dipendenza solo di sviluppo; nessun'altra versione di libreria cambiata.

Emulatore Firestore 1.19.8 avviato localmente con CLI 14.16.0 e progetto `demo-lamultipla-private`, poi spento. Test: anonimo/UID estraneo negati; lettore non pubblica; writer non scrive ACK/token dispositivo; lettore registra token; ACK falso negato; eventi/finali/ruoli non sostituibili; head fuori sequenza negata; finale NO BET commit atomico. Nessuna richiesta a progetto reale e nessun task persistente. Il test è `tests/private-cloud-emulator.mjs`, separato dalla suite ordinaria.

`private-cloud/firebase.emulator.json` è configurazione soltanto locale. Per riprodurre l'emulatore usare il comando di test dalla cartella privata prevista, progetto con prefisso `demo-`, senza login/deploy. `firestore.indexes.json` esclude il campo JSON dagli indici. Registrazione dei ruoli e applicazione delle regole nel progetto personale confermate dall’utente; nessuna regola aperta temporanea necessaria. Non pubblicare identificatori o configurazione del progetto.

Il CLI `--flush` invia FCM quando è stata installata la credenziale dedicata nel vault DPAPI tramite `--install-fcm`. In sua assenza espone `notifications: not_configured` e `push: not_configured`, senza confondere upload con consegna. La credenziale di servizio è usata solo per FCM, con scope OAuth messaging; Firestore continua a usare ID token Auth e Security Rules. Ruolo IAM dedicato predisposto dall’utente per il collaudo, senza privilegi Firestore. Ripete le consegne non confermate nei limiti del batch. Conserva diagnosi senza contenuto privato in `.local/private-delivery/diagnostics`. Nessuna chiamata OddsPapi, nessun import in giocate e nessuna automazione persistente attivati da queste CLI.

## Intervento necessario dell'utente

1. PC acceso/connesso nella finestra pre-kickoff, oppure migrazione motore con input/credenziali autorizzati.
2. Uso privato OddsPapi già chiarito secondo conferma dell'utente; rispettarne l'ambito. Solo l'eventuale percorso pubblico resta da chiarire, senza bloccare quello privato. Non condividere la chiave per assistenza.
3. Evidenze umane di contesto/regole/prezzi quando richieste. Senza evidenze NO BET valido.
4. Progetto Spark, identità e abbinamento del dispositivo di collaudo già configurati. Conservare l’accesso privato; configurazione di eventuali altri dispositivi e rotazione/revoca delle chiavi restano passaggi separati. Segreti mai in chat.
5. Autorizzazione finale distinta per attivare task Windows persistenti e per rilascio/deploy di produzione. Sviluppo e collaudo sintetico del trasporto/notifiche sono già richiesti e autorizzati; non richiedere di nuovo tale autorizzazione.

Sviluppo dell’orchestratore e preparazione prospettica possono proseguire con il trasporto privato di collaudo già disponibile. Restano da analizzare 27 vulnerabilità npm segnalate prima di una nuova distribuzione.

## Fonti primarie consultate l'11 ottobre 2026

- [Firebase prezzi](https://firebase.google.com/pricing), [Firestore quote](https://firebase.google.com/docs/firestore/quotas).
- [Firestore REST: token Auth e IAM](https://firebase.google.com/docs/firestore/use-rest-api), [transazioni e regole getAfter](https://firebase.google.com/docs/firestore/manage-data/transactions).
- [FCM invio HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api), [durata/consegna](https://firebase.google.com/docs/cloud-messaging/customize-messages/setting-message-lifespan).
- [FCM Android](https://firebase.google.com/docs/cloud-messaging/android/receive-messages), [FCM web](https://firebase.google.com/docs/cloud-messaging/web/get-started).
- [GitHub sicurezza runner](https://docs.github.com/en/actions/reference/security/secure-use), [quote Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
- [OddsPapi termini](https://oddspapi.io/en/legal/terms); uso privato confermato all'utente dal provider secondo il suo riscontro, distinto dalla fonte pubblica.
- [Microsoft: avvio al login Windows](https://learn.microsoft.com/en-us/windows/win32/taskschd/starting-an-executable-when-a-user-logs-on), solo riferimento progettuale; nessun task creato.
- [W3C Web Cryptography / ECDSA](https://www.w3.org/TR/webcrypto/): verificare implementazioni prima di integrare.

Riconfermare fonti/quote prima della configurazione; nessuna promessa di servizio perpetuamente gratuito.


## Prima consegna autonoma confermata — 13 ottobre

Dopo la correzione dei byte JSON, le prime due consegne sono recuperate all’apertura dell’app, senza nuovo login: accesso salvato, ricezione attiva, cursore 2 e flush con ACK 2/pending 0. Una nuova fixture NO BET per revisione/liquidazione mancante è generata con l’orologio corrente e accodata come sequenza 3. Con app in background, il PC conferma upload e accettazione FCM; l’utente riferisce notifica immediata. All’apertura, importazione della giornata sintetica 9 e cursore 3 confermati; flush successivo ACK 3/pending 0, nessun nuovo invio. **Primo percorso completo notificato e confermato sul dispositivo reale**, senza import manuale JSON. Questa prova non certifica funzionamento a PC spento, assenza di USB/rete comune, Doze prolungato o tutte le condizioni Android.
