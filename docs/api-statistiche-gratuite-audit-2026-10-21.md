# API statistiche gratuite — audit del 21 ottobre 2026

Aggiornamento successivo all'audit: [prova privata PitchAPI autorizzata](pitchapi-prova-diagnostica.md),12/12 risposte riuscite su tre incontri. Accesso gratuito ai dati osservati verificato; completezza storica, continuità, diritti di training/conservazione e alcune semantiche restano aperti. Le classificazioni sotto descrivono lo stato al momento dell'audit, prima di questa prova.

Base: `e5a3104bb5eb3288732f2a95ad4881d49de762fa`, branch `feature/oddspapi-private-import`, PR #2 in bozza. Ricerca pubblica e riscontri locali; **zero nuove richieste autenticate**, account, chiavi, pagamenti, training o forecast. Le evidenze grezze rimangono private.

## Conclusione e classificazione

**Non abbiamo ancora una API gratuita completa, verificata e autorizzata per l'intero progetto.** Questo non dimostra che non esista: restano prove autenticate e chiarimenti contrattuali. Accesso Free, copertura reale, semantica dei campi e diritti sono quattro verifiche distinte.

- **A — utilizzabile e verificata per tutte le nuove statistiche:** nessuna fonte.
- **B — promettenti, da provare/chiarire:** PitchAPI, 5DollarFootballAPI e API-Football; SportScore soltanto come alternativa parziale da chiarire.
- **C — non soddisfano la soluzione completa:** football-data.org Free per le statistiche dettagliate; archivi aperti storici come feed aggiornato; alternative con solo stagione corrente, campi premium o accesso non autorizzabile. Un'esclusione per questo scopo non rende inutili i risultati FT o gli archivi di ricerca.

Prima prova consigliata: **5DollarFootballAPI, massimo tre richieste Free e senza upgrade**, perché esistono demo numeriche ripetibili, una chiamata aggrega identità/statistiche/eventi e le condizioni menzionano l'uso in modelli. Deve però risolvere un conflitto concreto di piano e non copre i giocatori. PitchAPI è la candidata più interessante per profondità, ma prima servono condizioni sui dati e copertura effettiva. Nessuna delle due è adottata.

## Matrice dei servizi

`D` = dichiarato/documentato; `V-web` = osservato nella demo pubblica, non prova dell'accesso API Free; `NC` = non certificato; `—` = assente dal prodotto dichiarato o non adatto allo scopo indicato. Un valore D non certifica un dato reale.

