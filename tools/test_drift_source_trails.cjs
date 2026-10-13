const assert=require('node:assert/strict'),{load}=require('./drift_feed_test_helpers.cjs');const {DriftSourceTrails}=load('assets/scripts/drift/DriftSourceTrails.ts');const {DriftFeedRun}=load('assets/scripts/drift/driftFeedRules.ts');
const t=new DriftSourceTrails(),r=new DriftFeedRun(1),s=r.snapshot;s.phase='driving';
t.emit(s,1/60);assert.equal(t.particles.length,0);assert.equal(t.marks.length,0);
s.drifting=true;for(let i=0;i<30;i++){s.car.y+=5;t.emit(s,1/60);t.update(1/60);}assert(t.marks.length>0);assert(t.particles.length>0);assert(t.particles.every(p=>p.shape==='smoke'));assert.equal(t.marks[0].width,5.2);assert(Math.abs(t.marks[0].startX+125*.58*.23)<1e-8);
s.drifting=false;t.emit(s,1/60);assert.equal(t.playerTrailLeftPoint,null);s.car.y+=1000;s.drifting=true;const before=t.marks.length;t.emit(s,1/60);assert.equal(t.marks.length,before,'no discontinuous wheel line');
t.reset();assert.equal(t.marks.length,0);assert.equal(t.particles.length,0);console.log('PASS original two-wheel marks, soft smoke, no ordinary blue exhaust, reset');
