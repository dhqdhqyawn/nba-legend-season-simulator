(()=>{
  "use strict";
  const api=globalThis.__v35UnifiedH5;
  if(!api?.environmentWorkerRequest||typeof Worker!=="function"){
    document.documentElement.dataset.nba82EnvironmentWorker="unavailable";
    return;
  }
  let active=null,readyKey="",scheduled=false,cancelledCount=0;
  const settle=job=>{if(job&&!job.settled){job.settled=true;job.resolve();}};
  const stop=(job,reason="settled")=>{if(!job)return;job.worker?.terminate();if(reason==="replaced"){cancelledCount+=1;document.documentElement.dataset.nba82EnvironmentWorkerCancelledCount=String(cancelledCount)}settle(job);if(active===job)active=null;};
  function start(){
    scheduled=false;
    const request=api.environmentWorkerRequest();
    if(!request||readyKey===request.persistenceKey||active?.key===request.persistenceKey)return;
    if(active)stop(active,"replaced");
    const worker=new Worker("assets/runtime/nba82-environment-worker.eced597.js");
    let resolve;
    const done=new Promise(next=>{resolve=next});
    const job={worker,request,key:request.persistenceKey,done,resolve,settled:false};
    active=job;
    document.documentElement.dataset.nba82EnvironmentWorker="working";
    worker.onmessage=event=>{
      if(active!==job)return stop(job);
      const message=event.data||{};
      if(message.type==="ready"){
        try{
          if(api.acceptPreparedEnvironment(request,message.environment)){
            readyKey=request.persistenceKey;
            document.documentElement.dataset.nba82EnvironmentWorker=message.cacheHit?"cache-hit":"ready";
          }
        }catch(error){
          console.warn("NBA82 prepared environment rejected",error);
          document.documentElement.dataset.nba82EnvironmentWorker="rejected";
        }
      }else if(message.type==="error"){
        console.warn("NBA82 environment worker failed",message.message);
        document.documentElement.dataset.nba82EnvironmentWorker="fallback";
      }
      stop(job);
    };
    worker.onerror=event=>{
      console.warn("NBA82 environment worker crashed",event.message||event);
      document.documentElement.dataset.nba82EnvironmentWorker="fallback";
      stop(job);
    };
    worker.postMessage({type:"prepare",request});
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    const run=()=>start();
    if(typeof requestIdleCallback==="function")requestIdleCallback(run,{timeout:350});
    else setTimeout(run,40);
  }
  async function awaitCurrent(){
    start();
    if(active)await active.done;
  }
  new MutationObserver(schedule).observe(document.getElementById("cards")||document.body,{childList:true,subtree:true});
  document.getElementById("eraSelect")?.addEventListener("change",schedule);
  document.addEventListener("click",event=>{if(event.target.closest("#openPackBtn,#rerollBtn,#importLineupBtn"))setTimeout(schedule,0)},true);
  globalThis.__nba82EnvironmentClient=Object.freeze({schedule,awaitCurrent,status(){return document.documentElement.dataset.nba82EnvironmentWorker||"idle"},cancelledCount(){return cancelledCount}});
  schedule();
})();
