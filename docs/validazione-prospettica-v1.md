# Validazione prospettica 1X2 v1 — protocollo e Windows

## Approvazione e limiti

L'utente autorizza il 10 ottobre 2026 la fase sperimentale prospettica, non l'uso per selezionare scommesse. PR #2 resta draft. Tutte le scritture sono in `.local/model/prospective`, senza app, schedine, storico giocate, merge/deploy o nuove richieste OddsPapi. Il motore statistico e il protocollo storico del commit `b630b78` non sono modificati.

Il confronto storico è stato riprodotto sul PC: 4.980 risultati, 705 test, 45 esclusioni, config halfLife365/ridge5/rho-0.1. Log-loss1X2=0.9809919813532423, Brier=0.5860859777711311, baseline empirica1.0874723600042104/Poisson1.0869370003778915. I file Windows hanno CRLF: codice raw SHA `d4357fa17a8d5d0f08d47027024100d270c7c69bc6de412cbabcfd8db9880d6e`, protocollo raw `45dbc4f4ef20d96547e358b0ee975e22512f4f8d2065f9e90a3dc04e0d1698c0`. Convertire gli stessi contenuti LF a CRLF produce esattamente questi valori. Hash canonici LF: codice `9f3164d585f686ee7ebfcb7a87e415a6fedde6992d1ab4104349a860c054ff11`, protocollo `8fa215bc08008e86c90d834b666de42a50235940f000167cc1a7e0b721c0977b`.

Dataset PC: `96fa9036ca4375a0176568862ac7c486ccaccd05825aa2fe08cbe55045b0d777`. Il suo hash è distinto dal dataset Work perché include il momento di acquisizione: non va forzato a coincidere. Verifica anche i 14 hash sorgenti congelati (digest manifest `cba3153dea8c6430cc5223422649d12ea7f3aa99d1f057793067d05a933e969e`) e licenza. Studio PC `791e2be8-b0d9-4b5f-a648-3d0610a580be.json`.

Verifica del software: 58 test passati, inclusi congelamento concorrente, alterazione degli hash, esclusione post-kickoff, risultati assenti o revisionati, confronto appaiato e percorso CLI con risposte pubbliche simulate. Lint senza errori, con il warning preesistente `combinedPlayedOdd` nell'app. Il percorso di acquisizione dei risultati futuri è predisposto e testato con mock, non ancora collaudato su risultati reali della giornata target. Nessuna richiesta OddsPapi nel collaudo del journal.

## Prima giornata prospettica

Manifest delle dieci partite in `docs/fixtures/seriea-2026-27-round06.json`, da confrontare con il report locale verificato. Identificativi OddsPapi già acquisiti, nessuna chiamata al servizio. Orari verificati nel corpo della comunicazione ufficiale https://en.legaseriea.it/serie-a/news/the-referees-for-the-6th-round-x3981 e confrontati con https://www.legaseriea.it/serie-a/news/quando-si-gioca-anticipi-e-posticipi-fino-alla-12a-giornata. Conversione Europe/Rome UTC+2 per 10–12 ottobre. Il sottotitolo della pagina arbitri contiene altre date, ma la lista delle dieci gare è esplicita: salvare questa distinzione. Il PDF collegato nella seconda pagina, esaminato, inizia dalla prima giornata e non costituisce prova aggiuntiva per la sesta.

Training cutoff **2026-10-01T00:00:00Z**, coerente con il refit mensile del protocollo già congelato. La disponibilità dei risultati resta date+48h. Un solo fit del modello originale per tutta la giornata; 40 bootstrap per date condivisi fra eventi quantificano incertezza, non modificano il fit centrale. Nessun risultato delle partite target può entrare nel training. Parametri invariati; le previsioni precedenti con cutoff diverso sono inventariate come non registrate prospettiche, non importate. Il confronto storico non viene rieseguito né ottimizzato durante freeze.

Ogni record: fixtureID, squadre canoniche, stagione/giornata, kickoff UTC, 1/X/2, CI95, baseline empirica e Poisson lega congelate sullo stesso training, config/versione, cutoff, generazione, hash record. Journal: dataset/source commit/file hashes, studio, modello e codice journal, manifest/report hash, fit e coefficienti, legacy inventory. Esclusioni esplicite: storico/fit/uncertezza insufficiente, kickoff già iniziato o meno di cinque minuti prima. Le esclusioni non hanno probabilità riempitive. Il timestamp è letto dall'orologio al completamento del calcolo; non esiste un parametro CLI per retrodatare.

Nome journal deterministico per stagione/giornata/modello. Pubblicazione locale tramite file temporaneo, fsync e hard link esclusivo: nessuna sostituzione neanche concorrente; su Windows NTFS è supportato. Hash dell'envelope e di ogni entry verificati. La protezione evita sovrascritture dal programma e rileva alterazioni rispetto all'hash registrato; non è WORM, non impedisce al proprietario del PC di cancellare/manipolare file né certifica l'orologio. Riportare in chat l'ID, SHA e timestamp prima dei kickoff fornisce un riscontro esterno del congelamento. I dati non vengono pubblicati dal programma.

