const assert=require('node:assert/strict'),{load}=require('./drift_feed_test_helpers.cjs');const {DriftFeedRun}=load('assets/scripts/drift/driftFeedRules.ts');
// Scripted releases are intentionally imperfect: verify deterministic driving and crashes,
// rather than changing source physics until an old bot can finish 85 curves.
for(const seed of [123,999]){
 const runs=[new DriftFeedRun(seed),new DriftFeedRun(seed)];let maxRoads=0,frames=0;
 for(const r of runs)r.start();
 while(frames++<60000&&runs[0].snapshot.phase==='driving'){
  for(const r of runs){const s=r.snapshot,a=r.track.anchors.find(a=>a.releaseS>s.progress&&a.constraintStartS-100<=s.progress);r.setPressed(!!a);r.update(1/60);maxRoads=Math.max(maxRoads,r.track.getEndlessRoadVisuals().length);}
  assert.equal(JSON.stringify(runs[0].snapshot),JSON.stringify(runs[1].snapshot));
 }
 assert(runs[0].snapshot.curves>=10);assert(maxRoads<80);
 console.log('PASS source-parameter endurance',JSON.stringify({seed,frames,curves:runs[0].snapshot.curves,maxRoads}));
}
