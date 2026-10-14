# Audit della lacuna Serie A 2024/25

Sorgente congelata: openfootball/football.json commit `e6744429ee395bc86f247348c6184bb08d4eb361`, `2024-25/it.1.json`. Ispezione reale: 380 incontri, 370 risultati, **dieci `score:{}` tutti nella 38ª giornata**. Non sono dieci risultati numerici dimostrati errati. Nessuna imputazione o modifica al dataset/studio già congelato.

| Data sorgente | Incontro | Stato del controllo incrociato |
|---|---|---|
| 2025-05-23 | Como–Inter | Fonte Lega riporta 0–2 nel precedente 2024/25; lacuna confermata, non importata |
| 2025-05-23 | Napoli–Cagliari | Fonte Lega riporta 2–0 nel 2024/25; lacuna confermata, non importata |
| 2025-05-24 | Bologna–Genoa | Non risolto in questo audit |
| 2025-05-24 | Milan–Monza | Non risolto in questo audit |
| 2025-05-25 | Atalanta–Parma | Non risolto in questo audit |
| 2025-05-25 | Empoli–Verona | Non risolto in questo audit |
| 2025-05-25 | Lazio–Lecce | Non risolto in questo audit |
| 2025-05-25 | Torino–Roma | Non risolto in questo audit |
| 2025-05-25 | Udinese–Fiorentina | Non risolto in questo audit |
| 2025-05-25 | Venezia–Juventus | Non risolto in questo audit |

Controlli primari letti:
- Lega, https://www.legaseriea.it/serie-a/news/cagliari-napoli-per-riaccendere-il-sogno-scudetto, riferimento esplicito a Napoli-Cagliari 2–0 nella stagione 2024/25.
- Lega, https://en.legaseriea.it/coppa-italia/news/como-inter-primo-round, precedente Como-Inter 0–2 nel 2024/25.
- Match report ufficiale trovato https://img.legaseriea.it/vimages/6830e3c2/2024-25_A_UNICO_UNI_38_NAPCAG.pdf, ma recupero fallito HTTP502: non dichiarato letto/verificato.
- Pagine widget match/calendario possono restituire no-data o metadati di stagione diversa: non usate come prova dei dieci score.

La mancanza è strutturata sull'ultima giornata, non casuale: la validazione su 370 partite di quella stagione non certifica prestazioni sulla 38ª. Il test complessivo resta 750 risultati disponibili/705 previsioni. Completare lo storico cambierebbe hash e campione: eventuale dataset corretto deve essere nuovo, con risultati e fonti documentati, e studio separato; non riscrivere la valutazione preregistrata.

Le correzioni posteriori restano rischio di validazione retrospettiva anche per i 370 risultati presenti: la fonte non fornisce timestamp originari di pubblicazione/correzione. Congelare oggi un commit non dimostra quali dati fossero noti nel 2024. Per la fase futura si archiviano gli snapshot osservati (commit, hash, UTC) e si segnalano punteggi discordanti senza sostituire il passato. Non è stata eseguita una verifica ufficiale sistematica di tutti i risultati storici; non dichiarare la qualità complessiva certificata.
