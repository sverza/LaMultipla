# M3-A — Compositore esplorativo isolato

27 ottobre 2026. Base locale `94abb388067fc76c1dd287e4c2259b81bae5e0b5`, branch `feature/oddspapi-private-import`.

## Perimetro effettivo

Componente puro, sincrono e deterministico per **soli vettori sintetici offline**, BTTS e O/U2,5 FT. Non legge file, rete o orologio implicito e non persiste nulla. Non produce una proposta autentica, neppure quando i gate ipotetici sono soddisfatti. Non attiva la policy M3 proposta e non implementa M3-B.

La limitazione a input sintetici è intenzionale: impedisce di utilizzare questo lotto per comporre simulazioni su G6–G9 o partite future. Gli ingressi autentici/archiviati sono rifiutati. Il lettore M2 autentico resta quello già esistente, senza essere esteso o richiamato da M3-A.

Tutti i risultati, le combinazioni e le leg esplorative dichiarano `operationallyApproved:false`, `scientificallyValidated:false`, `statisticallyValidated:false`, `actualStakeEUR:0`, `admissible:false`. Non sono istruzioni di gioco. Nessun pacchetto Android, classifica operativa o feed pubblico.

## File e contratti

| File | Funzione |
|---|---|
| `scripts/lib/mm-simulator-v1/composition.mjs` | `composeSyntheticExploration(input)`: validazione, enumerazione limitata, esclusioni e limiti matematici |
| `scripts/lib/mm-simulator-v1/composition-gates.mjs` | Contratti di scenario sintetico, gate contestuali, tempi, liquidazione e prezzo del ticket |
| `tests/fixtures/mm-composition.mjs` | Input sintetici costruiti con adapter M1 e diagnostica M2 reali; nessun mock dei validatori |
| `tests/mm-simulator-composition.test.mjs` | Prove matematiche, funzionali, di immutabilità, esclusione e assenza di effetti |

I contratti M1/M2 rimangono invariati. Il risultato usa `lamultipla-mm-synthetic-composition-v1`. Gli ingressi comprendono snapshot M1, diagnostica M2, journal/studio sintetici corrispondenti, UTC esplicito, limiti di ricerca espliciti ed eventuali evidenze sintetiche. Il ricalcolo delle **sole proiezioni** M2 confronta l'intero risultato con quello fornito: non è un fit, un nuovo forecast o un controllo limitato al digest auto-dichiarato. Vengono usati i validatori scientifici già esistenti; nessun modulo registrato viene cambiato.

Riferimenti conservati: snapshot/diagnostica/journal/studio, codice/protocollo, griglie e bootstrap, entry, dataset, timestamp, identità e provenienza delle quote. Gli hash dello scenario, della ricerca e di tutte le evidenze identificano la prova. L'hash canonico del risultato è un fingerprint in memoria, **non una ricevuta di persistenza o attestazione di freeze**.

L'API non accetta opzioni di attivazione. Uno scenario può avere soltanto `approvalState:NOT_APPROVED` e `synthetic:true`; uno stato APPROVED o un campo di autorizzazione aggiunto all'input viene rifiutato. I contratti review sono esplicitamente `lamultipla-mm-synthetic-selection-review-v1` e `lamultipla-mm-synthetic-ticket-review-v1`: non costituiscono verifiche umane reali. Non si generano attestazioni autentiche.

## Parametri e decisioni ancora da approvare

**Nessuno dei valori nuovi sotto è attivato.** Il fatto che un valore esista nel vecchio selettore non approva il suo trasferimento a M3. I parametri presenti nella fixture sono vettori di test dichiarati, non configurazione operativa.

