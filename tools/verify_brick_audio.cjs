const assert=require('node:assert/strict');
const {chromium}=require('/Users/skyhand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 const p=await b.newPage();await p.addInitScript(()=>{
 window.audioProbe={starts:[],stops:[],live:new Set()};
 const proto=AudioBufferSourceNode.prototype, start=proto.start, stop=proto.stop;
 proto.start=function(...args){this._probeID=window.audioProbe.starts.length;window.audioProbe.starts.push({id:this._probeID,duration:this.buffer?.duration,loop:this.loop});window.audioProbe.live.add(this);this.addEventListener('ended',()=>window.audioProbe.live.delete(this));return start.apply(this,args)};
 proto.stop=function(...args){window.audioProbe.stops.push(this._probeID);window.audioProbe.live.delete(this);return stop.apply(this,args)};
 });
 await p.goto('http://127.0.0.1:8767/');await p.waitForFunction(()=>window.cc&&cc.director.getScene()?.name==='NewMainScene');
 await p.evaluate(()=>cc.director.getScene().getChildByName('Canvas').getComponent('newMainScene').openBrickChop());
 await p.waitForFunction(()=>cc.director.getScene()?.name==='BrickChopFeedGameScene');await p.waitForTimeout(700);
 const read=()=>p.evaluate(()=>({starts:audioProbe.starts,stops:audioProbe.stops,live:[...audioProbe.live].map(a=>({id:a._probeID,duration:a.buffer?.duration,loop:a.loop}))}));
 assert.equal((await read()).live.filter(x=>x.loop).length,1,'one BGM after scene entry');
 await p.evaluate(()=>{const c=cc.director.getScene().getChildByName('Canvas').getComponent('brickChopFeedGameScene');window.brick=c;c.feed=true;c.entered=false;c.feedChanged({entered:true,exited:false});c.onTap();c.onShow();});await p.waitForTimeout(700);
 const entered=await read();assert.equal(entered.live.filter(x=>x.loop).length,1,'entry/touch/show must not leave overlapping BGM sources');
 await p.evaluate(()=>{brick.onHide();brick.onShow();brick.onTap();brick.onShow()});await p.waitForTimeout(400);
 assert.equal((await read()).live.filter(x=>x.loop).length,1,'background recovery has one BGM');
 await p.evaluate(()=>brick.onHide());await p.waitForTimeout(200);
 assert.equal((await read()).live.filter(x=>x.loop).length,0,'hide stops every audible BGM source');
 console.log('PASS real WebAudio sources: single BGM across feed entry/touch/show, foreground recovery, fully silent on hide');
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
