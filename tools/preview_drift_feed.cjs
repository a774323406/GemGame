// Real Cocos scene preview. No live advertising or platform analytics are sent.
const fs=require('node:fs');const {chromium}=require('/Users/skyhand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url=process.argv[2]||'http://127.0.0.1:7456/',out=process.argv[3]||'docs/reference/drift-feed/first-playable';fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 const page=await browser.newPage({viewport:{width:750,height:1334},deviceScaleFactor:1,isMobile:true,hasTouch:true});const errors=[];
 page.on('requestfailed',r=>console.log('REQUEST_FAILED',r.url(),r.failure()));page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.location().url?.endsWith('/favicon.ico'))errors.push(m.text());});
 await page.addInitScript(()=>localStorage.setItem('gem_first_direct_game_entry_v1','1'));
 await page.goto(url);await page.evaluate(async()=>{window.cc=await System.import('cc')});
 await page.waitForFunction(()=>cc.director.getScene()?.name==='NewMainScene',null,{timeout:45000});
 await page.evaluate(()=>cc.director.getScene().getChildByName('Canvas').getComponent('newMainScene').openDrift());
 await page.waitForFunction(()=>cc.director.getScene()?.name==='DriftFeedGameScene',null,{timeout:30000});await page.waitForTimeout(500);await page.evaluate(()=>cc.profiler.hideStats());
 await page.screenshot({path:out+'/ready-short.png'});
 const initial=await page.evaluate(()=>{const g=cc.director.getScene().getChildByName('Canvas').getComponent('driftFeedGameScene');window.driftGame=g;return {phase:g.run.snapshot.phase,roads:g.world.getChildByName('Roads').children.length,clips:g.audioClips.length,carSize:g.visual.car.getComponent(cc.UITransform).contentSize}});console.log('INITIAL',initial);if(initial.carSize.width!==125||initial.carSize.height!==238)throw Error('Car image resized away from design dimensions');
 const client=await page.context().newCDPSession(page);await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:370,y:1000}]});await page.waitForFunction(()=>driftGame.run.snapshot.progress>180,null,{timeout:4000}).catch(async e=>{console.log('DRIVE_DIAGNOSTICS',await page.evaluate(()=>({snapshot:driftGame.run.snapshot,blocked:driftGame.blocked(),accumulator:driftGame.run.accumulator,clock:driftGame.run.clock,enabled:driftGame.enabledInHierarchy})));console.log('ERRORS',errors);throw e;});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 console.log('TOUCH',await page.evaluate(()=>({phase:driftGame.run.snapshot.phase,progress:driftGame.run.snapshot.progress})));

 // Reproducible course, driven by actual browser touch events (no position steering).
 await page.evaluate(()=>{driftGame.retry();driftGame.run.restart(123);});
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:370,y:1000}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 let held=false,driftShot=false,boostShot=false,themeShot=false;const deadline=Date.now()+100000;
 while(Date.now()<deadline){
  const state=await page.evaluate(()=>{const r=driftGame.run,s=r.snapshot;return {phase:s.phase,curves:s.curves,pressed:r.track.anchors.some(a=>a.releaseS>s.progress&&a.constraintStartS-100<=s.progress),pin:!!s.pin,drifting:s.drifting,marks:driftGame.effects.trails.marks.length,burst:s.bursting,theme:s.themeIndex,angle:driftGame.world.angle,scale:driftGame.world.scale.x};});
  if(state.angle!==0||state.scale!==1)throw Error('Camera rotated or zoomed');
  if(state.phase==='crashing'||state.phase==='result')throw Error('Touch driver crashed: '+JSON.stringify(state));
  if(state.pressed!==held){held=state.pressed;await client.send('Input.dispatchTouchEvent',{type:held?'touchStart':'touchEnd',touchPoints:held?[{x:370,y:1000}]:[]});}
  if(state.drifting&&state.marks>=8&&!driftShot){await page.screenshot({path:out+'/drifting.png'});driftShot=true;}
  if(state.burst&&!boostShot){await page.screenshot({path:out+'/boost.png'});boostShot=true;}
  if(state.theme===1&&!themeShot){await page.screenshot({path:out+'/desert.png'});themeShot=true;}
  if(state.curves>=3){console.log('REAL_TOUCH_RUN',state);break;}
  await page.waitForTimeout(25);
 }
 if(!driftShot)throw Error('Touch run did not cover drift');
 if(held)await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.evaluate(()=>{driftGame.run.crash()});await page.waitForTimeout(80);await page.screenshot({path:out+'/explosion.png'});await page.waitForTimeout(900);await page.screenshot({path:out+'/result-short.png'});
 const resultState=await page.evaluate(()=>({phase:driftGame.run.snapshot.phase,overlay:driftGame.resultOverlay.active,hud:driftGame.hud.active}));console.log('RESULT',resultState);if(!resultState.overlay||resultState.hud)throw Error('Result HUD state invalid');
 await page.setViewportSize({width:750,height:1624});await page.waitForTimeout(300);await page.screenshot({path:out+'/result-tall.png'});

 const revival=await page.evaluate(async()=>{
  const g=driftGame,request=g.gate.request.bind(g.gate);
  g.gate.request=(_show,apply)=>request(async()=>false,apply);const before=g.run.snapshot.revivesRemaining;await g.requestRevive();if(g.run.snapshot.revivesRemaining!==before||!g.resultOverlay.active)throw Error('Cancel consumed revival');
  g.gate.request=(_show,apply)=>request(async()=>true,apply);await g.requestRevive();g.gate.request=request;
  if(g.run.snapshot.phase!=='reviving'||g.resultOverlay.active||g.run.snapshot.revivesRemaining!==before-1)throw Error('Rewarded revival state invalid');return {phase:g.run.snapshot.phase,remaining:g.run.snapshot.revivesRemaining};
 });console.log('SIMULATED_AD_REVIVAL',revival);await page.waitForTimeout(300);await page.screenshot({path:out+'/revive-countdown.png'});
 await page.evaluate(()=>driftGame.retry());await page.waitForTimeout(300);await page.screenshot({path:out+'/ready-tall.png'});
 fs.writeFileSync(out+'/browser-errors.json',JSON.stringify(errors,null,2));console.log('ERRORS',JSON.stringify(errors));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