| Elemento | Vincolo già applicabile / origine | Proposta M3 o decisione futura |
|---|---|---|
| Famiglie e periodo | BTTS Yes/No e O/U2,5 FT, esclusi supplementari/rigori: perimetro esplicito M3-A | Altre linee richiedono nuova autorizzazione |
| Una leg per fixture | Esplicitamente vincolante in M3-A | Non derogabile dallo scenario |
| Nessuna squadra ripetuta | Ulteriore criterio della proposta | Da approvare; in M3-A è soltanto un'opzione diagnostica esplicita `excludeRepeatedTeams` |
| Fonte, board e flag | M1: identità esatta, board completo, tutti i quattro flag positivi; nessun override | Riutilizzo vincolante; non sono ammissione scientifica |
| Modello primario | DC e bivariato restano distinti nei dati M2 | DC fisso proposto, bivariato comparatore; scelta da approvare. Nei test la scelta è esplicita, senza fallback o selezione del migliore |
| EV marginale puntuale | Vecchio riferimento ingegneristico 0,05 | 0,05 proposto, non validato per M3 |
| EV marginale inferiore | Vecchio riferimento 0,02 | 0,02 proposto |
| Ampiezza intervallo | Vecchio riferimento 0,25 punti di probabilità | 0,25 proposto |
| EV combinato inferiore | Vecchio riferimento 0,05 | 0,05 proposto, da prezzo effettivo e Fréchet |
| Numero leg | Il vecchio selettore ha regole proprie | M3 propone minimo2/massimo4; nessun default operativo M3-A |
| Budget combinazioni | Vecchio tetto ingegneristico 20.000 | Trasferimento da approvare. `maxCombinations` è obbligatorio nella singola prova sintetica |
| Budget lavoro interno | Nessun valore di protocollo M3 già approvato | `maxVisitedNodes` esplicito limita anche il percorso di enumerazione; tetto produttivo da approvare in M3-B |
| Budget ticket | Nessuna approvazione precedente per M3 | Massimo10 review per tentativo proposto; lo scenario sintetico deve dichiararlo |
| Ordinamento | Nessun ranking M3 attivo | Inferiore EV, puntuale EV, fixture/board/outcome/quote come tie-break; o puro ordine di ID per diagnostica. Ordine autentico da approvare |
| Scelta della combinazione | Nessuna selezione finale in M3-A | Prima combinazione che supera i gate nell'ordine approvato, proposta da approvare; vietata scelta retrospettiva del miglior tentativo |
| Tempi forecast/quote/review | Percorso originale: forecast24h, osservazione e review30min | Adozione M3 da approvare; vincoli espliciti nello scenario, mai clock autentico simulato |
| Calendario/provider | Percorso originale60min | Trasferimento M3 da approvare; entrambe le osservazioni vincolate al contenuto degli eventi |
| Ultimo cambiamento | Vecchio gate24h con review per prezzi non cambiati | Proposta di riuso: `changedAt` non equivale all'ora di osservazione |
| Chiusura composizione | Gestore attuale: kickoff−150min escluso | Adozione M3 da approvare. Nessuna attivazione dei margini di consegna135/120min |
| Contesto | Policy esistente: calendar/injuries/suspensions/lineups; TTL24/24/168/24h, confermate2h, storico osservato72h | Non cambiata. Il gate reale `contextGate` rivaluta evidenze sintetiche; nessun semplice booleano READY basta |
| Regole di liquidazione | Vecchio gate entro7 giorni | Requisito di review esatta di FT, supplementari/rigori, void/rinvii da confermare nel nuovo contratto autentico |
| Bootstrap | M2: almeno40, fallimenti≤10%, metadati coerenti | Invariato; niente replica nuova, calibrazione o intervallo simultaneo |
| Centrale fuori intervallo | M2 segnala l'anomalia senza allargare l'intervallo | La proposta M3 richiede review; M3-A la rende un blocco ipotetico, senza introdurre un override |
| Classificazioni negative | Nessun NO BET completo per dati mancanti | Stati M3 e finalità autentica da approvare; M3-A usa solo stati sintetici e perimetro esplicito |
| Prezzo del ticket | Deve essere osservato per l'esatta combinazione; prodotto delle singole insufficiente | Review autentica e attribuzione da implementare solo dopo approvazione; in M3-A `actualTicketPrice` è sempre null |
| Una finale per giornata | Proposta M3, non nuova regola attiva | Da approvare insieme a intent/recovery e gestione tentativi |
| Inizio, universo e registrazione | Coorti esistenti immutabili, nessun riuso prospettico di G6–G9 | Nuovo esperimento, policy/code hash e autorizzazione antecedenti ai dati eleggibili; da approvare separatamente |

## Gate e matematica

