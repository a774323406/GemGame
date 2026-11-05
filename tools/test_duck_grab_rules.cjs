const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
assert(fs.existsSync('assets/scripts/duckGrabRules.ts'),'duck round implementation exists');
const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/scripts/duckGrabRules.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:out,Math,Number});
const {DuckGrabRound}=out;
let r=new DuckGrabRound();assert.equal(r.remaining,60);assert.equal(r.attempts,0);
assert(r.attempt());assert(!r.attempt());assert.equal(r.attempts,1);r.tick(.5);assert.equal(r.phase,'playing','first off-center attempt misses');assert(!r.reaching);assert(r.attempt(),'can retry');
r=new DuckGrabRound();r.unlockCatching();r.tick((Math.PI-0.18*3.3*3)/3.3);r.attempt();r.tick(.18);assert.equal(r.phase,'success','contact with centered neck succeeds');const attempts=r.attempts;r.tick(5);assert(!r.attempt());assert.equal(r.attempts,attempts);
r=new DuckGrabRound();r.tick(60);assert.equal(r.phase,'failure');assert.equal(r.remaining,0);assert(!r.attempt());
r=new DuckGrabRound();r.slowDown();assert.equal(r.speedMultiplier,.72);r.slowDown();assert.equal(r.speedMultiplier,.72*.72);r.tick(NaN);r.tick(-2);assert.equal(r.remaining,60);
r=new DuckGrabRound();r.tick(59.9);r.attempt();r.tick(.2);assert.equal(r.phase,'failure','timeout beats an unfinished reach');
console.log('PASS repeat attempts, contact-time hit, miss, timeout, slowdown and invalid dt');

r=new DuckGrabRound();let normal=new DuckGrabRound();r.attempt();r.tick(.1);normal.tick(.1);assert(r.swing>normal.swing*2,'reaching briefly speeds up duck');r.tick(.4);assert(r.tauntRemaining>0,'miss shows mocking question mark');const start=r.swing;r.tick(.1);assert(Math.abs(r.swing-start-.33)<1e-7,'burst ends and normal pace returns');r.tick(1);assert.equal(r.tauntRemaining,0,'taunt expires');
r=new DuckGrabRound();r.slowDown();r.attempt();r.tick(.1);assert(Math.abs(r.swing-.1*3.3*3*.72)<1e-7,'ad slowdown also reduces dodge burst');

for(let i=0;i<360;i++){const g=new DuckGrabRound();g.swing=i*Math.PI/180;g.attempt();g.tick(.18);assert.equal(g.phase,'playing','pre-ad attempt must visibly dodge');assert(Math.abs(g.neckX)>32,'miss must agree with rendered neck, not hidden hit rejection');}
r=new DuckGrabRound();assert(!r.catchUnlocked);r.tick(30);assert(r.catchUnlocked,'no-ad fallback unlocks after 30 playing seconds');r=new DuckGrabRound();r.unlockCatching();assert(r.catchUnlocked,'shown ad unlocks immediately');
for(const speed of [1,.72,.5184,.1])for(let i=0;i<360;i+=3){const g=new DuckGrabRound();g.speedMultiplier=speed;g.swing=i*Math.PI/180;g.attempt();let previous=g.angle;for(let j=0;j<18;j++){g.tick(.01);assert(Math.abs(g.angle-previous)<14,'dodge must stay continuous');previous=g.angle;}assert.equal(g.phase,'playing');assert(Math.abs(g.neckX)>32);}
console.log('PASS locked attempts visibly miss across phases/speeds; 30-second/ad unlock; smooth dodge');
