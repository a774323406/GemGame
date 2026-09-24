const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const file = 'assets/scripts/motoRaceRules.ts';
assert(fs.existsSync(file), 'motorcycle race simulation must exist');
const out = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, {exports:out, Math, Number});
const {MotoRace, MAX_SPEED, RACE_LENGTH} = out;
assert.equal(RACE_LENGTH,10000,'full 10 km course');
const step = (r, seconds, steer=0) => { for(let i=0;i<Math.round(seconds*60);i++) r.tick(1/60,steer); };
const newRace=()=>{const r=new MotoRace();r.cars=[];r.aggressionEnabled=false;return r;};
let r = newRace(); r.riders.length=0;
step(r,12); assert.equal(r.speed,MAX_SPEED,'automatic acceleration reaches its cap');
step(r,5); assert.equal(r.speed,MAX_SPEED,'never exceeds top speed');
r.paused=true; const snapshot=JSON.stringify(r); step(r,2,1); assert.equal(JSON.stringify(r),snapshot,'pause freezes race and damage');
r.paused=false; step(r,3,1); assert(r.x<=1.45 && r.x>=1,'steering is bounded but allows shoulders'); assert(r.speed<MAX_SPEED,'grass slows the bike'); assert(r.armor<100,'running off road costs armor');
r = newRace(); r.riders.length=0; r.riders.push({id:0,x:.24,distance:1,speed:0,armor:100,fallen:0,attackCooldown:10,hitFlash:0});
assert.equal(r.attack('punch'),true); step(r,.12); assert(r.riders[0].armor<100,'nearby punch damages opponent');
const hp=r.riders[0].armor; assert.equal(r.attack('kick'),false,'shared cooldown prevents attack spam'); assert.equal(r.riders[0].armor,hp);
step(r,.6); r.riders[0].x=.29; r.riders[0].distance=r.distance+1; r.attack('kick'); step(r,.15); assert.equal(r.knockouts,1,'punch plus kick knocks opponent down');
r = newRace(); r.riders.forEach(b=>b.distance=500); r.attack('kick'); assert(r.riders.every(b=>b.armor===100),'distant opponents cannot be hit');
r = newRace(); r.riders.length=0; r.distance=RACE_LENGTH-1; r.speed=MAX_SPEED; step(r,1); assert.equal(r.status,'finished'); assert.equal(r.distance,RACE_LENGTH); const finish=JSON.stringify(r); step(r,1); assert.equal(JSON.stringify(r),finish,'result stays frozen');
r = newRace(); r.armor=1; r.x=1.4; step(r,.4); assert(r.fallen>0,'zero armor knocks player down');assert.equal(r.status,'racing');
r = newRace(); r.riders.length=0; r.riders.push({id:0,x:0,distance:1,speed:0,armor:100,fallen:0,attackCooldown:0,hitFlash:0}); step(r,.1); assert(r.armor<100,'contact with a rival damages player'); const damaged=r.armor; step(r,.1); assert.equal(r.armor,damaged,'invulnerability prevents per-frame damage');
console.log('PASS motorcycle acceleration, cap, pause, steering, grass, combat range/cooldown, knockout, collision immunity, finish and crash');

// Regression: the old invisible AI strike damaged bikes several metres apart.
for (const [x,z] of [[.4,6],[0,4],[.25,0]]) {
  r=newRace(); r.riders=r.riders.slice(0,1);
  Object.assign(r.riders[0],{x,distance:z,attackCooldown:0});
  r.tick(1/60,0); assert.equal(r.armor,100,`no remote collision at ${x}, ${z}`);
}
r=newRace(); r.riders=r.riders.slice(0,1); r.riders[0].x=.65; r.riders[0].distance=12;
r.attack('kick'); step(r,.3); assert.equal(r.riders[0].armor,100,'no remote player kick');
r=newRace(); assert.equal(r.rank,12,'start last');
const passes=[]; const seen=new Set(); let leaderSeenAt=0,leaderPassedAt=0;
for(let i=0;i<160*60 && r.status==='racing';i++) {
  // Stay in an open road strip, correcting only the curve drift.
  r.x=.96; r.tick(1/60,0);
  if(!leaderSeenAt && out.riderVisibility(r.riders[10].distance-r.distance)>0)leaderSeenAt=r.distance;
  if(!leaderPassedAt && r.riders[10].distance<r.distance)leaderPassedAt=r.distance;
  for(const b of r.riders) if(b.distance<r.distance&&!seen.has(b.id)){seen.add(b.id);passes.push(r.elapsed);}
  for(const a of r.riders) for(const b of r.riders) if(a.id<b.id && Math.abs(a.x-b.x)<.3)
    assert(Math.abs(a.distance-b.distance)>=11.9,'AI keeps following clearance');
}
assert(passes[0]>5 && passes[0]<15,'first overtake after acceleration');
assert(leaderSeenAt>=RACE_LENGTH*.5 && leaderSeenAt<RACE_LENGTH*.6,'leader first visible after halfway');
assert(leaderPassedAt>RACE_LENGTH*.9,'leader caught in final tenth');
console.log({leaderSeenAt,leaderPassedAt});
assert.equal(seen.size,11,'clean run can catch all riders');
for(let i=1;i<passes.length;i++) assert(passes[i]-passes[i-1]>1,'passes distributed over time');
console.log('PASS fair collision, narrow attacks, last-place grid and progressive pursuit',passes.map(t=>t.toFixed(1)));

