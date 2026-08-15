(()=>{
  "use strict";
  const source="assets/runtime/nba82-protected-events.eced597.js";
  let pending=null;
  function ready(){return document.documentElement.dataset.nba82ProtectedEventBootStatus==="ready"}
  function loadProtectedEvents(){
    if(ready())return Promise.resolve(true);
    if(pending)return pending;
    document.documentElement.dataset.nba82ProtectedEventBootStatus="loading";
    pending=new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src=source;
      script.async=true;
      script.onload=()=>ready()?resolve(true):reject(new Error("NBA82 protected-event resource did not become ready"));
      script.onerror=()=>reject(new Error("NBA82 protected-event resource failed to load"));
      document.head.appendChild(script);
    }).catch(error=>{
      pending=null;
      document.documentElement.dataset.nba82ProtectedEventBootStatus="failed";
      document.documentElement.dataset.nba82ProtectedEventBootError=String(error?.message||error);
      throw error;
    });
    return pending;
  }
  function preload(){loadProtectedEvents().catch(error=>console.warn("NBA82 deferred resource preload failed",error))}
  if(typeof requestIdleCallback==="function")requestIdleCallback(preload,{timeout:1200});
  else setTimeout(preload,120);
  globalThis.__nba82DeferredResources=Object.freeze({preload,readyForSimulation:loadProtectedEvents,status(){return document.documentElement.dataset.nba82ProtectedEventBootStatus||"idle"}});
})();
