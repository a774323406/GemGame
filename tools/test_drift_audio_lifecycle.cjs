const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
let muted=false;const sources=[];
class AudioSource{constructor(){this.playing=false;this.detachedShots=0;sources.push(this)}play(){this.playing=true}stop(){this.playing=false}pause(){this.playing=false}playOneShot(){this.detachedShots++}}
class Node{constructor(name){this.name=name}addChild(){}addComponent(){const a=new AudioSource();a.node=this;return a}destroy(){}}
const exp={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/scripts/drift/driftFeedAudio.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exp,require:n=>n==='cc'?{Node,AudioSource,isValid:value=>!!value&&value.isValid!==false}:{default:{getSound:()=>muted?1:0,getMusic:()=>0}},Math});
const a=new exp.DriftFeedAudio(new Node('root'),Array(7).fill({}));const s={phase:'driving',pin:{},bursting:false};a.unlock();a.sync(s,.1);assert.equal(sources.filter(s=>s.playing).length,3);
a.consume([{type:'boost-start'}]);a.setSuspended(true);assert(sources.every(s=>!s.playing&&s.detachedShots===0),'pause must silence all audible sounds including boost');
a.setSuspended(false);a.consume([{type:'crash'}]);muted=true;a.sync(s,.1);assert(sources.slice(1).every(s=>!s.playing&&s.detachedShots===0),'sound mute must silence pending collision and loops');a.dispose();assert(sources.every(s=>!s.playing));console.log('PASS drift audio lifecycle: music and two loops, paused burst, muted collision, dispose');

// Cocos destroys child nodes/components before the owning Canvas controller.
const torn=new exp.DriftFeedAudio(new Node('root'),Array(7).fill({}));
for(const source of sources.slice(-4)){source.node=null;source.isValid=false;source.stop=()=>assert.fail('must not stop a destroyed AudioSource');source.pause=()=>assert.fail('must not pause a destroyed AudioSource');}
assert.doesNotThrow(()=>torn.dispose());assert.doesNotThrow(()=>torn.dispose());
assert.doesNotThrow(()=>torn.setSuspended(true));assert.doesNotThrow(()=>torn.sync(s,.1));assert.doesNotThrow(()=>torn.consume([{type:'crash'}]));
console.log('PASS child-first teardown, repeated disposal and late audio callbacks');
