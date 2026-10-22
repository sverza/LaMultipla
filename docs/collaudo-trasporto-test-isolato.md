# Collaudo Firebase → Samsung TEST: isolamento e verifica senza ADB

Audit del 22 ottobre 2026. **Stato dell'invio sintetico reale: BLOCKED, nessuna consegna eseguita.** Il percorso di osservazione PC/telefono non richiede ADB. Questa attività non attiva un nuovo contratto TEST e non modifica G8.

## Causa esatta e percorso esistente

| Livello | Contratto verificato | Conseguenza |
|---|---|---|
| Identità | App `it.personale.lamultipla.collaudo`, pairing attivo trasferito a `shadow` | Il suffisso TEST dell'APK non trasforma il canale in un contenitore di dati sintetici. |
| Firma PC e parser WebView | `shared/private-delivery.mjs`: `synthetic_test` ammesso soltanto su `synthetic_shadow` | Cambiare soltanto l'etichetta visibile o il tipo di stato non risolve il blocco. |
| Verificatore nativo v7 | `PrivateProtocol.verify`: stessa equivalenza canale/provenienza | Una deroga soltanto sul PC verrebbe rifiutata sul telefono. |
| Pairing e profilo ritirato | Una sola associazione attiva; `loadRetiredProfile` usato per consultare ricevute precedenti | Il profilo sintetico conservato non è un secondo ricevitore attivabile. Nessuna transizione inversa prevista. |
| Coda PC | CLI blocca nuovi accodamenti sintetici dopo la transizione; gli stati giornata richiedono `shadow` | Non scongelare la vecchia coda e non azzerare sequenze/cursori. |
| Firebase | `supported(channel)` consente solo `synthetic_shadow` e `shadow` | Un terzo canale/namespace non è già autorizzato dalle regole esistenti. |
| Ricezione | Native worker e client WebView usano il profilo attivo per percorso, firma, audience e ACK | Non si può instradare un pacchetto TEST in un altro percorso cambiando soltanto la destinazione FCM. |

**Opzione A non disponibile:** non è stato trovato un percorso sintetico ancora attivo e riutilizzabile con l'associazione corrente. Usare `sourceData:local_original_artifacts` per un contenuto fittizio falsificherebbe la provenienza ed è escluso. Anche replay di una vecchia consegna, re-pairing o reset dei cursori non dimostrerebbero il nuovo collaudo richiesto.

## ADB non è necessario per il trasporto

La ricezione ordinaria usa Internet, Firebase Auth, Firestore e l'eventuale risveglio FCM. `receiveAndroidPrivate` importa in IndexedDB, riconcilia l'archivio nativo persistente e soltanto dopo produce l'ACK. Il PC può leggere quell'ACK autenticato e collegarlo alla propria consegna firmata. Nessun passaggio di questo protocollo invoca ADB.

La registrazione del dispositivo, il token FCM o una risposta FCM positiva non dimostrano che il telefono sia online, che abbia importato il pacchetto o che lo abbia conservato. L'ACK non contiene un timestamp di produzione: si può attestare quando viene osservato sul PC, senza attribuirgli un orario precedente. Un ACK di un pacchetto scaduto può provare archiviazione, non ricezione tempestiva.

La precedente mancanza di ADB era un limite della diagnosi locale, **non un prerequisito necessario della consegna**. Per una prova reale bastano un'app compatibile, associazione/sessione valide, Internet, osservazione nell'interfaccia e ACK corrispondente. ADB resta utile per log, verifica approfondita dell'APK o interventi autorizzati.

## Implementazione sicura completata

Nuovo comando manuale `scripts/private-transport-audit.mjs`, senza modalità di invio o polling. Riusa vault, firme, coda e client esistenti; non cambia alcun contratto.

```powershell
node scripts/private-transport-audit.mjs --local --channel shadow
```

È il controllo predefinito e non usa rete: verifica chiave pubblica P-256, firma e catena dei frame esistenti, destinatario e compatibilità delle fonti. Non importa la chiave privata nel firmatario, non crea pacchetti e non scrive nel vault. Rende espliciti `adbRequired:false`, `deviceOnlineVerified:false` e `installedApkVersionVerified:false`; non deduce la versione installata dai soli metadati.

