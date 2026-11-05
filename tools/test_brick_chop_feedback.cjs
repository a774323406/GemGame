const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/scripts/brickChopFeedback.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:out});
const {brickSplitTime,visibleSplitCount,chopEndTime,chopHandPose,CHOP_CONTACT_TIME}=out;
for(const hit of [1,5,10,12]){
 let seen=0;
 for(let t=0;t<chopEndTime(hit);t+=1/60){const count=visibleSplitCount(t,hit);assert(count>=seen&&count<=hit);seen=count;}
 assert.equal(seen,hit,'each counted brick visibly splits before strike ends');
 assert(chopEndTime(hit)-brickSplitTime(hit-1)>=.37,'last split remains visible');
 const pose=chopHandPose(brickSplitTime(hit-1)+.05,hit,250,0);assert(Math.abs(pose.y+(hit-1)*34)<.01,'hand reaches last counted layer');
 const resting=chopHandPose(chopEndTime(hit)+.01,hit,250,0);assert(Math.abs(resting.y-250)<.01);assert(Math.abs(resting.angle)<1e-8);
}
assert.equal(visibleSplitCount(CHOP_CONTACT_TIME-.01,10),0);
assert.equal(visibleSplitCount(CHOP_CONTACT_TIME+.02,10),1);
assert.equal(visibleSplitCount(brickSplitTime(9),10),10);
assert(chopHandPose(.08,10,250,0).y>250,'windup visibly raises hand');
console.log('PASS 1/5/10/12 visible fracture counts, last-layer hand depth, brief hit-stop and return to rest');
