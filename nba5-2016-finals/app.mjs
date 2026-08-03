import { EVENT_CATEGORIES, PLAYERS, TEAMS, TEAM_IDS, seedFromEntropy, simulateSeries } from "./engine.mjs";

const STORAGE_KEY = "nba5-2016-finals-room-score-v1";
const $ = selector => document.querySelector(selector);
const dom = {
  warriorsRoster: $("#warriorsRoster"),
  cavaliersRoster: $("#cavaliersRoster"),
  warriorsRoomScore: $("#warriorsRoomScore"),
  cavaliersRoomScore: $("#cavaliersRoomScore"),
  seriesCounter: $("#seriesCounter"),
  resetScoreboard: $("#resetScoreboard"),
  simulateSeries: $("#simulateSeries"),
  simulateAgain: $("#simulateAgain"),
  lastResultSummary: $("#lastResultSummary"),
  resultSection: $("#resultSection"),
  resultHero: $("#resultHero"),
  resultEyebrow: $("#resultEyebrow"),
  resultTitle: $("#resultTitle"),
  resultSummary: $("#resultSummary"),
  resultWarriorsScore: $("#resultWarriorsScore"),
  resultCavaliersScore: $("#resultCavaliersScore"),
  gamesList: $("#gamesList"),
  mvpCard: $("#mvpCard"),
  seriesStats: $("#seriesStats"),
  simulationOverlay: $("#simulationOverlay"),
  simulationStatus: $("#simulationStatus")
};

let scoreboard = loadScoreboard();
let running = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function loadScoreboard() {
  const fallback = { warriors: 0, cavaliers: 0, series: 0 };
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return fallback;
    const number = value => Number.isInteger(value) && value >= 0 && value <= 9999 ? value : 0;
    return {
      warriors: number(parsed.warriors),
      cavaliers: number(parsed.cavaliers),
      series: number(parsed.series)
    };
  } catch {
    return fallback;
  }
}

function saveScoreboard() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scoreboard));
  } catch {
    // Storage can be unavailable in strict privacy modes; the current session still works.
  }
}

function renderScoreboard() {
  dom.warriorsRoomScore.textContent = scoreboard.warriors;
  dom.cavaliersRoomScore.textContent = scoreboard.cavaliers;
  dom.seriesCounter.textContent = scoreboard.series
    ? `已完成 ${scoreboard.series} 轮系列赛`
    : "尚未开赛";
}

function renderRoster(teamId, target) {
  target.innerHTML = TEAMS[teamId].playerIds.map(playerId => {
    const player = PLAYERS[playerId];
    return `
      <article class="player-card" tabindex="0">
        <div class="player-art"><img src="${escapeHtml(player.art)}" alt="${escapeHtml(player.name)}卡面" loading="lazy"></div>
        <div class="player-card-copy">
          <span>${escapeHtml(player.slot)} · #${escapeHtml(player.number)}</span>
          <strong>${escapeHtml(player.name)}</strong>
          <small>${escapeHtml(player.topicVersion)}</small>
          <details>
            <summary>卡面来源</summary>
            <p>${escapeHtml(player.sourceVersion)}</p>
          </details>
        </div>
      </article>`;
  }).join("");
}

function formatStat(value) {
  return Number(value).toFixed(1);
}

function gameTopPlayer(game, teamId) {
  const box = teamId === TEAM_IDS.WARRIORS ? game.warriorsBox : game.cavaliersBox;
  return [...box.players].sort((left, right) => right.points - left.points || right.assists - left.assists)[0];
}

function renderGame(game) {
  const winner = TEAMS[game.winnerId];
  const top = gameTopPlayer(game, game.winnerId);
  const home = TEAMS[game.homeTeamId];
  return `
    <details class="game-card" ${game.number === 1 ? "open" : ""}>
      <summary>
        <span class="game-number">G${game.number}</span>
        <span class="game-teams"><b>16勇士 ${game.warriorsScore}</b><i>—</i><b>${game.cavaliersScore} 16骑士</b></span>
        <span class="game-winner">${escapeHtml(winner.name)}胜</span>
      </summary>
      <div class="game-detail">
        <div class="game-meta">
          <span>${escapeHtml(home.name)}主场</span>
          <span>系列赛 ${game.seriesScoreAfter.warriors}-${game.seriesScoreAfter.cavaliers}</span>
          <span>${escapeHtml(top.name)} ${top.points}分</span>
        </div>
        <div class="event-stack">
          ${game.events.map(event => `
            <article class="event-item ${event.momentum > 0 ? "positive" : "negative"}">
              <span>${escapeHtml(event.categoryLabel)}</span>
              <div><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.detail)}</p></div>
            </article>`).join("")}
        </div>
        <div class="mini-boxes">
          ${[game.warriorsBox, game.cavaliersBox].map(box => `
            <div class="mini-box">
              <div class="mini-box-head"><b>${escapeHtml(TEAMS[box.teamId].name)}</b><span>全队 ${box.teamScore} 分</span></div>
              <div class="mini-box-columns"><span>球员</span><i>得分</i><i>篮板</i><i>助攻</i></div>
              ${box.players.map(line => `
                <div class="mini-box-row">
                  <em>${escapeHtml(line.name)}</em><b>${line.points}</b><i>${line.rebounds}</i><i>${line.assists}</i>
                </div>`).join("")}
            </div>`).join("")}
        </div>
      </div>
    </details>`;
}