Il controllo cloud è un comando distinto e manuale, **non eseguito in questa attività**:

```powershell
node scripts/private-transport-audit.mjs --cloud --channel shadow
```

Effettua tre sole letture Firestore: registrazione del device già abbinato, head e ACK. Usa Firebase Auth del writer esistente; il normale rinnovo della sessione può aggiornare la sua cache DPAPI, senza cambiare account, credenziali di accesso, pairing o ruoli. Non scrive documenti Firestore, non registra dispositivi, non invia FCM e non scrive ACK.

Per verificare una consegna effettiva, aggiungere `--delivery-id` con l'hash esatto restituito dall'accodamento autorizzato. È un parametro **futuro oggi non disponibile**, non un ID da inventare. Il comando legge anche quell'evento (quarto GET), confronta i byte del frame con l'outbox verificata e controlla che l'ACK sia coerente e copra la sua sequenza. Hash discordanti, evento locale assente, head sconosciuta e identità errate provocano arresto. Non ripara o cancella ricevute.

`ACK_VERIFIED` significa prova del protocollo di importazione persistente per quella consegna; la conferma visiva dopo riapertura resta distinta e non viene autocertificata dal tool. Questi controlli sono riutilizzabili per i pacchetti autentici già ammessi, senza autorizzare la loro generazione o consegna.

## Soluzione B proposta, da approvare prima di implementarla

La soluzione più circoscritta è una funzione **di solo collaudo trasporto**, separata dai pacchetti scientifici. Non è implementata ora, perché richiede un contratto Firebase aggiuntivo e un aggiornamento dell'APK TEST, oltre il perimetro di approvazione attuale.

| Aspetto | Proposta |
|---|---|
| Namespace | Ramo distinto, per esempio `users/{reader}/transportTests/v1/...`, senza cambiare `/channels/shadow` o riaprire `synthetic_shadow`. Il nome è proposto, non distribuito. |
| Identità | Messaggio `lamultipla-transport-test-v1`, UUID TEST/DEMO, applicazione esatta `.collaudo`, scadenza, hash, sequenza e predecessore. Nessuna stagione, giornata, fixture, probabilità, quota o stake nominale. Stake reale zero. |
| Firma | Dominio separato `lamultipla-private-test-delivery-v1`, stessi strumenti crittografici e chiave già associata; nessuna rotazione o nuova identità scientifica. Il verificatore dei pacchetti autentici resta identico. |
| Firebase | Regole additive nel solo ramo TEST: stessi UID reader/writer già autorizzati, immutabilità, scritture atomiche head/event e ACK verificato. Nessuna apertura dei rami esistenti; prove negative e regressioni sull'emulatore obbligatorie. |
| Android TEST | Ricevitore esplicito disponibile soltanto nell'app `.collaudo`, derivato dall'associazione esistente. Non cambiare il profilo attivo o il suo cursore. |
| Persistenza | Archivio e cursori TEST distinti sia nel vault nativo sia in IndexedDB. Pannello futuro «Collaudo tecnico TEST/DEMO» dentro Esperimento. Nessuna scrittura negli esperimenti scientifici, nel tracker legacy o nelle statistiche. |
| FCM | Audience `.collaudo` e dispositivo già associato; nessuna registrazione di nuovi destinatari. La normale ricezione manuale deve poter funzionare anche senza push. |
| ACK | Emesso soltanto dopo commit verificato nei due archivi TEST; PC collega esattamente ID, frame e catena. Non è un ACK scientifico. |

Questa proposta conserva accessi e pairing esistenti, ma **aggiunge un contratto di trasporto**: occorre approvarne espressamente implementazione e verifiche. Non sarebbe corretto presentarla come una correzione compatibile con la v7 già installata.

Accettazione prima di qualunque invio reale: firma e audience errate rifiutate; messaggi TEST rifiutati da `shadow`; messaggi scientifici rifiutati dal ramo TEST; produzione rifiuta il messaggio di collaudo; replay idempotente; crash in ciascun commit; ACK perso; scadenze; telefono offline; errori cloud; nessuna modifica a journal, tracker, otto esperimenti e backup precedenti. Verificare anche le regole esistenti con gli stessi test di regressione.

