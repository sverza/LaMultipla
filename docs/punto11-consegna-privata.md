# Punto 11 — motore Windows e consegna privata a costo zero

Progetto dell'11 ottobre 2026, base `977ec41`, PR #2 in bozza. **Proposta da implementare e collaudare**, non servizio operativo. Nessun progetto cloud, credenziale di produzione, job, trigger, workflow, deploy o nuova automazione creato da questo studio. Stake reale 0 €.

## Dove eseguire il motore

| Opzione | Dati e credenziali | Costo/vincoli | Valutazione |
|---|---|---|---|
| PC Windows dell'utente | File privati e credenziali già locali | Hardware/rete esistenti; acceso, sveglio e connesso prima dei kickoff | Scelta proposta per il primo ciclo |
| Runner GitHub ospitato, repo privato | Nuovi trasferimenti autorizzati e credenziali dedicate; DPAPI del PC non trasferibile | GitHub Free: 2.000 minuti/mese, 500 MB artefatti secondo quote del conto; verificare piano/pagamento | Alternativa se il PC non è disponibile |
| Runner sul PC per repo pubblico | Macchina persistente con segreti esposta ai workflow | Sconsigliato dalla documentazione di sicurezza GitHub | Escluso dalla proposta |

GitHub pubblico conserva sorgenti, documentazione redatta e CI software. Il runner ospitato non legge automaticamente `C:\LaMultipla`, né la chiave OddsPapi del PC. Nessun dataset/report privato nei log o artefatti Actions. Le quote di un repo privato non garantiscono spazio/minuti disponibili nell'account; verificare il consumo condiviso e impedire addebiti.

Primo ciclo manuale con CLI esistenti. Un eventuale task Windows sarà una fase successiva autorizzata: qui non si prepara o registra alcun task/trigger. Vecchio trigger sospeso separato.

### Ripartenza dopo spegnimento

L'utente conferma che il PC può restare acceso spesso. Prevedere, dopo sviluppo/collaudo e autorizzazione, avvio al suo accesso Windows e recupero delle esecuzioni perse ancora valide. Non richiedere terminale aperto o USB del telefono; DPAPI resta legata alla stessa identità Windows.

All'avvio: leggere stato persistente e orologio, attendere rete se assente, ottenere lock di singola esecuzione, verificare calendario/scadenze e riprendere il primo passaggio incompleto. Forecast congelati e finali esistenti non sono rigenerati; consegne in outbox riutilizzano ID e byte. Dati scaduti non sono riutilizzati come freschi. Se kickoff/buffer sono trascorsi, nessuna analisi pre-partita retroattiva: stato tecnico analisi non completata e successiva valutazione solo degli artefatti già congelati. Una giornata già iniziata non diventa un ciclo completo nuovo per le sole gare residue.

Il recupero previsto non è una funzione già installata. Oggi dopo un riavvio non c'è un motore automatico da riattivare; il collaudo manuale riprende dal suo checkpoint. L'APK statico può aprirsi e mostrare gli esperimenti offline senza server PC; il server locale serve soltanto al percorso PWA di laboratorio.

## Trasporto privato proposto

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

Involucro versionato proposto, esterno al pacchetto v4:

| Campi firmati | Vincolo |
|---|---|
| `schema`, `keyId`, `channel` | Versione esplicita, test/produzione separati |
| `audience` | UID lettore e identificativo app previsti |
| `round`, `kind` | Stagione/giornata; anteprima/finale/risultato |
| `sequence`, `previousDeliveryHash` | Sequenza monotona del canale, predecessore vincolato |
| `deliveryId`, `envelopeSha256` | ID deterministico da canale/giornata/tipo/hash pacchetto, indipendente dalla firma |
| `generatedAtUtc`, `expiresAtUtc` | Tempi firmati, mai retrodatati |
| `signature` | ECDSA P-256/SHA-256; raw `r || s`, 64 byte, base64url |

Firma su JSON canonico definito/versionato, prefisso di dominio `lamultipla-private-delivery-v1`; payload vincolato dal suo SHA. Fissare serializer e vettori interoperabili prima del codice. Chiave pubblica incorporata in build verificata o abbinata tramite fingerprint dal PC: non fidarsi di una chiave scaricata dal medesimo feed. Privata sul PC. Rotazione con vecchia firma della nuova chiave e revoca esplicita.

