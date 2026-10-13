const assert=require('node:assert/strict'),{load}=require('./drift_feed_test_helpers.cjs');
const {DriftFeedRun,baseSpeedMultiplier}=load('assets/scripts/drift/driftFeedRules.ts');
assert.equal(baseSpeedMultiplier(6),1);assert.equal(baseSpeedMultiplier(65),1.4);assert.equal(baseSpeedMultiplier(1000),1.4);
const a=new DriftFeedRun(42),b=new DriftFeedRun(42);
assert.equal(JSON.stringify(a.track.getEndlessRoadVisuals()),JSON.stringify(b.track.getEndlessRoadVisuals()));
a.update(1);assert.equal(a.snapshot.progress,140);a.start();a.update(1/60);assert(a.snapshot.progress>0);
a.crash();a.crash();assert.equal(a.drainEvents().filter(e=>e.type==='crash').length,1);
for(let i=0;i<47;i++)a.update(1/60);assert.equal(a.snapshot.phase,'crashing');a.update(1/30);assert.equal(a.snapshot.phase,'result');
assert(a.revive());assert.equal(a.snapshot.car.velocityX,0);assert.equal(a.snapshot.car.velocityY,0);assert.equal(a.snapshot.revivesRemaining,1);assert(!a.revive());
for(let i=0;i<181;i++)a.update(1/60);assert.equal(a.snapshot.phase,'driving');a.crash();for(let i=0;i<50;i++)a.update(1/60);assert(a.revive());
for(let i=0;i<181;i++)a.update(1/60);a.crash();for(let i=0;i<50;i++)a.update(1/60);assert(!a.revive());
a.restart(123);assert.equal(a.snapshot.phase,'ready');assert.equal(a.snapshot.revivesRemaining,2);assert.equal(a.snapshot.curves,0);
a.start();a.update(20);assert(a.snapshot.progress<240,'long frame clamped');
console.log('PASS drift rules: deterministic roads, speed curve, states, crash once, revival, long frame');
const interrupted=new DriftFeedRun(123);interrupted.start();
for(let i=0;i<500&&interrupted.snapshot.progress<1300;i++){const s=interrupted.snapshot,anchor=interrupted.track.anchors.find(a=>s.progress<a.recoverS);interrupted.setPressed(!!anchor&&s.progress>=anchor.constraintStartS-50&&s.progress<anchor.releaseS);interrupted.update(1/120);}
assert(interrupted.snapshot.pin,'drifting before lifecycle interruption');interrupted.setPressed(false);interrupted.setPressed(true);interrupted.update(1/60);assert(interrupted.snapshot.pin,'fresh touch after pause/background can reconnect current bend');
