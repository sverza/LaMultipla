# Punto 10 — collegamento selettore → contratto v4 → app

11 ottobre 2026. Base `5692c52`, branch `feature/oddspapi-private-import`, PR #2 in bozza. Ripresa dal lavoro già implementato: nessuna rianalisi o acquisizione del pilot, nessuna ottimizzazione statistica ripetuta. L'implementazione software è disponibile; il collaudo reale Windows e Android su dispositivo rimangono aperti. Nessun test sintetico viene presentato come validazione operativa.

## Risultato concreto

Un solo selettore (`scripts/lib/shadow/combinations.mjs`), conservato dopo analisi, riceve candidate filtrate per EV/incertezza, contesto e liquidazione. Default massimo 4 selezioni, minimo 2, limite assoluto 6; stake nominale 3 €, reale 0. Esclude eventi/squadre ripetuti. Non moltiplica probabilità: calcola bound Fréchet e sensibilità alle marginali, non una probabilità congiunta validata. Richiede attestazione italiana con quoteIDs esatte, prezzo osservato e timestamp recente; il prodotto dei prezzi resta diagnostico. NO BET distingue insufficienza dati, valore non robusto, contesto/regole, prezzo combinato e valore congiunto non dimostrato. Il blocco operativo MODEL_NOT_AUTHORIZED è sempre separato.

L'adapter `decision --app-package` verifica gli input e il replay completo prima di generare il contratto v4 minimizzato. Il parser Node/app condiviso controlla schema, hash, provenienza obbligatoria, stime/CI, prezzi/EV, identità, tempi e limiti di stake. L'app visualizza MULTIPLA SIMULATA oppure NO BET con motivazione, verifiche, marginali e audit; non espone azioni di gioco. Probabilità congiunta e CI congiunto restano null.

Archivio IndexedDB sperimentale separato dalle giocate; import idempotente per hash; verifiche prima di scrivere. Backup v4 conserva storico/preferenze e include gli esperimenti; ripristino v3 resta compatibile e non cancella esperimenti. Protezione nel parser legacy impedisce conversioni dirette di un payload sperimentale in una schedina. La distinzione tra bozza e giocata dello storico v3 continua a funzionare; uno stato v4 draft/approved/played è rifiutato, non abilitato per anticipare future autorizzazioni.

Correzione aggiunta nella ripresa: localhost identifica solo un'anteprima **browser**, non l'APK Capacitor; evita la disabilitazione involontaria del feed Android. Quote/forecast congelati non vengono modificati. Rafforzati i controlli contro campi di provenienza mancanti e CI incoerenti con le stime. Anche le ricevute sintetiche sono etichettate come test software nell'interfaccia.

## Verifiche e accettazione

| Criterio del protocollo | Evidenza software | Limite residuo |
|---|---|---|
| 1 Ciclo futuro, audit, integrità | Test CLI del ciclo con calendario/quote mock; dodici fasi, envelope e replay | Giornata reale futura sul PC non eseguita |
| 2 Negative identity/freshness/context/settlement | Suite esistente più parser v4: NaN, campi extra/mancanti, esiti/periodi, doppioni, quote scadute, inattivi e attestazioni discordanti | Verità delle attestazioni è responsabilità del revisore |
| 3 Lavagna incompleta e indipendenza forecast | Test shadow: niente probabilità mercato inventate, journal invariato | Coverage reale dipende dai dati disponibili |
| 4 Cardinalità, stake, combinazione | Min 2/default max 4/limite 6, finale esclusivo, stake 3/0, prezzi distinti, bound senza prodotto di marginali | Nessun modello congiunto validato |
| 5 Modello sperimentale | Test positivo reale selettore→v4 con input sintetici, NO BET tecnico e operativo; approvazioni/giocate rifiutate | Zero autorizzazione operativa |
| 6 Replay e freeze | Test hash alterati, replay a tempo originale, file esclusivi/concorrenza, CLI reimport senza sovrascrittura | SHA locale non autentica la fonte né l'orologio |
| 7 App/backup | Parser legacy/statistiche invariati, archivio distinto; UI desktop 1280×900 e mobile 390×844, backup/ripristino v4 e v3 | Android su dispositivo e PWA installata/offline non collaudati |
| 8 Consegna/pubblicazione | Allowlist della ricevuta senza quote/forecast/report/contesto; pacchetto privato senza segreti; nessuna scrittura public | Diritti, autenticità feed, CAS/ricontrollo e consenso da completare al punto 11 |

**114/114 test automatici superati**, lint zero errori e un warning preesistente (`combinedPlayedOdd`, app/components.tsx). Build Next/TypeScript completata localmente. La CI del nuovo commit non è stata eseguita: il push è bloccato dalla revisione automatica. Nessun nuovo pacchetto runtime installato o modifica lockfile; Playwright/Chromium usati soltanto nel test locale, non inclusi nel prodotto.