function renderMvp(result) {
  const row = result.mvp;
  const player = PLAYERS[row.playerId];
  const winner = TEAMS[result.winnerId];
  dom.mvpCard.innerHTML = `
    <article class="mvp-card" style="--team-color:${winner.color};--team-soft:${winner.colorSoft}">
      <div class="mvp-art"><img src="${escapeHtml(player.art)}" alt="${escapeHtml(player.name)}卡面"></div>
      <div class="mvp-copy">
        <span>${escapeHtml(winner.name)} · ${escapeHtml(player.slot)}</span>
        <strong>${escapeHtml(player.name)}</strong>
        <small>${escapeHtml(player.topicVersion)}</small>
        <div class="mvp-numbers">
          <div><b>${formatStat(row.ppg)}</b><span>PTS</span></div>
          <div><b>${formatStat(row.rpg)}</b><span>REB</span></div>
          <div><b>${formatStat(row.apg)}</b><span>AST</span></div>
        </div>
      </div>
    </article>`;
}

function renderStats(result) {
  dom.seriesStats.innerHTML = [TEAM_IDS.WARRIORS, TEAM_IDS.CAVALIERS].map(teamId => {
    const rows = result.stats
      .filter(row => PLAYERS[row.playerId].teamId === teamId)
      .sort((left, right) => right.ppg - left.ppg);
    return `
      <section class="team-series-table ${result.winnerId === teamId ? "winner" : ""}">
        <header><b>${escapeHtml(TEAMS[teamId].name)}</b><span>${result.winnerId === teamId ? "本轮胜方" : "系列赛场均"}</span></header>
        <div class="stats-head"><span>球员</span><span>得分</span><span>篮板</span><span>助攻</span></div>
        ${rows.map(row => `
          <div class="stats-row ${row.playerId === result.mvp.playerId ? "mvp-row" : ""}">
            <span>${escapeHtml(PLAYERS[row.playerId].name)}</span>
            <b>${formatStat(row.ppg)}</b><b>${formatStat(row.rpg)}</b><b>${formatStat(row.apg)}</b>
          </div>`).join("")}
      </section>`;
  }).join("");
}

function renderResult(result) {
  const winner = TEAMS[result.winnerId];
  dom.resultSection.hidden = false;
  dom.resultHero.dataset.winner = result.winnerId;
  dom.resultEyebrow.textContent = result.headline.eyebrow;
  dom.resultTitle.textContent = result.headline.title;
  dom.resultSummary.textContent = result.headline.summary;
  dom.resultWarriorsScore.textContent = result.scoreA;
  dom.resultCavaliersScore.textContent = result.scoreB;
  dom.gamesList.innerHTML = result.games.map(renderGame).join("");
  renderMvp(result);
  renderStats(result);
  dom.lastResultSummary.textContent = `${winner.name} ${result.winnerId === TEAM_IDS.WARRIORS ? result.scoreA : result.scoreB}-${result.winnerId === TEAM_IDS.WARRIORS ? result.scoreB : result.scoreA} 赢下上一轮。`;
}

function setRunning(nextRunning) {
  running = nextRunning;
  dom.simulateSeries.disabled = nextRunning;
  dom.simulateAgain.disabled = nextRunning;
  dom.simulationOverlay.hidden = !nextRunning;
  document.body.classList.toggle("is-simulating", nextRunning);
}

function wait(milliseconds) {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

async function runSeries({ scroll = true } = {}) {
  if (running) return;
  setRunning(true);
  const statuses = ["正在生成 G1…", "正在推进系列赛…", "正在整理关键事件…"];
  for (let index = 0; index < statuses.length; index += 1) {
    dom.simulationStatus.textContent = statuses[index];
    await wait(index === 0 ? 260 : 210);
  }
  const result = simulateSeries({ seed: seedFromEntropy() });
  if (result.winnerId === TEAM_IDS.WARRIORS) scoreboard.warriors += 1;
  else scoreboard.cavaliers += 1;
  scoreboard.series += 1;
  saveScoreboard();
  renderScoreboard();
  renderResult(result);
  setRunning(false);
  if (scroll) requestAnimationFrame(() => dom.resultSection.scrollIntoView({ behavior: "smooth", block: "start" }));
}

dom.simulateSeries.addEventListener("click", () => runSeries());
dom.simulateAgain.addEventListener("click", () => runSeries());
dom.resetScoreboard.addEventListener("click", () => {
  if (scoreboard.series > 0 && !window.confirm("清空当前设备上的房间记分？")) return;
  scoreboard = { warriors: 0, cavaliers: 0, series: 0 };
  saveScoreboard();
  renderScoreboard();
  dom.lastResultSummary.textContent = "房间记分已经清零，下一轮重新开始。";
});

renderRoster(TEAM_IDS.WARRIORS, dom.warriorsRoster);
renderRoster(TEAM_IDS.CAVALIERS, dom.cavaliersRoster);
renderScoreboard();
