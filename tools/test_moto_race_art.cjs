const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const file='assets/scripts/motoRaceArt.ts';assert(fs.existsSync(file),'image-based rider presentation must exist');
const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:out,require:()=>({}),Math});
const pose=out.riderPose;
assert.equal(pose(0,0,'punch',1,0).frame,0);
assert.equal(pose(-1,0,'punch',1,0).frame,1,'left steer uses left-lean image');
assert.equal(pose(1,0,'punch',1,0).frame,2,'right steer uses right-lean image');
assert.equal(pose(0,.29,'punch',1,0).frame,4,'punch starts at windup');
assert.equal(pose(0,.14,'punch',1,0).frame,6,'punch reaches contact pose');
assert.equal(pose(0,.14,'kick',1,0).frame,10,'kick uses leg extension rather than punch');
assert.equal(pose(0,.14,'kick',-1,0).flip,true,'left attacks mirror a consistent right-side action');
assert.equal(pose(0,0,'kick',-1,0).flip,false,'driving never inherits attack flip');
assert.equal(out.opponentFrame(0,2),16,'opponent palettes use separate atlas cells');
assert.equal(out.opponentFrame(2,3),22);
console.log('PASS rider animation poses, left/right mirroring, opponent atlas variants');
for(let palette=1;palette<=3;palette++) {
 assert.equal(out.opponentFrame(4,palette),28+(palette-1)*4,'rival windup preserves palette');
 assert.equal(out.opponentFrame(6,palette),30+(palette-1)*4,'rival contact frame preserves palette');
}
console.log('PASS visible rival windup/contact/recovery animation mapping');
