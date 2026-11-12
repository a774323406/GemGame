const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('/Users/skyhand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:750,height:1334},deviceScaleFactor:1,hasTouch:true,isMobile:true});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log(e.stack)});
 await page.goto(process.argv[2]||'http://127.0.0.1:8768/');await page.waitForFunction(()=>window.cc&&cc.director.getScene()?.name==='NewMainScene',null,{timeout:60000});
 await page.evaluate(()=>cc.director.getScene().getChildByName('Canvas').getComponent('newMainScene').openRopeDuck());
 await page.waitForFunction(()=>cc.director.getScene()?.name==='RopeDuckFeedGameScene',null,{timeout:30000});await page.waitForTimeout(700);
 await page.evaluate(()=>{cc.profiler.hideStats();window.duckGame=cc.director.getScene().getChildByName('Canvas').getComponent('ropeDuckFeedGameScene')});
 const out='/tmp/rope-duck-preview';fs.mkdirSync(out,{recursive:true});
 await page.evaluate(()=>{duckGame.feed=true;duckGame.feedChanged({entered:false,exited:false})});
 const state=await page.evaluate(()=>({x:duckGame.round.ducks[0].x,scale:duckGame.ducks[0].scale.y}));await page.waitForTimeout(230);
 assert.equal(await page.evaluate(()=>duckGame.round.ducks[0].x),state.x);assert.notEqual(await page.evaluate(()=>duckGame.ducks[0].scale.y),state.scale);
 await page.waitForFunction(()=>{const a=cc.director.getScene().getChildByName('AudioManager')?.getComponent('cc.AudioSource');return a?.playing&&a.clip?.name==='getUserBgm'});
 await page.evaluate(()=>{duckGame.feed=false;duckGame.entered=true;duckGame.exited=false;duckGame.replay()});
 const touch=await page.context().newCDPSession(page);
 async function down(){await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:390,y:560,id:1}]})}
 async function up(){await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
 for(const height of [1334,1624]){
  await page.setViewportSize({width:750,height});await page.waitForTimeout(220);await page.evaluate(()=>duckGame.replay());
  await page.screenshot({path:out+'/play-'+height+'.png'});
  await down();await page.waitForTimeout(350);assert(await page.evaluate(()=>duckGame.round.charging));await page.screenshot({path:out+'/charge-'+height+'.png'});await up();await page.waitForTimeout(130);
  assert.equal(await page.evaluate(()=>duckGame.round.selected),1);assert(await page.evaluate(()=>duckGame.round.ducks[0].y>0));await page.screenshot({path:out+'/jump-'+height+'.png'});
  await page.touchscreen.tap(60,140);assert(await page.evaluate(()=>duckGame.exitOverlay.active));const y=await page.evaluate(()=>duckGame.round.ducks[0].y);await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>duckGame.round.ducks[0].y),y);
  await page.screenshot({path:out+'/pause-'+height+'.png'});
  await page.touchscreen.tap(375,height/2+155);
  assert(await page.evaluate(()=>!duckGame.exitOverlay.active&&!duckGame.exitPaused&&duckGame.round.distance===0&&duckGame.round.ducks.every(d=>d.grounded)),'pause restart resets the round immediately');
  await page.waitForFunction(()=>cc.director.getScene().getChildByName('AudioManager')?.getComponent('cc.AudioSource')?.playing);
  await page.evaluate(()=>{duckGame.replay();duckGame.round.ducks.forEach(d=>{d.y=-600;d.grounded=false});duckGame.update(.02)});
  assert(await page.evaluate(()=>duckGame.resultOverlay.active&&!duckGame.hud.active));await page.screenshot({path:out+'/failure-'+height+'.png'});
  const margins=await page.evaluate(()=>[duckGame.reviveButton,duckGame.replayButton,duckGame.homeButton].map(b=>b.node.getComponent('cc.UITransform').getBoundingBoxToWorld().y));assert(margins.every(y=>y>=80));
  await page.evaluate(()=>{duckGame.round.revive();duckGame.resultOverlay.active=false;duckGame.hud.active=true;duckGame.render()});assert(await page.evaluate(()=>duckGame.round.ducks.every(d=>d.grounded)));
 }
 await page.evaluate(()=>{
  duckGame.replay();const r=duckGame.round,p=r.platforms[1];
  Object.assign(r.ducks[1],{x:p.start+90,y:p.y,vx:0,vy:0,grounded:true});
  Object.assign(r.ducks[0],{x:p.start-14,y:p.y-240,vx:0,vy:0,grounded:false});r.selected=1;
  duckGame.cameraX=p.start-200;duckGame.resetCord();duckGame.render();
 });
 const bracedX=await page.evaluate(()=>duckGame.round.ducks[1].x);await page.waitForTimeout(350);
 assert(Math.abs(await page.evaluate(()=>duckGame.round.ducks[1].x)-bracedX)<.01,'hanging partner does not drag the planted duck backwards');
 await page.screenshot({path:out+'/rescue-before.png'});await down();await page.waitForTimeout(220);await up();
 await page.waitForTimeout(250);await page.screenshot({path:out+'/rescue-pull.png'});
 await page.waitForFunction(()=>{const r=duckGame.round,d=r.ducks[0];return d.grounded&&d.x>=r.platforms[1].start},null,{timeout:4000});
 await page.screenshot({path:out+'/rescue-after.png'});
 await page.evaluate(()=>duckGame.replay());
 await page.touchscreen.tap(390,560);await page.touchscreen.tap(390,560);
 assert(await page.evaluate(()=>duckGame.round.ducks.every(d=>!d.grounded)),'two quick taps jump both ducks without a debounce delay');
 await page.evaluate(()=>duckGame.replay());await down();await page.waitForTimeout(220);await up();
 for(let i=0;i<5;i++){await page.waitForTimeout(150);await page.screenshot({path:out+'/spring-'+i+'.png'});}
 await page.evaluate(()=>{duckGame.replay();for(let t=0;t<120*7&&duckGame.round.phase==='playing';t++){if(!duckGame.round.charging)duckGame.round.beginCharge();else if(duckGame.round.charge>=.15)duckGame.round.release();duckGame.update(1/120)}duckGame.onHide()});
 assert(await page.evaluate(()=>duckGame.round.distance>=20));await page.screenshot({path:out+'/course.png'});
 for(const metres of [150,300,500,750]){
  await page.evaluate(m=>{
   duckGame.onShow();duckGame.replay();const r=duckGame.round,x=m*14+175;
   r.ducks.forEach((d,i)=>Object.assign(d,{x:x+i*85,y:600,vx:0,vy:0,grounded:false}));r.tick(1/120);
   const p=r.platforms.find(p=>p.start>=x);r.ducks.forEach((d,i)=>Object.assign(d,{x:p.start+55+i*85,y:p.y,vx:0,vy:0,grounded:true}));
   r.distance=Math.floor((p.start-175)/14);duckGame.cameraX=p.start-160;duckGame.resetCord();duckGame.render();duckGame.onHide();
  },metres);await page.screenshot({path:out+'/difficulty-'+metres+'.png'});
 }
 await page.evaluate(()=>{duckGame.onShow();duckGame.replay();const r=duckGame.round;r.energy=4;r.platforms[0].energyX=130;r.ducks[0].y=75;r.ducks[0].grounded=false;duckGame.update(1/120)});
 assert(await page.evaluate(()=>duckGame.round.boost>3&&duckGame.round.energy===0));await page.screenshot({path:out+'/energy-boost.png'});
 await page.evaluate(()=>{duckGame.onShow();duckGame.replay();duckGame.home()});await page.waitForFunction(()=>cc.director.getScene()?.name==='NewMainScene');
 assert.deepEqual(errors,[]);console.log('PASS real touch charge/release, preview BGM, dual viewport, jump/terrain, pause/failure/revival rendering, bottom margins and exit',out);
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