## APK TEST e processo di distribuzione futuro

La v7 è sufficiente per ricevere i pacchetti shadow autentici già supportati. **Per la soluzione B serve una nuova versione TEST.** Nessun APK è stato costruito o installato in questa attività.

Una futura distribuzione autorizzata dovrà mantenere package e certificato TEST, incrementare il versionCode e verificare hash/firma. Prima: backup verificato dell'archivio attuale, conteggi e hash degli esperimenti, pairing, Keystore e cursori. Aggiornamento senza disinstallazione o cancellazione dati; app principale intatta. Dopo: confronto degli originali e dei cursori, verifica del nuovo archivio TEST vuoto. Il metodo di trasferimento/installazione va autorizzato separatamente; ADB non è necessario al successivo trasporto Firebase.

Implementazione del contratto, deploy limitato delle regole TEST e aggiornamento APK sono operazioni distinte, non eseguite né considerate autorizzate. Anche l'adozione del nuovo protocollo per l'unico invio reale deve essere confermata: l'autorizzazione precedente rimane inutilizzata e non viene estesa automaticamente.

## Interventi manuali sul Samsung

Per osservare lo stato **attuale**, senza installare o riconfigurare:

1. Aprire **LaMultipla TEST**, sezione **Esperimento**.
2. In «Ricezione privata dal PC», verificare «PC abbinato · canale shadow», «Accesso salvato» e lo stato della ricezione. Non importare nuovamente il pairing.
3. Se in una futura sessione autorizzata occorre recuperare consegne già presenti, usare il pulsante esistente **Recupera analisi in attesa**, con Internet disponibile. Questo non rende compatibili i sintetici vietati.

Il futuro messaggio TEST/DEMO sarà visibile solo dopo un'eventuale approvazione, implementazione e distribuzione della soluzione B. Per il collaudo: verificare l'ID univoco, chiudere e riaprire normalmente l'app, controllare una sola registrazione persistente e leggere l'ACK dal PC. Non cancellare dati, esperimenti o cursori.

## Decisione consigliata e stato

**Opzione C per proteggere G8:** rinviare la consegna sintetica reale finché B non è approvata e verificata. La finestra scientifica e il freeze-only non devono dipendere da questo nuovo contratto. Dopo il freeze si può affrontare B come intervento separato e circoscritto, senza sviluppare un altro scheduler.

Sono pronti l'audit senza ADB e la verifica di ACK secondo il contratto attuale. Il percorso sintetico reale resta **BLOCKED in attesa di approvazione B**, non di un cavo USB. Nessun allentamento della sicurezza esistente è necessario o consigliato.

## Prove e integrità

Sei nuovi test sintetici: audit locale senza rete/ADB; receiver Android con IndexedDB e mirror nativo simulato, crash prima del mirror e ACK solo dopo persistenza; riapertura/duplicati; registrazione distinta da presenza online; firme/eventi/ACK/identità errati; Firebase 403; ricevuta tardiva senza timestamp inventati; CLI senza opzioni di invio, watch o clock override. I test esistenti coprono ulteriormente scadenze, catene, transizioni e archivi precedenti. Sono prove software, non un nuovo collaudo cloud o Samsung.

L'esecuzione locale del nuovo audit viene conservata privatamente. Nessun `--cloud` eseguito, nessuna chiamata OddsPapi/PitchAPI, consegna, forecast, refit, scheduler, modifica di regole o APK. I 3.400 file protetti, approvazioni G8, ledger e vault sono confrontati prima/dopo. Nessun dato privato o token viene aggiunto a Git. Test completi, lint, build, commit remoto e CI effettivi sono riportati nella consegna della sessione; PR #2 resta in bozza.

Esiti locali: **424/424** test completi; **26/26** mirati (audit, Android e transizioni); lint senza errori, solo il warning preesistente `combinedPlayedOdd`; build riuscita. L'audit locale ha confermato progetto privato, app `.collaudo`, canale `shadow`, coda locale vuota e zero accessi cloud; non ha attestato presenza online o capacità correnti del Samsung.