Il test browser già eseguito prima dell'interruzione ha lasciato file/screenshot su entrambe le viewport: importazione simulazione/NO BET/ricevuta, prezzo 1,40 distinto da 1,44, inattivo con verifica, rifiuto manomissione, persistenza/deduplicazione ed esportazione backup. Nella ripresa non è stata rieseguita questa sequenza: è stata completata la verifica del ripristino dai backup esistenti, con `LAMULTIPLA_TEST_RESTORE_ONLY=true`. Il primo tentativo di ripresa ha rilevato un errore di scope nel test; corretto. Un successivo tentativo si è interrotto alla seconda viewport per chiusura Chromium in modalità single-process: ora il test apre un browser distinto per viewport e conserva risultati intermedi. La verifica conclusiva riporta 2 viewport, restore v4/v3, storico di prova invariato, zero page errors. Evidenze locali in `.local/e2e-v4/restore-result.json`, file per viewport e screenshot `restored-ui-*`; non vengono pubblicate.

Le marginali 95%, CI 94–96% e prezzi 1,20/1,40 della prova positiva sono **fixture sintetiche dichiarate**, scelte per esercitare la diramazione robusta del software; non sono previsioni di partite reali. Non dimostrano profitto, accuratezza, calibrazione o valore congiunto del modello.

## Consegna e vincoli preservati

- [Contratto app v4](contratto-app-v4.md): schema, stati e confini della consegna privata.
- [Collaudo Windows](collaudo-v4-windows.md): un comando per volta, inventario read-only e calendario futuro verificato prima delle acquisizioni.
- Protocollo generale v1 aggiornato sullo stato implementativo; policy generale/shadow, soglie e motori statistici originali invariati. Rapporti storici dei punti precedenti non riscritti.
- `public/latest-slip.json`, storico applicativo nel repository, manifest del pilot, modelli/registri/protocolli specialistici e workflow inalterati. Il container non ha accesso al filesystem Windows: l'integrità materiale dei file originali sul PC dovrà essere confermata localmente.
- Zero nuove richieste OddsPapi, nessun merge/deploy/feed reale, nessun trigger o modifica di automazioni. Il vecchio audit resta sospeso come già verificato nel punto 9; questa ripresa non invoca API di gestione automazioni.
- Repository pubblico: vengono salvati solo codice, documentazione e fixture sintetiche. I pacchetti privati, screenshot e log locali sono esclusi dal commit.

## Blocchi precisi verso il punto 11

| Blocco | Completamento richiesto |
|---|---|
| PC Windows/giornata futura | Aggiornamento branch verificato, studio/dataset/calendario disponibili, forecast prima delle quote, evidenze reali, decisione congelata/replay e import app; NO BET è esito ammissibile |
| Android/PWA installata | File picker, WebCrypto/IndexedDB, riapertura/offline, backup/condivisione su dispositivo; viewport mobile non sostituisce il test nativo |
| Monitoraggio originale | Dal 15 ottobre valutazione separata del journal originale e baseline; obbligo manuale, nessuna attività programmata |
| Validazione operativa | Evidenze future preregistrate per modello/mercato e selettore, metodo congiunto validato, revisione e autorizzazione esplicita; nessuna promozione automatica |
| Feed GitHub→app | Diritti redistribuzione/retention OddsPapi e dati contestuali, autenticità del pacchetto, consenso pubblicazione, CAS del feed e rilettura; native NO BET notification ancora legacy |
| Automazione | Ruolo del job e credenziali private/budget definiti dopo collaudo; autorizzazione separata prima di qualunque attivazione |

Punto 10 software completato in shadow; accettazione reale end-to-end ancora pendente. Sviluppo del punto 11 può proseguire senza presentare questi blocchi come già risolti o autorizzare giocate.

## Stato della consegna remota

Implementazione e documentazione salvate in un commit locale sul branch della PR. Due tentativi di push sono stati respinti dalla revisione automatica. Dopo il primo rifiuto sono stati verificati con il connettore GitHub il repository pubblico `sverza/LaMultipla` (ID 1348886595), la PR #2 aperta/in bozza e il branch `feature/oddspapi-private-import`; inoltre sono stati controllati i 21 file del commit, senza percorsi privati/feed modificati o pattern di credenziali rilevati. Il secondo rifiuto riconosce questi controlli ma richiede autorizzazione esplicita alla pubblicazione dei 21 file sorgente/documentazione sul repository pubblico. Nessun percorso alternativo di upload viene usato. La PR resta al commit 5692c52 finché il push non è consentito; nessun nuovo stato CI è dichiarato.

Il codice e gli artefatti privati rimangono disponibili localmente. Il collaudo Windows deve attendere che il branch remoto contenga il nuovo codice prima del pull; il primo comando successivo sarà l'inventario read-only del repository sul PC, seguito da un solo comando alla volta.
