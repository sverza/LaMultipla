# Milestone 2.5 — Regression stability audit e readiness M3

27 ottobre2026. Base locale `f83990de5320128ac1b01736b25bef20fdc5c3e7`, branch `feature/oddspapi-private-import`.

**Decisione: M3 READY WITH DOCUMENTED LIMITATIONS**, intesa come possibilità di autorizzare il prossimo lotto di sviluppo dopo la revisione della policy. Nessun compositore è stato implementato o attivato; un primo uso autentico non è pronto né autorizzato da questo rapporto.

## 1. Errore esatto e precedenti

Test: `final freeze is one per round across policies and concurrent writers; previews stay separate`, `tests/decision.test.mjs`, assertion originaria alla riga105:

`assert.equal(results.filter(r=>r.status==='fulfilled').length,1)`

Risultato osservato nei log precedenti: **0 !== 1**. Due Promise di `persistDecision` erano terminate senza alcun valore fulfilled. Questa assertion non registrava le cause delle rejection.

| Evidenza storica conservata | Esito |
|---|---|
| M1, `full-suite-release.private.log` |497/498, stesso test e assertion0!==1; altre esecuzioni e suite seriale498/498 |
| M2, `full-suite-parallel.private.log` |513/513 |
| M2, `full-suite-serial.private.log` |512/513, stesso test e assertion0!==1 |
| M2, ripetizione isolata | PASS |

Comandi originali: `node --test tests/*.test.mjs` e `node --test --test-concurrency=1 tests/*.test.mjs`. Il problema è comparso sia in una suite parallela sia in una seriale: non è dimostrabile che dipenda soltanto dal parallelismo fra file.

`--test-concurrency=1` serializza i file di test, non le due chiamate `persistDecision` lanciate dal `Promise.allSettled` dentro questo test: la contesa interna resta presente anche nella suite seriale.

## 2. Risorse, isolamento e possibili interferenze

Il test usa un `mkdtemp` dedicato sotto la directory temporanea Windows, con prefisso `lamultipla-general-`. Dentro quel root crea intenzionalmente due writer sullo stesso percorso stagione/giornata/policy e sulla medesima directory `locks`. Prima crea/rimuove una finale di policy precedente per verificare il blocco trasversale fra policy.

I due writer sono Promise nello stesso processo Node, con PID uguale e nonce UUID distinti. `persistDecision` verifica assenza di finali, acquisisce `privateLock`, ricontrolla e pubblica un envelope tramite hard link esclusivo. Non usa database, Firebase, Android, account o rete. Non scrive nel root scientifico reale.

M1/M2 non appartengono alla catena di chiamate della persistenza di questo test. I file di test della suite sono normalmente isolati in processi; i loro temp root hanno identità differenti. Non sono emerse collisioni di nomi, cache o database fra test. CPU, disco e interferenze esterne Windows possono variare gli interleaving, ma non sono state identificate come causa di questi episodi. Non sono stati disattivati antivirus, alterati ACL o aumentati timeout.

Il documento precedente `docs/lock-windows-g8-safety.md` descrive già il contratto del lock: **fail-fast, senza attesa/retry e senza promessa di fairness o successo di ogni tentativo conteso**. M1/M2 possono cambiare il carico della suite, non aggiungono import o mutazioni alla funzione `privateLock`. Il fenomeno riprodotto non richiede alcuna chiamata a M1/M2.

## 3. Piano di riproduzione limitato ed evidenze

Prima di intervenire sono stati dichiarati:6 ripetizioni naturali del test originario,2 interleaving controllati prima della correzione; dopo,4 ripetizioni naturali e2 prove controllate focalizzate; una sola suite completa parallela e una seriale. Le due suite includono ciascuna anche la nuova regressione controllata. Nessun loop fino al successo o stress runner aggiuntivo illimitato.

Le suite complete mantengono i test del lock già presenti:2.000 acquisizioni locali consecutive e600 tentativi fra6 processi, con limiti predefiniti. Non è stato aumentato quel carico. I processi figli delle riproduzioni hanno un limite20 secondi; le barriere del test controllato falliscono dopo5 secondi, senza cambiare il lock produttivo.

### Ripetizioni naturali prima della modifica

6/6 passate: in ciascuna un writer riuscito e uno respinto da BUSY oppure dal controllo finale EEXIST. Il test originale è stato copiato soltanto nel namespace diagnostico privato per registrare le rejection prima dell'assertion invariata. Nessun risultato filesystem è stato sostituito.

Questi sei successi non dimostrano la risoluzione e non stimano l'incidenza del problema.

### Interleaving controllato sul filesystem Windows reale

In2/2 casi è stato ottenuto lo stesso controesempio all'assertion originale:

1. A e B pubblicano annunci immutabili `choosing:true`.
2. A pubblica il ticket e osserva B ancora in scelta: fallisce BUSY.
3. A ritira il ticket prima dell'annuncio, come previsto dal protocollo sicuro.
4. B pubblica il proprio ticket mentre l'annuncio di A è ancora visibile e non ha più ticket: B osserva A come `choosing:true` e fallisce BUSY.
5. Entrambi ritirano i propri record. **Zero writer riusciti, nessuna finale, directory locks vuota.**

`tests/fixtures/lock-failfast-schedule.mjs` introduce soltanto barriere su link/unlink della directory di prova, inoltrando tutte le operazioni alle vere funzioni filesystem. Non sostituisce file, dati, errori, return value o validatori e non modifica il clock. La traccia registra, per ciascun writer, l'annuncio dell'altro con `choosing:true`, ticket0 e ticket file assente.

È una race di **progresso/disponibilità**, non una dimostrazione di due ingressi contemporanei. Non richiede EPERM, collisione UUID, file corrotti o risultati calcistici. L'ordine di ritiro ticket→annuncio è deliberatamente conservativo e non va invertito per far passare il test.

**Limite dell'attribuzione:** i vecchi log conservano solo il conteggio0, non le cause dei due rifiuti. Abbiamo dimostrato una condizione sufficiente che riproduce esattamente quel sintomo con lo stesso codice; non possiamo certificare retroattivamente che ogni fallimento storico fosse questo interleaving o escludere altri errori Windows non registrati allora.

## 4. Correzione minima: aspettativa del test, non algoritmo produttivo

Il difetto dimostrato è l'assunzione del test: esigeva esattamente un vincitore da un'API fail-fast che non garantisce progresso sotto contesa. **Nessuna modifica a `privateLock`, `persistDecision`, `writeExclusive`, selettore o protocolli.**

La nuova verifica non si limita a sostituire `===1` con `<=1`:

- Due successi restano sempre un fallimento.
- Ogni rifiuto deve essere un BUSY esatto oppure il guard EEXIST di finale già presente; errori filesystem, cleanup e altri errori non sono accettati genericamente.
- Con zero successi sono necessarie **due rejection BUSY**, entrambi i writer già conclusi, nessuna finale/claim o altro effetto parziale, e directory locks vuota.
- Solo dopo queste verifiche il test effettua **un solo tentativo serializzato**, con la stessa decisione immutata. Nessun loop, timeout più lungo o nuova policy.
- L'esito deve produrre un'unica finale, integralmente uguale al payload JSON atteso, con hash/ricevuta coerenti. Un successivo persist sulla stessa finale deve essere rifiutato e i byte rimanere invariati. La preview resta separata.

`tests/fixtures/decision-race-contract.mjs` è esclusivamente un helper di test, non un'API di retry e non un'implementazione della persistenza M3. L'uguaglianza segue il contratto JSON esistente: le proprietà oggetto `undefined` sono omesse dalla serializzazione. La prima verifica del nuovo helper ha rilevato questa differenza nella fixture; l'aspettativa è stata corretta sul **payload JSON completo**, con digest, non su un sottoinsieme permissivo. Nessun dato o formato produttivo è stato cambiato.

La nuova regressione controllata verifica anche che permessi EPERM, AggregateError di rilascio, record residui, effetti parziali o due successi non vengano convertiti in recovery o PASS. Tutti i file residui delle prove negative sono preservati fino alla pulizia della sola directory temporanea posseduta dal test.

## 5. Esiti mirati e regressione

- 4/4 ripetizioni naturali dopo la correzione passate; tutte con un vincitore iniziale. Questo non viene usato per negare il caso a zero vincitori.
- Il caso controllato continua a produrre zero vincitori iniziali: la prova finale del nuovo contratto è passata verificando poi esattamente una finale dopo quiescenza. Le prove negative del contratto sono passate.
- Nessun test rimosso, saltato o convertito in successo per un accesso negato. Nessun parametro scientifico ritoccato.
- Gli esiti delle due sole suite complete e dell'integrità sono registrati nel riepilogo conclusivo sotto e nelle evidenze private.

Suite completa **parallela515/515** e **seriale515/515**, senza skip. La regressione controllata passa in entrambe, con due BUSY iniziali e una sola finale dopo quiescenza. Il test naturale ha riportato un vincitore in entrambe. Le prove multiprocesso esistenti hanno registrato23 e20 ingressi su600 tentativi rispettivamente, con **zero sovrapposizioni** e zero accessi Windows rifiutati nelle due esecuzioni. Questi conteggi non sono una promessa di throughput o fairness.