Il solo SHA corrente rileva alterazioni, non autentica il produttore. La firma non certifica accuratezza dei dati o tempo esterno del forecast. WebCrypto e formato firma da collaudare in Node, WebView APK e PWA; nessuna chiave reale generata ora.

## Finale unico e recupero

Percorsi logici: `users/{readerUid}/deliveries/{deliveryId}`, indice finale per giornata, testa del canale, dispositivi e ACK separati. Outbox locale persistente prima della rete. Transazione cloud crea consegna/finale e aggiorna testa: confronto sul predecessore, sequenza +1, finale solo se assente. Regole `getAfter` vincolano documenti collegati. Produttore ordinario non può cancellare/sostituire un finale.

Retry riusa consegna già sigillata e ID; stesso ID con byte diversi è errore. Modifica pre-finale → nuova anteprima. Rettifica post-finale → protocollo distinto, senza sostituzione silenziosa.

Dopo commit cloud, FCM invia avviso minimale con ID: niente quote, credenziali o dossier nella notifica. App scarica autenticata, verifica firma/destinatario/hash/tempi/sequenza, poi parser v4 e import Esperimento. Import e cursore salvati atomicamente. Deduplicazione SHA attuale mantenuta; da sola non impedisce due finali diversi della stessa giornata.

ID restituito da FCM significa invio accettato, non ricevuto sul telefono. TTL entro scadenza; push perso/duplicato/fuori ordine gestito recuperando testa e consegne mancanti in ordine all'apertura/ritorno online. Consegna scaduta solo archivio storico, mai nuova proposta utilizzabile. ACK distinto da invio e import.

Cursore persistente anche dopo restore/reset: futura revisione backup o recupero autenticato dello stato completo, senza alterare retroattivamente backup v4. Backup vecchio non autorizza rollback/duplicazione.

## APK principale e PWA

APK: futura ricezione FCM/apertura esperimento. Callback Android con tempo limitato; download lunghi richiederebbero lavoro successivo o recupero all'apertura. Nuovi servizi/job richiedono la fase autorizzata; nessuno aggiunto ora. Provare permessi notifiche, app chiusa, Doze, offline, token ruotato, force-stop. Piano gratuito non garantisce tempestività.

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

## Sviluppo senza attivazione

| Componente pianificato | Prove prima di servizi reali |
|---|---|
| Serializer/firma/verifica condivisi | Node/WebCrypto, alterazioni, chiave/audience errate, expiry, rollback |
| Outbox/finale locale | Crash/retry/concorrenza, stesso ID, secondo finale respinto |
| Regole/transazioni in emulatore | Anonimo/UID errato negati, lettore non produttore, finale immutabile, testa coerente |
| Import e cursore app | Push perso/duplicato/fuori ordine, catena incompleta, restore vecchio; giocate invariate |
| Trasporto/notifiche | Mock errori/timeout/quota; invio distinto da ACK; log senza segreti |
| Stato tecnico/risultati | Analisi assente distinta da NO BET valido; rinvii/revisioni senza riscrittura forecast |

Componenti pianificati, non già implementati. Prima locale sintetico/emulatore, poi prova privata manuale autorizzata, infine autorizzazione distinta per attivazione/rilascio.

## Intervento necessario dell'utente

1. PC acceso/connesso nella finestra pre-kickoff, oppure migrazione motore con input/credenziali autorizzati.
2. Uso privato OddsPapi già chiarito secondo conferma dell'utente; rispettarne l'ambito. Solo l'eventuale percorso pubblico resta da chiarire, senza bloccare quello privato. Non condividere la chiave per assistenza.
3. Evidenze umane di contesto/regole/prezzi quando richieste. Senza evidenze NO BET valido.
4. In fase autorizzata, progetto Spark/identità/dispositivo e abbinamento chiave pubblica verificato. Segreti mai in chat.
5. Autorizzazione distinta per job, servizi notifiche, distribuzione APK/PWA e automazione. Non presunta qui.

Sviluppo sintetico locale, analisi dipendenze e preparazione prospettica proseguono indipendentemente. Restano da analizzare 27 vulnerabilità npm segnalate prima di una nuova distribuzione.

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
