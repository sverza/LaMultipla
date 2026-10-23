# G8 — MULTIPLA INTEGRITY FIX

Correzione tecnica del percorso sperimentale, con riferimento iniziale `f28d0fafc445ab247dafd26b73fb4fc395f51688`. Non modifica il freeze scientifico, le probabilità, le quote, EV, selezioni, soglie o governance. Nessuna acquisizione, consegna o attivazione reale è necessaria per il collaudo.

## Causa dimostrata

`appPackage()` assegnava `decision.governance.shadow.reasons` direttamente a `payload.reasonCodes`. L'append delle etichette progressive modificava quindi l'array della decisione. Nel percorso `runReferenceScreen()` il finale era già persistito da `commitFinal()`: l'hash calcolato successivamente per la ricevuta descriveva la copia alterata in memoria, non il file finale. La riproduzione su input congelati sollevava inoltre un errore durante `Array.push`.

Non era una divergenza legittima fra preview e finale. Il pacchetto poteva dichiarare l'hash del finale corretto mentre la ricevuta dichiarava quello della copia successivamente mutata.

## Correzione e confini

- Le motivazioni del pacchetto sono un array autonomo; il payload validato viene restituito come copia profonda, per non condividere nemmeno round, intervalli, conteggi o bounds con gli input.
- `experimentPayload()` costruisce una copia autonoma del finale: la preview rimane immutata.
- Prima della ricevuta, il bridge confronta gli hash attesi con le decisioni e il pacchetto effettivamente persistiti. Una discordanza arresta il percorso, senza riparare né sovrascrivere artifact.
- Le ricevute nuove indicano esplicitamente `previewDecisionFile`, `previewDecisionSha256`, `decisionFile`, `decisionSha256`, `packageFile` e `packageSha256`. Sono metadati locali aggiuntivi: il contratto Android v4 resta invariato.

Per una MULTIPLA, `decision.json` nel tentativo è la preview; `decisionFile` della ricevuta indica il finale canonico shadow. I due hash differiscono intenzionalmente per finalizzazione, provenienza e relativo audit di governance. Probabilità, opportunità, gate e selettore sono identici. `payload.source.decisionSha256` deve coincidere con l'hash del finale, non con quello della preview.

Per NO BET provvisorio e ANALYSIS_INCOMPLETE con decisione, i riferimenti puntano alla decisione del tentativo, senza inventare un finale. In assenza di quote non esiste una decisione e i riferimenti sono null.

`verifyDecisionBundle()` e `commitFinal()` non richiedono modifiche: il replay avviene al timestamp originario e la pubblicazione resta esclusiva. Un contenuto differente non può sostituire il finale. Nessuna migrazione o riscrittura automatica di vecchie ricevute, decisioni, esperimenti o backup.

## Prove di regressione

`tests/multipla-integrity.test.mjs` verifica input profondamente congelati, assenza di alias di output, determinismo, hash e byte dei due tipi di decisione, collegamento al pacchetto v4, recupero dopo crash in cinque fasi, replay senza cambiamenti a byte/mtime, rigetto di input o artifact alterati anche con envelope ricalcolato e assenza di regressioni negli altri due esiti.

I test `reference-screen` esercitano anche il percorso sintetico completo fino al ricevitore, persistenza, duplicati e ACK tramite trasporto REST simulato. Questo non costituisce una consegna cloud/Samsung reale né una validazione predittiva.

Gli errori inseriti dai test restano in directory temporanee isolate. Nessun journal G8 autentico viene creato. I checkpoint di crash sono conservati durante il recupero; il selettore viene eseguito una sola volta per il medesimo input.

## Gate formazioni: riscontro, nessuna modifica

La policy attuale richiede review di `calendar`, `injuries`, `suspensions` e `lineups` per entrambe le squadre. Una probabile è ammessa, senza presentarla come formazione confermata, quando:

- è riferita esattamente a fixture, squadra e competizione;
- proviene da una fonte attribuita e revisionata con ambito prima squadra maschile e diritti delle note private espliciti;
- contiene undici ID e nominativi distinti, `kind: probable`, osservazione anteriore a decisione/kickoff e validità temporale del protocollo;
- la review è unica, successiva alle osservazioni incluse e riconosce l'incertezza con nota reale;
- non vi sono conflitti fra formazioni o altre evidenze incompatibili.

Le probabili e le rispettive review hanno TTL 24 ore rispetto alla decisione. Le confermate richiedono fonte club/league e osservazione entro due ore. Gli ID dei giocatori devono essere reali, non segnaposto creati per superare il gate. Un'informazione assente non viene trasformata in conferma.

Senza una formazione valida il contesto della gara non è pronto: le sue selezioni non entrano nella MULTIPLA. È comunque possibile conservare e consultare opportunità 1X2 grezze, prima del gate contestuale, chiaramente diagnostiche e non ammesse né consigliate. Il freeze delle probabilità resta indipendente da tutte queste informazioni.

## Operatività

Il monitor privato deve continuare a rilevare hash discordanti. La prova storica del bug viene conservata; un'evidenza separata della correzione può chiuderla soltanto per gli esatti file collaudati. I controlli privati di HEAD devono riconoscere il commit tecnico verificato senza rinnovare o modificare coorte, approvazioni o budget provider.

Il fix rende coerente il percorso MULTIPLA sintetico; non garantisce opportunità reali. Per venerdì restano indispensabili calendario e ID freschi, finestra valida, quote autorizzate dopo il freeze e gate manuali effettivamente completati. Stake reale sempre zero. Nessun invio Android è compreso.

## Validazione locale del fix

Suite completa: 471 test superati. Il lotto mirato con i controlli privati del monitor e delle guardie operative comprende 50 test superati. Lint: nessun errore e un warning preesistente in `app/components.tsx`. Build di produzione riuscita, senza deploy. Queste prove tecniche non costituiscono validazione statistica né un collaudo cloud o Samsung reale.
