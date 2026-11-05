const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
function load(file){const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/scripts/'+file+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:out,require:()=>load('brickChopFeedback')});return out;}const out=load('brickChopRules');const {BrickChopRound,bricksForPower}=out;
// Every brick keeps its original layer threshold after earlier layers are removed.
for (const [remaining,power,hit] of [
 [2,.2,0],[2,.5,0],[2,.9,0],[2,.92,1],[2,.979999,1],[2,.98,2],
 [1,.2,0],[1,.5,0],[1,.95,0],[1,.979999,0],[1,.98,1],
 [10,.8,7],[10,.2,0],[12,.5,5],[12,.500001,6],[12,.94,11],[12,.98,12],
]) {
 const round=new BrickChopRound();round.remaining=remaining;round.chargeTime=power*.9;
 assert(round.strike());assert.equal(round.lastHit,hit,`${remaining} remaining at ${power} power`);
 assert.equal(round.remaining,remaining,'deduct only on contact');
 round.tick(1.5);assert.equal(round.remaining,remaining-hit);
 assert.equal(round.phase,hit===remaining?'success':'aiming');assert.equal(round.chances,2);
}
// Repeated/equal/weaker hits cannot chip away at layers beyond their fixed reach.
const sequence=new BrickChopRound();sequence.chances=7;
for (const [power,hit,left,phase] of [
 [.9,10,2,'aiming'],[.5,0,2,'aiming'],[.9,0,2,'aiming'],
 [.92,1,1,'aiming'],[.92,0,1,'aiming'],[.979999,0,1,'aiming'],[.98,1,0,'success'],
]) {
 sequence.chargeTime=power*.9;assert(sequence.strike());assert.equal(sequence.lastHit,hit);
 sequence.tick(1.5);assert.equal(sequence.remaining,left);assert.equal(sequence.phase,phase);
}
assert.equal(sequence.chances,0,'last chance can still win');
const weak=new BrickChopRound();weak.remaining=2;
for(let i=0;i<3;i++){weak.chargeTime=.9*.5;weak.strike();weak.tick(1.5);}
assert.equal(weak.remaining,2);assert.equal(weak.phase,'failure','weak hits consume chances but cannot lower thresholds');
for(let remaining=1;remaining<=12;remaining++) {
 assert(bricksForPower(.98-1e-8,remaining)<remaining,'below final threshold cannot clear any stack');
 assert.equal(bricksForPower(.98,remaining),remaining,'inclusive final threshold clears every stack size');
}
for(const time of [.9*.98,.9*(2-.98)]) {
 const round=new BrickChopRound();round.remaining=1;round.chargeTime=time;round.strike();
 assert.equal(round.lastHit,1,'exactly 98% clears on both rising and falling meter');
}
for(let layer=1;layer<12;layer++) {
 for(const [power,depth] of [[layer/12-1e-8,layer-1],[layer/12,layer-1],[layer/12+1e-8,layer]]) {
  assert.equal(bricksForPower(power),depth,'early layers require exceeding their threshold');
  const round=new BrickChopRound();round.chargeTime=power*.9;round.strike();assert.equal(round.lastHit,depth);
 }
}
assert.equal(bricksForPower(0),0);assert.equal(bricksForPower(.17),2);assert.equal(bricksForPower(1),12);assert.equal(bricksForPower(NaN),0);
for(let i=1;i<=100;i++)assert(bricksForPower(i/100)>=bricksForPower((i-1)/100));
let r=new BrickChopRound();assert.equal(r.remaining,12);assert.equal(r.chances,3);r.tick(.9);assert(Math.abs(r.power-1)<1e-9);assert(r.strike());assert.equal(r.chances,2);assert(!r.strike());r.tick(.24);assert.equal(r.remaining,12);r.tick(.01);assert.equal(r.remaining,0);assert.equal(r.phase,'striking');r.tick(1.5);assert.equal(r.phase,'success');assert(!r.strike());assert(!r.addChances());
r=new BrickChopRound();for(let i=0;i<3;i++){assert(r.strike());r.tick(1.5);}assert.equal(r.phase,'failure');assert.equal(r.remaining,12);assert.equal(r.attempts,3);
r=new BrickChopRound();r.tick(.5);r.strike();const amount=r.lastHit;r.tick(1.5);assert.equal(r.remaining,12-amount);assert.equal(r.chances,2);assert(r.addChances());assert.equal(r.chances,5);assert(r.slowDown());assert.equal(r.speedMultiplier,.72);
const t=r.chargeTime;r.tick(NaN);r.tick(-1);assert.equal(r.chargeTime,t);
for(let i=0;i<20;i++)r.slowDown();assert(r.speedMultiplier>=.3);
r=new BrickChopRound();r.remaining=1;r.tick(.9);r.strike();assert.equal(r.lastHit,1);r.tick(1.5);assert.equal(r.phase,'success');
r=new BrickChopRound();r.tick(.9);r.strike();assert(!r.slowDown());assert(!r.addChances());r.tick(1.5);assert.equal(r.remaining,0);
console.log('PASS strength mapping, sampled strike, impact timing, repeated input, win/fail, reward and invalid time');
