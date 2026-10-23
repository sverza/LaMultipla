# Protocollo analisi progressive v1

Registrato il 13 ottobre 2026 alle 18:16:47 UTC, prima dell'implementazione. Versione `analysis-progressive-v1`, solo giornate con tutti i kickoff successivi alla registrazione, esclusa la sesta giornata 2026/27. Le policy statistiche v1 e shadow v2, i rispettivi documenti/hash, EV, incertezza, liquidazione, prezzo combinato e limiti Fréchet non cambiano. Stake reale zero; nessun percorso abilita il gioco.

## Identità, finestre e arresto

La giornata conserva dieci fixture e venti squadre distinti. Le finestre derivano dai kickoff UTC verificati, senza giorni della settimana fissati. Ogni tentativo considera tutti gli incontri residui dell'intera giornata, anche di giorni diversi. Una proposta completa viene finalizzata subito: non si attende la finestra successiva. Minimo due, normalmente due–quattro, massimo sei selezioni; nominale massimo 3 euro e un solo finale per giornata.

La finestra apre sei ore prima di un kickoff; i nuovi producer chiudono 150 minuti prima. Le selezioni devono conservare 150 minuti al congelamento, l'accodamento 135 e il trasporto scade a 120. Sono margini tecnici iniziali di 30 minuti per calcolo/verifica e 15 minuti per il trasporto, non una garanzia del tempo di consegna su reti mobili/Doze. Quote/verifiche sempre entro 30 minuti alla decisione e forecast entro 24 ore. La scadenza effettiva del frame è il minimo fra decisione+30 minuti e primo kickoff selezionato−120 minuti: non si promette validità del prezzo per due ore. Prezzi e disponibilità vanno ricontrollati prima di un eventuale futuro uso operativo.

Nessuna nuova acquisizione conteggiata più spesso di sei ore, nessuna chiamata provider per il solo tick quinqueminutale. Riletture locali e replay con nuove evidenze possono riusare forecast/report ancora freschi; ogni tentativo resta registrato. Un intento ambiguo non viene aggirato con un nuovo ID/finestra. I producer non eseguono recuperi retrodatati: output già congelati possono essere riparati e archiviati, ma una proposta scaduta non riceve una nuova scadenza o notifica.

Stati: WAITING_WINDOW, ANALYSIS_IN_PROGRESS, NO_BET_PROVISIONAL, EVIDENCE_INSUFFICIENT, TECHNICALLY_INCOMPLETE, SHADOW_PROPOSAL_FROZEN, NO_BET_FINAL. NO_VALUE e UNCERTAIN_VALUE restano motivi distinti da errori, input mancanti o MODEL_NOT_AUTHORIZED. La chiusura temporale non certifica assenza di valore: conserva tutte le ragioni e i tentativi incompleti. REAL_PLAY_CONFIRMED è riservato a una futura versione operativa, rifiutato oggi.

## Forecast scientifico e revisioni shadow

Il primo forecast completo resta nel percorso originale del journal prospettico, scritto esclusivamente prima delle quote e prima del primo kickoff. Se il PC arriva dopo, non si inventa un primo forecast scientifico. Ogni tentativo successivo ha piano, input, orario, forecast realmente ricalcolato, prezzi, contesto, decisione e ricevute propri in un archivio distinto. Il cutoff mensile del primo forecast rimane vincolante; risultati del target non entrano nel training. Nessuna probabilità deriva dalle quote o da correzioni contestuali.

Un primo avvio tardivo registra una lacuna scientifica senza creare un journal primario. Nuove previsioni shadow possono essere ricalcolate sulle opportunità residue con lo stesso cutoff mensile, marcate non ammissibili alla coorte e legate al marker immutabile della lacuna. Non compensano la copertura scientifica mancante.

Le revisioni sono marcate `cohortEligible:false`, legate all'hash del primo journal e escluse dalla valutazione della coorte scientifica. Tutti i tentativi e l'ordine di arresto sono conservati; non si sceglie retrospettivamente il migliore, non si aggiungono osservazioni indipendenti duplicando una fixture. Cambi di kickoff/squadre/ID richiedono evidenza nuova, lasciando intatta l'identità e la previsione originali. Rinvii senza data verificata richiedono revisione; non producono una chiusura temporale arbitraria.

## Persistenza e compatibilità

Piani per tentativo vincolati a calendario e contenuti, catena di ricevute e lock con proprietario. `shadow.mjs` rimane unica autorità per selezione e congelamento finale. Outbox, firma, sequenza e ACK restano quelli esistenti. Il recupero della consegna è eseguito anche se una nuova analisi fallisce.

Le proposte restano pacchetti v4 compatibili. Gli aggiornamenti di giornata senza forecast/prezzi usano un contratto distinto, senza dati inventati; il publisher ne richiede la capacità dichiarata dal ricevitore. L'APK attuale non viene aggiornato implicitamente. Gli aggiornamenti provvisori sono silenziosi; notifica decisiva solo per proposta o NO BET finale, con scadenza e deduplicazione persistenti. Backup e archivi precedenti restano leggibili.

## Risultati e pilot originale

La valutazione del journal originale e della baseline G6 resta dovuta dal 15 ottobre 2026 Europe/Rome. Risultati assenti sono pending, non imputati né motivo per spostare la valutazione. Download recente non dimostra storico aggiornato: fonte, commit, hash, tempo di raccolta e lacune sono registrati. Una nuova fonte è un intervento separato, senza modifica arbitraria della coorte o del protocollo originale.

Gli scenari sintetici verificano il software, non validano statisticamente i modelli o la redditività. Nessun task Windows viene registrato/attivato da questa implementazione.
