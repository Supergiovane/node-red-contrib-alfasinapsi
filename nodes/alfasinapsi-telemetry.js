"use strict";

let readTelemetry;
try {
  ({ readTelemetry } = require("./lib/alfasinapsi-telemetry"));
} catch (_) {
  readTelemetry = null;
}

module.exports = function (RED) {
  const COMPATIBILITY_TELEMETRY = "telemetry";
  const COMPATIBILITY_KNX_LOAD_CONTROL_PIN = "knxLoadControlPin";

  function wToKw(valueW) {
    return Number(valueW ?? 0) / 1000;
  }

  function whToKwh(valueWh) {
    return Number(valueWh ?? 0) / 1000;
  }

  function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function round1(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 10) / 10;
  }

  function simplifyTelemetry(telemetry) {
    const hasWarning = !!telemetry?.cutoff?.hasWarning;
    const powerImportW = Number(telemetry?.power?.importW ?? 0);
    const powerExportW = Number(telemetry?.power?.exportW ?? 0);
    const powerProductionW = Number(telemetry?.power?.productionW ?? 0);
    const powerConsumptionW = Math.max(0, powerImportW + powerProductionW - powerExportW);
    const powerSurplusW = Number(telemetry?.power?.surplusW ?? powerExportW);
    const productionUsedLocallyW = Math.max(0, powerProductionW - powerExportW);

    // Percentuali istantanee (0..100)
    const selfConsumptionPct = powerProductionW > 0 ? round1(clamp01(productionUsedLocallyW / powerProductionW) * 100) : 0;
    const gridSalePct = powerProductionW > 0 ? round1(clamp01(powerExportW / powerProductionW) * 100) : 0;
    const gridPurchasePct = powerConsumptionW > 0 ? round1(clamp01(powerImportW / powerConsumptionW) * 100) : 0;

    return {
      power: {
        importkW: wToKw(powerImportW),
        exportkW: wToKw(powerExportW),
        productionkW: wToKw(powerProductionW),
        consumptionKW: wToKw(powerConsumptionW),
        surplusKW: wToKw(powerSurplusW)
      },
      utilityPercent: {
        selfConsumption: selfConsumptionPct,
        gridSale: gridSalePct,
        gridPurchase: gridPurchasePct
      },
      energy: {
        importTotalkWh: whToKwh(telemetry?.energy?.importTotalWh),
        exportTotalkWh: whToKwh(telemetry?.energy?.exportTotalWh),
        productionTotalkWh: whToKwh(telemetry?.energy?.productionTotalWh)
      },
      tariffBand: Number(telemetry?.tariffBand ?? 0),
      cutoff: {
        hasWarning,
        remainingSeconds: hasWarning ? Number(telemetry?.cutoff?.remainingSeconds ?? 0) : null,
        atIso: telemetry?.cutoff?.atIso ?? null
      }
    };
  }

  function toIso(ms) {
    const d = new Date(Number(ms));
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function AlfaSinapsiTelemetryNode(config) {
    try {
      RED.nodes.createNode(this, config);
    } catch (err) {
      try {
        RED.log?.error?.(err?.stack || err?.message || String(err));
      } catch (_) {
        // ignore
      }
      return;
    }

    const node = this;

    const reportError = (err, context) => {
      const text = err?.stack || err?.message || String(err);
      const msg = context ? `${context}: ${text}` : text;
      try {
        node.error(msg);
      } catch (_) {
        try {
          RED.log?.error?.(msg);
        } catch (_) {
          // ignore
        }
      }
    };

    const safeStatus = (status) => {
      try {
        node.status(status);
      } catch (_) {
        // ignore
      }
    };

    const safeSend = (msg) => {
      try {
        node.send(msg);
      } catch (err) {
        reportError(err, "send");
      }
    };

    try {
      if (typeof readTelemetry !== "function") {
        safeStatus({ fill: "red", shape: "ring", text: "errore inizializzazione" });
        reportError(new Error("readTelemetry non disponibile"), "init");
        return;
      }

      const deviceId = config.device;
      node.device = null;
      node.sendOnChange = !!config.sendOnChange;
      node.compatibility = config.compatibility || COMPATIBILITY_TELEMETRY;

      const telemetryEnabled = node.compatibility === COMPATIBILITY_TELEMETRY;

      node.pollInterval = Math.max(500, Number(config.pollInterval || 10000));

      let lastPayloadCore = null;
      let timer = null;
      let inFlight = false;
      let lastShedding = null;
      let currentStatus = { connected: false, connecting: false, error: null, ts: Date.now() };
      let lastStatusSignature = null;
      let bootstrapDone = false;
      let resolveTimer = null;

      const normaliseStatus = (s) => {
        const connected = !!s?.connected;
        const connecting = !!s?.connecting;
        const error = s?.error ? String(s.error) : null;
        return { connected, connecting, error, ts: Date.now() };
      };

      const emitStatusIfChanged = (nextStatus, reason) => {
        const signature = JSON.stringify({
          connected: !!nextStatus?.connected,
          connecting: !!nextStatus?.connecting,
          error: nextStatus?.error ? String(nextStatus.error).slice(0, 64) : null
        });
        currentStatus = nextStatus;
        if (signature === lastStatusSignature) return;
        lastStatusSignature = signature;
        safeSend({
          topic: "alfasinapsi/telemetry/status",
          payload: currentStatus,
          status: currentStatus,
          reason: reason || "status"
        });
      };

      const onStatus = (s) => {
        try {
          if (s.connecting) safeStatus({ fill: "yellow", shape: "ring", text: "in connessione" });
          else if (s.connected) safeStatus({ fill: "green", shape: "dot", text: "connesso" });
          else safeStatus({ fill: "red", shape: "ring", text: s.error ? `errore: ${s.error}` : "disconnesso" });
          emitStatusIfChanged(normaliseStatus(s), "device");
        } catch (err) {
          reportError(err, "onStatus");
        }
      };

      async function tick() {
        if (inFlight) return;
        inFlight = true;
        try {
          if (!node.device) {
            safeStatus({ fill: "red", shape: "ring", text: "dispositivo non configurato" });
            return;
          }
          const telemetry = await readTelemetry(node.device, { wordOrder: node.device.wordOrder });

          if (node.compatibility === COMPATIBILITY_KNX_LOAD_CONTROL_PIN) {
            const hasWarning = !!telemetry?.cutoff?.hasWarning;
            const shedding = hasWarning ? "shed" : "unshed";
            if (node.sendOnChange && lastShedding != null && lastShedding === shedding) return;
            lastShedding = shedding;
            safeSend({
              topic: "alfasinapsi/telemetry/knx-load-control-pin",
              payload: shedding,
              shedding,
              status: currentStatus
            });
            return;
          }

          if (!telemetryEnabled) return;

          const payloadCore = simplifyTelemetry(telemetry);
          const payload = {
            ...payloadCore,
            messageAtIso: toIso(Date.now()),
            meterReadAtIso: toIso(telemetry?.ts ?? Date.now())
          };
          const insight = {
            telemetry,
            power: {
              consumptionW: Number(telemetry?.power?.consumptionW ?? 0),
              surplusW: Number(telemetry?.power?.surplusW ?? telemetry?.power?.exportW ?? 0)
            },
            meta: {
              ts: telemetry?.ts ?? Date.now(),
              functionCode: 3,
              readMode: node.device?._alfasinapsiTelemetryMode || "group"
            },
            device: {
              host: node.device?.host,
              port: 502,
              unitId: 1,
              timeoutMs: 1000,
              reconnectTimeoutMs: 2000,
              queueDelayMs: 1
            }
          };

          if (node.sendOnChange && lastPayloadCore) {
            const same = JSON.stringify(payloadCore) === JSON.stringify(lastPayloadCore);
            if (same) return;
          }

          lastPayloadCore = payloadCore;
          safeSend({ topic: "alfasinapsi/telemetry", payload, insight, status: currentStatus });
        } catch (err) {
          const message = err?.message || String(err);
          const text = /timed out/i.test(message) ? "timeout" : `errore: ${message}`;
          safeStatus({ fill: "red", shape: "ring", text: String(text).slice(0, 32) });
          emitStatusIfChanged(normaliseStatus({ connected: false, connecting: false, error: message }), "error");
          try {
            node.error(message, {
              topic: "alfasinapsi/telemetry/error",
              payload: { message }
            });
          } catch (err2) {
            reportError(err2, "node.error");
          }
        } finally {
          inFlight = false;
        }
      }

      const bootstrap = () => {
        if (bootstrapDone) return;
        if (!node.device) return;
        bootstrapDone = true;

	        try {
	          node.device.on("alfasinapsi:status", onStatus);
	        } catch (err) {
	          reportError(err, "device.on");
	        }

	        timer = setInterval(() => {
	          tick().catch((err) => reportError(err, "tick(unhandled)"));
	        }, node.pollInterval);
        tick().catch((err) => reportError(err, "tick(first)"));
      };

      const resolveDevice = () => {
        try {
          node.device = RED.nodes.getNode(deviceId);
        } catch (err) {
          node.device = null;
          reportError(err, "getNode(device)");
        }
        if (node.device) {
          bootstrap();
          return;
        }
        safeStatus({ fill: "red", shape: "ring", text: "dispositivo non configurato" });
        resolveTimer = setTimeout(resolveDevice, 1000);
      };
      resolveDevice();

      node.on("close", (removed, done) => {
        try {
          if (resolveTimer) clearTimeout(resolveTimer);
	          resolveTimer = null;
	          if (timer) clearInterval(timer);
	          timer = null;
	          try {
	            node.device?.off?.("alfasinapsi:status", onStatus);
	          } catch (err) {
	            reportError(err, "device.off");
          }
        } catch (err) {
          reportError(err, "close");
        } finally {
          try {
            done();
          } catch (_) {
            // ignore
          }
        }
      });
    } catch (err) {
      safeStatus({ fill: "red", shape: "ring", text: "errore" });
      reportError(err, "constructor");
    }
  }

  try {
    RED.nodes.registerType("alfasinapsi-telemetry", AlfaSinapsiTelemetryNode);
  } catch (err) {
    try {
      RED.log?.error?.(err?.stack || err?.message || String(err));
    } catch (_) {
      // ignore
    }
  }
};
