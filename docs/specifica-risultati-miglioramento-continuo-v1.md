# Specifica tecnica v1: risultati e miglioramento continuo

21 ottobre2026. Direzione metodologica approvata dall'utente; questo documento è una **specifica da revisionare**, non una registrazione di nuove coorti, un protocollo attivo o l'implementazione del ciclo produttivo. Restano immutati engine, modelli/studi v1/v2, governance e coorti preregistrate. Il laboratorio allegato esercita soltanto controlli read-only e dati sintetici.

## A/B/C: contratti delle fonti distinti

| Ruolo immutabile | Uso ammesso dal disegno | Esclusioni |
|---|---|---|
| A — original | Fonte/protocollo esattamente preregistrati, oggi Openfootball CC0 per G6 e studi esistenti | Non modificare source ID, regola data+48h, evaluator, journal, cutoff o baseline per riempire pending |
| B — supplemental | Valutazione parallela con protocollo/ID/output propri; origine e ragione dell'inclusione esplicite | Non diventa A, campione indipendente o training per effetto della riconciliazione. G6 con esiti acquisiti ora non viene chiamata valutazione tempestiva del15 |
| C — future cohort | Fonte e regole fissate prima del primo evento eleggibile della nuova coorte/challenger | Nessun riuso post hoc di eventi già osservati come holdout nuovo. Cambiare fonte richiede versione distinta, non alias |

Un contratto di fonte `result-source-contract-v1` dovrà contenere: `sourceId`, `version`, `role`, `providerLineage`, URL/endpoint documentati, schema/periodo/stati ammessi, competizione/stagione, diritti **separati** per acquisizione, conservazione audit, valutazione, training e redistribuzione; prova/URL/hash/data dei termini; attribuzione, scadenza e vincoli dopo cessazione, limiti richieste e credenziali richieste. Nessun segreto nel contratto. Un revisore non può rendere legale una fonte impostando un booleano: occorre evidenza verificata e ambito coerente. Cambi di termini sospendono nuove acquisizioni sino a review.

Dipendenze comuni devono essere registrate: due siti alimentati dallo stesso provider non sono riscontri indipendenti. Un risultato ufficiale ha un ruolo diverso da un riaggregatore; il conflitto non si risolve contando le pagine concordi. Nessuna fonte alternativa attualmente promossa. Scelta candidata e blocchi nell'[audit corrente](risultati-affidabili-audit-2026-10-21.md).

## Artifact e collegamenti proposti

Tutti privati, immutabili, versionati, con envelope SHA256 già usato dal progetto e riferimenti per hash; nessuna append su un journal scientifico originale. Namespace futuro dedicato `.local/research-review/v1/`, non i percorsi originali delle valutazioni v1/v2. Questo namespace non viene attivato dall'implementazione attuale.