Lint: zero errori, solo l'avviso preesistente `combinedPlayedOdd` in `app/components.tsx`. Build Next.js/TypeScript superata. File originali e di controllo inventariati:5.732;5.731 invariati per hash byte/dimensione/mtime, unica modifica attesa `tests/decision.test.mjs`. Nessuna differenza inattesa: lock, store, selettore, M1/M2, engine, studi, dataset, journal, ricevute, approvazioni e ledger restano invariati. Il file locale non correlato non è stato letto, modificato o incluso nel commit.

Evidenze private: `.local/diagnostics/mm-stability-m25-20261027/`. Comprendono baseline hash, sei log naturali originali, due tracce controllate pre-correzione, quattro log naturali corretti, test controllato finale, casi matematici sintetici e log delle suite. I vecchi log M1/M2 non sono modificati.

## 6. Policy M3 proposta

Specifica separata: `docs/policy-simulatore-multimercato-m3-v1-proposta.md`, ID `multimarket-exploratory-m3-v1-draft-20261027`. È una proposta versionata **non registrata, non approvata e non attiva**.

Definisce board esatti BTTS/O2,5, quattro flag obbligatori, una leg per fixture, journal v2 verificati, primario DC proposto e comparatore separato, tempi reali, contesto/regole, review singole/ticket, Fréchet e limiti dell'incertezza, ricerca dichiarata e stati negativi non confusi con NO BET globale. Il prezzo del ticket è effettivo e indipendente dal prodotto delle singole. Android v4 e selettore1X2 sono esclusi.

Le soglie economiche proposte provengono esplicitamente dai valori ingegneristici esistenti, non da risultati G6–G9. Primario, soglie, ordine e budget richiedono approvazione prima dell'uso autentico. Non sono proclamati validati.

Dimostrazione sintetica con la funzione `frechet` esistente: due estremi inferiori0,90 e prezzo del ticket dato1,40 consentono EV inferiore0,12; due estremi0,49 danno limite inferiore zero ed EV inferiore−1 per qualunque prezzo finito. La composizione non è matematicamente impossibile, ma può essere molto rara. Nessuna modifica dei limiti per ottenere una proposta.

## 7. Readiness distinta per area

| Area | Esito e limite |
|---|---|
| Stabilità tecnica dei test | Controesempio riprodotto e aspettativa errata corretta; risultati finali delle suite riportati esplicitamente. Prove finite, nessuna garanzia assoluta contro errori futuri del filesystem |
| Sicurezza persistenza esistente | Esclusione fail-closed preservata, nessuna doppia finale nelle prove. Non promette progresso sotto contesa; errori dopo l'azione possono lasciare effetti da ispezionare |
| Persistenza M3 futura | Da implementare e testare secondo intent/receipt/replay/recovery della proposta. Sarebbe bloccata una versione che assume un vincitore garantito o ritenta esiti ambigui; non è bloccato il suo sviluppo controllato |
| Contratti M1/M2 | Base adeguata a identità, quote e marginali; non comprendono ancora tutti i gate contestuali, ticket e finalità M3. COMPLETE_OFFLINE_DIAGNOSTIC non è ammissione |
| Lettura autentica delle giornate future | Il loader reale M2 è attualmente legato alla verifica della serie G8. Un pilot su eventi futuri richiederà journal autorizzati e il relativo lettore ufficiale verificato; non è già dimostrata una pipeline generica per le giornate successive |
| Fattibilità matematica | Fréchet rende possibile un caso sintetico ma può legittimamente escludere tutte le combinazioni osservate. Nessuna indipendenza o probabilità congiunta puntuale |
| Validazione scientifica | Pendenti i mercati e il selettore; `validatedMarkets:[]` invariato. Codice e test non equivalgono a calibrazione, profitto o autorizzazione operativa |
| Prerequisiti di sviluppo | Nuova autorizzazione M3 e revisione della policy proposta; preferibile iniziare da gate/preview e contratto di persistenza con le nuove regressioni |
| Prerequisiti di esecuzione autentica | Esperimento futuro approvato, forecast/quote freschi e autorizzati, evidenze reali, ticket e FSM di recovery verificato. Nessun budget o consenso provider rinnovato qui |

**M3 READY WITH DOCUMENTED LIMITATIONS** non autorizza ad avviare M3, a usare G8 retroattivamente o a generare una multipla. La conclusione riguarda la possibilità di procedere alla revisione e a un nuovo lotto autorizzato, conservando il rischio di mancato progresso come stato esplicito da gestire.

Nessuna API, acquisizione, forecast autentico, refit, journal/coorte modificati, consegna, Android, scheduler, deploy, merge o scommessa. Stake reale0 €. Nessun lavoro M3 avviato.
