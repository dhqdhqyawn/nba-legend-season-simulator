(() => {
  "use strict";
  const teams = globalThis.CLASSIC_CROSS_ERA_TEAMS || [];
  const byId = id => document.getElementById(id);
  const params = new URL(location.href).searchParams;
  const mode = ["theater", "offline", "online"].includes(params.get("mode"))
    ? params.get("mode") : "";
  const invitedRoom = mode === "online" ? String(params.get("room") || "").trim().toUpperCase() : "";
  let format = params.get("format") === "coach" ? "coach" : "quick";
  let teamAId = teams[0]?.id || "";
  let teamBId = teams[1]?.id || "";

  if (!mode) return;
  byId("labHome").hidden = true;
  byId("setup").hidden = false;
  const titles = {
    theater: ["LEGENDS THEATER", "传奇剧场"],
    offline: ["OFFLINE LEGENDS", "离线传奇对战"],
    online: ["ONLINE LEGENDS", "在线传奇对战"]
  }[mode];
  document.title = `${titles[1]} · 传奇实验室`;
  byId("pageTitle").textContent = titles[1];
  byId("setupKicker").textContent = titles[0];
  byId("setupTitle").textContent = mode === "theater" ? "选择经典球队" : "选择我的经典队";
  byId("teamBRow").hidden = mode !== "theater";
  byId("teamALabel").textContent = mode === "theater" ? "经典球队 A" : "我的经典队";
  byId("teamBLabel").textContent = "经典球队 B";
  if (mode === "theater") {
    byId("formatPanel").hidden = true;
    byId("startButton").classList.add("theater-start");
    byId("startButton").innerHTML = "<b>开始模拟</b><span>进入无策略跨时代系列赛</span>";
  }

  const options = teams.map(team => `<option value="${team.id}">${team.displayName}</option>`).join("");
  byId("teamA").innerHTML = options;
  byId("teamB").innerHTML = options;
  byId("teamB").value = teamBId;
  const updateTeamLabels = () => {
    if (mode !== "theater") return;
    byId("teamALabel").textContent = teams.find(team => team.id === teamAId)?.displayName || "经典球队 A";
    byId("teamBLabel").textContent = teams.find(team => team.id === teamBId)?.displayName || "经典球队 B";
  };
  updateTeamLabels();
  byId("teamA").addEventListener("change", event => {
    teamAId = event.currentTarget.value;
    if (teamAId === teamBId) {
      teamBId = teams.find(team => team.id !== teamAId).id;
      byId("teamB").value = teamBId;
    }
    updateTeamLabels();
  });
  byId("teamB").addEventListener("change", event => {
    teamBId = event.currentTarget.value;
    if (teamAId === teamBId) {
      teamAId = teams.find(team => team.id !== teamBId).id;
      byId("teamA").value = teamAId;
    }
    updateTeamLabels();
  });
  document.querySelectorAll("[data-format]").forEach(button => button.addEventListener("click", () => {
    format = button.dataset.format;
    document.querySelectorAll("[data-format]").forEach(node => node.classList.toggle("active", node === button));
  }));
  document.querySelectorAll("[data-format]").forEach(button => {
    button.classList.toggle("active", button.dataset.format === format);
  });
  byId("startButton").addEventListener("click", () => {
    const target = new URL("../nba5/", location.href);
    target.searchParams.set("legendMode", mode);
    target.searchParams.set("team", teamAId);
    if (mode === "theater") target.searchParams.set("opponent", teamBId);
    target.searchParams.set("format", mode === "theater" ? "quick" : format);
    if (invitedRoom) target.searchParams.set("room", invitedRoom);
    location.href = target.href;
  });
})();