| Artifact | Campi minimi / vincoli |
|---|---|
| `result-observation-v1` | source-contract hash, request ID/URL senza credenziali, richiesta/acquisizione UTC, bytes originali/hash/content-type/status, providerUpdatedAt opzionale, adapter code hash, record ID/revision. Acquisizione è prima evidenza locale, non data gara o prima pubblicazione universale |
| `fixture-crosswalk-v1` | season/competition/round, ID canonico e di fonte, home/away e participant ID, kickoff previsto ed effettivo, manifest hash, alias esatto versionato, evidenza/revisore/data. Relazione uno-a-uno; rinvii richiedono un artifact calendario di rettifica |
| `result-review-v1` | observation/crosswalk hashes, durata/FT90, score separato da extra-time/rigori/tavolino, stato, locator, diritti, conflitti/mancanze, revisore. Campo mancante non è zero |
| `result-adjudication-v1` | Tutte le osservazioni/versioni coinvolte, motivo e documentazione della decisione, effective/as-of UTC, approvatore, scope di fonte/coorte. Non elimina le versioni smentite |
| `evaluation-plan-v1` | Versione/fonte/coorte, manifest/eventi pianificati, endpoint e scoring per mercato, baseline/model set, target/durata/liquidazione, unità di analisi, regole pending/revisioni, metriche, campione/orizzonte/molteplicità e criteri di arresto |
| `cohort-frame-v1` | ID e protocollo hash, start season/round, frame consecutivo pianificato, deadline per evento/giornata, fonti e modelli ammessi. Non inferire l'inizio dal primo journal che sopravvive; tutti i round attesi restano nel denominatore |
| `forecast-set-v1` | Journal/entry hash originali, versione/study/code/config/dataset/calibrazione/cutoff, generatedAt e forecast deadline, distribuzione e incertezza già congelate. Riferimento/challenger/baseline sugli stessi eventi. Nessun ricalcolo di forecast passati |
| `paired-evaluation-v1` | Plan/frame/forecast/result-review/adjudication hashes, acquisizione e scoring UTC, esiti appaiati per mercato, metriche, copertura ed esclusioni per modello, tutti i tentativi, supersedes opzionale esplicito |
| `round-review-v1` | Stato risultati/dati e problemi di forecast separati, metriche descrittive per giornata/cumulativo, tentativi negativi e null, lacune, ipotesi ancora non provate; nessun vincitore automatico |
| `hypothesis-card-v1` | Causa ipotizzata, evidenza osservata e già consumata, modifica proposta, costi/rischi, falsificabilità, dati di sviluppo e nuovo holdout; stato proposed/rejected/deferred/registered |
| `challenger-registration-v1` | Nuovo ID/versione/code/config/calibrazione/dataset-policy, timestamp prima di forecast/eventi di valutazione, hypothesis e plan hashes, primo evento futuro eleggibile, reference e baseline. Nessun aggiornamento silenzioso di un ID |
| `model-review-decision-v1` | retain/reject/suspend/propose-future-version, risultati positivi e negativi, confronto preregistrato e limiti, motivazione/approvatore. Una proposta non cambia il modello attivo |

## Flusso e arresti sicuri

1. `OBSERVED` → bytes/hash/diritti verificati; errori HTTP/schema/diritti diventano `SOURCE_UNAVAILABLE` o `QUARANTINED`, non NO BET o perdita predittiva.
2. `IDENTITY_VERIFIED` → crosswalk completa; duplicati, periodo o casa/trasferta ambigui: `WITHHELD`. Un rinvio non inventa una fixture né un nuovo score.
3. `FT_VERIFIED` → prova di fine gara e durata coerente. Live, suspended, postponed, cancelled, awarded rimangono stati distinti; i punteggi a tavolino non sono gol sul campo. Default non eleggibili allo scoring90 senza regola esplicita preregistrata.
4. `PAIRED_EVALUATION` → identità e tempi del forecast già congelato verificati; stesso sottoinsieme di eventi per ciascun confronto. Registrare anche i denominatori completi e le righe senza forecast, senza risultato, senza una marginale o senza baseline.
5. `DESCRIPTIVE_REVIEW` → errori e copertura analizzati dopo ogni giornata, anche con zero esiti (metriche null). Suggerimenti diventano hypothesis-card, non correzioni delle probabilità storiche.
6. `CHALLENGER_PROPOSED` → approvazione e preregistrazione di un lotto limitato prima di nuovi forecast. Nessun fit o cambio automatico dopo dieci risultati. Implementazione e calendario futuri richiedono un nuovo incarico.

Idempotenza: risultato identificato da bytes/source-contract/adapter hash; valutazione da plan+forecast+result-review hashes, non dal solo numero giornata. Stesso input riusa soltanto un artifact identico; acquisizioni ripetute con nuovi timestamp sono osservazioni distinte, non nuovi eventi statistici. Scrittura esclusiva e lock dedicato del futuro runner; intent recuperabili, nessuna ripetizione ambigua, nessun polling provider o accoppiamento al task Windows di consegna. Il laboratorio presente non ha writer, runner o cron.