1. Si accettano solo ingressi sintetici coerenti M1/M2 e journal/studio corrispondenti. Hash, identità, scope, periodi, linee, entry, griglie e bootstrap sono ricontrollati. Nessuna associazione artificiale con un'altra giornata.
2. Solo board osservati, normalizzazione valida, esattamente due outcome, disponibilità OPEN, quote valide e forecast prospettico compatibile. Ogni esclusione resta visibile, inclusi board senza outcome. Modello primario incompleto: nessun fallback al comparatore.
3. Le combinazioni sono enumerate prima per numero di leg crescente e poi per indici lessicografici della lista dichiarata. I limiti contano anche combinazioni escluse per fixture ripetuta. Il limite sui nodi protegge il lavoro prima della generazione di una combinazione. Nessun ciclo infinito o ricerca fino al successo.
4. Si riusa soltanto `frechet()` dal vecchio modulo; il selettore1X2 non viene invocato. Per `n` leg: `L=max(0,sum(p)-(n-1))`, `U=min(p)`; sensibilità `max(0,sum(l)-(n-1))` e `min(u)`. `jointProbability:null`, `jointConfidenceInterval:null`, intervalli marginali non simultanei.
5. Contesto rivalutato dal validatore esistente. Review sintetiche di singole, regole e ticket legate tramite hash agli input esatti; duplicati/contraddizioni, dati scaduti o futuri, prezzi diversi e timestamp non coerenti bloccano il relativo scenario. Il ticket deve seguire le review singole.
6. Se una combinazione fallisce già soltanto i criteri marginali, non richiede un ticket per dimostrare quel rifiuto. Un contesto mancante o un'altra review assente rimane invece incompletezza. I ticket sono esaminati nell'ordine dichiarato, con budget esplicito; nessuna nuova acquisizione.
7. Solo con un prezzo del ticket **sintetico fornito indipendentemente** si mostra `[C*L_sens-1,C*U_sens-1]`, condizionale alla liquidazione binaria ordinaria di tutte le leg. Nessuna probabilità di void inventata. Non viene neppure prodotto il prodotto delle quote singole.

Sono sempre presenti i blocchi `M3A_SYNTHETIC_ONLY`, `POLICY_NOT_APPROVED`, `AUTHENTIC_EVIDENCE_NOT_VERIFIED`, `M3B_NOT_IMPLEMENTED`. L'assenza della policy ammette matematica, non ammissione. Le review sintetiche non eliminano questi blocchi e non provano che bet365 offrisse alcun prezzo.

## Stati e casi incompleti

| Stato M3-A | Significato |
|---|---|
| INPUT_INVALID | Contratto, hash, scope o identità non verificabili, oppure tentativo di usare dati autentici |
| ANALYSIS_INCOMPLETE | Review, prezzi del ticket, contesto, modello o dati necessari mancanti; ricerca troncata; mai NO BET completo |
| MATHEMATICALLY_CALCULABLE_NO_COMBINATION | Nessuna combinazione costruibile nel perimetro diagnostico senza lacune rilevate |
| NO_COMBINATION_MEETS_SYNTHETIC_CRITERIA_IN_REVIEWED_SCOPE | Nessuna combinazione supera i criteri nel solo scope sintetico esplorato e verificato; non prova di assenza di valore nell'offerta reale |
| SYNTHETIC_CRITERIA_SATISFIED_NOT_ADMISSIBLE | Almeno una combinazione supera i gate dello scenario di test; nessuna proposta ammissibile o finale |

Il campo distinto `mathematicalState` mostra `COMBINATIONS_CALCULABLE`, `MARGINALS_ONLY` o `NO_VERIFIABLE_MARGINALS`. Ogni combinazione riporta i gate falliti e resta `EXPLORED_NOT_ADMISSIBLE` oppure soddisfa soltanto i criteri sintetici. Lacune della popolazione sono esposte separatamente; una combinazione positiva ipotetica non certifica copertura completa delle altre fixture. Non si sceglie o persiste una combinazione finale.

## Dimostrazione sintetica

Dieci fixture inventate, quote presenti sulle prime due, altre otto senza board quotati: nessuna partita reale. Dai journal sintetici verificati, DC assegna0,95 a BTTS Yes e Over2,5; i bootstrap congelati del vettore danno estremo inferiore0,90. Due leg di fixture distinte producono limiti centrali[0,90;0,95] e limite inferiore di sensibilità0,80. Prezzo del ticket dato1,40, distinto dal prodotto1,20×1,20=1,44: estremo netto inferiore0,12, **solo nello scenario sintetico**. `actualTicketPrice` resta null e nessuna ammissione avviene.

Il vettore separato con estremi0,49/0,49 conserva esattamente `L_sens=0`, netto inferiore−1 per ogni prezzo finito. La mancanza di contesto, policy o ticket produce incompletezza; l'assenza di un forecast impedisce la relativa leg. Le soglie non sono state stimate o scelte usando risultati reali.

Evidenze della prova privata e log: `.local/diagnostics/mm-simulator-m3a-20261027/`. La demo è un report diagnostico sintetico, non journal/decisione autentica. Per i test riproducibili: `node --test tests/mm-simulator-composition.test.mjs`.

## Test, integrità e limiti

