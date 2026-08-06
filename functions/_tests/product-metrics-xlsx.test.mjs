import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { buildWorkbook, suggestedFilename, workbookTables } = require("../../product-metrics-xlsx.js");

function fixture() {
  return {
    schemaVersion: "product-analytics-1.3.0",
    generatedAt: "2026-08-06T04:00:00.000Z",
    windowKey: "custom",
    bucketUnit: "day",
    range: { from: "2026-08-04", to: "2026-08-06" },
    totals: { activeVisitors: 390, returningVisitors: 80, sessions: 1_017, crossModeVisitors: 44 },
    daily: [{
      day: "2026-08-04", activeVisitors: 168, returningVisitors: 0, sessions: 470,
      nba82Entrants: 107, nba82Starters: 87, nba82Completers: 85,
      nba5Entrants: 68, nba5Starters: 18, nba5Completers: 18,
      onlineEntrants: 70, onlineStarters: 29, packOpeners: 168,
      lineupCompleters: 121, sharers: 12,
    }],
    modes: [{ mode: "nba82", visitors: 250, sessions: 400, starters: 200, completers: 195 }],
    events: [{ eventName: "session_start", events: 1_017, visitors: 390 }],
    transitions: [{ fromMode: "nba82", toMode: "online", transitions: 22, visitors: 18 }],
    versions: [{ releaseVersion: "monitoring-1.3.0", visitors: 390, events: 4_000 }],
    legacyRooms: [{ day: "2026-08-04", roomsCreated: 30, roomsComplete: 12 }],
  };
}

function storedZipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    entries.set(name, decoder.decode(bytes.subarray(dataStart, dataStart + compressedSize)));
    offset = dataStart + compressedSize;
  }
  return entries;
}

test("builds a real multi-sheet xlsx archive with numeric and percentage cells", () => {
  const summary = fixture();
  const bytes = buildWorkbook(summary);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  const entries = storedZipEntries(bytes);
  assert.ok(entries.has("[Content_Types].xml"));
  assert.ok(entries.has("xl/workbook.xml"));
  assert.ok(entries.has("xl/styles.xml"));
  assert.equal([...entries.keys()].filter((name) => name.startsWith("xl/worksheets/")).length, 8);
  assert.match(entries.get("xl/workbook.xml"), /name="时段明细"/);
  assert.match(entries.get("xl/workbook.xml"), /name="口径说明"/);
  assert.match(entries.get("xl/worksheets/sheet2.xml"), /<c r="B2" s="2"><v>168<\/v><\/c>/);
  assert.match(entries.get("xl/worksheets/sheet2.xml"), /<c r="D2" s="3"><v>0<\/v><\/c>/);
  assert.match(entries.get("xl/worksheets/sheet1.xml"), /<c r="B3" s="2"><v>390<\/v><\/c>/);
  assert.match(entries.get("xl/worksheets/sheet1.xml"), /<c r="B5" s="3"><v>0\.205128/);
});

test("exports the requested tables without raw identities", () => {
  const summary = fixture();
  const sheets = workbookTables(summary);
  assert.deepEqual(sheets.map((sheet) => sheet.name), [
    "概览", "时段明细", "模式汇总", "事件漏斗", "模式转化", "版本分布", "在线房间参考", "口径说明",
  ]);
  assert.equal(JSON.stringify(sheets).includes("visitor_hash"), false);
  assert.equal(suggestedFilename(summary), "老板看板_2026-08-04_2026-08-06.xlsx");
});