Revisioni: confrontare tutte le osservazioni note, incluse rimozioni e ritorni a uno score precedente. Qualsiasi contraddizione resta `CONFLICT_REQUIRES_REVIEW`, senza scegliere automaticamente la versione recente o favorevole. Una decisione successiva crea nuovi artifact e identifica l'eventuale valutazione superata; non la cancella. Mostrare sia risultato osservato al primo controllo sia correzione successiva. Il piano deve preregistrare la politica di rettifica e il momento di chiusura, non sceglierli dopo aver visto le metriche.

## Scoring, calibrazione e confronti

- **1X2:** tre probabilità, log-loss sul risultato osservato; Brier somma delle tre componenti. **BTTS e Over2.5:** target binari, log-loss e Brier `(p-y)^2`. Nel prototipo si riusano le metriche originali senza cambiarle, floor log-loss1e-15 dichiarato. Under2.5 e No Goal complementari non duplicano il campione. Le probabilità congelate non vengono ricalibrate nel report.
- **Nuove linee/payoff:** occorre un endpoint registrato per linea/periodo/famiglia. Su interi/quarti non ridurre push/halfWin/halfLoss a sconfitte: per uno score proprio servono probabilità di tutte le categorie esaustive di liquidazione, oppure target di conteggio opportunamente dichiarato. FT da solo permette di ricostruire il target soltanto se schema e regole sono verificati; non valida il nuovo mercato. EV/ROI e prezzi non sostituiscono scoring predittivo. Nessun adapter B2 incluso.
- **Calibrazione:** curve e conteggi per classe/linea, dieci bin fissi nel prototipo, ECE con denominatori; intervalli descrittivi Wilson già presenti, senza attribuire indipendenza a linee o giocatori dello stesso incontro. Affidabilità/calibrazione con campione piccolo deve mostrare l'incertezza, non un gate automatico basato sull'ECE di dieci match.
- **Confronto appaiato:** reference/challenger/baseline sul medesimo insieme per mercato; mostrare anche copertura per ciascun modello e ragioni di perdita degli eventi. Non favorire un modello che rinuncia agli incontri difficili. Serie completa intention-to-forecast e confronto appaiato sono due viste, non denominatori intercambiabili.
- **Incertezza/inferenza:** review quotidiane descrittive, nessun test ripetuto fino alla significatività. Piano futuro con orizzonte, effetto minimo utile/potenza e molteplicità fissati; bootstrap o altra inferenza per blocchi temporali/match secondo dipendenze, non righe/quote come osservazioni indipendenti. I gate Bonferroni/60 round v2 restano identici. Eventuale monitoraggio sequenziale valido va studiato e preregistrato separatamente.
- **Errori:** loggare probabilità assegnata/esito, errore e contributo allo score; distinguere schema/identità/temporalità/missingness/fit da incertezza predittiva. L'esito raro di una partita non dimostra che il modello abbia una causa sbagliata; motivazioni causali restano ipotesi da studiare su sviluppo dichiarato.

Conservare ogni challenger, rifiuto, fallimento di fit e risultato peggiore: nessuna scelta retrospettiva del tentativo migliore. La revisione può proporre nuove idee prima della fine delle60 giornate, ma gli esiti già letti non diventano nuove conferme indipendenti.

## Aggiornamento dati, parametri, training e modello

| Operazione | Identità e autorizzazione proposta |
|---|---|
| Nuova osservazione di risultati, stesso contratto | Nuovo snapshot; consentito solo entro diritti/rate policy e contesto autorizzato. Non è automaticamente un aggiornamento del dataset di training |
| Estensione dati di training secondo policy già registrata | Nuovo dataset hash/as-of, stessi filtri/cutoff/finestra; nessuna riscrittura del dataset precedente. Gli originali continuano con la propria regola temporale |
| Refit mensile prescritto, stesse regole/config | Nuovo fit e parametri stimati dichiarati nel forecast, non retuning di halfLife/ridge/temperatura; nessun refit di journal già congelati |
| Cambio iperparametri, calibratore, features, cutoff o distribuzione | Nuova versione/challenger e preregistrazione; anche se il nome del modello resta Poisson, non è un aggiornamento innocuo di dati |
| Cambio fonte/target/semantica temporale | Nuovo source-contract e protocollo/coorte; comparabilità esplicita, mai conversione in Openfootball |

