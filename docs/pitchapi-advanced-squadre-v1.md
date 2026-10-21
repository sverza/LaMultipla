# PitchAPI — statistiche avanzate di squadra, contratto e campione v1

Base `8b9f59271125cea347261269c357841b269ebc7b`; osservazione del 21 ottobre 2026. Lotto autorizzato dopo presentazione del manifest: **18/18 GET `/advanced`, nessun retry, nessun altro endpoint autenticato**. Nove HTTP 200 con contratto principale completo e nove HTTP 404 `ANALYTICS_UNAVAILABLE`. Nessun errore di identità o controllo semantico locale. Questo è un audit di accesso e struttura, non validazione predittiva o prova della correttezza di ogni conteggio.

La gratuità senza scadenza/contingente e la conservazione privata sono confermate dall’utente: non viene ripetuto l’audit commerciale. Training/refit, automazione ricorrente e altri impieghi non esplicitamente chiariti rimangono separati. Nessun modello, studio, coorte, journal, cutoff, selettore, app o preparazione G8 modificati. Probabili formazioni facoltative: nessuna nuova verifica e nessun blocco al forecast per la loro assenza.

## Fonti e riproducibilità

[Contratto advanced](https://pitchapi.dev/#get-match-advanced), [lettura delle metriche](https://pitchapi.dev/#metrics), [Passing](https://pitchapi.dev/#metrics-passing), [Creation](https://pitchapi.dev/#metrics-creation), [Defending](https://pitchapi.dev/#metrics-defending), [Territory](https://pitchapi.dev/#metrics-territory), [Tempo](https://pitchapi.dev/#metrics-tempo), [Possession value](https://pitchapi.dev/#metrics-possession-value), [Shooting](https://pitchapi.dev/#metrics-shooting), [Team stats](https://pitchapi.dev/#team-stats-guide), [Lineups](https://pitchapi.dev/#lineups-guide). Sono definizioni del fornitore, non standard universali garantiti.

Documentazione pubblica osservata 2026-10-21T19:07:35.460Z; SHA256 HTML `04a231f0ab36f4278f26064f51ea6a8701667565ccfeecd5d0b80cebf7506af4`. Copia e provenienza conservate privatamente. Dati acquisiti fra 2026-10-21T19:11:41.492Z e 2026-10-21T19:11:43.096Z, cioè 21:11 Europe/Rome.

Archivio privato `.local/preparation/pitchapi-advanced-20261021/`: proposta sigillata, manifest delle 18 fixture con squadre/ID/kickoff, grant approvato, intent precedenti alle trasmissioni, bytes originali, ricevute, checkpoint numerati e `result.private.json`. Ogni risposta è legata a URL, timestamp effettivo, SHA256, fixture e grant. Le 18 ricevute e i bytes sono stati riletti e verificati senza rete. I vecchi lotti da 12 e 24 richieste non vengono estesi né riutilizzati come autorizzazione. Nessun payload privato o credenziale pubblicato.

## Copertura realmente osservata

Campioni deterministici già fissati: prima gara, mediana inferiore e ultima gara conclusa per kickoff, senza sostituzioni dopo la risposta. Non sono campioni casuali rappresentativi. Stagione corrente limitata al frame delle 70 gare concluse già osservate. Tutte le identità sono riconciliate esattamente con gli snapshot precedenti: match_id, due squadre in ordine home/away, ID e nomi. Il nuovo endpoint non ripubblica kickoff/stagione: questi restano provenienza dell’elenco precedente, non una riconferma di calendario.

| Stagione | Gare pianificate | HTTP 200 / contratto principale completo | ANALYTICS_UNAVAILABLE | Team-cell complete per ciascuno dei 7 gruppi |
|---|---:|---:|---:|---:|
| 2021/2022 | 3 | 0 / 3 | 3 / 3 | 0 / 6 |
| 2022/2023 | 3 | 0 / 3 | 3 / 3 | 0 / 6 |
| 2023/2024 | 3 | 0 / 3 | 3 / 3 | 0 / 6 |
| 2024/2025 | 3 | 3 / 3 | 0 / 3 | 6 / 6 |
| 2025/2026 | 3 | 3 / 3 | 0 / 3 | 6 / 6 |
| 2026/2027 | 3 | 3 / 3 | 0 / 3 | 6 / 6 |

I sette gruppi sono possession_value, passing, carrying, creation, defending, territory e tempo. Per il 2022/23: due gare ordinarie (4 team-cell) e uno spareggio neutro Spezia–Verona (2 team-cell), entrambi senza analytics; i denominatori separati rimangono nel rapporto privato. Il recupero Atalanta–Fiorentina del 2023/24 rimane nel campione originario. Nessun rimpiazzo per ottenere una copertura più favorevole.

**9/18 gare, 18/36 team-cell:** tutti i 64 campi principali sono numeri validi nel campione disponibile. Per ogni gruppo recente il risultato è 6/6 team-cell per stagione; nei tre gruppi di stagioni precedenti è 0/6. Non è dimostrato che tutte le gare dal 2024/25 siano coperte, né che tutte quelle precedenti siano prive di analytics. I 404 non significano valori statistici zero e non sono trasformati in null di singoli campi.

`defending.press_zone_fraction` e `territory.possession_method` sono descritti nel testo ufficiale ma omessi nell’esempio del contratto e in **18/18 team-object ricevuti**. Sono inventariati separatamente dai 64 campi principali. VALID_COMPLETE significa completezza numerica del contratto principale: non risolve queste lacune o le ambiguità delle definizioni. Risposte parziali: 0; campi principali null/omessi: 0/1152 ciascuno nei soli team-object disponibili. Le 18 team-cell senza risposta non entrano in quel denominatore di 1152 e restano RESPONSE_UNAVAILABLE nella matrice pianificata.

## Dizionario versionato

Struttura: `data.match_id` è una stringa ID partita opaca; `data.teams` è un array di esattamente due oggetti (home poi away); `team.id` è ID squadra opaco e `team.name` stringa, entrambi riconciliati senza fuzzy matching. I sette gruppi sono oggetti, `creation.sca_breakdown` è un oggetto di conteggi e `actions` è numerico al livello del team. Nessuno di questi ID è una feature numerica. Un eventuale `side` deve concordare con l'ordine; campi aggiuntivi di data/team vengono inventariati. `error.code` è una stringa applicativa distinta da HTTP; data ed error non possono coesistere. Non sono presenti pubblicazione, revisione o versione del modello verificabili nel contratto ricevuto.

Fonte eseguibile: `scripts/lib/pitchapi-advanced.mjs`, 66 locatori: 64 campi principali più 2 metadati descritti ma non osservati. I tipi integer/number sono vincoli diagnostici dedotti dalla natura delle quantità e dagli esempi, non uno JSON Schema ufficiale completo. Tutti i campi hanno stato distinto VALUE, ZERO, NULL, OMITTED, SEMANTIC_ERROR; il null di un intero gruppo conserva il percorso del gruppo e non diventa omissione o zero. Campi nuovi vengono elencati, non ignorati. Nessuna imputazione.

Le righe sono team-level su questa route. T+P indica che la documentazione definisce anche l’analogo individuale su una route diversa, che non è stata interrogata. T indica solo squadra. EV non calcolato: questi dati non sono probabilità di un mercato né prezzi.

Origine: E = trasformazione/aggregazione del flusso eventi; F = flag evento; Q = giudizio/qualificatore fonte; S = ricostruzione sintetica; M = modello provider; J = join con xG di tiri, quindi anch’esso dipendente da modello. G/C/T/F/A nelle utilità indicano ipotesi per gol/corner/tiri/falli/cartellini: non effetto dimostrato. Ogni uso prepartita richiede **solo partite precedenti, osservazioni disponibili prima del cutoff e protocollo di feature autorizzato**.

| Campo esatto nel team-object | Tipo / unità | Ambito / origine | Definizione operativa | Ipotesi mercati | Valori/zero/null/omessi nei 18 team-object disponibili |
|---|---|---|---|---|---|
| `actions` | integer / actions | T+P / E | Azioni nel flusso convertito, inclusi carry sintetici; non tocchi grezzi. | G,T | 18/0/0/0 |
| `possession_value.xt_total` | number / probability_delta_sum | T+P / M | Somma del valore spaziale delle progressioni riuscite; griglia 16×12. | G,T,C | 18/0/0/0 |
| `possession_value.vaep_total` | number / probability_delta_sum | T+P / M | Valore azioni con orizzonte delle successive 10 azioni; convenzione segno da chiarire. | G,T,C | 18/0/0/0 |
| `possession_value.vaep_offensive` | number / probability_delta_sum | T+P / M | Variazione della probabilità di segnare entro 10 azioni. | G,T,C | 18/0/0/0 |
| `possession_value.vaep_defensive` | number / probability_delta_sum | T+P / M | Componente rischio entro 10 azioni; non reinterpretare il segno. | G,T,C | 18/0/0/0 |
| `possession_value.pv_total` | number / probability_delta_sum | T+P / M | Valore con orizzonte 10 secondi e stato delle ultime tre azioni; baseline non esposta. | G,T,C | 18/0/0/0 |
| `possession_value.pv_offensive` | number / probability_delta_sum | T+P / M | Componente offensiva su 10 secondi. | G,T,C | 18/0/0/0 |
| `possession_value.pv_defensive` | number / probability_delta_sum | T+P / M | Componente difensiva su 10 secondi; segno/baseline da chiarire. | G,T,C | 18/0/0/0 |
| `passing.passes` | integer / count | T+P / E | Passaggi tentati inclusi cross; esclusi throw-in, corner e punizioni. | G,C,T | 18/0/0/0 |
| `passing.pass_accuracy` | number / percent | T+P / E | Passaggi riusciti / tentati, inclusi cross; null senza tentativi. | G,C,T | 18/0/0/0 |
| `passing.progressive_passes` | integer / count | T+P / E | Passaggi riusciti open play dai due terzi offensivi: distanza dalla porta ridotta almeno del 25%. | G,C,T | 18/0/0/0 |
| `passing.progressive_pass_distance` | number / metres | T+P / E | Riduzione della distanza dalla porta sui soli passaggi progressivi. | G,C,T | 18/0/0/0 |
| `passing.passes_into_box` | integer / count | T+P / E | Passaggi riusciti dall’esterno all’interno dell’area, inclusi cross. | G,C,T | 18/0/0/0 |
| `passing.key_passes` | integer / count | T+P / E | Passaggi seguiti da tiro del compagno, anche gol, attraversando eventuali carry. | G,C,T | 18/0/0/0 |
| `passing.assists` | integer / count | T+P / F | Ultimo passaggio prima del gol, flag della fonte. | G,C,T | 11/7/0/0 |
| `passing.through_balls` | integer / count | T+P / Q | Passaggi filtranti identificati dal qualificatore del provider. | G,C,T | 9/9/0/0 |
| `passing.crosses` | integer / count | T+P / E | Cross open play; sottoinsieme di passes, non corner/punizioni. | G,C,T | 18/0/0/0 |
| `passing.switches` | integer / count | T+P / E | Passaggi completati con spostamento laterale almeno 36,6 m. | G,C,T | 18/0/0/0 |
| `carrying.carries` | integer / count | T+P / S | Spostamenti sintetizzati >5 m fra azioni consecutive della stessa squadra. | G,C,T,F,A | 18/0/0/0 |
| `carrying.carry_distance` | number / metres | T+P / S | Somma spostamenti rettilinei, non distanza effettivamente corsa. | G,C,T,F,A | 18/0/0/0 |
| `carrying.progressive_carries` | integer / count | T+P / S | Guadagni verso porta: 30 m nella propria metà, 15 attraversandola, 10 nella metà avversaria. | G,C,T,F,A | 18/0/0/0 |
| `carrying.progressive_carry_distance` | number / metres | T+P / S | Somma guadagni verso porta dei carry; arretramenti non negativi. | G,C,T,F,A | 18/0/0/0 |
| `carrying.carries_into_final_third` | integer / count | T+P / S | Carry che attraversano x=70 dall’esterno. | G,C,T,F,A | 18/0/0/0 |
| `carrying.carries_into_box` | integer / count | T+P / S | Carry dall’esterno all’area avversaria. | G,C,T,F,A | 16/2/0/0 |
| `carrying.take_ons` | integer / count | T+P / E | Tentativi di superare l’avversario in possesso. | G,C,T,F,A | 18/0/0/0 |
| `carrying.take_ons_won` | integer / count | T+P / E | Take-on riusciti mantenendo il possesso. | G,C,T,F,A | 18/0/0/0 |
| `carrying.miscontrols` | integer / count | T+P / E | Controlli errati con perdita; esclusi autogol sullo stesso tipo interno. | G,C,T,F,A | 18/0/0/0 |
| `carrying.dispossessed` | integer / count | T+P / E | Perdite contro avversario senza take-on né cattivo controllo. | G,C,T,F,A | 18/0/0/0 |
| `creation.sca` | integer / count | T+P / E | Fino a due azioni offensive prima del tiro, fermandosi al limite del possesso. | G,T | 18/0/0/0 |
| `creation.gca` | integer / count | T+P / E | Analogo SCA per tiri conclusi in gol. | G,T | 14/4/0/0 |
| `creation.chances_created` | integer / count | T+P / E | Alias numerico di passing.key_passes; non sommare. | G,T | 18/0/0/0 |
| `creation.second_assists` | integer / count | T+P / E | Contributo precedente all’assist/opportunità; definizione giudiziale, non ogni gol. | G,T | 10/8/0/0 |
| `creation.sca_breakdown.pass_live` | integer / count | T+P / E | SCA da passaggi in gioco. | G,T | 18/0/0/0 |
| `creation.sca_breakdown.pass_dead` | integer / count | T+P / E | SCA da riprese: punizioni, corner, rimesse, kickoff, rinvii. | G,T | 15/3/0/0 |
| `creation.sca_breakdown.take_on` | integer / count | T+P / E | SCA da dribbling. | G,T | 15/3/0/0 |
| `creation.sca_breakdown.shot` | integer / count | T+P / E | SCA da tiro precedente/ribattuta. | G,T | 12/6/0/0 |
| `creation.sca_breakdown.foul_drawn` | integer / count | T / E | SCA da fallo subito: attribuito solo alla squadra. | G,T | 9/9/0/0 |
| `creation.sca_breakdown.defensive` | integer / count | T+P / E | SCA da recupero difensivo. | G,T | 9/9/0/0 |
| `creation.xag` | number / expected_goals_sum | T+P / J | xG dei tiri effettivamente creati da passaggi; esclusi rigori. Non xA. | G,T | 18/0/0/0 |
| `defending.tackles` | integer / count | T+P / E | Contrasti a terra che sottraggono il pallone. | G,T,F,A | 18/0/0/0 |
| `defending.interceptions` | integer / count | T+P / E | Intercetti inclusi passaggi bloccati nella conversione. | G,T,F,A | 18/0/0/0 |
| `defending.blocks` | integer / count | T+P / E | Tiri diretti in porta bloccati da giocatori di movimento; esclusi da PPDA. | G,T,F,A | 18/0/0/0 |
| `defending.clearances` | integer / count | T+P / E | Allontanamenti senza destinatario; esclusi da PPDA. | G,T,F,A | 18/0/0/0 |
| `defending.duels_won` | integer / count | T+P / E | Duelli vinti a terra e aerei. | G,T,F,A | 18/0/0/0 |
| `defending.aerials` | integer / count | T+P / E | Duelli aerei disputati; esclusi colpi di testa non contesi. | G,T,F,A | 18/0/0/0 |
| `defending.aerials_won` | integer / count | T+P / E | Duelli aerei vinti. | G,T,F,A | 18/0/0/0 |
| `defending.ppda` | number / ratio | T / E | Passaggi avversari / azioni difensive nella zona dichiarata; null con denominatore vuoto. | G,T,F,A | 18/0/0/0 |
| `defending.opponent_passes` | integer / count | T / E | Numeratore PPDA nella sola zona di pressing. | G,T,F,A | 18/0/0/0 |
| `defending.defensive_actions` | integer / count | T / E | Denominatore PPDA: falli, tackle, intercetti/passaggi bloccati, challenge nella zona. | G,T,F,A | 18/0/0/0 |
| `defending.challenges` | integer / count | T / E | Tentativi falliti di fermare un dribbling; dal flusso grezzo. | G,T,F,A | 16/2/0/0 |
| `defending.avg_defensive_action_x` | number / metres | T / E | x media di tackle, intercetti, falli e clearances; non altezza linea difensiva. | G,T,F,A | 18/0/0/0 |
| `defending.high_turnovers` | integer / count | T / E | Possessi iniziati entro 40 m dalla porta avversaria. | G,T,F,A | 18/0/0/0 |
| `defending.counterpress_regains_5s` | integer / count | T / E | Recuperi entro 5 s di orologio dalla perdita; non misura di pressione. | G,T,F,A | 18/0/0/0 |
| `defending.ball_recovery_time` | number / seconds | T / E | Tempo medio di recupero in gioco effettivo; null senza episodi. | G,T,F,A | 18/0/0/0 |
| `defending.press_zone_fraction` | number / fraction | T / E | Frazione della zona PPDA; documentata nella descrizione, assente nell’esempio. | G,T,F,A | 0/0/0/18 |
| `territory.possession_pct` | number / percent | T / E | Quota delle consegne tentate: passaggi, cross e riprese; non tempo di possesso. | G,C,T | 18/0/0/0 |
| `territory.field_tilt` | number / percent | T / E | Quota di attività nell’ultimo terzo; algoritmo preciso non specificato. | G,C,T | 18/0/0/0 |
| `territory.final_third_entries` | integer / count | T / E | Passaggi/carry che attraversano x=70 verso l’attacco. | G,C,T | 18/0/0/0 |
| `territory.box_entries` | integer / count | T / E | Ingressi nell’area rettangolare 16,5×40,32 m. | G,C,T | 18/0/0/0 |
| `territory.avg_action_x` | number / metres | T / E | x iniziale media non ponderata delle azioni. | G,C,T | 18/0/0/0 |
| `territory.possession_method` | string / label | T / E | Metodo dichiarato pass_share, non possesso cronologico. | G,C,T | 0/0/0/18 |
| `tempo.passes_per_sequence` | number / passes_per_sequence | T / E | Media passaggi nelle sequenze open play; null senza sequenze. | G,C,T,F,A | 18/0/0/0 |
| `tempo.sequence_time` | number / seconds | T / E | Durata media sequenze open play. | G,C,T,F,A | 18/0/0/0 |
| `tempo.direct_speed` | number / metres_per_second | T / E | Progresso verso porta / durata della sequenza. | G,C,T,F,A | 18/0/0/0 |
| `tempo.buildup_attacks` | integer / count | T / E | Sequenze open play con almeno 10 passaggi concluse con tiro o tocco in area. | G,C,T,F,A | 14/4/0/0 |
| `tempo.direct_attacks` | integer / count | T / E | Sequenze dalla propria metà che coprono almeno metà distanza verso porta e finiscono con tiro/tocco in area. | G,C,T,F,A | 18/0/0/0 |

## Metriche delle sezioni richieste che NON appartengono al lotto advanced

La sezione Shooting rimanda a shots/team stats: nessuna richiesta aggiuntiva è stata eseguita. Le eventuali statistiche già disponibili restano nel loro archivio precedente. Non dichiarare assente xG perché non compare in `/advanced` e non considerare xag un sostituto di xG.

| Nome nella guida | Collocazione documentata | Tipo/unità e significato | Uso/limite |
|---|---|---|---|
| xg | shots[].expected_goals | Numero 0–1 per tiro, modello provider | Qualità tiri storici; non mescolare xG di fornitori diversi. |
| npxg | stats / Expected goals | Numero, somma xG senza rigori | Gol e qualità occasioni; non campo advanced. |
| shots | stats / Shots | Intero, tentativi inclusi bloccati; autogol esclusi | Target tiri; definizioni da congelare. |
| shots_on_target | stats / Shots | Intero, tentativi in porta secondo fonte | Non equiparare ogni blocco a SOT né dedurre automaticamente parate. |
| xg_per_shot | stats / Expected goals | Rapporto xG/tiri, null senza denominatore | Qualità distinta dal volume; derivato ridondante. |
| goals_minus_xg | stats / Expected goals | Differenza numerica sugli stessi tiri | Esito meno aspettativa, elevata varianza; non skill certa. |
| big_chances | stats / Big chances | Intero, classificazione editoriale | Non soglia xG universale; rigori inclusi. |
| big_chances_missed | stats / Big chances | Intero, grandi occasioni non convertite | Definizione ampia, non soltanto mancato tentativo. |
| conversion_rate | stats / Shots | Gol/tutti i tiri, scala da confermare sul campo effettivo | Non gol/SOT; ridondante con componenti. |
| saves | players / top_stats | Intero, parate del portiere | Individuale, fuori lotto; eventuale aggregazione futura autorizzata. |

Lineups e statistiche individuali non sono interrogate. Le formazioni restano contestuali facoltative e il precedente controllo G8 è concluso senza contenuto utilizzabile. `minutes_played`, `xg_chain`, `xg_buildup` e goalkeeping sono individuali e non campi di questa route. xg_chain attribuisce l’intero xG del possesso a ogni partecipante: sommare giocatori lo moltiplicherebbe, senza analogo team. Le categorie individuali SCA senza occorrenze possono essere omesse: questo non autorizza a imputare zero a qualsiasi omissione nel contratto squadra.

## Relazioni, anomalie e limiti semantici

- passes include crosses: non sommarli. I cross avanzati sono open play; corner e punizioni sono azioni distinte. Non convertire cross in corner.
- chances_created e key_passes coincidono in tutti i 18 team-object osservati: due nomi dello stesso conteggio, che comprende anche passaggi sfociati in gol. Non aggiungere nuovamente gli assist per costruire le occasioni.
- SCA: la somma dei sei componenti coincide con il totale nei 18 team-object. Il componente foul_drawn non appartiene a nessun giocatore: la somma player è inferiore alla squadra di quel componente. Non imporre equivalenza per tutte le aggregazioni.
- I carry sono ricostruiti, non osservati direttamente; actions comprende tali azioni. Distanza del carry è spostamento netto, non tracking. Soglie progressive di carry e passaggi diverse: non renderle intercambiabili.
- PPDA è verificabile con numeratore e denominatore disponibili (tolleranza assoluta 0,02 per arrotondamento), ma senza press_zone_fraction non certifica la zona effettiva. Non ricostruire il denominatore dal totale FT delle statistiche tradizionali. Intercetti includono passaggi bloccati; clearances e shot blocks sono esclusi dal PPDA.
- Territory: pass_share è dichiarato dalla guida, ma il metadato manca nelle risposte. Non sostituire BallPossesion tradizionale con possession_pct. Field tilt non ha algoritmo pubblicato sufficientemente preciso per un confronto automatico fra fonti.
- VAEP/PV: nei 18 team-object total è compatibile con offensive + defensive entro 0,0002. La descrizione testuale parla invece di sottrazione del rischio e, per PV, aggiunta di una baseline non esposta. Si conservano entrambi i residui additivo/sottrattivo senza cambiare segno, inventare baseline o imporre una formula. Interpretazione delle componenti sospesa in attesa di chiarimento.
- xT, VAEP e PV sono output di modelli del fornitore; xag dipende da xG esterno al flusso eventi. Non sono conteggi grezzi o probabilità prepartita LaMultipla. La dichiarazione del fornitore su fitting di stagioni chiuse non fornisce versioni/hash/cutoff specifici verificabili. Non prova disponibilità storica as-of o assenza di leakage per ogni retro-test.
- Nessun nuovo campo, duplicato di team, inversione home/away, tipo numerico inatteso, subset incoerente o alias discordante rilevato nei nove payload validi. Questo non certifica conteggi evento per evento: nessun nuovo evento è stato richiesto. Il periodo non è esplicitato dalla route; non certificare FT regolamentari rispetto a supplementari. Lo spareggio è separato e senza analytics.

## Archivio futuro proposto — non attivato

| Livello | Identità e contenuto | Regole di ingresso |
|---|---|---|
| 1 Fixture/risultati/stati | Fonte+league+season+fixture, home/away, kickoff, FT/HT, status, rinvii | Riconciliazione esatta; durata/risultato verificati; fonte originale separata da supplementare/futura. |
| 2 Tradizionali FT | Fixture+team+periodo+chiave+unità+definizione | Target di gol/corner/cartellini/falli/tiri con null/zero/omissione distinti. |
| 3 Analytics squadra | Fixture+team+campo+versione definizione/modello provider | Dipende da evento e modello; missingness per stagione; metriche ambigue in quarantena. |
| 4 Tiri opzionali | Source+match+shot_id (non globale), coordinate e xG/versione | Necessità scientifica motivata; nessun download in questo lotto. |
| 5 Prepartita | Osservazione, fonte, pubblicazione/aggiornamento se noti, confirmed e validità | Facoltativo; nessuna lineup postpartita retrodatata, assenza non blocca reference. |
| 6 Individuali collettivi | Player ID, team temporale, minuti/esposizione/ruolo | Solo aggregati motivati per squadra; nessun modello di scommesse individuali. |

Ogni osservazione: observation_id/hash bytes, source/url, request intent e receipt, acquired_at_utc, server Date separata, source_published/source_updated se realmente forniti, kickoff/event time, periodo/durata, parser/dictionary/code version, source/model version nullable, raw hash, input identity hash, quality status e missingness reason. Hash del JSON normalizzato distinto da hash dei bytes. Conservare anche gli errori/assenze e il motivo di esclusione; un campo mancante non diventa zero.

Append-only: nuova osservazione per ogni revisione, revises_observation_id solo con evidenza, niente overwrite. Un dataset ammissibile è una lista immutabile di observation ID più hash, policy temporale, definizioni e frame, non un file latest sovrascritto. Conflitti fra fonti rimangono separati: nessuna media automatica. L’eventuale orchestrazione futura riusa lock/checkpoint/intent esistenti, un solo scheduler e grant per fonte/operazione; questi componenti diagnostici non attivano acquisizioni ricorrenti. Una richiesta interrotta resta ambigua e blocca avanzamento/retry finché riesaminata.

## Protezione temporale e priorità dei challenger

Per eventi futuri: una feature deve provenire da gare terminate prima del cutoff e da snapshot già osservati entro quel cutoff. Se la data originaria di pubblicazione manca, acquired_at è il limite conservativo di disponibilità, non la data della partita. Una statistica del 2021 scaricata oggi non dimostra di essere stata disponibile nel 2021. Backtest su archivio ricostruito deve essere etichettato come tale; non è una simulazione as-of autentica. Revisioni successive non riscrivono feature/forecast congelati.

Proposta da approvare separatamente:

1. Consolidare target tradizionali e definizioni con storico più lungo; mantenere reference e baseline. Diritti training/refit da chiarire prima di usare anche una sola nuova variabile.
2. Primo challenger futuro parsimonioso per gol/tiri: volumi storici, xG/npxG quando ammessi e chiari, key_passes oppure chances_created, ingressi in area. Nessuna duplicazione degli alias; non introdurre 64 feature insieme.
3. Corner: volumi corner target, cross, ingressi/territorio e ritmo come ipotesi. Tiri: volume/qualità e creazione. Falli/cartellini: storici target e contesto/arbitro ove lecito, con pressing/duelli come ipotesi; PPDA senza zona e cards subtype irrisolti non sono risolti dagli analytics.
4. xT/VAEP/PV e field tilt solo in un lotto successivo, dopo semantica, versioni/cutoff e ablation. Valori di possesso non equivalgono a un nuovo modello gol calibrato.

Rolling proposti, non implementati: statistiche per team su gare precedenti, esposizione/denominatore espliciti, home/away con shrinkage e opponent-adjustment stimato soltanto sul training passato. Numero finestre, decadimento e interazioni da preregistrare o scegliere esclusivamente nel tuning temporale; nessun peso arbitrario. Missingness/età della feature e cambio di copertura stagionale vanno modellati/valutati, non confusi con un effetto sportivo.

Validazione: split cronologici train/tuning/calibration/holdout, walk-forward per giornata e accoppiamento sui medesimi eventi con reference. Ablation per blocco (tradizionali → creazione → territorio/ritmo → provider models), proper scoring per il target, calibrazione, dispersione e intervalli; conteggi e probabilità di mercato valutati separatamente. Registrare tutti i tentativi anche peggiori, correggere molteplicità e non usare la G8 per retuning retroattivo. Il campione di nove gare con analytics non autorizza training né dimostra utilità predittiva.

## Strumenti e controlli

`pitchapi-advanced.mjs`: dizionario, controllo puro delle risposte e matrice campionaria con denominatori pianificati, compresi indisponibili/non osservati. `pitchapi-advanced-acquisition.mjs`: solo exact allowlist di 18 route advanced in ordine congelato, singolo grant non rinnovabile nello stesso ledger, key in memoria da vault DPAPI esistente, redirect rifiutati, timeout 25 s, limite risposta 8 MiB, nessun retry/paginazione. Un 404 ANALYTICS_UNAVAILABLE viene registrato e permette il prossimo campione; gli altri errori HTTP/applicativi, contenuto non JSON, identità/semantica incompatibili o intent ambiguo arrestano il lotto. Cache verificata non consuma richieste. Nessuna CLI di acquisizione automatica o schedulazione introdotta.

Le prove sintetiche verificano scope/grant/ordine/tetto, scadenza, replay/integrità, rete assente, risposte malformate e riflesso credenziale, HTTP/identità/semantica, null/zero/omissione, formule e copertura separata dello spareggio. Non sono validazione statistica.

Verifiche locali: **400/400 test**, inclusi 10 test avanzati dedicati; lint senza errori (solo warning preesistente `combinedPlayedOdd` nell'app), build Next/TypeScript riuscita. Le 18 ricevute reali sono state rivalidate senza rete. I 3.400 file protetti e i due vault cifrati risultano invariati rispetto al preflight. Nessuna autenticazione o modifica alle vecchie acquisizioni necessaria per questi controlli.

**Stato:** campione avanzato concluso; archivio e protocollo feature proposti, non ciclo produttivo. Nessuna acquisizione aggiuntiva è implicita. G8 e il percorso scientifico originale restano indipendenti.
