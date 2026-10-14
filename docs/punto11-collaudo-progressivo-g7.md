# Collaudo progressivo Samsung/Firebase e G7 — 14 ottobre 2026

Preparazione sul PC `C:\LaMultipla`, branch della PR2. Nessun deploy, installazione sul telefono, chiamata OddsPapi, attivazione Windows o modifica alla valutazione G6. Cornerflick escluso da questo incarico.

## Materiale pronto

- Nuova copia privata `.local/android-progressive-rounds-collaudo/`, package `it.personale.lamultipla.collaudo`, label LaMultipla TEST APK, versionCode7 / `1.0.1-private-progressive`. Identità/versione dell'app principale invariati. Il preparatore produce questa versione in nuova directory, senza sovrascrivere collaudi precedenti.
- APK app: `android/app/build/outputs/apk/debug/app-debug.apk` nella copia sopra,9500436 byte, SHA256 `f5521d431e1a6b4fd6ea4554fb352c514b38e8ad6622eee7516287cdf2c3a0ff`.
- APK test: stessa copia, `android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk`,573064 byte, SHA256 `ceb802505f25242447b42f470192780a83b7981613d0e851bb0dd155bbbe5306`.
- `apksigner`: entrambi validi e certificato uguale all'APK privato versione6 conservato. `aapt`: package/versione/label corretti, BackgroundJobService assente. Auto-init FCM inizialmente disattivato; nessuna credenziale Firebase o chiave privata inserita nell'APK, configurazione dal pairing esistente.
- Regole `private-cloud/firestore.rules`, già compatibili con `roundStateProtocol:1`; copia revisionata `.local/preparation/android-g7-20261014/firestore.rules.reviewed`, SHA256 `b725dbb68d181e938f20e957e09458af07d46dc20d820055397079c0397d1e6b`. Nessuna apertura di ruoli o deploy.
- Manifest/hash/log privati in `.local/preparation/android-g7-20261014/`; APK non committati.

## Stato verificato e conservazione

Preflight autenticato del14 sul canale shadow: registrazione reader/FCM/package valida, ma **roundStateProtocol1 assente** (`PRIVATE_RECEIVER_UPGRADE_REQUIRED`). Nessun invio o scrittura Firestore. Non è un test di consegna/ACK live né certifica le regole distribuite. Sessione PC gestita dal percorso DPAPI esistente, nessuna nuova associazione o rotazione.

USB: nessun dispositivo autorizzato disponibile. Versione attualmente installata, archivio e permessi del S24 Ultra da controllare sul telefono; ultima versione attestata6.

Backup privato precedente: parser v4 passato, **otto esperimenti, zero schedine**, SHA256 `85e7dad627228c7c11b55aef5edfccdfaa07a68826396fbb24866a59fe285ccf`. Byte del backup e vault DPAPI writer shadow invariati prima/dopo; nessun segreto stampato. Questo non sostituisce il controllo dell'archivio fisico attuale.

Stesso package/certificato permette l'aggiornamento mantenendo sandbox e Keystore; conservazione dopo installazione ancora da attestare. **Mai disinstallare, cancellare dati, rifare pairing, riparare UID o reimportare la transizione già conclusa.** Prima dell'aggiornamento conservare un nuovo backup con nome distinto e confrontare il numero effettivo di esperimenti.

## Prove e limite Android

Tre nuovi test host: import/duplicati/sequenza per provvisorio, insufficienza, incompletezza, proposta e finale; vecchio dispositivo distinto da capacità nuova; backup con otto v4 byte-identici accanto ai nuovi stati. Suite **266/266**, zero skip; lint zero errori (warning preesistente), build Next/TypeScript riuscita.

Firestore emulator demo127.0.0.1:8087: regole/ruoli, registrazioni vecchie/nuove, campi arbitrari rifiutati, immutabilità, pubblicazione idempotente, cinque frame progressivi firmati, lettura e ACK5. Solo sintetici/progetto demo, nessuna richiesta al cloud reale in queste prove. Emulatore chiuso a fine lavoro.