La disponibilità `data+48h` resta un'assunzione della policy originale, non una prova storica di pubblicazione. Per un nuovo contratto C registrare prima osservazione locale e revisioni; distinguere gli archivi retrospettivi di sviluppo dai dati point-in-time dimostrabili. Una fonte scoperta il21/10 non prova disponibilità al cutoff1/10. L'eventuale uso di backfill storico nello sviluppo futuro deve dichiararne il limite; non inserirlo automaticamente in training originale o vecchi confronti. Nessuna modifica di queste regole attuata ora.

## Coorte originale e nuova serie

Mantenere G7 mancante, non sostituirla con revisioni shadow o risultati successivi. Il motore v2 non ha journal reali osservati: il suo frame non è attestato come avviato. Un audit basato soltanto sui journal presenti non scopre un prefisso mancante; serve un frame pianificato esterno, soggetto a review. Il nuovo controllo `auditRoundContinuity` espone missing, late/nonoriginal e duplicati su un frame fornito esplicitamente; è un controllo di metadata, non certificazione di autenticità o sostituto dei gate originali.

Per partire eventualmente da G8: registrazione separata con ID, inizio, versione, riferimento, endpoint/fonte, denominatore e trattamento delle lacune fissati **prima** del freeze e dei risultati. Non assegnare ora in automatico la vecchia coorte a G8 e non modificare l'hash degli studi per renderla apparentemente continua. Se G8 non viene autorizzata entro la finestra, registrare anche quella lacuna; nessun forecast a posteriori. Le evidenze G6 restano utilizzabili soltanto nel loro ambito originale o in un supplemento identificato.

## Confine implementato e criteri del prossimo lotto

Implementati fuori dai moduli registrati:

- `scripts/results-lab.mjs --audit-cc0 --manifest FILE --observation FILE [--previous FILE]`: lettura di input privati e envelope; stampa solo un controllo disponibilità/provenienza/date/revisioni, senza scoring o rete. Il manifest può essere letto dal journal esistente. Nessuna opzione per falsificare la data CLI.
- `scripts/lib/results-lab/quality.mjs`: funzioni pure di QA CC0 e continuità su frame esplicito; nessuna acquisizione, selezione, modifica di coorte o modello.
- `scripts/lib/results-lab/prototype.mjs`: confronto appaiato 1X2/BTTS/Over2.5 con calibrazione e differenze descrittive, soltanto con manifest/forecast/evidenze marcati sintetici. Riusa quarantena e metriche esistenti, conserva anche challenger peggiori. Non espone un percorso per valutare journal originali con una nuova fonte.

Test di accettazione: risultato mancante/revisionato/rimosso, fonte diversa, timestamp futuro, data/rinvio, duplicati e casa/trasferta; prefisso/intervallo mancante, journal tardivi/nonoriginali, stagioni; scoring esatto e set appaiati, marginali assenti, esito non FT/tavolino e diritti non verificati; rifiuto di dati originali nel prototipo; CLI locale senza scritture. Sono prove tecniche sintetiche, non validazione predittiva.

Prossimo lotto produttivo soltanto dopo revisione: (1) diritti/account e prova di copertura della fonte, (2) approvazione source-contract B/C e piano/frame, (3) adapter separato con test di schema/identità/quote limits, (4) eventuale confronto reale supplementare autorizzato, (5) freeze prospettico futuro e accumulo descrittivo. B2 resta un lotto distinto; nessun ciclo produttivo, challenger nuovo o automazione attivato da questa specifica.
