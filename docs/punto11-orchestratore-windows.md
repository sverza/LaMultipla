# Orchestratore Windows — primo componente eseguibile

13 ottobre 2026. Implementato il **recupero delle consegne private già accodate**. Non è ancora l’orchestratore dell’intera analisi: calendario, storico, forecast, quote, contesto, decisione e risultati devono essere collegati a passaggi persistenti. `shadow.mjs` rimane l’unica autorità decisionale. Stake reale 0 €, nessuna API OddsPapi, task Windows non registrati/attivati.

## Esecuzione e stato

`node scripts/windows-orchestrator.mjs --once` esegue una sola verifica. Riusa `private-delivery.mjs --flush`, DPAPI e l’outbox immutabile esistenti. Non genera nuove analisi, non accoda altri file, non richiede password se la sessione del PC è ancora rinnovabile. Dopo crash di una richiesta ripete il trasporto idempotente, senza rigenerare ID/firme/pacchetti. Il lock esistente riconosce il processo proprietario sullo stesso host e recupera i partecipanti terminati; nessuna esecuzione contemporanea del pump.

Stato privato: `.local/orchestrator/delivery-state.private.json`. Ricevute locali di conferma: `.local/orchestrator/receipts/{tipHash}.json`. La ricevuta immutabile precede l’aggiornamento dello stato: se il processo si interrompe tra queste scritture, il successivo avvio recupera la conferma senza una nuova richiesta. Una conferma memorizzata per l’ultimo frame permette di evitare polling cloud quando tutta l’outbox è confermata. Nuove consegne determinano una nuova verifica.

ACK ancora mancante: nuovo tentativo dopo cinque minuti. Errore: backoff persistente 5/10/20/30 minuti. Timeout del figlio a due minuti; output grezzo/credenziali mai nei log. Diagnostica conserva solo codici fissi o HTTP 4xx/5xx. Orologio arretrato, outbox non contigua, stato/ricevuta incompatibili o ACK fuori sequenza bloccano il percorso. Il trasporto originale conserva scadenze e archivia i pacchetti scaduti senza notifica retroattiva.

Lo stato del pump è metadato locale, non una nuova attestazione indipendente: la fiducia resta nella firma PC e negli ACK autenticati del trasporto già verificato. Il test PC spento ha confermato consegna 4 e ACK dopo riaccensione; non prova ancora un avvio del pump tramite scheduler.

## Preparazione Windows senza attivazione

`node scripts/prepare-windows-task.mjs` crea una nuova sottocartella privata con XML disabilitato e hash. Legge il SID corrente solo sul PC, senza pubblicarlo. Il task preparato usa la stessa identità Windows/DPAPI, token interattivo e privilegi ordinari. Prevede login e controllo ogni cinque minuti mentre il PC è acceso e l’utente è connesso; rete richiesta, avvii simultanei ignorati, nessun risveglio automatico e limite di esecuzione quattro minuti. Non funziona prima dell’accesso Windows e non è un servizio sempre disponibile.

`scripts/validate-windows-task.ps1 -TaskXmlPath FILE` valida l’XML con COM e il solo flag `TASK_VALIDATE_ONLY = 1`. Controlla che la preparazione sia disabilitata e che l’esistenza del nome task non cambi. **Nessun `Register-ScheduledTask`, create/update/enable o importazione persistente.** Attivazione futura solo dopo autorizzazione finale, quando la configurazione completa sarà concretamente revisionabile.

Fonti Microsoft: [RegisterTask / sola validazione](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskfolder-registertask), [schema ufficiale](https://learn.microsoft.com/en-us/windows/win32/taskschd/task-scheduler-schema), [ripetizione del trigger](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-repetition-triggerbasetype-element). La validazione Windows COM resta una prova sul PC; il container non possiede Task Scheduler.

## Collaudo e limiti

`node scripts/orchestrator-selftest.mjs` usa una nuova cartella sintetica privata e adapter, verifica waiting ACK/backoff, recupero dopo interruzione tra ricevuta e stato, assenza di nuovo flush dopo conferma. Non legge vault o outbox reali, non usa rete/API/task; elimina solo la propria nuova cartella a esito riuscito. Non attesta connessione reale o spegnimento Windows.

Sette nuove prove host coprono checkpoint dopo interruzione, backoff tra istanze, intento in-flight, esclusione tra esecuzioni, nuovo frame, ACK/stato/orologio/ricevuta/outbox invalidi, self-test e XML disabilitato/privilegi/escaping. Il recupero dei lock dopo morte del processo è coperto dai test precedenti del lock condiviso. Per il collaudo Windows usare prima il self-test, poi preparazione/validazione; esecuzione singola del pump reale soltanto dopo verifica dello stato. Nessun task persistente viene attivato da questi comandi.

Da completare: riconoscimento/verifica autonoma di calendario e stagione, checkpoint delle fasi del motore, gestore delle scadenze pre-kickoff, acquisizioni limitate, dossier/fonti e revisione mirata, generazione/pacchetto/accodamento automatici, risultati e metriche. Non presentare il pump come analisi automatica già pronta. Il journal originale della sesta giornata resta separato, immutabile e da valutare dal 15 ottobre Europe/Rome.

Verifica host: suite 181/181, nessun test saltato; lint senza errori (warning preesistente). Self-test del nuovo componente superato. XML generato validato contro lo XSD ufficiale Microsoft con `lxml`; sola validazione COM e comportamento su NTFS restano da verificare sul PC Windows. Nessuna build APK nuova necessaria per questi componenti PC.


## Collaudo Windows e confine COM — 13 ottobre, 00:39 Europe/Rome

Self-test reale Windows superato: recupero della ricevuta, idempotenza/backoff, zero rete/API, outbox reale invariata e nessun task registrato. La prima validazione COM rifiuta l’XML con HRESULT `0x8004131A`. La prova successiva in memoria isola la dichiarazione XML: originale rifiutato, testo senza dichiarazione accettato da `TaskDefinition.XmlText`, poi XML riserializzato dal componente nativo validato con `TASK_VALIDATE_ONLY`, senza registrazione. Non attribuire questo esito alle credenziali o alle impostazioni del task.

Il generatore omette ora la dichiarazione di encoding all’interfaccia stringa COM. Il validatore accetta anche preparazioni precedenti: rimuove soltanto la dichiarazione nella copia in memoria, usa `NewTask(0)`/`XmlText` per riserializzare nativamente e conserva file/hash originali. Verifica disabilitazione prima e dopo il parser, poi valida con il solo flag 1. Non riscrive XML privati, non crea task persistenti. Il validatore aggiornato sul file precedente resta da riconfermare sul PC. Fonte: [TaskDefinition.XmlText](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskdefinition-xmltext) e prova comparativa riferita dall’utente.
