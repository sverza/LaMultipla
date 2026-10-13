# Punto 11 — canale privato reale in shadow mode

13 ottobre 2026. Implementata la separazione fra il trasporto sintetico collaudato e quello delle analisi reali sperimentali. Nessun modello promosso, stake reale 0 €, nessuna schedina pubblicata. Preparazione locale e codice APK, non rilascio di produzione. Compilazione/prove sul Samsung della nuova versione ancora necessarie.

## PC e cloud

`private-delivery.mjs --prepare-shadow` riusa la chiave P-256 esistente e prepara un profilo DPAPI separato in `.local/private-delivery/channels/shadow`. Richiede una ricevuta locale immutabile che confermi l’ultima consegna sintetica, oltre alla verifica di tutti i frame dell’outbox. Nessuna rete, API OddsPapi o attivazione di ricezione. Non modifica vault, outbox o ricevute precedenti; dopo interruzione fra vault ed esportazione recupera lo stesso profilo, device ID e firma.

Esporta un file privato di transizione, con configurazione Firebase per il client e sola chiave pubblica. **Non allegare alla chat e non pubblicare.** Firma con dominio distinto dai pacchetti decisionali: la firma autentica mittente e byte del nuovo profilo; l’hash da solo non lo fa. Validità sette giorni, identità/progetto/Firebase invariati, nuovo device ID, cambio solo da `synthetic_shadow` a `shadow`, cursore precedente vincolato. Una volta preparato il nuovo profilo, il CLI congela nuovi accodamenti sintetici per non invalidare il cursore della transizione; le quattro consegne già presenti restano leggibili/confermabili.

Trasporto reale: `private-delivery.mjs --queue FILE --channel shadow` e `--flush --channel shadow`. Outbox, cursori, ricevute e backoff sono separati. Sessione PC e credenziale FCM esistenti restano condivise, con esclusione delle operazioni Auth. Il percorso precedente senza `--channel` continua a riferirsi al canale sintetico. Il pump del workflow analitico usa esplicitamente quello shadow. Il task Windows già preparato conserva la sola consegna sintetica: nessuna modifica/attivazione implicita.

Firestore già usa namespace distinti per canale e le regole esistenti li ammettono entrambi. Il profilo shadow non basta per spendere quota: prima delle quote, il motore verifica la registrazione Android nel nuovo canale con l’UID autenticato del PC. Assenza/errore blocca l’acquisizione, senza trasformare il dato mancante in assenza di valore. Non è una garanzia che il telefono sia sempre online o riceva FCM entro una scadenza; recupero e ACK mantengono il protocollo originale.

## Android

Nuova copia APK di collaudo, stessa identità e firma di debug, versionCode 5. Intestazione «analisi sperimentali», mentre le singole schede conservano la distinzione sintetico/dati originali. Feed pubblico, aggiornamenti di produzione, vecchi job e promozione a giocata rimangono disabilitati nella copia. Nessuna modifica automatica all’app principale.

Procedura una tantum: aggiornare l’APK di collaudo preservando i dati; sospendere ricezione e completare eventuali pacchetti; importare il file tramite «Configura il canale shadow dal PC». Firma verificata sia nel WebView sia nel codice nativo, con stesso cursore nei due archivi. Il nuovo stato conserva quello sintetico nel vault cifrato e tutti i pacchetti in IndexedDB, conserva la sessione dell’utente, inizia sequenza zero nel canale separato e rimane **sospeso**. L’utente abilita poi esplicitamente la ricezione e registra il nuovo device nel namespace shadow. Non richiede una nuova chiave, nuovo progetto o nuova password ogni giornata.

Il worker controlla che il profilo resti quello con cui ha iniziato prima di aggiornare token, inbox, cursore o diagnostica. Un’attività precedente non può scrivere nel nuovo stato dopo la transizione. Notifiche e PendingIntent del canale shadow hanno identità distinte da quelle sintetiche. Le ricevute dell’archivio sintetico continuano a essere verificabili con il suo profilo conservato. Un replay della transizione dopo il cambio o con contatori diversi è rifiutato.

## Verifiche

Suite host: 208 test superati, nessuno saltato; lint senza errori, build web/TypeScript superata. Sette nuove prove coprono firma/domini distinti, alterazioni, scadenze, profilo/cursore, conservazione chiave, preparazione interrotta, tip non confermato, namespace indipendenti e registrazione prima delle quote. Interoperabilità della nuova firma verificata con Java reale. Gli asset strumentali contengono soltanto profilo, token e stato sintetici con chiave pubblica effimera; nessuna credenziale reale o chiave privata.

Due nuovi test strumentali `PrivateTransitionInstrumentedTest` verificano il vero parser Android e la conservazione dello stato senza usare PrivateVault, rete, WorkManager o archivio effettivo del telefono. Eseguire solo la classe nuova; le due prove precedenti del protocollo sono già state superate. Build Windows: `:app:assembleDebug :app:assembleDebugAndroidTest`, senza coinvolgere il modulo Cordova di test vuoto. Esito sul dispositivo ancora da acquisire.

Restano prima del collaudo reale: verifica del profilo PC su Windows; compilazione e test della transizione sul Samsung; applicazione una tantum e registrazione del canale; piano/calendario aggiornati e fonti contestuali; prova prospettica prima dei kickoff. Scheduler completo, riconoscimento calendario e risultati automatici restano attività separate. Nessuna nuova automazione Windows persistente attivata. Il pilot originale della sesta giornata conserva la valutazione separata dal 15 ottobre.
