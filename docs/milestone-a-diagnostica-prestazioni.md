# Milestone A: censimento, affidabilità e prestazioni diagnostiche

Misure effettuate il 14 ottobre 2026; ripresa e chiusura del lavoro il 18 ottobre. La roadmap generale è approvata, ma l'autorizzazione operativa di questo intervento riguarda soltanto A. Nessun modello o adapter di mercato B–G viene introdotto.

## Confini e causa misurata

La CLI diagnostica usa ora `scripts/lib/diagnostic-performance/`, esterno ai moduli registrati. `engine/screen.mjs`, `engine/markets.mjs`, i modelli, gli studi, i protocolli scientifici e il selettore 1X2 restano invariati. Il riferimento originale rimane disponibile per i confronti; chiamarlo direttamente mantiene il costo storico. La modifica riguarda il percorso diagnostico della CLI, non l'autorità decisionale.

Il report era serializzato e sottoposto a SHA256 nel loop di ogni quota sia nello screening sia nel mapping diagnostico: l'operando destro del confronto veniva calcolato anche con mapping assente. Nel caso da 14.414 selezioni ci sono 28.830 lookup dell'hash del report. Il profiling strumenta copie private dei sorgenti originali e registra i relativi hash, senza modificarli. Dopo 300 secondi il riferimento senza cache non aveva completato: all'ultima osservazione aveva calcolato 7.296 hash del report, per 295,29 secondi. Il calcolo dei payout parzialmente eseguito aveva richiesto 2,23 secondi. Non è disponibile un tempo finale del riferimento completo.

Il nuovo adapter valida il journal e costruisce hash invarianti e indici una volta per elaborazione. Riusa distribuzioni di liquidazione e campioni bootstrap per fixture/modello/spec; mantiene il calcolo EV specifico del prezzo e le stesse formule. Gli indici conservano l'ordine e le distinzioni del riferimento: prima riga di screening per quoteId/modello, ultima review nello screening, review unica obbligatoria nel mapping diagnostico. Nessuna cache sopravvive alla singola elaborazione. I duplicati non vengono trasformati in quote valide.

Disponibilità manuale, origine, identità, integrità dei legami hash, periodi, freschezza, soglie, componenti push/halfWin/halfLoss, intervalli e motivi di esclusione restano verificati. La CLI controlla gli hash canonici dei sorgenti di riferimento prima di usare l'adapter e registra l'identità del codice aggiuntivo nel nuovo rapporto. Una modifica futura a tali sorgenti blocca questo adapter fino a revisione esplicita. I vecchi artifact non vengono riscritti.

## Benchmark riproducibile

`scripts/benchmark-diagnostic.mjs --shape PRIVATE_REPORT --mode optimized --timeout 180` usa soltanto struttura e cardinalità dell'acquisizione esistente; quote, squadre, giocatori, griglie e orologi del workload sono sintetici. Nessuna rete, nuovo training originale, consegna o chiamata provider. I 40 bootstrap sono griglie sintetiche già preparate: questo benchmark misura la loro elaborazione, non ripete il benchmark dei fit.

Le modalità sono `reference` (algoritmo e hash originali strumentati), `reference-cached` (stesso algoritmo originale, riuso del solo hash puro e invariante del report), `optimized`. La seconda serve a ottenere un riferimento completo confrontabile senza attendere tutti i ricalcoli identici. Non viene presentata come il tempo originale senza ottimizzazioni. Varianti: `base`, `incomplete`, `duplicates`.

Il controller conserva intent, esito, stderr, profilo parziale e risultati privati. Il timeout predefinito è 300 secondi, configurabile fino a 1.800; non arresta automaticamente il lavoro a 60 secondi. Termina e attende il proprio unico worker su timeout/interruzione, senza agire su altri processi. Un test verifica anche che il PID non sia più attivo. JSON e HTML sintetici completi vengono conservati privatamente nei run riusciti.

Hardware delle misure: Windows, Node 24.19.0, Intel i9-10900KF, 20 processori logici, circa 32 GiB RAM. Sono misure locali, non un percentile di servizio o una promessa per qualsiasi report.

| Caso da 14.414 selezioni / 34 tipi | Tempo build + JSON + HTML | Picco RSS processo |
|---|---:|---:|
| Originale senza cache | Non completato entro 300,04 s | Almeno 315,87 MiB, profilo parziale |
| Riferimento con solo hash riusato | 7,617 s | 314,90 MiB |
| Adapter ottimizzato, normale | 4,021 s | 357,98 MiB |
| Adapter ottimizzato, ripetizione | 4,057 s | 357,93 MiB |
| Adapter, report incompleto | 4,018 s | 357,43 MiB |
| Adapter, duplicati | 4,034 s | 358,36 MiB |
| Adapter finale, ripresa del 18 ottobre | 5,706 s | 364,35 MiB |

Il picco RSS aumenta di circa 43 MiB rispetto al riferimento completo con solo hash riusato: è il costo delle cache e della generazione/archiviazione degli artifact, non un miglioramento di memoria. Il picco finale dell'originale senza cache non è noto. L'aumento è contenuto sul PC misurato, ma va sorvegliato per volumi maggiori; non viene nascosto dal risultato sui tempi. Nel caso normale CPU user/system circa 4,063/0,093 s, non una somma di core o una stima delle altre fasi operative.

