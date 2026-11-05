const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('/Users/skyhand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({viewport:{width:750,height:1334},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>{console.log(e.stack);errors.push(e.message)});
  await page.goto(process.argv[2]||'http://127.0.0.1:8767/');
  await page.waitForFunction(()=>window.cc&&cc.director.getScene()?.name==='NewMainScene',null,{timeout:40000});
  await page.evaluate(()=>cc.director.getScene().getChildByName('Canvas').getComponent('newMainScene').openBrickChop());
  await page.waitForFunction(()=>cc.director.getScene()?.name==='BrickChopFeedGameScene',null,{timeout:30000});
  await page.waitForTimeout(700);
  await page.evaluate(()=>{cc.profiler.hideStats();window.brick=cc.director.getScene().getChildByName('Canvas').getComponent('brickChopFeedGameScene')});
  const out='/tmp/brick-chop-preview';fs.mkdirSync(out,{recursive:true});
  // Feed preview remains animated/audible without consuming a chance.
  await page.evaluate(()=>{brick.feed=true;brick.feedChanged({entered:false,exited:false})});
  const charge=await page.evaluate(()=>brick.gaugeFill.fillRange);await page.waitForTimeout(220);
  assert.notEqual(await page.evaluate(()=>brick.gaugeFill.fillRange),charge);assert.equal(await page.evaluate(()=>brick.round.chances),3);
  await page.waitForFunction(()=>{const a=cc.director.getScene().getChildByName('AudioManager')?.getComponent('cc.AudioSource');return a?.playing&&a.clip?.name==='getUserBgm'});
  await page.evaluate(()=>{const power=brick.gaugeFill.fillRange;brick.feedChanged({entered:true,exited:false});brick.onTap();if(Math.abs(brick.round.strikePower-power)>.04)throw Error('preview power lost on entry');brick.feed=false;brick.entered=true;brick.exited=false;brick.replay()});
  for(const height of [1334,1624]){
   await page.setViewportSize({width:750,height});await page.waitForTimeout(250);await page.evaluate(()=>brick.replay());
   await page.screenshot({path:out+'/play-'+height+'.png'});
   const bounds=await page.evaluate(()=>[brick.slowdownButton,brick.extraButton].map(b=>b.node.getComponent('cc.UITransform').getBoundingBoxToWorld().y));assert(bounds.every(y=>y>=80));
   await page.touchscreen.tap(62,143);assert(await page.evaluate(()=>brick.exitOverlay.active));const t=await page.evaluate(()=>brick.round.chargeTime);
   await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>brick.round.chargeTime),t);
   await page.touchscreen.tap(375,height/2+80);assert(!await page.evaluate(()=>brick.exitOverlay.active));
   await page.touchscreen.tap(375,height*.45);assert.equal(await page.evaluate(()=>brick.round.attempts),1);await page.waitForTimeout(900);
   // Deterministic low-power attempts exercise failure and a full result overlay.
   await page.evaluate(()=>{brick.replay();for(let i=0;i<3;i++){brick.round.chargeTime=0;brick.onTap();for(let j=0;j<9;j++)brick.update(.1)}});
   assert(await page.evaluate(()=>brick.resultOverlay.active&&!brick.hud.active));assert.equal(await page.evaluate(()=>brick.resultTitle.string),'挑战失败');
   await page.screenshot({path:out+'/failure-'+height+'.png'});
   await page.evaluate(()=>{brick.replay();brick.round.chargeTime=.9;brick.onTap();brick.update(.1);brick.update(.1);brick.update(.06);brick.onHide()});
   assert(await page.evaluate(()=>brick.leftPieces.some(p=>p.active)));
   await page.screenshot({path:out+'/impact-'+height+'.png'});
   await page.evaluate(()=>brick.onShow());await page.waitForTimeout(1000);
   assert.equal(await page.evaluate(()=>brick.resultTitle.string),'挑战成功');assert(!await page.evaluate(()=>brick.hitLabel.node.active));
   await page.screenshot({path:out+'/success-'+height+'.png'});
   const margins=await page.evaluate(()=>[brick.replayButton,brick.homeButton].map(b=>b.node.getComponent('cc.UITransform').getBoundingBoxToWorld().y));assert(margins.every(y=>y>=80));
  }
  await page.evaluate(()=>{brick.replay();brick.round.chargeTime=.81;brick.onTap();for(let i=0;i<8;i++)brick.update(.1);brick.onHide()});
  assert.equal(await page.evaluate(()=>brick.leftPieces.filter(p=>p.active).length),10);
  assert.equal(await page.evaluate(()=>brick.rightPieces.filter(p=>p.active).length),10);
  assert.equal(await page.evaluate(()=>brick.bricks.filter(p=>p.active).length),2);
  await page.screenshot({path:out+'/ten-bricks.png'});
  // Original layer thresholds persist: equal/weaker hits cannot chip away
  // at deeper bricks, and the final layer clears at exactly 98%.
  const remainingChecks=await page.evaluate(()=>{
   brick.onShow();brick.replay();const results=[];
   for(const power of [.9,.5,.9,.92,.92,.979999,.98]) {
    if(brick.round.chances===1)brick.round.addChances();
    brick.round.chargeTime=power*.9;brick.onTap();
    for(let i=0;i<16;i++)brick.update(.1);
    results.push({hit:brick.round.lastHit,left:brick.round.remaining,whole:brick.bricks.filter(p=>p.active).length,phase:brick.round.phase});
   }
   return results;
  });
  assert.deepEqual(remainingChecks,[
   {hit:10,left:2,whole:2,phase:'aiming'},
   {hit:0,left:2,whole:2,phase:'aiming'},
   {hit:0,left:2,whole:2,phase:'aiming'},
   {hit:1,left:1,whole:1,phase:'aiming'},
   {hit:0,left:1,whole:1,phase:'aiming'},
   {hit:0,left:1,whole:1,phase:'aiming'},
   {hit:1,left:0,whole:0,phase:'success'},
  ]);
  await page.evaluate(()=>{brick.onShow();brick.replay()});await page.touchscreen.tap(62,143);await page.touchscreen.tap(375,1624/2+255);
  await page.waitForFunction(()=>cc.director.getScene()?.name==='NewMainScene',null,{timeout:8000});
  assert.deepEqual(errors,[]);console.log('PASS live input, preview music/gauge, strike fragments, fixed layer thresholds and inclusive 98% final threshold, success/failure, pause/exit, both heights and bottom margins',out);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
