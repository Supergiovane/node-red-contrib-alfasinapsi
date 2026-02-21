# node-red-contrib-alfasinapsi

<br/>

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
