# node-red-contrib-alfasinapsi-ultimate

<br/>

<p>
<b>Version 1.0.0</b> - February 2026<br/>
- BREAKING CHANGE: changed package name to node-red-contrib-alfasinapsi-ultimate
- FIX: faster node shutdown (best-effort client close) to avoid <code>Close timed out</code> errors on deploy/restart.<br/>
- NEW: nodes now emit <code>msg.status</code> connection state messages (topics: <code>alfasinapsi/telemetry/status</code>, <code>alfasinapsi/controller/status</code>).<br/>
- NEW: telemetry and controller summary payloads now include <code>messageAtIso</code> (timestamp messaggio) and <code>meterReadAtIso</code> (timestamp ultima lettura).<br/>
- NEW: <code>payload.cutoff.remainingSeconds</code> is now included for a human-friendly countdown to cutoff events.<br/>
- FIX: hardened editor-side dynamic outputs to prevent the load controller node from disappearing when dragged into the workspace.<br/>
- FIX: telemetry node now retries device resolution on startup to avoid false <code>dispositivo non configurato</code> statuses during deploy.<br/>
</p>

<p>
<b>Version 0.1.3</b> - February 2026<br/>
- HARDEN: added extensive try/catch guards to avoid uncaught exceptions and prevent Node-RED crashes.<br/>
</p>

<p>
<b>Version 0.1.1</b> - February 2026<br/>
- NEW: `alfasinapsi-telemetry` output compatibility selector: Telemetria / KNX Load Control PIN.<br/>
- NEW: KNX Load Control PIN mode emits `msg.payload` + `msg.shedding` = `shed`/`unshed` every 10 seconds, based on cutoff warning telemetry.<br/>
- CHANGE: `alfasinapsi-telemetry` now has a single output pin; the message format depends on the selected compatibility.<br/>
- DOC: updated node help panels and README to describe the new telemetry/KNX modes.<br/>
- DOC: fixed images in the npm page by switching README image URLs to `raw.githubusercontent.com`.<br/>
</p>

<p>
<b>Version 0.1.0</b><br/>
- Initial release.<br/>
</p>