La revisione del 18 ottobre ha eliminato anche un hash ridondante nel riepilogo dello screening esterno. Il codice finale calcola l'hash del report soltanto nel contesto iniziale; gli altri moduli usano quel valore. L'ultima prova, svolta durante i controlli della ripresa, registra build 5,635 s, JSON 0,0646 s, HTML 0,0058 s, CPU user/system 5,859/0,094 s e picco 364,35 MiB. Il tempo è superiore alle misure intermedie del 14: non si assume un ambiente privo di altri carichi né si seleziona soltanto la prova più rapida. Anche l'output completo di questa versione finale è esattamente uguale al riferimento. Il confronto di memoria completo disponibile diventa circa +49 MiB; nessuna riduzione di memoria viene dichiarata.

| Fase del caso normale | Tempo |
|---|---:|
| Validazione, hash e indici | 0,293 s |
| Screening, inclusi i payout usati dallo screening | 3,554 s |
| Calcolo dei payout probabilistici, totale trasversale | 3,491 s |
| Di cui dentro lo screening | 3,447 s |
| Generazione envelope JSON completo e formattato | 0,0479 s |
| Generazione HTML | 0,0048 s |

Le righe probabilistiche si sovrappongono allo screening e non vanno sommate due volte. Il resto della build comprende classificazioni, intervalli, ranking e composizione. Il totale misura elaborazione e generazione; scrittura privata e avvio del processo sono registrati separatamente. Nei run normali del 14 avvio + esecuzione del worker richiedono circa 4,8–4,9 secondi; nell'ultima prova del 18 circa 6,85 secondi. L'obiettivo locale di 60 secondi è raggiunto senza ridurre dati o controlli.

## Equivalenza e censimento

I test confrontano con `deepStrictEqual` gli oggetti completi, le serializzazioni e l'HTML, senza tolleranze numeriche. Coprono report assente/scaduto/futuro/incompleto, prezzi invalidi, quote inattive, identità errate, duplicati con prezzi diversi e review duplicate, mapping asiatico manuale, rimborsi parziali, verifica manuale disponibile/non disponibile, legami hash errati, griglie alterate e bootstrap insufficiente. `referenceV1` conserva le proprie differenze dichiarate rispetto ai due modelli v2, senza inventare intervalli mancanti.

Sul volume completo, normale/incompleto/duplicato, l'adapter e il riferimento con il solo hash riusato producono gli stessi oggetti, hash del payload e HTML. Il riferimento senza cache è verificato direttamente sui casi deterministici di dimensione ridotta. Un controllo separato usa lo studio v2 registrato, 1.643 righe consentite anteriori a luglio 2024, parametri fissi, cutoff 2024-06-01 e 40 bootstrap per modello su target astratti: equivalenza esatta, nessun tuning e nessuna validazione predittiva o forecast originale G7.

Il census versione 2 conserva tutti i 34 tipi osservati e distingue per gruppo: presenza catalogo e legame con lo snapshot, osservazione effettiva, prezzo numerico e flag provider, disponibilità corrente non certificata, matematica/payoff implementati, modello mancante o gate prospettico pendente, regole/ticket non attestati dal census e posizione rispetto al selettore. I tipi soltanto a catalogo restano separati. Inattivi, mancanti, periodi e tipi non supportati non spariscono. La matrice e il JSON completi restano privati.

`Double Chance Full Time` è censito con `EXACT_NAME_MISMATCH_NO_SILENT_ALIAS`: il test dimostra che quel nome è escluso mentre il nome esatto già riconosciuto `Double Chance` continua a essere riconosciuto. Nessun alias funzionale nuovo viene aggiunto in A. La mancanza di mapping o validazione non significa assenza dimostrata di valore.

Verifica locale: 293 test superati, inclusi sette nuovi test di equivalenza/controller; lint senza errori con il solo warning preesistente, build riuscita. I benchmark sintetici sono collaudo tecnico, non validazione statistica. G6, baseline, studi e coorti restano invariati.

## Proposta del primo lotto B, da autorizzare

1. Adapter esterno per il nome provider `Double Chance Full Time`, limitato a periodo FT, esiti 1X/X2/12, quote non player e catalogo/snapshot esattamente collegati. Nessuna normalizzazione generica o alias su altri periodi.
2. Consolidamento del contratto dei mapping già matematicamente supportati: totali FT, gol squadra home/away e DNB. Esplicitare ID/esito/linea/lato, campi mancanti e stato di verifica delle regole; non creare nuovi modelli o promuovere mercati.
3. Test necessari: fixture/outcome ID esatti, rifiuto di nomi/periodi ambigui, complementi/monotonicità sulle mezze linee, push e quarti dove applicabili, orientamento home/away e rimborso DNB, legami hash obsoleti, duplicati e provenienza delle attestazioni. Conservare i test di equivalenza A e tutti i blocchi del selettore.

Handicap con orientamento non ancora provato, Multigol, score esatti e modelli temporali restano lotti successivi: non completare campi mancanti per inferenza. B non viene avviata da questo intervento.

## Date scientifiche e limiti

Il lavoro del 14 ottobre non ha eseguito valutazione G6 né freeze G7. Alla ripresa del 18 ottobre entrambe le date originariamente previste sono trascorse: questo intervento verifica l'integrità ma non certifica un'esecuzione avvenuta il 15/16, non retrodata e non ricostruisce forecast. Il preflight readonly del 18 riporta G6 `DUE_REQUIRES_RECORD`, con journal e baseline integri: nessun controllo registrato del 15 viene quindi dichiarato completato. Eventuali controlli o lacune del percorso originale richiedono una fase separata autorizzata, con i timestamp effettivi. Nessuna richiesta provider, consegna, automazione, deploy o modifica Android. Stake reale zero.