// Fast follower must brake/avoid a slow leader, including frame-rate changes.
for(const hz of [20,30,60,120]) {
  r=newRace(); r.riders=r.riders.slice(0,3); r.x=.96;
  r.riders.forEach((b,i)=>Object.assign(b,{id:10-i,x:0,distance:100+i*14,speed:i?60:222}));
  for(let n=0;n<hz*8;n++) {
    r.x=.96; r.tick(1/hz,0);
    for(const a of r.riders) for(const b of r.riders) if(a.id<b.id&&Math.abs(a.x-b.x)<.3)
      assert(Math.abs(a.distance-b.distance)>=11.9,`no AI pileup at ${hz} Hz`);
  }
}
r=newRace(); r.riders=r.riders.slice(0,4); r.distance=1000;
r.riders.forEach((b,i)=>Object.assign(b,{distance:100,x:[0,-.62,0,.62][i],fallen:i?0:.001,speed:0}));
r.tick(1/60,0); assert(r.riders[0].fallen>0,'blocked recovery waits instead of overlapping');
r.riders.slice(1).forEach(b=>b.distance+=30); r.tick(1/60,0);
assert.equal(r.riders[0].fallen,0,'recovery resumes when road clears');
console.log('PASS AI slow-leader avoidance at 20/30/60/120 Hz and safe recovery');

// Direction is chosen even when the opponent is outside the strike's reach.
r=newRace(); r.riders=r.riders.slice(0,1); r.riders[0].x=-.6; r.riders[0].distance=3;
r.attack('punch'); assert.equal(r.attackSide,-1,'left target selects left animation even on a miss');
assert.equal(r.riders[0].armor,100,'windup does not deal immediate damage');
step(r,.3); assert.equal(r.riders[0].armor,100,'out-of-reach swing remains a miss');

