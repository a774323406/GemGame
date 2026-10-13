const assert=require('node:assert/strict'),{load}=require('./drift_feed_test_helpers.cjs');
const {DriftFeedRun}=load('assets/scripts/drift/driftFeedRules.ts'),{driftViewport,roadBounds,overlaps}=load('assets/scripts/drift/driftRoadVisibility.ts');
for(const height of [1334,1624])for(const seed of [3,123,999,42]){
 const r=new DriftFeedRun(seed);r.viewportHeight=height;r.start();let ids=new Set(r.track.getEndlessRoadVisuals().map(p=>p.id)),created=0;
 // Follow the centerline solely to audit streaming; this does not test driving skill.
 for(let s=140;s<500000;s+=100){r.snapshot.progress=s;const c=r.track.getTrackPoint(s),v=driftViewport(c,r.track.getTrackPoint(s+240),height);Object.assign(r.snapshot.car,{x:c.x,y:c.y});r.prepareRoads();assert(r.track.track.at(-1).s>s+1200,'future road buffer exhausted '+JSON.stringify({s,seed,height,tail:r.track.track.at(-1),v}));for(const p of r.track.getEndlessRoadVisuals())if(!ids.has(p.id)){ids.add(p.id);created++;assert(!overlaps(roadBounds(p),v),'tile generated in padded view '+JSON.stringify({seed,s,p}));}}
 assert(created>100);console.log('PASS offscreen generation',height,seed,created);
}
// A distant-by-progress tile in a hairpin must remain until its complete sprite leaves view.
const p={prefabName:'road_180_r300',x:0,y:0,heading:Math.PI/2,scaleX:1};assert(overlaps(roadBounds(p),{left:-375,right:375,bottom:-812,top:812}));