Nuova classe `PrivateRoundStateInstrumentedTest`: due test con org.json Android, firme PC e chiavi pubbliche sintetiche, cinque frame concatenati, alterazioni rifiutate, titoli, scadenze e aggiornamenti silenziosi. Logica notifiche esistente estratta in piccolo helper testabile, comportamento invariato. APK app/test compilati con `:app:assembleDebug :app:assembleDebugAndroidTest`.

Android emulator/AVD preparati in SDK/directory privati: manca il driver hypervisor; due avvii software falliscono, il secondo con access violation. **Test strumentali non eseguiti**. Nessun driver/servizio Windows installato per forzarlo. Restano sul Samsung dopo autorizzazione: Firestore emulator passato non equivale ad Android emulator passato.

## Sequenza esatta delle autorizzazioni

1. **Solo deploy delle regole Firestore** identificate sopra nel progetto privato già associato. Verificare progetto/hash e accesso proprietario; nessuna modifica a access/config, ruoli/Auth, billing, FCM, hosting o app principale. Conservare regole precedenti per eventuale ripristino autorizzato, senza regole aperte temporanee.
2. **Aggiornamento della sola app di collaudo e APK test**: collegare Samsung/USB autorizzato, controllare versione/package/certificato, inbox/ACK e archivio; nuovo backup prima di procedere. Sospendere esplicitamente ricezione durante aggiornamento e test per evitare attività Firebase al cold-start.
3. Con seriale verificato, esclusivamente `adb -s SERIAL install -r APK_APP` e `adb -s SERIAL install -r APK_TEST`. Hash/certificati devono corrispondere; altrimenti fermarsi. Mai uninstall/pm clear/cambio package.
4. Sola classe nuova: `adb -s SERIAL shell am instrument -w -e class it.personale.lamultipla.PrivateRoundStateInstrumentedTest it.personale.lamultipla.collaudo.test/androidx.test.runner.AndroidJUnitRunner`. Atteso **OK (2 tests)**; test isolati, ricezione sospesa. Ricontrollare associazione/archivio dopo i test.
5. **Preflight e recupero del canale reale**, senza analisi/quote nuove: l'utente riabilita ricezione/permessi, il client registra capacità1; PC verifica con `ensureShadowReception(...requiredRoundState:true)`, outbox/ACK. Chiave, device e cursori precedenti conservati, nessun reset sequenze.
6. **Prima esecuzione manuale G7 e richieste OddsPapi entro budget**, autorizzazione distinta: calendario fresco, input verificati, config/hash pin, forecast originale e ricevute. Sul telefono controllare fase, import, firma, sequenza, finale unico, ACK dopo persistenza, duplicati e ritardi. Provvisori silenziosi nell'archivio, proposta/NO BET finale con notifica decisiva, stake reale zero.

Gli argomenti SERIAL/APK vanno risolti e ricontrollati prima dell'azione; nessuna istruzione sopra eseguita qui. Non accodare i vettori sintetici al canale shadow reale: il protocollo distingue synthetic_shadow/shadow. Non mascherare dati sintetici da originali per ottenere un finto collaudo remoto. Prove parser/contratti isolate già disponibili; consegna dei nuovi stati originali appartiene al ciclo G7 autorizzato.

## G7: preparazione e input ancora mancanti

