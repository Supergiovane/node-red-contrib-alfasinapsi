# node-red-contrib-alfasinapsi

<p align="center">
  <img src="assets/alfasinapsi-logo.svg" width="520" alt="node-red-contrib-alfasinapsi logo" />
</p>

Node-RED nodes to connect to **Sinapsi Alfa** over WiFi and build a **load controller**.

This implementation is based on the Home Assistant reference files under `documents/`.

## What you get

This package adds these nodes:

- **Sinapsi Alfa telemetry** (`alfasinapsi-telemetry`) – reads measurements and outputs telemetry
- **Sinapsi Alfa load controller** (`alfasinapsi-load-controller`) – decides which loads to turn ON/OFF

You can use only the telemetry node (to monitor power/energy), or combine it with the load controller node.

## Requirements

- Node.js >= 18
- A reachable Sinapsi Alfa on your WiFi network
- Node-RED running on the same network

## Quick start (step-by-step)

1. Open the Node-RED editor.
2. In the left palette, search for “alfasinapsi”.
3. Drag **alfasinapsi telemetry** into the flow.
4. Double-click it and click the **pencil** next to _Device_ to create a new **alfasinapsi device** config.
5. Fill in:
   - **Sinapsi IP address**: the IP address of your Sinapsi Alfa (example `192.168.1.186`)
6. Click **Add** (device), then **Done** (telemetry).
7. Wire the telemetry output to a **Debug** node and click **Deploy**.

You should now see messages in the debug sidebar with power and energy values.

## Nodes

### `alfasinapsi-telemetry`

Polls Sinapsi Alfa and outputs an object with:

- instant power (import, export, production)
- total energy (import, export, production)
- yesterday energy by tariff bands F1..F6 (import and export)
- current tariff band
- cutoff notice data (event date + remaining seconds)

Output:

- `msg.topic = "alfasinapsi/telemetry"`
- `msg.payload = { ...metrics }`

Configuration:

- `Device`: your Sinapsi IP address (connection settings are fixed for stability)

### `alfasinapsi-load-controller`

Reads telemetry directly from Sinapsi Alfa (polling) and decides which loads to switch ON/OFF.

Output 1: summary (`msg.topic = "alfasinapsi/controller"`).  
Output 2..N+1: ON/OFF command for each load (boolean payload).

Algorithm (configurable):

- **Surplus**: enables loads when there is enough **export** to grid (W).
- **Import limit**: disables loads when **import** exceeds a threshold (W).
- **Cutoff notice**: if present, disables everything (forced).

Notes:

- Per-load commands are `msg.payload = true/false` with `msg.topic = "load/<name>"`.
- You can override a load by sending an input message with `topic = "load/<name>"` and boolean `payload`.

## Node details (beginner-friendly)

### 1) `alfasinapsi-device` (configuration node)

This node does not appear in your flow as a normal node. It is a shared configuration used by the other nodes.

Main field:

- **Sinapsi IP address**: IP address or hostname of the Sinapsi Alfa device

Fixed settings (not configurable):

- Connection profile is fixed for stability (you only need the IP address).

### 2) `alfasinapsi-telemetry` (read-only measurements)

This node reads measurements every _Poll (ms)_ and outputs a single message.

Typical use:

- Wire it to a **Debug** node to inspect values.
- Wire it to a **Dashboard** (or your own logic) to display or process power/energy.

Message structure (high level):

- `msg.payload` – simplified fields for everyday use:
  - `payload.power.importkW` / `exportkW` / `productionkW`
  - `payload.energy.importTotalkWh` / `exportTotalkWh` / `productionTotalkWh`
  - `payload.tariffBand`
  - `payload.cutoff.hasWarning` / `payload.cutoff.atIso`
- `msg.insight` – technical details:
  - `insight.telemetry`: full decoded telemetry (includes additional fields like yesterday bands, quarter averages, etc.)
  - `insight.meta`: timestamp, read mode
  - `insight.device`: connection profile details

## Terminology (import/export/surplus)

These are standard power-flow terms used in energy monitoring:

- **Import**: power/energy drawn from the grid (you are consuming more than you produce).
- **Export**: power/energy fed into the grid (you are producing more than you consume).
- **Surplus**: available excess power. In this package, surplus logic is based on **export** (optionally reduced by _Surplus reserve_).

### 3) `alfasinapsi-load-controller` (decisions only)

This node reads telemetry (it does its own polling) and outputs:

- Output 1: a **summary** of current power and controller state
- Output 2..N+1: a boolean command for each configured load

Important: this node **does not switch relays by itself**. You must connect each load output to something that actually turns devices ON/OFF (for example MQTT, Shelly nodes, Home Assistant service calls, etc.).

How to configure loads:

- **Name**: used for the output label and for manual override (`load/<name>`)
- **W**: expected power consumption of that load (used to estimate how many loads can fit into the available surplus)
- **Priority**: lower number = higher priority (kept ON longer)
- **Min ON (s)**: minimum time the load stays ON before it can be turned OFF again
- **Min OFF (s)**: minimum time the load stays OFF before it can be turned ON again

Manual override (optional):

Send a message into the node input:

- `msg.topic = "load/<name>"`
- `msg.payload = true` (force desired ON) or `false` (force desired OFF)

## Troubleshooting

- **All values are 0 or missing**: check connectivity and that the IP address is reachable from Node-RED.
- **Timeout errors**: ensure nothing else is connected to the device at the same time (some devices allow only one client). The nodes will automatically fall back to smaller reads when possible.
- **Load controller stuck in timeout after deploy**: update to the latest version of this package. Older versions could get stuck after the first failed request due to a queue issue.
- **No nodes appear in the palette after install**: restart Node-RED and check the Node-RED logs for install errors.
- **Cutoff notice behavior**: when `payload.cutoff.hasWarning` is `true` and _Turn everything off on cutoff notice_ is enabled, the load controller will command all loads OFF.

## Example

See `examples/alfasinapsi-load-controller.json`.
