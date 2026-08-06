(function attachProductMetricsXlsx(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ProductMetricsXlsx = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createProductMetricsXlsx() {
  "use strict";

  const encoder = new TextEncoder();
  const modeNames = { nba82: "NBA82", nba5: "NBA5 离线", online: "在线房间" };
  const eventNames = {
    session_start: "进入游戏",
    mode_entered: "进入模式",
    pack_opened: "完成开包",
    lineup_completed: "选满五人",
    nba82_started: "开始 NBA82",
    nba82_completed: "完成 NBA82",
    nba5_started: "开始 NBA5",
    nba5_completed: "完成 NBA5",
    room_created: "创建在线房间",
    room_joined: "加入在线房间",
    room_started: "在线开赛",
    result_shared: "生成分享图",
  };

  function ratio(part, total) {
    return total ? Number(part || 0) / Number(total) : null;
  }

  function currentRangeLabel(summary) {
    if (summary.range?.from && summary.range?.to) return `${summary.range.from} 至 ${summary.range.to}`;
    return `最近 ${summary.windowKey || "当前窗口"}`;
  }

  function workbookTables(summary) {
    const totals = summary.totals || {};
    const daily = summary.daily || [];
    const overview = [
      ["指标", "数值", "说明"],
      ["查询范围", currentRangeLabel(summary), "北京时间"],
      ["窗口活跃用户", Number(totals.activeVisitors || 0), "当前范围去重用户，不能与每日活跃相加"],
      ["回访用户", Number(totals.returningVisitors || 0), "首次出现早于当前查询范围的用户"],
      ["回访占比", ratio(totals.returningVisitors, totals.activeVisitors), "不是严格次日留存"],
      ["会话数", Number(totals.sessions || 0), "当前范围去重会话"],
      ["人均会话", ratio(totals.sessions, totals.activeVisitors), "会话数 ÷ 窗口活跃用户"],
      ["跨模式用户", Number(totals.crossModeVisitors || 0), "当前范围进入过两个及以上模式"],
      ["生成时间", summary.generatedAt || "", "接口生成时间（UTC）"],
      ["数据版本", summary.schemaVersion || "", "产品监控汇总版本"],
    ];
    const detail = [[
      summary.bucketUnit === "hour" ? "小时" : "日期",
      "活跃用户", "回访用户", "回访占比", "会话",
      "NBA82进入", "NBA82开始", "NBA82完成",
      "NBA5进入", "NBA5开始", "NBA5完成",
      "在线进入", "在线开赛", "开包", "选满五人", "分享",
    ], ...daily.map((row) => [
      row.day,
      Number(row.activeVisitors || 0),
      Number(row.returningVisitors || 0),
      ratio(row.returningVisitors, row.activeVisitors),
      Number(row.sessions || 0),
      Number(row.nba82Entrants || 0),
      Number(row.nba82Starters || 0),
      Number(row.nba82Completers || 0),
      Number(row.nba5Entrants || 0),
      Number(row.nba5Starters || 0),
      Number(row.nba5Completers || 0),
      Number(row.onlineEntrants || 0),
      Number(row.onlineStarters || 0),
      Number(row.packOpeners || 0),
      Number(row.lineupCompleters || 0),
      Number(row.sharers || 0),
    ])];
    const modes = [["模式", "用户", "会话", "开始", "完成", "完成/开始比"],
      ...(summary.modes || []).map((row) => [
        modeNames[row.mode] || row.mode,
        Number(row.visitors || 0), Number(row.sessions || 0), Number(row.starters || 0),
        Number(row.completers || 0), ratio(row.completers, row.starters),
      ])];
    const events = [["事件", "事件次数", "用户数"],
      ...(summary.events || []).map((row) => [
        eventNames[row.eventName] || row.eventName,
        Number(row.events || 0), Number(row.visitors || 0),
      ])];
    const transitions = [["来源模式", "去向模式", "切换次数", "用户数"],
      ...(summary.transitions || []).map((row) => [
        modeNames[row.fromMode] || row.fromMode,
        modeNames[row.toMode] || row.toMode,
        Number(row.transitions || 0), Number(row.visitors || 0),
      ])];
    const versions = [["版本", "用户", "事件"],
      ...(summary.versions || []).map((row) => [
        row.releaseVersion || "unknown", Number(row.visitors || 0), Number(row.events || 0),
      ])];
    const rooms = [["日期", "创建房间", "完成房间", "完成/创建比"],
      ...(summary.legacyRooms || []).map((row) => [
        row.day, Number(row.roomsCreated || 0), Number(row.roomsComplete || 0),
        ratio(row.roomsComplete, row.roomsCreated),
      ])];
    const definitions = [
      ["字段", "口径"],
      ["活跃", "该时段内产生任一白名单事件的匿名去重用户，不代表同时在线。"],
      ["回访", "首次出现时间早于查询范围开始的匿名用户，不等同于次日留存。"],
      ["开始/完成", "在所选时段分别去重计数；可能跨时段发生，不能当作严格 cohort 转化率。"],
      ["隐私", "仅导出匿名聚合数字，不包含昵称、阵容、原始访客标识或反馈正文。"],
      ["时区", "所有日期与小时按北京时间（UTC+8）聚合。"],
    ];
    return [
      { name: "概览", rows: overview, percentColumns: new Set(), percentCells: new Set(["B5", "B7"]) },
      { name: "时段明细", rows: detail, percentColumns: new Set([4]) },
      { name: "模式汇总", rows: modes, percentColumns: new Set([6]) },
      { name: "事件漏斗", rows: events, percentColumns: new Set() },
      { name: "模式转化", rows: transitions, percentColumns: new Set() },
      { name: "版本分布", rows: versions, percentColumns: new Set() },
      { name: "在线房间参考", rows: rooms, percentColumns: new Set([4]) },
      { name: "口径说明", rows: definitions, percentColumns: new Set() },
    ];
  }

  function xmlEscape(value) {
    return String(value ?? "")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function columnName(index) {
    let value = index;
    let name = "";
    while (value > 0) {
      value -= 1;
      name = String.fromCharCode(65 + value % 26) + name;
      value = Math.floor(value / 26);
    }
    return name;
  }

  function displayWidth(value) {
    return Array.from(String(value ?? "")).reduce((sum, char) => sum + (char.codePointAt(0) > 255 ? 2 : 1), 0);
  }

  function worksheetXml(sheet) {
    const rowCount = sheet.rows.length;
    const columnCount = Math.max(1, ...sheet.rows.map((row) => row.length));
    const widths = Array.from({ length: columnCount }, (_, index) => Math.min(38, Math.max(10,
      ...sheet.rows.map((row) => displayWidth(row[index]) + 2),
    )));
    const rows = sheet.rows.map((row, rowIndex) => {
      const cells = row.map((value, columnIndex) => {
        const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
        const isPercent = sheet.percentColumns.has(columnIndex + 1) || sheet.percentCells?.has(ref);
        const style = rowIndex === 0 ? 1 : isPercent ? 3 : typeof value === "number" ? 2 : 0;
        if (value === null || value === undefined || value === "") return `<c r="${ref}" s="${style}"/>`;
        if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
        return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
      }).join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join("");
    const columns = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
    const lastCell = `${columnName(columnCount)}${Math.max(1, rowCount)}`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${rows}</sheetData><autoFilter ref="A1:${lastCell}"/></worksheet>`;
  }

  function workbookFiles(summary) {
    const sheets = workbookTables(summary);
    const sheetNodes = sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
    const relationships = sheets.map((sheet, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
    const contentOverrides = sheets.map((sheet, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
    const files = [
      ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${contentOverrides}</Types>`],
      ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetNodes}</sheets></workbook>`],
      ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0%"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF9E3F2D"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><bottom style="thin"><color rgb="FFDDD5C8"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
      ...sheets.map((sheet, index) => [`xl/worksheets/sheet${index + 1}.xml`, worksheetXml(sheet)]),
    ];
    return files;
  }

  let crcTable = null;
  function crc32(bytes) {
    if (!crcTable) {
      crcTable = Array.from({ length: 256 }, (_, index) => {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
        return value >>> 0;
      });
    }
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ crc >>> 8;
    return (crc ^ 0xffffffff) >>> 0;
  }

  function u16(value) {
    return new Uint8Array([value & 255, value >>> 8 & 255]);
  }

  function u32(value) {
    return new Uint8Array([value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255]);
  }

  function concat(parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.length; }
    return output;
  }

  function zipStore(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const [name, text] of files) {
      const nameBytes = encoder.encode(name);
      const data = encoder.encode(text);
      const checksum = crc32(data);
      const local = concat([
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(checksum), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes, data,
      ]);
      const central = concat([
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(checksum), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0),
        u16(0), u16(0), u32(0), u32(offset), nameBytes,
      ]);
      locals.push(local);
      centrals.push(central);
      offset += local.length;
    }
    const centralDirectory = concat(centrals);
    return concat([
      ...locals,
      centralDirectory,
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralDirectory.length), u32(offset), u16(0),
    ]);
  }

  function buildWorkbook(summary) {
    if (!summary || typeof summary !== "object") throw new TypeError("summary is required");
    return zipStore(workbookFiles(summary));
  }

  function suggestedFilename(summary) {
    const range = summary.range?.from && summary.range?.to
      ? `${summary.range.from}_${summary.range.to}`
      : summary.windowKey || "current";
    return `老板看板_${range}.xlsx`;
  }

  function download(summary) {
    if (typeof document === "undefined" || typeof URL === "undefined") {
      throw new Error("download is only available in a browser");
    }
    const bytes = buildWorkbook(summary);
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = suggestedFilename(summary);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return { buildWorkbook, download, suggestedFilename, workbookTables };
});