## Comandi (la guida in chat li propone uno alla volta)

Da PowerShell, repository `C:\LaMultipla`, Node >=22.13 già installato. Prima aggiornare il branch con `git pull --ff-only`. Nessuna nuova dipendenza, API key o carta. Studio storico già riprodotto: non ripeterlo per ottenere nuovi timestamp.

```powershell
node "C:\LaMultipla\scripts\prospective.mjs" --verify-study --study "C:\LaMultipla\.local\model\studies\791e2be8-b0d9-4b5f-a648-3d0610a580be.json"
```

Verifica read-only dei file presenti e delle metriche originali. Poi, in un passaggio distinto:

```powershell
node "C:\LaMultipla\scripts\prospective.mjs" --freeze --study "C:\LaMultipla\.local\model\studies\791e2be8-b0d9-4b5f-a648-3d0610a580be.json"
```

Legge di default `.local/oddspapi/latest.json` e il report locale confermato; `--report FILE` permette selezione esplicita se necessario. Non rilegge quote online. Rifiuta journal già esistente. Stampa percorso/ID/SHA/timestamp/conteggi. Finché il PC non esegue freeze con successo, **zero previsioni PC sono dichiarate congelate**. Ispezione read-only successiva: `node scripts/prospective.mjs --inspect PERCORSO_JOURNAL`.

## Risultati e valutazione successiva

Solo dopo le partite: `--capture-results PERCORSO_JOURNAL`. Tre GET pubbliche: commit corrente openfootball, licenza CC0 al commit, file stagione al medesimo commit. Nessun retry/polling/login/OddsPapi. Normalizza e conserva una nuova osservazione con commit/URL/hash/acquisizione e audit; nessun aggiornamento del dataset originario. Una fonte non aggiornata restituisce assenze esplicite, mai risultati presunti. I risultati con date+48h non trascorse restano esclusi anche se compare già un punteggio.

`--evaluate PERCORSO_JOURNAL --results PERCORSO_RISULTATI`: match esatto per stagione/squadre/date; risultato osservato dopo kickoff, goal interi, niente duplicati. Rinvii con data diversa restano pending finché non esiste evidenza di riprogrammazione: non vengono risolti automaticamente. Valutazione append-only, legata a SHA journal/result snapshot: P(esito reale), log-loss, Brier, curva calibrazione/ECE/Wilson, copertura, esclusioni/pending e confronto sulle stesse partite con baseline congelate. Il formato dichiara risultati fulltime comunitari, non certificazione ufficiale.

`--progress` produce un nuovo snapshot di metriche cumulative e per giornata, separando versioni del modello. Ogni evento conta una sola volta. Una successiva osservazione con punteggio diverso produce conflitto da revisionare: nessuna correzione silenziosa, evento in conflitto escluso dall'aggregazione. Previsioni intatte. Risoluzione esplicita dei conflitti/rinvii e validazione ufficiale sistematica sono limiti ancora presenti. Dieci incontri sono un primo campione, non una prova sufficiente di calibrazione/affidabilità futura. Nessuna promozione automatica a uso operativo; modifiche a parametri/protocollo richiedono nuova versione e giornate future.

## Baseline bet365 Italia separata

`--market-template JOURNAL` produce dieci schede vuote (prezzi/timestamp/disponibilità null). Compilare una copia di lavoro **solo dopo osservazione reale** nell'app italiana. Ogni lavagna richiede 1/X/2 tutti verificati disponibili, prezzo >1, dominio bet365.it, origine manuale, revisore/evidenza, mercato Full Time Result, fulltime, linea0, nessun giocatore. Flag originali eventualmente allegati restano invariati: una verifica manuale positiva della disponibilità è distinta dal flag provider. Non usare quote vecchie del report per riempire schede.

`--market JOURNAL --boards COPIA_COMPILATA`: congela ogni lavagna una volta sola. Prezzi osservati da non più di 30 minuti, tutti prima del kickoff e distanti fra loro <=5 minuti. Confronto compatibile solo se ogni osservazione è entro 30 minuti dalla generazione del forecast; osservazioni più tarde sono conservabili ma non entrano nel confronto appaiato. Una lavagna incompleta/inattiva/non verificata è rifiutata e annotata. Nessuna selezione viene inventata.

Metodo preregistrato: r_i=1/quota_i, S=sum(r_i), margine=S-1, p_i=r_i/S. Normalizzazione proporzionale semplice; non corregge il favorite-longshot bias e non è prova di probabilità vere. Riferimento: Clarke, Kovalchik & Ingram (2017), https://doi.org/10.11648/j.ajss.20170506.12. Power/Shin eventuali confronti successivi richiedono una versione dichiarata, non scelta del metodo dopo aver visto i risultati. L'evaluatore confronta log-loss/Brier modello e mercato soltanto sul sottoinsieme identico con snapshot compatibili, anche cumulativamente. Le quote non entrano mai nel fit; nessun rendimento simulato viene chiamato capacità predittiva.
