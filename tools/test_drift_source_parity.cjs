const assert=require('node:assert/strict'),fs=require('node:fs'),{load}=require('./drift_feed_test_helpers.cjs');
const {DriftFeedRun}=load('assets/scripts/drift/driftFeedRules.ts');
const run=new DriftFeedRun(123);
assert.equal(run.track.config?.sampleStep ?? run.track.options?.sampleStep,20);
const view=fs.readFileSync('assets/scripts/drift/driftFeedView.ts','utf8');
assert(!view.includes('this.heading+='),'no rotating camera');
assert(!view.includes('s.bursting?.56'),'no invented zoom');
assert(fs.readFileSync('assets/scripts/drift/driftFeedEffects.ts','utf8').includes('if(this.shake>0)'),'collision shake restored by user request');
console.log('PASS original drift configuration and fixed camera orientation');
const path=require('node:path');
const original=path.resolve('../cocosProject/drift');
const {driftFeel}=load('assets/scripts/drift/driftSourceConfig.ts');
assert.equal(JSON.stringify(driftFeel),JSON.stringify(JSON.parse(fs.readFileSync(original+'/assets/config/driftFeel.json','utf8'))));
for(const name of ['SlingDriftMotion'])assert.equal(fs.readFileSync('assets/scripts/drift/'+name+'.ts','utf8'),fs.readFileSync(original+'/assets/Script/game/'+name+'.ts','utf8'));
const controller=fs.readFileSync(original+'/assets/Script/game/GameSceneController.ts','utf8');
const copy=fs.readFileSync('assets/scripts/drift/DriftSourceRules.ts','utf8');
for(const name of ['continuousTurnHandoffS','canSelectAnchorAtProgress','findAutoAnchor','canAttachSlingConstraintAt','carCollisionInsetWithHeading','isCarTouchingRoadEdgeAt','isCarPathTouchingRoadEdge','carCollisionHalfSize','carCollisionSamplePointsAt','findClosestTrackPointNearProgress','anchorWorldPoint']){
 const start=controller.indexOf('  private '+name+'('),end=controller.indexOf('\n  private ',start+5);
 const method=controller.slice(start,end).split('\n  /**')[0].trimEnd().replace('  private '+name,'  '+name);
 assert(copy.includes(method),'original method unchanged: '+name);
}
run.start();run.snapshot.curves=20;run.update(1/60);assert.equal(run.snapshot.targetSpeed,560*(1+14/59*.4));assert.equal(run.snapshot.bursting,false);
console.log('PASS exact source modules, JSON configuration and 11 original controller routines');
