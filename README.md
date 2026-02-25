<p align="center">
  <img src="assets/alfasinapsi-logo.svg" width="520" alt="node-red-contrib-alfasinapsi-ultimate logo" />
</p>

[![NPM version][npm-version-image]][npm-url]
[![Node.js version][node-version-image]][npm-url]
[![Node-RED Flow Library][flows-image]][flows-url]
[![Docs][docs-image]][docs-url]
[![NPM downloads per month][npm-downloads-month-image]][npm-url]
[![NPM downloads total][npm-downloads-total-image]][npm-url]
[![MIT License][license-image]][license-url]
[![JavaScript Style Guide][standard-image]][standard-url]
[![Youtube][youtube-image]][youtube-url]

Nodi Node-RED per collegare **Sinapsi Alfa** via WiFi e creare un **controller carichi**.

## Requisiti

- Un dispositivo Sinapsi Alfa raggiungibile sulla tua rete WiFi

## CHANGELOG

[CHANGELOG](changelog.md)

## Avvio rapido (passo-passo)

1. Apri l'editor di Node-RED.
2. Nella palette a sinistra, cerca "alfasinapsi".
3. Trascina **alfasinapsi telemetria** nel flow.
4. Fai doppio click e premi la **matita** vicino a _Dispositivo_ per creare una nuova configurazione **alfasinapsi device**.
5. Compila:
   - **Indirizzo IP Sinapsi**: l'indirizzo IP del tuo Sinapsi Alfa (esempio `192.168.1.186`)
6. Premi **Add**, poi **Done**.
7. Collega l'uscita del nodo telemetria a un nodo **Debug** e premi **Deploy**.

Dovresti vedere i messaggi nella sidebar di debug con valori di potenza ed energia.

<p align="center">
  <img src="assets/picture.jpg" width="520" alt="Esempio flow" />
</p>

Esempio `examples/alfasinapsi-load-controller.json`.

## Nodi

### `alfasinapsi-telemetry`

Interroga Sinapsi Alfa e, in base alla configurazione <i>Compatibilita</i>, invia:

- **Telemetria** (default): un messaggio con misure semplificate + dettagli tecnici.
- **KNX Load Control PIN**: un messaggio compatibile con l'ingresso del nodo KNX Load Control (es. `knxUltimateLoadControl`) per forzare shed/unshed.
- **Stato connessione**: quando cambia lo stato del dispositivo, invia un messaggio di stato.

Output:

- Modalita <b>Telemetria</b>:
  - `msg.topic = "alfasinapsi/telemetry"`
  - `msg.payload` (semplificato): potenza/energia (import/export/production), fascia tariffaria, avviso distacco + timestamp
  - `msg.insight` (tecnico): telemetria completa decodificata (include campi extra come fasce di ieri, medie di quarto d'ora, ecc.)
  - `msg.status`: stato connessione corrente
- Modalita <b>KNX Load Control PIN</b> (in base a <i>Poll (ms)</i>):
  - `msg.topic = "alfasinapsi/telemetry/knx-load-control-pin"`
  - `msg.payload = "shed" | "unshed"`
  - `msg.shedding = "shed" | "unshed"`
  - `msg.status`: stato connessione corrente
- Messaggio <b>Stato connessione</b> (solo quando cambia):
  - `msg.topic = "alfasinapsi/telemetry/status"`
  - `msg.payload = msg.status`

Configurazione:

- `Dispositivo`: IP del tuo Sinapsi (parametri di connessione fissi per stabilita)
- `Poll (ms)`: ogni quanto il nodo legge i dati (in modalita <i>Telemetria</i> influenza anche la frequenza dei messaggi; quindi e' importante se a valle hai logiche a stadi)
- `Solo se cambia`: se abilitato, emette solo quando cambiano i valori principali
- `Compatibilita`: seleziona <i>Telemetria</i> oppure <i>KNX Load Control PIN</i>
  - Nota: in modalita <i>KNX Load Control PIN</i> emette con la stessa frequenza del <i>Poll (ms)</i> (oppure solo al cambio stato se <i>Solo se cambia</i> e' attivo).

### `alfasinapsi-load-controller`

Reagisce ai messaggi in formato <b>Telemetria</b> e applica una sequenza a stadi sui carichi configurati usando <code>payload.cutoff.hasWarning</code>.

Uscite: una uscita per ogni carico configurato (minimo 1, per evitare che il nodo sparisca dall'editor).
Ogni uscita emette un comando booleano per quel carico con:

- `msg.topic = "<nome carico>"`
- `msg.payload = true` (unshed/abilitato) oppure `false` (shed/disabilitato)

Algoritmo:

- Se <code>payload.cutoff.hasWarning = true</code> aumenta lo <b>stage</b> di 1 (fino a N carichi).
- Se <code>payload.cutoff.hasWarning = false</code> diminuisce lo <b>stage</b> di 1 (fino a 0).
- Lo stage indica quanti carichi vengono messi in shedding, in base all'<b>ordine</b> della lista (dall'alto verso il basso: shed per primo).

Note:

- I comandi dei carichi escono solo quando il nodo decide di cambiare stato (shedding/unshedding di quel carico).

## Dettagli (per utenti inesperti)

### 1) `alfasinapsi-device` (nodo di configurazione)

Questo nodo non appare nel flow come un nodo normale. E' una configurazione condivisa usata dagli altri nodi.

Campo principale:

- **Indirizzo IP Sinapsi**: indirizzo IP o hostname del dispositivo Sinapsi Alfa

Impostazioni fisse (non modificabili):

- Il profilo di connessione e' fisso per stabilita (serve solo l'indirizzo IP).

### 2) `alfasinapsi-telemetry` (misure in sola lettura)

Questo nodo legge le misure ogni _Poll (ms)_ e invia messaggi dal suo unico output.

In piu:

- Ogni messaggio include `msg.status` (stato connessione corrente).
- Quando cambia lo stato di connessione, emette anche un messaggio dedicato con `msg.topic = "alfasinapsi/telemetry/status"`.

Puoi scegliere cosa emettere dall'output con <i>Compatibilita</i>:

- <b>Telemetria</b>: messaggio con misure + dettagli tecnici.
- <b>KNX Load Control PIN</b>: messaggio `shed/unshed` con la frequenza del <i>Poll (ms)</i> (compatibile con il nodo KNX Load Control).
  - Nota: in questa modalita la frequenza dipende da <i>Poll (ms)</i> (e rispetta <i>Solo se cambia</i>).
  - Nota importante: se colleghi questo output al nodo <code>alfasinapsi-load-controller</code>, la frequenza dei messaggi determina la velocita con cui aumenta/diminuisce lo <i>shedding stage</i>.

Uso tipico:

- Collegalo a un nodo **Debug** per vedere i valori.
- Collegalo a una **Dashboard** (o alla tua logica) per visualizzare o usare potenza/energia.

Struttura del messaggio (modalita <b>Telemetria</b>):

- `msg.payload` - campi semplificati per l'uso quotidiano:
  - `payload.power.importkW` / `exportkW` / `productionkW`
  - `payload.energy.importTotalkWh` / `exportTotalkWh` / `productionTotalkWh`
  - `payload.tariffBand`
  - `payload.cutoff.hasWarning` / `payload.cutoff.remainingSeconds` / `payload.cutoff.atIso`
  - `payload.messageAtIso` / `payload.meterReadAtIso`
- `msg.insight` - dettagli tecnici:
  - `insight.telemetry`: telemetria completa decodificata (include campi extra come fasce di ieri, medie di quarto d'ora, ecc.)
  - `insight.meta`: timestamp, modalita di lettura
  - `insight.device`: dettagli del profilo di connessione
- `msg.status` - stato connessione:
  - `status.connected` (boolean)
  - `status.connecting` (boolean)
  - `status.error` (string|null)
  - `status.ts` (number, epoch ms)

Struttura del messaggio (modalita <b>KNX Load Control PIN</b>):

- `msg.payload = "shed"` se e' presente un avviso distacco imminente, altrimenti `msg.payload = "unshed"` (con la frequenza del <i>Poll (ms)</i>)
- `msg.shedding` con lo stesso valore (per compatibilita con KNX Load Control)

## Terminologia (import/export/surplus)

Questi sono termini standard nel monitoraggio energetico:

- **Import**: potenza/energia prelevata dalla rete (stai consumando piu di quanto produci).
- **Export**: potenza/energia immessa in rete (stai producendo piu di quanto consumi).
- **Surplus**: potenza in eccesso disponibile. In questo pacchetto la logica surplus si basa su **export** (eventualmente ridotto da _Surplus reserve_).

### 3) `alfasinapsi-load-controller` (solo decisioni)

Questo nodo <b>non fa polling</b>. Riceve in ingresso messaggi <b>Telemetria</b> (output del nodo <code>alfasinapsi-telemetry</code> in modalita <i>Telemetria</i>) e usa <code>payload.cutoff.hasWarning</code> per decidere se aumentare o diminuire lo stage. Invia:

- Una uscita per ogni carico configurato, che emette <code>true/false</code> (unshed/shed) con <code>msg.topic</code> uguale al nome del carico.

Importante: questo nodo **non comanda i relè da solo**. Devi collegare ogni uscita carico a qualcosa che accende/spegne davvero i dispositivi (per esempio MQTT, nodi Shelly, chiamate di servizio Home Assistant, ecc.).

Nota importante: lo stage cambia di 1 per ogni messaggio ricevuto, quindi la velocita della sequenza dipende dalla frequenza dei messaggi in ingresso (per esempio dal <i>Poll (ms)</i> della telemetria).

Come configurare i carichi:

- **Nome**: usato come etichetta di uscita e come `msg.topic` in output
- **Ordine in lista**: la posizione nella lista determina la priorita (dall'alto verso il basso)
- **Min acceso (s)**: tempo minimo in cui il carico resta acceso prima di poter essere spento
- **Min spento (s)**: tempo minimo in cui il carico resta spento prima di poter essere acceso

## Problemi di connessione? Ricorda

- Sinapsi Alfa in genere accetta una sola connessione alla volta: evita di collegare piu sistemi contemporaneamente.

[npm-version-image]: https://img.shields.io/npm/v/node-red-contrib-alfasinapsi-ultimate.svg
[npm-url]: https://www.npmjs.com/package/node-red-contrib-alfasinapsi-ultimate
[node-version-image]: https://img.shields.io/node/v/node-red-contrib-alfasinapsi-ultimate.svg
[flows-image]: https://img.shields.io/badge/Node--RED-Flow%20Library-red
[flows-url]: https://flows.nodered.org/node/node-red-contrib-alfasinapsi-ultimate
[docs-image]: https://img.shields.io/badge/docs-documents-blue
[docs-url]: documents/
[npm-downloads-month-image]: https://img.shields.io/npm/dm/node-red-contrib-alfasinapsi-ultimate.svg
[npm-downloads-total-image]: https://img.shields.io/npm/dt/node-red-contrib-alfasinapsi-ultimate.svg
[license-image]: https://img.shields.io/badge/license-MIT-green.svg
[license-url]: https://opensource.org/licenses/MIT
[standard-image]: https://img.shields.io/badge/code%20style-standard-brightgreen.svg
[standard-url]: https://standardjs.com
[youtube-image]: https://img.shields.io/badge/YouTube-Subscribe-red?logo=youtube&logoColor=white
[youtube-url]: https://www.youtube.com/@Supergiovane
