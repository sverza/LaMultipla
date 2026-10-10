# Studio indipendente gol: implementazione e risultati

> Coordinamento aggiornato, 10 ottobre 2026: [protocollo generale v1](protocollo-generale-v1.md). Le istruzioni storiche restano per riproduzione; il pilot giornata 6 è protetto da nuove analisi. Le decisioni nuove richiedono anche attestazione di liquidazione; uso operativo/pubblicazione restano disabilitati.
## Stato

Implementazione Node.js senza dipendenze nuove: parser e snapshot risultati, alias espliciti squadre, training temporale con buffer 48h, Poisson penalizzato attacco/difesa e vantaggio casa, correzione Dixon-Coles a quattro celle, baseline empirica e Poisson lega, tuning separato dal test, metriche/calibrazione/Wilson, bootstrap appaiato settimanale e bootstrap delle previsioni per data. Il protocollo è in `docs/protocollo-modello-gol-v1.md` ed è stato scritto prima del modello.

Nessun dato delle schedine storiche è usato come training. Nessuna quota entra nel modello. Nessuna acquisizione OddsPapi in questa sessione. Nessun merge/deploy/storico/schedina modificato. Lo storico CC0 è distinto dai dati OddsPapi, i cui diritti di pubblicazione non sono ampliati da questo studio.

## Esperimento reale eseguito

Fonte openfootball/football.json, commit `e6744429ee395bc86f247348c6184bb08d4eb361`, cutoff `2026-10-09T23:00:00Z`. 4.980 risultati validi: 2013/14–2023/24 completi (380 a stagione), 2024/25 con 370/380, 2025/26 con 380/380, 2026/27 con 50 risultati e 330 eventi senza risultato. Non sono imputati i dieci risultati mancanti. Le date effettive della stagione pandemica 2019/20 proseguono fino ad agosto 2020: eccezione esplicita nel parser, nessuno spostamento fittizio.

Tuning 12 configurazioni sul 2022/23–2023/24. Configurazione scelta prima del test: half-life 365 giorni, ridge 5, rho -0.10. Configurazioni con meno copertura non possono vincere grazie all'esclusione di casi difficili; confronto di tuning fra configurazioni con massima copertura. Test 2024/25–2025/26: 705/750 risultati previsti (94%), 45 esclusi per meno di 20 presenze storiche di una squadra. 20 refit mensili del test, tutti convergenti. Shadow 2026/27: 50 previsioni, non usate per tuning. La sorgente potrebbe contenere correzioni posteriori: non è un archivio point-in-time certificato.

| Mercato test | Log-loss modello | Empirica | Poisson lega | Brier modello | ECE | Esito preregistrato |
|---|---:|---:|---:|---:|---:|---|
| 1X2 | 0.980992 | 1.087472 | 1.086937 | 0.586086 | 0.035772 / 0.005474 / 0.033698 | Superato retrospettivamente |
| BTTS | 0.696060 | 0.695925 | 0.697623 | 0.251386 | 0.036552 | Non superato |
| Over/Under 2.5 | 0.695558 | 0.692268 | 0.692323 | 0.251132 | 0.048767 | Non superato |

Brier 1X2: somma su tre classi; Brier binario: convenzione standard. Valori non confrontabili direttamente fra queste scale. CI95 bootstrap della differenza log-loss modello meno baseline (1.000 repliche, 72 blocchi settimanali): 1X2 vs empirica [-0.129169, -0.085753], vs Poisson [-0.127904, -0.085180]; BTTS vs empirica [-0.010925, 0.011789], vs Poisson [-0.013268, 0.010721]; Over2.5 vs empirica [-0.014225, 0.020714], vs Poisson [-0.014281, 0.020573]. I due mercati binari non dimostrano miglioramento: non autorizzati come mercati validati, anche se le probabilità sono calcolabili.

Forecast sperimentale reale Inter–Parma, training cutoff `2026-10-09T23:26:04.717Z`: 1/X/2 = 0.746617 / 0.173576 / 0.079807. Intervalli percentile95 di 40 bootstrap per date: [0.647805,0.817611] / [0.122900,0.216503] / [0.047937,0.105852], zero fit falliti. Gol attesi casa 2.392685, ospite 0.681394. BTTS 0.456474 e Over2.5 0.593200 sono esclusivamente output sperimentali **non validati**. Non è una proposta di gioco, né un confronto con una quota corrente: il report OddsPapi precedente è ormai oltre la soglia di freschezza. L'intervallo non comprende tutta l'incertezza sistematica, assenze o tattica.