22 test dedicati: casi positivi, complementi e Fréchet a2/3 leg, limite zero, stessa fixture, board inattivi/incompleti, prezzi/timestamp/identità non validi, forecast/bootstrap mancanti, duplicati, contesto reale rivalutato su dati sintetici, liquidazione/ticket, policy assente, limiti di ricerca/review, confini temporali, ordinamento e determinismo. Input congelati in profondità e confronto byte/hash prima/dopo. La prova di purezza intercetta accessi filesystem, fetch e `Date.now()` durante la chiamata.

Durante lo sviluppo la fixture iniziale è stata rifiutata perché il normalizzatore richiede un universo di10 incontri: la fixture è stata corretta, mantenendo il validatore invariato. La prova del limite zero ha inizialmente incontrato review insufficiente/scenario incoerente; sono stati distinti i vettori matematici, i controlli sulla centrale e il budget esplicito. Nessun test disabilitato o gate indebolito per ottenere PASS.

Esito finale: **M3-A COMPLETE**. Test dedicati22/22; regressione parallela537/537 in65,915s e seriale537/537 in242,559s, senza skip. Lint senza errori, solo l'avviso preesistente `combinedPlayedOdd` in `app/components.tsx`; build Next.js/TypeScript superata. Confronto su5.737 file preesistenti per SHA256 byte, dimensione e mtime: nessuna modifica. Aggiunti soltanto cinque file: i quattro elencati nella tabella e questo documento. Nessun file scientifico o selettore esistente modificato.

La regressione multiprocesso M2.5 rimane identica. Nella suite parallela il controllo del lock fra6 processi/600 tentativi ha registrato21 ingressi, zero sovrapposizioni e zero rifiuti di accesso Windows; non è una promessa di throughput. Nessun nuovo problema di concorrenza osservato nelle due suite. Il compositore non promette progressi di lock: non usa alcun lock o store. Non misura qualità predittiva né frequenza di opportunità; le griglie della demo sono inventate. Commit soltanto locale: nessun push, CI remota non eseguita, nessuna attivazione della policy.

## Piano M3-B — da autorizzare, non iniziato

1. **Decisioni prima del codice autentico:** approvare policy/versione/hash, modello primario, soglie, min/max leg, limiti di ricerca/nodi/review, ordinamento, finalità e universo futuro. Registrare autorizzazioni reali separatamente. Nessun consenso implicito dal superamento di M3-A.
2. **Contratti autentici e lettura:** manifest di ammissione e lettore ufficiale dei futuri journal autorizzati; verifica freeze/receipt, codice/modello/dataset/cutoff, RAW/catalogo/quote, universo e ID. Estendere il confine delle fonti senza cambiare engine, forecast o coorti. Non rietichettare il prezzo storico M2 come corrente.
3. **Review autentiche:** contratto versionato per disponibilità/prezzo singolo, fonti ufficiali di liquidazione, contesto completo e ticket realmente mostrato. Revisore, timestamp di osservazione/revisione, hash/versioni, scadenze e revisioni append-only; vietato riusare le asserzioni SYNTHETIC_TEST_VECTOR di questo lotto. Nessuna automazione dell'account bet365.
4. **Intent e writer:** namespace separato M3, lock esistente senza modifiche, input/code/policy hash immutabili prima degli effetti; rilettura sotto lock. Due BUSY possono significare nessun vincitore. Nessuna assunzione di fairness o retry automatico, nessuna numerazione per eludere effetti ambigui.
5. **Commit e ricevute:** preview/finale distinti, byte/hash e riferimenti propri, timestamp reale di completamento, rivalidazione di tutti i gate prima degli effetti; un'unica finale autorizzata nel perimetro approvato. Replay read-only degli stessi input; input nuovi richiedono osservazione/tentativo consentiti, mai riscrittura.
6. **Recovery:** test filesystem Windows con processi separati, crash prima/dopo ogni effetto, final senza receipt, cleanup fallito, EPERM/EACCES, lock alterato/residuo. Nessun successo senza verifica finale; completamento della sola receipt soltanto se previsto e con prova del commit entro deadline, non dedotto dal solo mtime. Fuori finestra niente nuova composizione autentica.
7. **Accettazione:** suite seriale/parallela, integrità di tutti gli originali, test sintetici completi con reader/review/store reali e clock controllato esclusivamente nei test. Nessuna esecuzione prospettica fino ad autorizzazione distinta. Android v4 resta escluso; nessun export senza nuovo contratto e revisione separata.

Rischi residui: mercati non validati (`validatedMarkets:[]`), intervalli marginali non simultanei, dipendenze non identificate, prezzo e regole reali ancora da verificare, raro superamento legittimo di Fréchet, completezza dei dati futuri, contesa fail-fast e recupero produttivo non ancora implementato. Il completamento del codice M3-A non risolve questi rischi e non autorizza M3-B.
