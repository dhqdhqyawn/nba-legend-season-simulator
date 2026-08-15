document.documentElement.dataset.modeSplitCandidate="nba5-stage-c-2.6.6";
document.documentElement.dataset.nba5SourceFingerprint="4d5d02c85c8d404b427021599c8fb36abda8363a628f8e9504acef1f3798f3be";
document.querySelector('[data-battle-mode="battle"]')?.click();
document.querySelector('[data-battle-mode="solo"]')?.remove();
document.getElementById("unifiedBackHome")?.remove();
document.getElementById("unifiedSwitchMode")?.remove();
(()=>{
  const link=document.createElement("a");
  link.id="modeHubReturn";
  link.className="mode-hub-return";
  link.href=window.location.protocol==="file:"?"../index.html":"../";
  const style=document.createElement("style");
  style.textContent=".mode-hub-return{display:inline-flex;align-items:center;min-height:40px;margin:0 0 12px;padding:0 14px;border:1px solid rgba(23,32,27,.16);border-radius:999px;background:rgba(255,255,255,.76);box-shadow:0 8px 24px rgba(30,42,35,.07);color:#1e2922;font-size:13px;font-weight:800;text-decoration:none}.mode-hub-return:hover{border-color:rgba(23,32,27,.36)}.mode-hub-return:focus-visible{outline:3px solid #d59b32;outline-offset:3px}";
  document.head.appendChild(style);
  document.querySelector("main.app")?.prepend(link);
  const sync=()=>{
    const english=document.documentElement.lang.toLowerCase().startsWith("en");
    link.textContent=english?"← Mode lobby":"← 返回玩法大厅";
    link.setAttribute("aria-label",english?"Return to mode lobby":"返回玩法大厅");
  };
  new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
  link.addEventListener("click",event=>{
    if(!document.body.classList.contains("online-room-session-active"))return;
    const english=document.documentElement.lang.toLowerCase().startsWith("en");
    if(!window.confirm(english?"Leave the current online room and return to the lobby?":"退出当前在线房间并返回玩法大厅？"))event.preventDefault();
  });
  sync();
})();
(()=>{
  const mode="nba5";
  const HANDOFF_KEY="h5ModeHandoffV1";
  const RETURN_KEY="h5ModeReturnContextV1";
  const SCHEMA="h5-mode-handoff-1.0.0";
  const MAX_AGE_MS=10*60*1000;
  const english=()=>document.documentElement.lang.toLowerCase().startsWith("en");
  const readJson=(storage,key)=>{try{return JSON.parse(storage.getItem(key)||"null")}catch{return null}};
  const writeJson=(storage,key,value)=>{try{storage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const remove=(storage,key)=>{try{storage.removeItem(key)}catch{}};
  const siblingUrl=target=>new URL(`../${target}/index.html`,location.href);
  const ownLineupCode=()=>{try{return globalThis.H5BattleOnlineBridge?.getOwnLineupCode?.()||""}catch{return""}};
  const currentNba5Context=()=>{
    const channel=document.body.dataset.battleChannel||"hub";
    if(channel!=="online")return channel==="offline"?"offline":"hub";
    const soloBridge=document.getElementById("onlineRoomSoloBridge");
    return soloBridge&&!soloBridge.hidden&&!document.body.classList.contains("online-room-session-active")?"online-open":"online-fair";
  };
  const importLineupCode=code=>{
    if(!code)return false;
    const trigger=document.getElementById("importLineupBtn");
    if(!trigger)return false;
    trigger.click();
    const dialog=document.getElementById("lineupImportDialog");
    const input=dialog?.querySelector("#lineupImportInput");
    const form=dialog?.querySelector("form");
    if(!input||!form)return false;
    input.value=code;
    form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
    return true;
  };
  const activateNba5Context=(context,code)=>{
    if(mode!=="nba5")return;
    if(context==="online-open"){
      document.querySelector('[data-battle-channel="online"]')?.click();
      document.querySelector('[data-online-room-type="open_lineup"]')?.click();
      const saved=document.getElementById("onlineRoomSavedLineupCode");
      if(saved&&code)saved.value=code;
    }else if(context==="offline"){
      document.querySelector('[data-battle-channel="offline"]')?.click();
    }
  };
  const clearMarker=()=>{try{
    const url=new URL(location.href);
    url.searchParams.delete("mode-handoff");
    history.replaceState(null,"",url.href);
  }catch{}};
  const consumeHandoff=()=>{
    const marked=new URL(location.href).searchParams.get("mode-handoff")==="1";
    if(!marked)return null;
    const payload=readJson(localStorage,HANDOFF_KEY);
    const valid=payload?.schemaVersion===SCHEMA&&payload.to===mode&&Date.now()-Number(payload.createdAt||0)<=MAX_AGE_MS;
    remove(localStorage,HANDOFF_KEY);
    clearMarker();
    if(!valid)return null;
    if(mode==="nba82"){
      returnContext=payload.context||"hub";
      writeJson(sessionStorage,RETURN_KEY,{context:returnContext,createdAt:Date.now()});
    }
    if(payload.lineupCode)importLineupCode(payload.lineupCode);
    activateNba5Context(payload.context,payload.lineupCode);
    return payload;
  };
  const navigate=(target,context)=>{
    if(target===mode)return;
    const lineupCode=ownLineupCode();
    if(lineupCode){try{localStorage.setItem("nba5LastGeneratedCodeV1",lineupCode)}catch{}}
    const payload={schemaVersion:SCHEMA,from:mode,to:target,context:context||"hub",lineupCode,createdAt:Date.now()};
    if(!writeJson(localStorage,HANDOFF_KEY,payload))return;
    if(mode==="nba82")remove(sessionStorage,RETURN_KEY);
    const url=siblingUrl(target);
    url.searchParams.set("mode-handoff","1");
    location.assign(url.href);
  };
  const returnState=readJson(sessionStorage,RETURN_KEY);
  let returnContext=returnState&&Date.now()-Number(returnState.createdAt||0)<=MAX_AGE_MS?returnState.context:"";
  if(!returnContext)remove(sessionStorage,RETURN_KEY);
  const button=document.createElement("button");
  button.id="modeCrossSwitch";
  button.className="mode-cross-switch";
  button.type="button";
  document.getElementById("modeHubReturn")?.after(button);
  const style=document.createElement("style");
  style.textContent=".mode-cross-switch{display:inline-flex;align-items:center;min-height:40px;margin:0 0 12px 8px;padding:0 14px;border:1px solid rgba(23,32,27,.16);border-radius:999px;background:#1e2922;box-shadow:0 8px 24px rgba(30,42,35,.12);color:#fff;font-size:13px;font-weight:900;cursor:pointer}.mode-cross-switch:hover{background:#334139}.mode-cross-switch:focus-visible{outline:3px solid #d59b32;outline-offset:3px}.mode-cross-switch[hidden]{display:none!important}.nba82-environment-status{display:flex;align-items:center;gap:8px;width:fit-content;margin:-4px 0 16px;padding:8px 12px;border:1px solid rgba(36,92,65,.18);border-radius:999px;background:rgba(236,247,240,.82);color:#245c41;font-size:12px;font-weight:850}.nba82-environment-status::before{content:'';width:8px;height:8px;border-radius:50%;background:#c99837}.nba82-environment-status[data-state='ready']::before,.nba82-environment-status[data-state='cache-hit']::before{background:#2f8b5b}.nba82-environment-status[data-state='fallback']::before{background:#9b6d36}@media(max-width:420px){.mode-cross-switch{min-height:38px;margin-left:5px;padding:0 11px;font-size:12px}}";
  document.head.appendChild(style);
  const sync=()=>{
    const code=ownLineupCode();
    if(mode==="nba82"){
      button.hidden=false;
      button.textContent=returnContext==="online-open"?(english()?"Return to NBA5 free lineup room":"返回 NBA5 自由阵容房"):code?(english()?"Take this lineup to NBA5":"带当前阵容去 NBA5"):(english()?"Go to NBA5":"去 NBA5");
    }else{
      const context=currentNba5Context();
      button.hidden=document.body.classList.contains("online-room-session-active")||context==="online-fair";
      button.textContent=context==="online-open"?(english()?"Build in NBA82":"去 NBA82 组阵容"):(english()?"Go to NBA82":"去 NBA82");
    }
  };
  button.addEventListener("click",()=>{
    if(mode==="nba82")navigate("nba5",returnContext||"hub");
    else{
      const context=currentNba5Context();
      if(context!=="online-fair")navigate("nba82",context);
    }
  });
  document.addEventListener("h5:mode-handoff-request",event=>{
    const target=event.detail?.to;
    if(target==="nba82"||target==="nba5")navigate(target,event.detail?.context||"hub");
  });
  if(mode==="nba5"){
    const oldSoloButton=document.getElementById("onlineRoomGoSolo");
    if(oldSoloButton){
      const replacement=oldSoloButton.cloneNode(true);
      oldSoloButton.replaceWith(replacement);
      replacement.addEventListener("click",()=>navigate("nba82","online-open"));
    }
  }
  new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:["class","data-battle-channel"]});
  const lineup=document.getElementById("lineup");
  if(lineup)new MutationObserver(sync).observe(lineup,{childList:true,subtree:true});
  const soloBridge=document.getElementById("onlineRoomSoloBridge");
  if(soloBridge)new MutationObserver(sync).observe(soloBridge,{attributes:true,attributeFilter:["hidden"]});
  consumeHandoff();
  sync();
})();
(()=>{
  const config={"storageKey":"nba5SplitOnboardingSeenV1","kicker":["第一次进入阵容对战","FIRST NBA5 BATTLE"],"title":["先选对战方式，再组你的五人","Choose a battle, then build your five"],"steps":[["选择离线对战或在线房间","Choose offline battle or an online room"],["抽卡组队，或导入已有阵容码","Draft a lineup or import a saved code"],["准备对手，或等待双方锁定阵容","Prepare an opponent or wait for both players to lock"],["开始七场四胜，查看完整系列赛结果","Play a best-of-seven and review the full result"]],"action":["选择对战方式","Choose battle format"],"open":["玩法说明","How to play"],"focusSelector":"#battleChannelHub [data-battle-channel]","skipAutoForRoom":true};
  const overlay=document.getElementById("p0Onboarding");
  const action=document.getElementById("p0OnboardingStart");
  const returnLink=document.getElementById("modeHubReturn");
  if(!overlay||!action||!returnLink)return;
  document.getElementById("unifiedOnboarding")?.remove();
  document.getElementById("unifiedCoach")?.remove();
  document.querySelectorAll(".unified-coach-target").forEach(node=>node.classList.remove("unified-coach-target"));
  const openButton=document.createElement("button");
  openButton.id="modeGuideOpen";
  openButton.className="mode-guide-open";
  openButton.type="button";
  returnLink.after(openButton);
  const style=document.createElement("style");
  style.textContent=".mode-guide-open{display:inline-flex;align-items:center;min-height:40px;margin:0 0 12px 8px;padding:0 14px;border:1px solid rgba(23,32,27,.16);border-radius:999px;background:rgba(255,255,255,.76);box-shadow:0 8px 24px rgba(30,42,35,.07);color:#1e2922;font-size:13px;font-weight:800;cursor:pointer}.mode-guide-open:hover{border-color:rgba(23,32,27,.36)}.mode-guide-open:focus-visible{outline:3px solid #d59b32;outline-offset:3px}.p0-onboarding-step span{line-height:1.4}@media(max-width:420px){.mode-hub-return,.mode-guide-open{min-height:38px;padding:0 11px;font-size:12px}.mode-guide-open{margin-left:5px}}";
  document.head.appendChild(style);
  const readSeen=()=>{try{return localStorage.getItem(config.storageKey)==="1"}catch{return false}};
  const writeSeen=()=>{try{localStorage.setItem(config.storageKey,"1")}catch{}};
  const english=()=>document.documentElement.lang.toLowerCase().startsWith("en");
  const sync=()=>{
    const languageIndex=english()?1:0;
    const kicker=overlay.querySelector(".p0-onboarding-kicker");
    if(kicker)kicker.textContent=config.kicker[languageIndex];
    const title=document.getElementById("p0OnboardingTitle");
    if(title)title.textContent=config.title[languageIndex];
    overlay.querySelectorAll(".p0-onboarding-step span").forEach((node,index)=>{
      node.textContent=config.steps[index]?.[languageIndex]||node.textContent;
    });
    action.textContent=config.action[languageIndex];
    openButton.textContent=config.open[languageIndex];
    openButton.setAttribute("aria-label",config.open[languageIndex]);
    overlay.querySelector(".p0-onboarding-steps")?.setAttribute("aria-label",english()?"How to play":"玩法步骤");
  };
  const show=()=>{
    sync();
    overlay.hidden=false;
    requestAnimationFrame(()=>action.focus());
  };
  const finish=()=>{
    writeSeen();
    overlay.hidden=true;
    requestAnimationFrame(()=>document.querySelector(config.focusSelector)?.focus());
  };
  action.addEventListener("click",finish);
  openButton.addEventListener("click",show);
  new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
  sync();
  const roomInvite=config.skipAutoForRoom&&new URL(location.href).searchParams.has("room");
  overlay.hidden=readSeen()||roomInvite;
})();
(()=>{
  "use strict";
  const select=document.getElementById("poolSelect");
  const field=select?.closest(".field");
  const advanced=document.querySelector("details.advanced-settings");
  if(!select||!field||!advanced)return;
  const panel=document.createElement("section");
  panel.className="card-pool-featured";
  panel.innerHTML='<div class="card-pool-featured-copy"><span>CARD POOL</span><strong id="cardPoolFeaturedTitle"></strong><small id="cardPoolFeaturedCopy"></small></div><div class="card-pool-featured-control"></div>';
  panel.querySelector(".card-pool-featured-control").appendChild(field);
  const draftSection=document.getElementById("cards")?.closest("section");
  if(draftSection)draftSection.prepend(panel);
  else advanced.before(panel);
  const style=document.createElement("style");
  style.textContent='.card-pool-featured{display:grid;grid-template-columns:minmax(0,1fr) minmax(180px,260px);gap:18px;align-items:end;margin:0 0 14px;padding:16px 18px;border:1px solid rgba(103,91,73,.18);border-radius:18px;background:linear-gradient(135deg,rgba(255,255,255,.88),rgba(238,240,237,.72));box-shadow:0 12px 28px rgba(31,37,34,.07)}.card-pool-featured-copy span,.card-pool-featured-copy strong,.card-pool-featured-copy small{display:block}.card-pool-featured-copy span{color:#2f775f;font-size:10px;font-weight:950;letter-spacing:.18em}.card-pool-featured-copy strong{margin-top:5px;font-size:18px}.card-pool-featured-copy small{margin-top:5px;color:var(--muted);font-size:11px;line-height:1.5}.card-pool-featured .field{margin:0}.card-pool-featured select:disabled{opacity:.68;cursor:not-allowed}.online-room-card-pool{display:grid;grid-template-columns:minmax(0,1fr) minmax(160px,240px);gap:14px;align-items:center;margin:12px 0;padding:13px 14px;border:1px solid rgba(103,91,73,.18);border-radius:14px;background:rgba(255,255,255,.7)}.online-room-card-pool label b,.online-room-card-pool label small{display:block}.online-room-card-pool label small{margin-top:4px;color:var(--muted);font-size:10px;line-height:1.45}@media(max-width:620px){.card-pool-featured,.online-room-card-pool{grid-template-columns:1fr;gap:12px}.card-pool-featured{padding:14px}}';
  document.head.appendChild(style);
  function sync(){
    const english=document.documentElement.lang==="en";
    const title=document.getElementById("cardPoolFeaturedTitle");
    const copy=document.getElementById("cardPoolFeaturedCopy");
    const label=field.querySelector('label[for="poolSelect"]');
    const roomTitle=document.getElementById("onlineRoomCardPoolTitle");
    const roomCopy=document.getElementById("onlineRoomCardPoolCopy");
    const roomSelect=document.getElementById("onlineRoomCardPoolSelect");
    if(title)title.textContent=english?"Choose the era before opening a pack":"开包前，先选择年代";
    if(copy)copy.textContent=english?"2015–26, historic seasons, or every available card.":"可选2015–26、历史时代，或全部947张正式卡。";
    if(label)label.textContent=english?"Card pool":"选择卡池";
    if(roomTitle)roomTitle.textContent=english?"Fair-room card pool":"三包房卡池";
    if(roomCopy)roomCopy.textContent=english?"The host locks one pool; both players may open up to three packs from it.":"房主选定后，双方各自在同一卡池最多开三包。";
    if(roomSelect){
      const labels=english?{all:"All eras",modern_2015_2026:"2015–26",historic_pre_2015:"Historic era"}:{all:"全部时代",modern_2015_2026:"2015–26",historic_pre_2015:"历史时代"};
      for(const option of roomSelect.options)option.textContent=labels[option.value]||option.textContent;
    }
  }
  new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
  sync();
})();
(() => {
  const params = new URL(location.href).searchParams;
  const legendMode = params.get("legendMode");
  if (!/^(theater|offline|online)$/.test(legendMode || "")) return;
  const teamId = params.get("team") || "";
  let opponentTeamId = params.get("opponent") || "";
  const format = params.get("format") === "coach" ? "coach" : "quick";
  const directory = globalThis.CLASSIC_CROSS_ERA_TEAMS || [];
  const own = directory.find(team => team.id === teamId);
  if (legendMode === "offline") {
    const opponents = directory.filter(team => team.id !== teamId);
    const randomIndex = globalThis.crypto?.getRandomValues
      ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % opponents.length
      : Math.floor(Math.random() * opponents.length);
    opponentTeamId = opponents[randomIndex]?.id || "";
  }
  const opponent = directory.find(team => team.id === opponentTeamId);
  if (!own || (legendMode !== "online" && !opponent)) {
    location.replace("legend-theater/");
    return;
  }
  document.body.classList.add("legend-nba5-session");
  document.body.dataset.legendMode = legendMode;
  document.body.dataset.legendTeamA = own.displayName;
  document.body.dataset.legendTeamB = opponent?.displayName || "";
  document.getElementById("p0Onboarding")?.setAttribute("hidden", "");
  document.getElementById("modeGuideOpen")?.setAttribute("hidden", "");
  const syncLegendCopy = () => {
    const pageSubtitle = document.querySelector(".sub");
    if (pageSubtitle && pageSubtitle.textContent !== "经典球队跨时代七场四胜。") {
      pageSubtitle.textContent = "经典球队跨时代七场四胜。";
    }
    if (legendMode === "online") {
      const roomIntro = document.querySelector(".online-room-heading p");
      const roomCopy = "先建房或加入房间，双方各自锁定经典球队后开始比赛。";
      if (roomIntro && roomIntro.textContent !== roomCopy) roomIntro.textContent = roomCopy;
    }
  };
  syncLegendCopy();
  requestAnimationFrame(syncLegendCopy);
  setTimeout(syncLegendCopy, 0);
  const subtitleNode = document.querySelector(".sub");
  if (subtitleNode) new MutationObserver(syncLegendCopy).observe(subtitleNode, { childList: true, subtree: true, characterData: true });
  const style = document.createElement("style");
  style.textContent = `
    .legend-nba5-session .unified-mode-hub,.legend-nba5-session .battle-channel-hub,
    .legend-nba5-session .battle-panel-head,.legend-nba5-session #battleBuildLineup,
    .legend-nba5-session .battle-lineup-quick-actions,.legend-nba5-session .battle-columns,
    .legend-nba5-session #battleCompactPool,.legend-nba5-session .battle-strategy-share,
    .legend-nba5-session #onlineRoomTypePicker,.legend-nba5-session #onlineRoomCardPoolPicker,
    .legend-nba5-session #onlineRoomSoloBridge,.legend-nba5-session #onlineRoomBuildLineup,
    .legend-nba5-session #onlineRoomSavedLineupActions,
    .legend-nba5-session #modeGuideOpen,.legend-nba5-session .mode-cross-navigation,
    .legend-nba5-session #modeCrossSwitch,.legend-nba5-session #simulateBtn,
    .legend-nba5-session #rerollBtn,.legend-nba5-session #actionMenu,
    .legend-nba5-session .flow-progress,.legend-nba5-session .flow-action,
    .legend-nba5-session .unified-session-nav,.legend-nba5-session .battle-channel-nav,
    .legend-nba5-session .public-footer,
    .legend-nba5-session #onlineCoachRoomTypeLabel,.legend-nba5-session #onlineCoachRoomType,
    .legend-nba5-session #onlineCoachPoolLabel,.legend-nba5-session #onlineCoachPool,
    .legend-nba5-session #onlineCoachPoolHelp,.legend-nba5-session #onlineCoachBuildLineup,
    .legend-nba5-session .battle-code-label,.legend-nba5-session .battle-own-code-row{display:none!important}
    .legend-session-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:12px 0 18px;padding:14px 16px;border-radius:16px;background:#17251f;color:#fff}
    .legend-session-bar span{display:block;color:#c9d5ce;font-size:11px;font-weight:900;letter-spacing:.08em}.legend-session-bar strong{display:block;margin-top:3px;font-size:18px}.legend-session-bar a{color:#17251f;background:#fff;border-radius:999px;padding:9px 13px;font-weight:900;text-decoration:none;white-space:nowrap}
    .legend-nba5-session[data-legend-mode="theater"] #battlePanel{display:none!important}
    @media(max-width:620px){.legend-session-bar{align-items:flex-start;flex-direction:column}.legend-session-bar a{align-self:stretch;text-align:center}}
  `;
  document.head.appendChild(style);
  const bar = document.createElement("section");
  bar.className = "legend-session-bar";
  bar.innerHTML = `<div><span>传奇实验室 · ${legendMode === "theater" ? "传奇剧场" : legendMode === "offline" ? "离线传奇对战" : "在线传奇对战"}</span><strong>${own.displayName}${legendMode === "theater" && opponent ? ` vs ${opponent.displayName}` : ""}</strong></div><a href="legend-theater/">重新选队</a>`;
  (document.querySelector("main") || document.body).prepend(bar);
  const bridge = globalThis.H5BattleOnlineBridge;
  bridge?.enterBattleMode?.();
  if (legendMode === "theater") {
    const applyTheaterNames = () => {
      const roots = [document.getElementById("battleResult"), document.getElementById("battleResultModalContent")]
        .filter(Boolean);
      const replacements = [
        [/你的阵容/g, own.displayName], [/我方/g, own.displayName],
        [/对手阵容/g, opponent.displayName], [/对方/g, opponent.displayName], [/对手/g, opponent.displayName],
        [/Your lineup/gi, own.displayName], [/YOUR LINEUP/g, own.displayName],
        [/Opponent lineup/gi, opponent.displayName], [/OPPONENT LINEUP/g, opponent.displayName],
        [/Opponent/gi, opponent.displayName], [/OPPONENT/g, opponent.displayName]
      ];
      roots.forEach(root => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(node => {
          let value = node.nodeValue || "";
          replacements.forEach(([pattern, replacement]) => { value = value.replace(pattern, replacement); });
          node.nodeValue = value;
        });
      });
    };
    const theaterObserver = new MutationObserver(() => queueMicrotask(applyTheaterNames));
    [document.getElementById("battleResult"), document.getElementById("battleResultModalContent")]
      .filter(Boolean).forEach(root => theaterObserver.observe(root, { childList: true, subtree: true }));
    requestAnimationFrame(() => {
      bridge?.showClassicTheater?.({ teamId, opponentTeamId });
      applyTheaterNames();
    });
    return;
  }
  document.querySelector(`[data-battle-channel="${legendMode === "online" ? "online" : "offline"}"]`)?.click();
  document.querySelector(`[data-nba5-gateway-channel="${legendMode === "online" ? "online" : "offline"}"][data-nba5-gateway-mode="${format}"]`)?.click();
  bridge?.loadClassicMatch?.({ teamId, opponentTeamId: legendMode === "offline" ? opponentTeamId : null });
  if (legendMode === "online") {
    document.querySelector('[data-online-room-type="open_lineup"]')?.click();
    const quickPool = document.getElementById("onlineRoomCardPoolSelect");
    if (quickPool) quickPool.value = "all";
    const coachType = document.getElementById("onlineCoachRoomType");
    if (coachType) coachType.value = "open_lineup";
    const coachPool = document.getElementById("onlineCoachPool");
    if (coachPool) coachPool.value = "all";
  }
})();
document.title=document.documentElement.lang==="en"?"NBA5 Lineup Battle":"NBA5 五人阵容对战";
