const assert=require('node:assert/strict'),{chromium}=require('/Users/skyhand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
 for(const height of [1334,1624]){
 const p=await b.newPage({viewport:{width:750,height},isMobile:true,hasTouch:true});const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('/favicon.ico'))errors.push(m.text());});
 await p.addInitScript(()=>localStorage.setItem('gem_first_direct_game_entry_v1','1'));await p.goto('http://127.0.0.1:8769/index.html');await p.waitForFunction(()=>!!window.System);await p.evaluate(async()=>window.cc=await System.import('cc'));await p.waitForFunction(()=>cc.director.getScene()?.name==='NewMainScene');
 await p.waitForTimeout(200);const state=await p.evaluate(()=>{cc.profiler.hideStats();const main=cc.director.getScene().getChildByName('Canvas').getComponent('newMainScene');window.main=main;main.gameList.scrollToBottom(0);const n=main.driftButton.node;return {title:n.getChildByName('TitlePlaque').getChildByName('GameName').getComponent(cc.Label).string,chrome:['CardShadow','CardOutline','CardSurface'].map(name=>n.getChildByName(name)?.active)}});
 assert.equal(state.title,'漂移');assert(state.chrome.every(Boolean));await p.waitForTimeout(100);await p.screenshot({path:`docs/reference/drift-feed/first-playable/lobby-${height}.png`});
 for(let round=0;round<3;round++){
 await p.evaluate(()=>cc.director.getScene().getChildByName('Canvas').getComponent('newMainScene').driftButton.node.emit(cc.Button.EventType.CLICK));
 await p.waitForFunction(()=>cc.director.getScene()?.name==='DriftFeedGameScene');
 if(round===0){
  const before=await p.evaluate(()=>{const g=cc.director.getScene().getChildByName('Canvas').getComponent('driftFeedGameScene');window.g=g;g.run.start();g.run.setPressed(true);cc.director.emit('sdk_interstitial_shown');return {progress:g.run.snapshot.progress,paused:g.paused,title:g.resultTitle.string,overlay:g.resultOverlay.active};});
  assert(before.paused&&before.overlay);assert.equal(before.title,'暂停驾驶');
  await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>g.run.snapshot.progress),before.progress);
  await p.evaluate(()=>cc.director.emit('sdk_interstitial_ended'));assert(await p.evaluate(()=>g.paused));
  await p.evaluate(()=>g.reviveButton.node.emit(cc.Button.EventType.CLICK));await p.waitForTimeout(100);
  assert(await p.evaluate(()=>!g.paused&&!g.resultOverlay.active));assert((await p.evaluate(()=>g.run.snapshot.progress))>before.progress);
 }
 await p.evaluate(round=>{const g=cc.director.getScene().getChildByName('Canvas').getComponent('driftFeedGameScene');window.g=g;g.audio.unlock();if(round===1){g.run.start();g.run.crash();}else{g.run.start();g.setPaused(true);}},round);
 await p.waitForFunction(()=>g.resultOverlay.active);
 await p.evaluate(()=>{g.homeButton.node.emit(cc.Button.EventType.CLICK);g.homeButton.node.emit(cc.Button.EventType.CLICK)});
 await p.waitForFunction(()=>cc.director.getScene()?.name==='NewMainScene');await p.waitForTimeout(200);
 assert.equal(errors.length,0,JSON.stringify(errors));
 }
 console.log('PASS lobby entry and 3 pause/result return-home cycles, no console errors',height);await p.close();
 }
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
