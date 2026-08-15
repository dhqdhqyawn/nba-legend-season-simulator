(()=>{
  "use strict";
  const noop=()=>{};
  function node(){
    const target={value:"",textContent:"",innerHTML:"",hidden:false,disabled:false,open:false,dataset:{},style:{setProperty:noop},classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},options:[]};
    return new Proxy(target,{get(object,key){if(key in object)return object[key];if(key==="querySelectorAll")return()=>[];if(key==="querySelector")return()=>null;if(key==="cloneNode")return()=>node();if(key==="getAttribute")return()=>null;if(key==="closest")return()=>null;if(key==="matches")return()=>false;if(key==="getContext")return()=>null;return noop}});
  }
  const nodes=new Map();
  const getNode=id=>{if(!nodes.has(id)){const item=node();item.id=id;if(id==="eraSelect")item.value="modern";if(id==="injuryRange"||id==="chemRange")item.value="0";if(id==="poolSelect"||id==="positionFilter")item.value="all";nodes.set(id,item)}return nodes.get(id)};
  globalThis.window=globalThis;
  globalThis.document={activeElement:null,body:getNode("body"),head:getNode("head"),documentElement:getNode("documentElement"),getElementById:getNode,createElement:()=>node(),querySelector:()=>null,querySelectorAll:()=>[],addEventListener:noop,execCommand:()=>false};
  globalThis.localStorage={getItem:()=>null,setItem:noop,removeItem:noop};
  globalThis.alert=noop;
  globalThis.confirm=()=>true;
  globalThis.requestAnimationFrame=callback=>setTimeout(()=>callback(Date.now()),0);
  globalThis.cancelAnimationFrame=clearTimeout;
  globalThis.MutationObserver=class{observe(){}disconnect(){}};
  globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  globalThis.Node=class{};
  globalThis.HTMLElement=class{};
  globalThis.matchMedia=()=>({matches:false,addEventListener:noop,removeEventListener:noop});
  const DB_NAME="nba82-environment-cache",STORE_NAME="environments";
  function openCache(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>request.result.createObjectStore(STORE_NAME);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
  async function readCache(key){const db=await openCache();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE_NAME,"readonly"),request=tx.objectStore(STORE_NAME).get(key);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);tx.oncomplete=()=>db.close()})}
  async function writeCache(key,value){const db=await openCache();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE_NAME,"readwrite");tx.objectStore(STORE_NAME).put(value,key);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)})}
  globalThis.onmessage=async event=>{
    const message=event.data||{};
    if(message.type!=="prepare")return;
    const request=message.request;
    try{
      let environment=await readCache(request.persistenceKey).catch(()=>null);
      const cacheHit=Boolean(environment);
      if(!environment){
        const nativeFetch=globalThis.fetch?.bind(globalThis);
        globalThis.fetch=(input,init)=>{
          const url=typeof input==="string"?input:String(input?.url||"");
          const cleanUrl=url.split(/[?#]/,1)[0];
          if(cleanUrl.endsWith("assets/card-art.json")){
            return Promise.resolve({ok:true,status:200,json:async()=>({cards:{}})});
          }
          return nativeFetch
            ? nativeFetch(input,init)
            : Promise.reject(new Error("worker-fetch-unavailable"));
        };
        importScripts("../data/public-cards.eced597.js","../data/hidden-opponent-cards.eced597.js","./nba82-app.eced597.js");
        environment=globalThis.__v35UnifiedH5.prepareEnvironmentForWorker(request);
        await writeCache(request.persistenceKey,environment).catch(()=>{});
      }
      postMessage({type:"ready",requestKey:request.persistenceKey,cacheHit,environment});
    }catch(error){postMessage({type:"error",requestKey:request?.persistenceKey||"",message:String(error?.message||error)})}
  };
})();