// Mirrored fist/foot shapes, active frames, per-swing damage, and sustained combat.
for(const side of [-1,1]) {
  r=newRace();r.riders=r.riders.slice(0,1);const b=r.riders[0];
  Object.assign(b,{x:side*.34,distance:1,speed:210});r.speed=240;
  r.attack('punch');assert.equal(r.attackSide,side);assert.equal(b.armor,100);
  step(r,.12);assert.equal(b.armor,60,'extended fist touches torso without body contact');
  assert(r.speed<220 && b.speed<210,'both riders lose speed on contact');
  step(r,.35);assert.equal(b.armor,60,'one damage event per swing');
  assert(Math.abs(b.distance-r.distance)<4,'first hit keeps opponent alongside');
  r.attack('kick');step(r,.15);assert.equal(r.knockouts,1,'second exchange hits before overtaking');
}
r=newRace();r.riders=r.riders.slice(0,1);Object.assign(r.riders[0],{x:.43,distance:0,combatTime:10});
r.attack('punch');step(r,.3);assert.equal(r.riders[0].armor,100,'fist cannot reach outside its shape');
step(r,.2);r.riders[0].x=.43;r.riders[0].distance=r.distance;
r.attack('kick');step(r,.12);assert.equal(r.riders[0].armor,40,'extended foot has longer reach');
r=newRace();r.riders=r.riders.slice(0,1);Object.assign(r.riders[0],{x:.25,distance:0});
r.attack('punch');r.riders[0].x=.8;step(r,.3);assert.equal(r.riders[0].armor,100,'escape during windup avoids hit');
for(const hz of [20,60,120]) {
 r=newRace();r.riders=[];r.speed=240;r.cars=[{id:0,x:0,distance:5,speed:70}];
 for(let i=0;i<hz*.2;i++)r.tick(1/hz,0);
 assert.equal(r.armor,78,`swept traffic collision once at ${hz} Hz`);
 assert(r.speed<200,'car impact costs speed');
}
r=newRace();r.riders=[];r.speed=240;r.cars=[{id:0,x:-.62,distance:5,speed:70}];
step(r,.3);assert.equal(r.armor,100,'oncoming car in another lane is safe');
console.log('PASS direction, limb contact, active frames, sustained combat and oncoming traffic');
// Full course with traffic: rivals keep their separation and the leader reveal stays late.
for(const hz of [20,60,120]) {
 r=new MotoRace();r.aggressionEnabled=false;let visible=0;let minGap=Infinity;
 for(let n=0;n<hz*160 && r.status==='racing';n++) {
  r.x=.98;r.tick(1/hz,0);
  if(!visible && out.riderVisibility(r.riders[10].distance-r.distance)>0)visible=r.distance;
  for(const a of r.riders)for(const b of r.riders)if(a.id<b.id&&Math.abs(a.x-b.x)<.3)
    minGap=Math.min(minGap,Math.abs(a.distance-b.distance));
 }
 assert(visible>=RACE_LENGTH*.5,`traffic does not expose leader early at ${hz} Hz`);
 assert(minGap>=11.9,`traffic does not bunch AI (${hz} Hz, ${minGap}m)`);
}
console.log('PASS full-course traffic spacing and late leader reveal at 20/60/120 Hz');
// The third knockout, not rider id 3, triggers a physical two-pass retaliation.
for(const hz of [20,60,120]) {
 r=newRace();r.riders=r.riders.slice(0,1);const b=r.riders[0];
 r.knockouts=2;r.speed=220;Object.assign(b,{x:.3,distance:0,speed:220,armor:60});
 r.attack('kick');step(r,.12);assert.equal(r.knockouts,3);assert.equal(b.revengeLeft,2);
 assert(b.fallen>0 && b.fallen<1,'third opponent gets up promptly');
 let swings=0,previous=b.revengePhase,drop=false,topSpeed=0;
 for(let i=0;i<hz*35;i++) {
   r.x=0;const old=b.distance;r.tick(1/hz,0);topSpeed=Math.max(topSpeed,b.speed);
   assert(b.distance-old<=285/3.6/hz+.001,'retaliation never teleports');
   if(b.revengePhase==='swing' && previous!=='swing')swings++;
   if(b.revengePhase==='cooldown' && b.distance<r.distance-4)drop=true;
   previous=b.revengePhase;
 }
 assert.equal(swings,2,`two distinct retaliation passes at ${hz} Hz`);
 assert.equal(b.revengePhase,'done');assert(drop,'attacker drops back after swinging');
 assert(topSpeed>240,'recovered rival accelerates enough to chase player');
 assert.equal(r.armor,32,'two punches leave one hit of stamina');
}
// AI cars: avoid if clear; a blocked escape causes one swept collision, not damage every frame.
r=newRace();r.distance=1000;r.riders=r.riders.slice(0,1);
Object.assign(r.riders[0],{x:-.62,distance:0,speed:200});r.cars=[{id:0,x:-.62,distance:150,speed:70}];
step(r,2);assert(r.riders[0].x>-.35,'AI steers out of an approaching car lane');
assert.equal(r.riders[0].trafficCooldown,0,'successful avoidance has no impact');
for(const hz of [20,60,120]) {
 r=newRace();r.distance=1000;r.riders=r.riders.slice(0,2);
 Object.assign(r.riders[0],{x:-.62,distance:0,speed:200});Object.assign(r.riders[1],{x:-.25,distance:0,speed:200});
 r.cars=[{id:0,x:-.62,distance:5,speed:70}];
 for(let i=0;i<hz*.15;i++)r.tick(1/hz,0);
 assert(r.riders[0].speed<150,'blocked rider is slowed by the car');
 assert(r.riders[0].speed>100,'single impact is not repeatedly applied');
 assert(r.riders[0].trafficCooldown>0,'AI car impact grace period');
}
console.log('PASS third-knockout recovery, two pursuit attacks, attack slowdown and AI car avoidance/impact');
// Avoidance used to alternate directions at the car's .4-lane danger boundary.
for(const hz of [20,60,120])for(const side of [-1,1]) {
 r=newRace();r.distance=1000;r.riders=r.riders.slice(0,1);const b=r.riders[0];
 Object.assign(b,{id:side<0?0:2,x:side*.62,distance:0,speed:200});
 r.cars=[{id:90,x:side*.62,distance:170,speed:70}];
 let lastSign=0,reversals=0;
 for(let i=0;i<hz*4;i++) {
  const old=b.x;r.tick(1/hz,0);const delta=b.x-old;
  if(Math.abs(delta)>.0001){const sign=Math.sign(delta);if(lastSign&&lastSign!==sign)reversals++;lastSign=sign;}
 }
 assert.equal(reversals,0,`one consistent avoidance direction at ${hz} Hz, side ${side}`);
 assert(Math.abs(b.x)<.03,'complete lane change instead of hovering at danger boundary');
}
console.log('PASS stable left/right traffic avoidance without steering reversals at 20/60/120 Hz');
// Three effective punches down the player; the race continues while they recover.
r=newRace();r.riders=[];r.speed=200;
for(let i=0;i<3;i++){r.invincible=0;r.damage(34,1,.96,0);if(i<2)assert.equal(r.fallen,0);}
assert(r.fallen>0);assert.equal(r.status,'racing');assert.equal(r.speed,0);
assert.equal(r.attack('punch'),false,'cannot attack while down');
const downDistance=r.distance;step(r,1);assert.equal(r.distance,downDistance);
step(r,1.2);assert.equal(r.armor,100);assert.equal(r.fallen,0);assert(r.invincible>0);

