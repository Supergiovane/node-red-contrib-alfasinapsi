"use strict";

const { DEFAULT_REGISTERS, DEFAULT_READ_GROUPS } = require("./alfasinapsi-map");

function decodeUint32(words, wordOrder) {
  const hi = words[0] ?? 0;
  const lo = words[1] ?? 0;

  if (wordOrder === "loHi") {
    return lo * 65536 + hi;
  }
  return hi * 65536 + lo;
}

function isNoCutoffWarning(eventEpoch) {
  // In HA: > 4294967294 => nessun avviso
  return Number(eventEpoch) > 4294967294;
}

function toIsoLocalFromEpochSeconds(epochSeconds) {
  if (!Number.isFinite(epochSeconds)) return null;
  const date = new Date(epochSeconds * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function buildTelemetry(raw, wordOrder) {
  const r = DEFAULT_REGISTERS;
  const get16 = (key) => raw[r[key].address];
  const get32 = (key) => raw[r[key].address];

  const cutoffEventEpoch = get32("cutoffEventEpoch");
  const cutoffRemainingSeconds = get16("cutoffRemainingSeconds");

  const hasCutoffWarning = !isNoCutoffWarning(cutoffEventEpoch);
  const cutoffAtEpoch = hasCutoffWarning ? Number(cutoffEventEpoch) + Number(cutoffRemainingSeconds || 0) : null;

  const powerImportW = Number(get16("powerImportW") ?? 0);
  const powerExportW = Number(get16("powerExportW") ?? 0);
  const powerProductionW = Number(get16("powerProductionW") ?? 0);
  const powerConsumptionW = Math.max(0, powerImportW + powerProductionW - powerExportW);
  const powerSurplusW = powerExportW;

  return {
    ts: Date.now(),
    power: {
      importW: powerImportW,
      exportW: powerExportW,
      productionW: powerProductionW,
      consumptionW: powerConsumptionW,
      surplusW: powerSurplusW,
      importQuarterAvgW: get16("powerImportQuarterAvgW"),
      exportQuarterAvgW: get16("powerExportQuarterAvgW")
    },
    energy: {
      importTotalWh: get32("energyImportTotalWh"),
      exportTotalWh: get32("energyExportTotalWh"),
      productionTotalWh: get32("energyProductionTotalWh"),
      importYesterdayWh: {
        F1: get32("energyImportYesterdayF1Wh"),
        F2: get32("energyImportYesterdayF2Wh"),
        F3: get32("energyImportYesterdayF3Wh"),
        F4: get32("energyImportYesterdayF4Wh"),
        F5: get32("energyImportYesterdayF5Wh"),
        F6: get32("energyImportYesterdayF6Wh")
      },
      exportYesterdayWh: {
        F1: get32("energyExportYesterdayF1Wh"),
        F2: get32("energyExportYesterdayF2Wh"),
        F3: get32("energyExportYesterdayF3Wh"),
        F4: get32("energyExportYesterdayF4Wh"),
        F5: get32("energyExportYesterdayF5Wh"),
        F6: get32("energyExportYesterdayF6Wh")
      }
    },
    tariffBand: get16("currentTariffBand"),
    cutoff: {
      hasWarning: hasCutoffWarning,
      eventEpoch: cutoffEventEpoch,
      remainingSeconds: cutoffRemainingSeconds,
      atEpoch: cutoffAtEpoch,
      atIso: cutoffAtEpoch != null ? toIsoLocalFromEpochSeconds(cutoffAtEpoch) : null
    },
    _wordOrder: wordOrder
  };
}

async function readTelemetry(device, options = {}) {
  // Deduplica chiamate concorrenti (telemetria + controller carichi) per non interrogare il dispositivo due volte.
  if (device && device._alfasinapsiTelemetryInFlight) {
    return device._alfasinapsiTelemetryInFlight;
  }

  const wordOrder = options.wordOrder || device.wordOrder || "hiLo";
  const registers = options.registers || DEFAULT_REGISTERS;

  const mode = options.mode || device._alfasinapsiTelemetryMode || "group"; // group | single

  async function readGrouped() {
    const groups = options.groups || DEFAULT_READ_GROUPS;
    const rawByAddress = Object.create(null);

    for (const group of groups) {
      // FC3 fisso: lettura registri holding
      const res = await device.readHoldingRegisters(group.start, group.count);
      const data = res?.data || res || [];

      for (let i = 0; i < group.count; i++) {
        rawByAddress[group.start + i] = data[i];
      }
    }

    const decodedByAddress = Object.create(null);
    for (const def of Object.values(registers)) {
      if (def.type === "uint16") {
        decodedByAddress[def.address] = Number(rawByAddress[def.address] ?? 0);
        continue;
      }

      if (def.type === "uint32") {
        const w0 = Number(rawByAddress[def.address] ?? 0);
        const w1 = Number(rawByAddress[def.address + 1] ?? 0);
        decodedByAddress[def.address] = decodeUint32([w0, w1], wordOrder);
        continue;
      }
    }

    return decodedByAddress;
  }

  async function readSingle() {
    const decodedByAddress = Object.create(null);
    const readCache = new Map(); // address -> word

    async function readWords(address, count) {
      const cached0 = readCache.get(address);
      const cached1 = readCache.get(address + 1);
      if (count === 1 && typeof cached0 !== "undefined") return [cached0];
      if (count === 2 && typeof cached0 !== "undefined" && typeof cached1 !== "undefined") return [cached0, cached1];

      // FC3 fisso: lettura registri holding
      const res = await device.readHoldingRegisters(address, count);
      const data = res?.data || res || [];
      for (let i = 0; i < count; i++) {
        readCache.set(address + i, Number(data[i] ?? 0));
      }
      return [Number(data[0] ?? 0), Number(data[1] ?? 0)].slice(0, count);
    }

    for (const def of Object.values(registers)) {
      if (def.type === "uint16") {
        const [w0] = await readWords(def.address, 1);
        decodedByAddress[def.address] = Number(w0 ?? 0);
        continue;
      }

      if (def.type === "uint32") {
        const [w0, w1] = await readWords(def.address, 2);
        decodedByAddress[def.address] = decodeUint32([Number(w0 ?? 0), Number(w1 ?? 0)], wordOrder);
        continue;
      }
    }

    return decodedByAddress;
  }

  let currentPromise;
  currentPromise = (async () => {
    try {
      const decoded = mode === "single" ? await readSingle() : await readGrouped();
      device._alfasinapsiTelemetryMode = mode;
      return buildTelemetry(decoded, wordOrder);
    } catch (err) {
      // Alcuni dispositivi non gradiscono letture su range ampi: fallback a letture a singolo registro.
      try {
        const decoded = await readSingle();
        device._alfasinapsiTelemetryMode = "single";
        return buildTelemetry(decoded, wordOrder);
      } catch (_) {
        throw err;
      }
    } finally {
      if (device && device._alfasinapsiTelemetryInFlight === currentPromise) {
        device._alfasinapsiTelemetryInFlight = null;
      }
    }
  })();

  if (device) device._alfasinapsiTelemetryInFlight = currentPromise;
  return currentPromise;
}

module.exports = {
  readTelemetry
};