| Fonte | Piano gratuito | Serie A 2026/27 | Storico accessibile gratis | Dati osservati | Training / conservazione | Classe |
|---|---|---|---|---|---|---|
| [PitchAPI](https://pitchapi.dev/) | D: senza scadenza/carta, tutti gli endpoint, nessun contingente; guardia burst non quantificata | Big five dichiarati; stagione e numero di gare NC | D: dal 2021; dettaglio stagioni/campi NC | Documentazione/schema, nessuna risposta di partita autenticata | NON CHIARITO: licenza dati, snapshot, refit e cessazione | B |
| [5DollarFootballAPI](https://5dollarfootballapi.com/pricing) | D: $0, 60/ora, massimo 20/min, senza carta; tre mesi mobili | Demo V-web; accesso Free NC per conflitto con catalogo qualità | Tre mesi, non archivio dal 2014. Community separato: dodici mesi mobili, rinnovo annuale e requisiti personali | Tre pagine partita e metadati qualità JSON; nessuna API con chiave | Uso in modelli/cache esplicito; audit permanente, refit e cessazione da precisare | B, solo parziale |
| [API-Football diretto](https://www.api-football.com/pricing) | D: $0, 100/giorno, 10/min, niente carta, endpoint inclusi | Competizione dichiarata; accesso a stagione 2026 e campi NC | Stagioni Free limitate: elenco esatto non pubblicato nei riscontri leggibili | Prezzi, termini e guida ufficiale; dal PC documenti protetti HTTP403 | Training/retention NON CHIARITI; diritti ulteriori possibili per prodotti betting | B |
| [SportScore](https://sportscore.com/developers/) | D: senza chiave, circa 10.000/giorno/IP, attribuzione | Hub Serie A; stagione/campi API NC | Intervallo gratuito non quantificato; storico oltre API pubblica su accordo separato | Documentazione e OpenAPI YAML HTTP200; API dati non chiamata | Cache e combinazione consentite, training/retention permanente NON CHIARITI; conflitto robots | B secondaria |
| football-data.org Free | Prova precedente verificata; nessuna nuova richiesta | Già riscontrati 20 risultati G6/G7 | Non verificato per statistiche dettagliate | Risultati soltanto per lo scopo di questo audit | Restano i gate dello sprint precedente | C come soluzione dettagliata |

5Dollar Community non è una trial con pagamento finale, ma non è nemmeno un diritto automatico: l'utente deve dichiarare un requisito vero e rinnovare. Non attivato. Le informazioni sui piani e sulle stagioni sono del21 ottobre; nessuna promessa che restino immutate. [Community](https://5dollarfootballapi.com/community), [limiti API-Football](https://www.api-football.com/news/post/how-ratelimit-works), [pricing football-data.org](https://www.football-data.org/pricing).

## Verifiche HTTP effettive dal PC

Richieste pubbliche limitate, senza header di autenticazione, retry automatici o aggiramento di protezioni. URL, orario UTC, redirect, content-type, byte, SHA256 e copie originali sono conservati in `.local/preparation/api-statistics-20261021`.

| Risorsa | Esito osservato | Interpretazione |
|---|---|---|
| PitchAPI `/`, `/get-api-key`, robots e sitemap | HTTP200 HTML/testo/XML | Documentazione e pagina chiave esistono. Il rendering statico della pagina chiave non certifica il completamento della registrazione. |
| 5Dollar `/docs`, `/pricing`, `/terms` | HTTP200 HTML | Offerta e condizioni consultate realmente. |
| 5Dollar `/openapi.json` | HTTP200 JSON, versione1.0.0 | Contratto pubblico, non dataset. Molte risposte usano un envelope generico: non prova tipi/completamento dei singoli campi. |
| 5Dollar tre URL `/scores/{id}` | HTTP200 HTML | Dati numerici realmente visibili; non equivale a tre risposte API Free. |
| 5Dollar `/docs/data-quality.json` | HTTP200 JSON | Misure pubblicate dal fornitore, non conteggio indipendente delle partite. |
| API-Football documentazione, prezzi, termini e copertura | HTTP403 HTML dal PC | Documenti primari leggibili attraverso ricerca web indicizzata; accesso automatico PC non dimostrato. Nessun bypass, proxy o cambio identità. |
| SportScore termini e OpenAPI | HTTP200 HTML/YAML | Contratto documentato; API dati non interrogata. |

Non eseguite richieste senza chiave agli endpoint autenticati per provocare401, né usate chiavi dimostrative trovate sul web. Nessuna spesa OddsPapi. Un403 su documentazione non dimostra che l'API con chiave sarà bloccata, ma va collaudato prima di integrarla.

## Cosa è realmente osservato nelle demo

Tre risorse pubbliche esplicitamente offerte dal sito come demo:

| Campione | URL | Verifica |
|---|---|---|
| G6, Torino–Udinese,12/10/2026 | [423767734](https://5dollarfootballapi.com/scores/423767734) | Fixture ID, squadre, kickoff UTC, FT/HT, corner FT/HT, tiri nello specchio/fuori, possesso e timeline visibili. |
| G7, Parma–Torino,19/10/2026 | [3625798766](https://5dollarfootballapi.com/scores/3625798766) | Stesse dimensioni; FT e kickoff concordano con il precedente riscontro privato G7. |
| Storica, Torino–Udinese,7/01/2026 | [308830042](https://5dollarfootballapi.com/scores/308830042) | Dimensioni presenti, data storica fuori dai tre mesi Free. Pagina pubblica non prova entitlement dell'API né campo stagione. |

Anche FT/kickoff G6 concordano con il riscontro precedente, già corroborato per il punteggio dal CU47; G7 dal CU49. **Corner, tiri e possesso non sono stati corroborati da una seconda fonte indipendente.** Nessun valore numerico è importato in un dataset o pubblicato qui come dato autorizzato per training.

Nel campione selezionato di tre pagine, per corner FT, corner HT, tiri nello specchio, tiri fuori e possesso: **6/6 celle squadra osservate,0/6 mancanti,0%** per ciascuna dimensione. Denominatore molto piccolo e non casuale; nessuna stima di completezza stagionale. Per campi non misurabili dalle pagine, percentuale NC, non zero. Il badge cartellini privo di un'identità testuale sufficiente non è stato convertito arbitrariamente in gialli/rossi. Non ricavare tiri totali sommando SOT e fuori senza conoscere i bloccati.

### Conflitto Free e catalogo qualità

[Pagina Serie A](https://5dollarfootballapi.com/serie-a-api) e pricing dichiarano la competizione nel Free, con esempio `league=12`. Il [catalogo qualità pubblico](https://5dollarfootballapi.com/docs/data-quality.json), generato21/10 alle05:05:32UTC, identifica invece `Italy Serie A` con ID **3405541143**, piano **pro**. Lo stesso compare nell'HTML del [report qualità](https://5dollarfootballapi.com/docs/data-quality). Nessuna equivalenza automatica tra12 e3405541143: potrebbe essere una discrepanza di metadata/alias/piani, ma non ne è dimostrata la causa. Servono chiarimento e risposta Free effettiva; non autorizza un upgrade.

Quel record dichiara381 gare terminate nella finestra365 giorni,100% con corner, cartellini, eventi e riga statistiche,13 stagioni dal2014. Sono aggregati del fornitore: una riga stats presente non implica tutti i suoi campi non-null, e quei13 anni non sono lo storico Free. La convenzione esclude corner0–0 dal tracking FT e considera registrato lo zero nei gialli: non adottarla come regola universale di missingness. Definizioni/versione e differenze devono restare nel report. Nessuna percentuale indipendente certificata su Serie A2026/27.

Il trust center descrive revisioni/retrazioni e un monitor esterno iniziato il24 agosto2026: non dimostra anni di continuità. Non abbiamo verificato indipendentemente l'uptime dichiarato. I rinvii possono ricevere nuovi fixture ID, quindi serve una relazione esplicita fra versioni. Le quote Bet365 generiche delle demo non certificano `bet365.it`, non sostituiscono OddsPapi Italia e non sono input probabilistici.

## Inventario dei campi

La matrice seguente è una checklist di accessibilità, non uno schema già integrato. D comprende esempi di documentazione e richiede verifica dei valori reali. Per Pitch i campi possono provenire da strati statistici differenti: non si considerano automaticamente equivalenti. Per API-Football la [guida ufficiale](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) documenta famiglie e endpoint; la disponibilità Free attuale resta NC.

| Dato partita | PitchAPI | 5Dollar | API-Football |
|---|---|---|---|
| Competizione / stagione / giornata | D / D / NC | D / D / V-web giornata | D / D / D |
| ID fixture / squadre | D | V-web fixture; D squadre | D |
| Kickoff / stato conclusivo | D | V-web | D |
| FT / HT regolamentari | D / NC | V-web entrambi | D entrambi; distinguere extra-time |
| Gol per squadra | D | V-web | D |
| Marcatori / minuti | D | Minuti V-web; niente anagrafica scorer strutturata | D |
| Autogol | D | NC distinto | D |
| Rigori segnati / sbagliati | D flag gol / NC esito mancato | NC segnati distinti / D missed event | D |
| Assist | D | — | D |
| Corner per squadra | NC contatore | V-web | D |
| Tiri totali | D | NC comprensivi di bloccati | D |
| Tiri nello specchio | D, definizione da verificare | V-web | D |
| Tiri fuori | NC separazione | V-web | D |
| Tiri bloccati | D flag tiro | NC | D |
| Possesso | D, definizione dipende dallo strato | V-web | D |
| Passaggi / precisione | D | NC, non documentati nei payload stats | D |
| Falli commessi / subiti | D descrizione gruppi | NC, non documentati | D commessi; subiti individuali |
| Fuorigioco | NC | NC, non documentati | D |
| Gialli | D eventi | D; qualità non è prova Free | D |
| Secondo giallo distinto | NC | NC | D eventi Yellow-Red |
| Rosso diretto distinto | NC, evento redcard aggrega | NC | D da verificare dettaglio eventi |
| Parate | NC campo specifico | NC, non documentate | D |
| xG / xGOT / avanzate | D; analytics non universali | — | NC nel materiale leggibile per la prova |

| Dato individuale | PitchAPI | 5Dollar | API-Football |
|---|---|---|---|
| ID giocatore / squadra / ruolo | D | — | D |
| Presenze stagionali | NC aggregato | — | D |
| Titolarità / XI / modulo | D, conferma separata | — | D |
| Minuti effettivi | D | — | D |
| Sostituzioni | D | D testo eventi, non dataset player | D |
| Gol / assist | D | — strutturati | D |
| Tiri / tiri nello specchio | D / verifica definizione | — | D |
| Falli commessi / subiti | D gruppi, valore da verificare | — | D |
| Gialli / rossi distinti | D eventi, separazioni NC | — player | D |
| Parate portiere | NC campo specifico | — | D |
| Passaggi / duelli / contrasti | D | — | D |
| xG individuale / avanzate | D | — | NC |

Fonti dello schema: [PitchAPI](https://pitchapi.dev/), [OpenAPI5Dollar](https://5dollarfootballapi.com/openapi.json), [documentazione5Dollar](https://5dollarfootballapi.com/docs), guida API-Football sopra. Il [trust center5Dollar](https://5dollarfootballapi.com/trust) esclude esplicitamente lineups, squadre giocatori, player stats e scorer names: nomi liberi nelle sostituzioni non sono un registry player.

Tre cautele specifiche Pitch: `redcard` non separa rosso diretto/secondo giallo; il periodo degli eventi è inferito; alcuni SOT/possesso hanno definizioni differenti fra flag tiri, stats e metriche avanzate. Serve un dizionario versionato per target, non un join sul nome. Le formazioni possono essere predette anziché confermate. L'assenza di un campo opzionale non è uno zero.

## Storico e missingness: ciò che possiamo affermare

| Fonte / granularità | Primo–ultimo periodo dimostrato | Numero di gare verificato | Null/mancanti per campo | Continuità e revisioni |
|---|---|---|---|---|
| Pitch squadra/player/eventi | Solo promessa dal2021; stagioni NC |0 risposte partita API | NC, denominatore assente | Changelog disponibile; vintage e completezza NC |
| 5Dollar API Free | D ultimi3 mesi |0 risposte autenticate | NC | Acquisizione/revisioni da osservare nel tempo |
| 5Dollar demo |7/01–19/10/2026, tre pagine scelte |3 pagine; solo2 giornate recenti | Cinque dimensioni6/6; altre NC | Una osservazione per pagina, nessuna misura di stabilità |
| 5Dollar catalogo qualità | D2014–2026,365 giorni per percentuali |381 dichiarati, non contati da noi | Aggregati di riga; non null-rate di ogni campo | D conteggio notturno; non disponibilità gratuita storica |
| API-Football | Elenco stagioni Free NC |0 risposte partita API | NC | Copertura varia per stagione e partita; flag true non garantisce100% |
| SportScore | Storico gratuito non quantificato |0 risposte dati | NC | Upstream multipli e correzioni dichiarati; diritto storico esteso non Free documentato |

Gli archivi già verificati in [roadmap](roadmap-multimercato-verificabile.md) restano utili per prototipi separati: Wyscout/Pappalardo Italia2017/18,380 gare/eventi, CC BY4.0; StatsBomb Open Data Serie A2015/16 con380 match nell'indice, non certificata la completezza di ogni evento. Non sono feed2026/27 e non bastano per validare giocatori/corner attuali. Nessun nuovo download o training di questi archivi in questo incarico.

## Diritti separati per finalità

`CE` = CONSENTITO ESPLICITAMENTE per la finalità indicata; `NC` = NON CHIARITO; `V` = VIETATO. È una lettura tecnica delle condizioni reperite, non un parere legale né una licenza concessa da LaMultipla.

| Finalità | Pitch | 5Dollar | API-Football | SportScore |
|---|---|---|---|---|
| Consultazione attraverso API | D offerta; contratto dati NC | CE secondo piano | CE secondo piano | CE con attribuzione, conflitto robots da chiarire |
| Automazione ordinaria API | D; condizioni NC | CE entro limiti | CE entro limiti, accesso PC da provare | CE client API; non trattare come permesso scraping |
| Uso in analisi/modelli propri | NC | CE uso in modelli/internal tools | NC per training/refit specifico | CE analytics derivati; training specifico NC |
| Cache privata | NC | CE | NC nei termini letti | CE |
| Snapshot immutabili permanenti | NC | NC: cache non è automaticamente archivio perpetuo | NC | NC |
| Training/refit continuativo e post-cessazione | NC | Uso in modelli sì; durata/refit/post-cessazione NC | NC | NC |
| Applicazione privata legata alle scommesse | NC | Nessun divieto generale trovato; nessuna garanzia per betting | Possibili licenze ulteriori: NC per questo progetto | V attività illegali; uso lecito specifico NC |
| Attribuzione | NC | Richiesta sui prodotti pubblici Free, non su uso interno | Licenza/diritti terzi da verificare | CE obbligo di badge visibile/dofollow |
| Rivendita raw / aggiramento quote | NC contratto | V | V | V |

[Termini5Dollar](https://5dollarfootballapi.com/terms), [termini API-Football](https://www.api-football.com/terms), [termini API SportScore](https://sportscore.com/developers/terms/). Nessun contratto dati Pitch individuato nelle pagine e link pubblici esaminati: non significa che non esista. Licenza di un eventuale SDK non licenzia il dataset. robots o Content-Signal per motori di ricerca/AI non sono una concessione per addestrare modelli calcistici con le risposte API.

API-Football distingue dashboard diretto (hard cap, niente overage) e RapidAPI (condizioni/possibili overage differenti): la prova proposta usa **solo Free diretto**, niente carta. Non sono consentiti account multipli per aumentare quota. Frequenze/SLA non garantiti; diritti delle competizioni non trasferiti automaticamente. Non interpretare la clausola betting come divieto universale, né come autorizzazione del progetto.

## Alternative considerate senza disperdere l'audit

- **SportScore:** contratto e YAML reali; robots predefinito disabilita `/api/` mentre il portale pubblicizza `/api/widget/`. Non chiamata l'API e non cambiato User-Agent per sfruttare regole diverse. Chiarire uso client, badge in report privati/Android, retention e training. La combinazione dati è ammessa nei termini, ma non prova la compatibilità delle definizioni o l'indipendenza degli upstream.
- **Big Balls Sports Data:** [pagina Serie A](https://bigballsdata.com/serie-a-api) con dati dimostrativi, Free limitato alla stagione corrente e profondità storica nei piani superiori; la presentazione mescola anche template di football americano. Non certificata come soluzione storica gratuita o fonte coerente, nessun account/API testato. Non proposta come sostituzione a pagamento.
- **Football-Data.co.uk:** audit precedente segnala restrizioni su bot/training; la nuova apertura pubblica restituisce429, senza retry o CSV. Non riabilitata per automazione. **football-data.org Free** non risolve queste statistiche: add-on dettagliati a pagamento esclusi dalla soluzione richiesta.
- Openfootball/archivi aperti: salvaguardano il riferimento e ricerca storica, non colmano automaticamente corner/props aggiornati. Nessuna nuova ricerca Cornerflick o sua adozione.

## Scelta pratica e prova minima successiva

I [piani di prova](api-statistiche-piano-verifica.md) fissano endpoint, massimali, arresti, campione e controlli. L'utente dovrà creare personalmente l'account scelto, leggere i termini e autorizzare una sola prova delimitata. Chiave soltanto in finestra locale/DPAPI, mai in chat. Nessuna integrazione credenziali nuova è stata attivata ora.

Priorità proposta: prima chiarire con5Dollar il conflitto `Free`/`pro` e l'archivio immutabile; poi prova Free3 richieste. In parallelo, chiedere a Pitch termini applicabili, copertura Serie A2026/27 per campo e diritti su storico/ML: è la strada potenzialmente più ricca. API-Football è il confronto più documentato per eventi/player, ma non promettere accesso2026 o anni gratuiti prima della prova. SportScore non è una soluzione storica certificata.

## Dieci risposte conclusive

1. **API gratuita per tutto?** Non ancora dimostrata. Pitch è una candidata, non un risultato positivo certificato.
2. **Dati reali?** Demo5Dollar mostrano corner/tiri/possesso/eventi; i dati player sono soltanto dichiarati dalle altre candidate, non acquisiti.
3. **Storico gratuito?** Nessuna stagione completa di statistiche recenti certificata in API. Free5Dollar tre mesi dichiarati; Community dodici condizionali; Pitch dal2021 e API-Football stagioni limitate ancora da verificare.
4. **Diritti?** Uso in modelli esplicito5Dollar, ma mancano chiarimenti su retention duratura e ciclo completo. Nessuna fonte nuova approvata per training.
5. **Aggiornamento automatico sostenibile?** Numeri compatibili con una raccolta postpartita moderata, subordinati a campi/diritti/stabilità e prove nel tempo. Non polling live.
6. **Combinare fonti?** Sì come strategia condizionata: A originale separata, supplemento squadra, eventuale player. Mai media automatica di statistiche discordanti o conferme indipendenti presunte.
7. **Mercati iniziali?** Famiglia gol già matematica; corner e poi cartellini dopo dataset e validazione propri. Props solo dopo ID/minuti/lineup e semantica affidabili.
8. **Cosa manca?** Stagioni complete, null-rate reali, revisioni, regole/refertazione, ID giocatori e diritti durevoli; per5Dollar anche strutturalmente molte statistiche e tutti i player.
9. **Account/autorizzazioni?** Nuovo account Free personale per una candidata e budget di prova esplicito; chiarimenti contrattuali richiesti prima di training/adozione.
10. **Prima fonte?**5Dollar per prova tecnica piccola e condizioni sull'uso in modelli; Pitch subito dopo chiarimento dei diritti, per lo storico e i giocatori. Nessun acquisto proposto automaticamente.

**G8 indipendente dalla ricerca:** tre campioni non costruiscono un dataset validato. Nuovi corner/props non sono realistici per un forecast scientificamente giustificato entro23 ottobre. Un futuro challenger con nuove caratteristiche richiede fonte approvata, dataset, cutoff, preregistrazione e pipeline revisionata; nessun cambiamento ai modelli originali, alle coorti o al freeze-only G8.

## Tracciabilità dell'intervento

Solo documentazione versionata e link README. Probe/transcrizioni/QC di supporto privati, senza modificare codice applicativo. Nessun adapter o downloader produttivo, nuova dipendenza, modello o scheduler. Verifica locale:3 campioni pubblici,2 riscontri di FT/kickoff, controllo degli hash dei3.400 file protetti invariati. Nessuna suite dichiarata rieseguita per un cambiamento documentale; CI del commit da verificare dopo pubblicazione. Snapshot, numeri acquisiti e chiavi esclusi da GitHub.