Manifest completo dieci ID/venti squadre, studio riproducibile e config progressivo già presenti/validati. [Calendario Lega](https://www.legaseriea.it/serie-a/news/quando-si-gioca-anticipi-e-posticipi-fino-alla-12a-giornata); [variazione successiva trovata](https://www.legaseriea.it/serie-a/news/anticipi-e-posticipi-fino-alla-fine-del-girone-di-andata) riguarda G12. [Frosinone,13 ottobre](https://www.frosinonecalcio.com/frosinone-sassuolo-la-biglietteria-3/) conferma16 ottobre20:45 Europe/Rome. Prima apertura resta **16 ottobre14:45 italiane**, limite iniziale di analisi18:15. Nessun cambio G7 trovato nelle fonti consultate, senza certificare assenza assoluta di altri comunicati.

Vicino alla finestra servono conferma ufficiale entro24h e snapshot provider entro un'ora. Manifest precedente conserva provider10 ottobre/conferma11; non rinnovati artificialmente. Ricerca del14 in nuovo receipt privato, senza modificare manifest originali. Collector solo dopo autorizzazione, con budget/lock/checkpoint esistenti.

Template contestuale concreto generato col CLI esistente: dieci gare, ottanta revisioni fixture/squadra/tema, tutte unknown. Inventario `.local/preparation/android-g7-20261014/g7-human-review-inventory.private.json`. Nessuna evidenza vuota promossa a verifica positiva o collegata al config come revisione completata.

| Input | Automatizzabile | Ancora umano |
| --- | --- | --- |
| Calendario/residui | Identità, UTC, piani e confronti | Conferma ufficiale, anomalie/rinvii |
| Storico/modello | Refresh CC0 con hash/cutoff e forecast | Dichiarare lacune/forma recente; nessuna fonte sostitutiva |
| Calendario squadre | Conteggi da evidenze valide | Tutte competizioni14 giorni precedenti/7 successivi, coppe/nazionali e scope |
| Assenze/squalifiche | Gate/tempi/conflitti delle note | Club ufficiali/convocati/conferenze e [CU47](https://www.legaseriea.it/serie-a/news/le-decisioni-del-giudice-sportivo-x9431); applicazione alla fixture, assenza di notizie non significa nessun assente |
| Formazioni | Probabile/confermata e freshness | Probabili documentate; XI ufficiali vicini al kickoff non disponibili due ore prima, non inventarli |
| Quote | Import/screening autorizzati | Prezzo/availability bet365 Italia legati a ID/hash/tempo, entro30 minuti |
| Liquidazione | Hash/freshness/identità della verifica | [Regole italiane](https://help.bet365.it/s/it-it/sportsrules/soccer-it): tempi regolamentari salvo eccezioni; clausole applicabili comprese void/rinvii legate al mercato effettivo |
| Multipla | Fréchet e controllo prezzo verificato | Prezzo della combinazione ordinaria esatta mostrata, non prodotto diagnostico; ticket in bozza senza giocata |

Regole italiane lette tramite browser web: principio90 minuti+recupero e1X2 presenti. Download anonimo diretto Windows **403**, nessun aggiramento o assessment automatico. Non applicare regole svizzere o clausole di altri mercati a quello italiano. Report G7 fresco e quota combinata effettiva ancora assenti: non verificabili in anticipo o riusabili oltre freshness.

Dopo report autorizzato: screening/anteprima e verifiche tempestive, input privati versionati e ripresa secondo ricevute/intenti. Report disponibile riusabile entro30 minuti senza nuova acquisizione; ambiguità provider non autorizza retry ciechi. Esito ammissibile/insufficiente registrato, nessuna promessa di multipla.

## G6 e fattibilità entro il16

`original-g6-check.mjs --inspect` passato il14: journal SHA `6500cb65e321568c033bfec90e90fee97b43b6fb489f07e9daf4b15adc3a9070`, baseline SHA `199386b326542ab68d7f7f18c80ac1b691f9e335db40a9c00070f552076d9990`, dieci entry integre. **Non eseguito --record**. Dal15 usare il comando concordato, pending anche se tutti i risultati mancano, nessuna fonte sostitutiva.

APK/regole pronti per le prossime autorizzazioni, ma senza USB e deploy/install autorizzati non si può attestare il collaudo reale. Android emulator fallito rende necessario test fisico. Prima del16 servono questi passi e un revisore nella finestra per contesto/regole/prezzi. Una prova originale con insufficienza può riuscire tecnicamente; proposta completa non garantita. Se mancano capacità1, calendario fresco o tempo, non dichiarare completamento. Nessun task persistente necessario per prima prova manuale.
