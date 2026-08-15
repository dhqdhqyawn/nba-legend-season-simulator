document.documentElement.dataset.modeSplitCandidate="nba82-eced597-b2";
document.querySelector('[data-battle-mode="solo"]')?.click();
document.querySelector('[data-battle-mode="battle"]')?.remove();
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
  
  sync();
})();
(()=>{
  const mode="nba82";
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
  const status=document.createElement("div");
  status.id="nba82EnvironmentStatus";
  status.className="nba82-environment-status";
  status.setAttribute("role","status");
  status.setAttribute("aria-live","polite");
  (document.querySelector(".nba82-split-actions")||document.querySelector(".controls"))?.after(status);
  const sync=()=>{
    const state=document.documentElement.dataset.nba82EnvironmentWorker||"working";
    const english=document.documentElement.lang.toLowerCase().startsWith("en");
    status.dataset.state=state;
    if(state==="ready")status.textContent=english?"29 opponent teams are ready":"29 支对手球队已就绪";
    else if(state==="cache-hit")status.textContent=english?"29 opponent teams loaded from cache":"已从本机缓存载入 29 支对手球队";
    else if(state==="fallback")status.textContent=english?"Opponent teams will be prepared when you simulate":"将在模拟时准备 29 支对手球队";
    else status.textContent=english?"Preparing 29 opponent teams…":"正在准备 29 支对手球队…";
  };
  new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:["lang","data-nba82-environment-worker"]});
  sync();
})();
(()=>{
  const config={"storageKey":"nba82SplitOnboardingSeenV1","kicker":["第一次进入极速赛季","FIRST NBA82 RUN"],"title":["用五个位置，走完一个赛季","Build five, then play a full season"],"steps":[["打开 25 张候选卡","Open a 25-card pack"],["依次选择 PG、SG、SF、PF、C","Fill PG, SG, SF, PF and C"],["每个位置选一张具体赛季球员卡","Choose one exact season card per position"],["模拟 82 场，查看季后赛、数据与奖项","Simulate 82 games, playoffs, stats and awards"]],"action":["开始组队","Start drafting"],"open":["玩法说明","How to play"],"focusSelector":"#openPackBtn","skipAutoForRoom":false};
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