for(const hz of [20,60,120]) {
 r=newRace();r.aggressionEnabled=true;r.distance=1000;r.riders=r.riders.slice(0,2);
 const [a,b]=r.riders;Object.assign(a,{x:-.175,distance:0,speed:220,attackCooldown:0,laneTarget:-.175});
 Object.assign(b,{x:.175,distance:0,speed:220,attackCooldown:99,laneTarget:.175});
 let hits=0,previous=b.armor;
 for(let i=0;i<hz*30;i++){r.tick(1/hz,0);if(b.armor<previous)hits++;previous=b.armor;}
 assert(hits>=3,JSON.stringify({hz,hits,a,b}));
 assert.equal(r.knockouts,0,'AI knockouts are not credited to player');
}
for(const [ahead,behind] of [[1,4],[4,7],[7,10]]){
 assert(out.aggressionForRank(ahead).cooldown<out.aggressionForRank(behind).cooldown);
 assert(out.aggressionForRank(ahead).range>out.aggressionForRank(behind).range);
}
r=newRace();const ranked=r.riders[0];ranked.distance=1000;assert.equal(r.riderRank(ranked),1);
ranked.distance=-1;assert.equal(r.riderRank(ranked),12,'aggression rank follows live position');
r=newRace();r.aggressionEnabled=true;r.riders=r.riders.slice(0,1);
Object.assign(r.riders[0],{x:.35,distance:0,speed:220,attackCooldown:0,laneTarget:.35});r.speed=220;
let damageCount=0,prior=r.armor;
for(let i=0;i<60*30&&!r.fallen;i++){r.x=0;r.speed=200;r.tick(1/60,0);if(r.armor<prior)damageCount++;prior=r.armor;}
assert.equal(damageCount,3);assert(r.fallen>0,'ordinary aggressive rider can down the player');
console.log('PASS three-hit fall/revive, rank-based aggression, AI-vs-AI knockdowns and active player attacks');
r=newRace();r.riders=[];assert(r.activateBoost());assert.equal(r.boostRemaining,600);
r.cars=[{id:0,x:0,distance:8,speed:70}];step(r,.2);assert.equal(r.armor,100);assert(r.speed>MAX_SPEED);
r=newRace();r.riders=r.riders.slice(0,1);Object.assign(r.riders[0],{x:0,distance:4,speed:0});
r.activateBoost();step(r,.1);assert(r.riders[0].fallen>0);assert.equal(r.knockouts,1);
step(r,6);assert.equal(r.boostRemaining,0);assert(r.speed<=MAX_SPEED);