## Riproduzione su Windows

Prerequisiti: stesso branch PR #2 aggiornato, Node >=22.13, PowerShell, rete GitHub; nessuna chiave API, carta, Python o servizio nuovo. Da `C:\LaMultipla`:

```powershell
Set-Location "C:\LaMultipla"
git pull --ff-only
node .\scripts\goals-study.mjs --download --cutoff "2026-10-09T23:00:00Z"
```

Il download usa 15 GET pubbliche a file raw del commit congelato (licenza + 14 stagioni), **zero richieste OddsPapi**. Non fa polling o retry. Produce dataset e studio privati in `.local\model\datasets` / `studies`. Il medesimo dataset/cutoff/configurazione produce stesse stime e metriche; timestamp di acquisizione e UUID/hash dell'artefatto possono differire. Il manifest conserva hash file, protocollo e codice. L'opzione `--source cartella` accetta un clone o directory già scaricata; registra commit solo se clone pulito, altrimenti hash dei singoli file.

Per una previsione sperimentale, sostituire SOLO il percorso dello studio stampato:

```powershell
$cutoff = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
node .\scripts\goals-study.mjs --study "PERCORSO_STUDIO_JSON" --home "Inter Milano" --away "Parma Calcio" --cutoff $cutoff
```

La CLI non prevede squadre senza storico sufficiente e rifiuta cutoff futuri o precedenti al completamento dello studio. Il forecast resta `NO_BET` sperimentale, con parametri, distribuzione derivata e intervalli; non è un assessment approvato.

## Collegamento privato alla revisione

`oddspapi-review.mjs` accetta opzionalmente `--forecast PERCORSO_FORECAST_JSON` insieme al report e ai quote IDs. Importa probabilità solo se squadre, ordine, periodo fulltime e mercato combaciano; totale solo linea 2.5. Non inventa settlement, contesto, verifica del prezzo o dipendenze. Registra hash forecast/dataset/studio, cutoff e incertezza. `validatedMarketTypes` deriva solo dai mercati che superano il test retrospettivo, ma `operationallyApproved=false` produce il blocco esplicito `independent_model_requires_operational_review`. Nessuna promozione automatica della validazione retrospettiva a idoneità operativa.

L'override manuale delle quote inattive è distinto da questo blocco statistico. Anche confermare Inter 1 a 1.14 non fornisce una probabilità e non supera la validazione del modello.

## Limiti e prossimo passo

Validazione valida come confronto retrospettivo condizionato alla qualità di questa sorgente; non prova della disponibilità delle informazioni nel passato né profitto futuro. Manca validazione prospettica immutabile, revisione indipendente qualità/identità dei risultati e evidenze sul contesto. Non stima multigol validato, corner, cartellini, falli, tiri, marcatori, handicap, altri Under/Over o Bet Builder, né dipendenze/joint probability di una multipla. Date-only, correzioni e aggiornamento upstream restano limiti reali; nessun modello player/disciplinare è ricavato dalla sola distribuzione gol.

Prossimo passo concreto a costo zero: eseguire sul PC uno studio identico e congelare un primo snapshot di previsioni 1X2 **prima delle partite**, poi valutarle soltanto dopo acquisizione autorizzata dei risultati, mantenendo `NO_BET` operativo finché evidenze, contesto e controlli non sono completi. Nessuna nuova attività programmata viene creata.

Per raccogliere nuovi risultati senza rifare tuning o riutilizzare il test finale: acquisire un clone pubblico aggiornato della stessa fonte e usare `--source CARTELLA --prepare-only --cutoff TIMESTAMP_UTC`. Si crea un nuovo dataset con commit/hash e data di acquisizione; nessun file precedente viene aggiornato. Il forecast accetta `--dataset PERCORSO_NUOVO_DATASET_JSON` insieme allo **studio congelato precedente**, mantenendo la configurazione selezionata; il nome del dataset deve essere il suo SHA256. `--download` rimane deliberatamente fissato al commit dello studio iniziale per riproducibilità. La valutazione automatica di un journal prospettico non è ancora implementata: non chiamare le prime previsioni una validazione prospettica già conclusa.
