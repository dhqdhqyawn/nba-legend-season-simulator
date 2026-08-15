import assert from "node:assert/strict";
import test from "node:test";

import { getWechatSummary, normalizeWechatMirror, normalizeWechatOfficial, persistWechatMirror } from "../_lib/wechat-analytics.mjs";

const NOW = 1_786_473_600;

test("accepts only anonymous whitelisted mini-program events", () => {
  const rows = normalizeWechatMirror({ events: [{
    id: "event_1234567890", name: "nba5_started", visitorHash: "a".repeat(64),
    sessionHash: "b".repeat(64), mode: "offline", simulationType: "quick",
    poolMode: "three_pack", releaseVersion: "2.7.5", occurredAt: NOW,
    openid: "must-not-survive", lineup: ["must-not-survive"],
  }] }, NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mode, "offline");
  assert.equal("openid" in rows[0], false);
  assert.equal("lineup" in rows[0], false);
  assert.throws(() => normalizeWechatMirror({ events: [{ id: "bad", name: "nba5_started" }] }, NOW));
});

test("persists mirrored events idempotently", async () => {
  let statement;
  const database = { prepare(sql) { statement = { sql, bind() { return this; } }; return statement; }, async batch() { return [{ meta: { changes: 1 } }]; } };
  const inserted = await persistWechatMirror(database, [{ id:"event_1234567890",name:"session_start",visitorHash:"a".repeat(64),sessionHash:"b".repeat(64),mode:"home",simulationType:"unknown",poolMode:"unknown",releaseVersion:"2.7.5",occurredAt:NOW,receivedAt:NOW }]);
  assert.equal(inserted, 1);
  assert.match(statement.sql, /INSERT OR IGNORE INTO wechat_analytics_events/);
});

test("normalizes official T+1 daily trend", () => {
  const rows = normalizeWechatOfficial({ rows: [{ refDate:"20260811",sessionCnt:40,visitPv:70,visitUv:21,visitUvNew:8,stayTimeUv:32.5,visitDepth:3.2 }] }, NOW);
  assert.deepEqual(rows[0], { refDate:"2026-08-11",sessionCount:40,visitPv:70,visitUv:21,newUv:8,stayTimeUv:32.5,stayTimeSession:0,visitDepth:3.2,syncedAt:NOW });
});

test("builds a separate WeChat summary without mixing web DAU", async () => {
  const results = [
    [{ activeVisitors:"9",sessions:"14" }],
    [{ day:"2026-08-11",activeVisitors:"9",sessions:"14" }],
    [{ eventName:"nba5_started",events:"7",visitors:"5" }],
    [{ mode:"offline",visitors:"6",sessions:"9",starters:"5",completers:"4" }],
    [{ releaseVersion:"2.7.5",visitors:"9",events:"50" }],
    [{ day:"2026-08-11",sessions:"20",visitPv:"42",visitUv:"11",newUv:"3",stayTimeUv:"31",stayTimeSession:"12",visitDepth:"2.5",syncedAt:String(NOW) }],
    [{ fromMode:"offline",toMode:"free",transitions:"2",visitors:"2" }],
    [{ day:"2026-08-11",packOpeners:"8",lineupCompleters:"6",nba5Starters:"5",nba5Completers:"4",onlineStarters:"2",sharers:"1" }],
  ];
  let index = 0;
  const database = { prepare() { const current=index++; return { bind(){return this;}, async all(){return {results:results[current]};} }; } };
  const summary = await getWechatSummary(database,{windowHours:168,windowKey:"7d",nowSeconds:NOW});
  assert.equal(summary.platform,"wechat_mini");
  assert.equal(summary.totals.activeVisitors,9);
  assert.equal(summary.daily[0].nba5Starters,5);
  assert.equal(summary.official[0].visitUv,11);
  assert.equal(summary.transitions[0].visitors,2);
});
