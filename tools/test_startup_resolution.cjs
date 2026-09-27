const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const noop=()=>{},service=new Proxy({}, {get:()=>noop});
for(const file of ['loadScene','newMainScene'])for(const height of [1334,1624]) {
 let design,policy;
 const cc={_decorator:{ccclass:()=>c=>c,property:()=>()=>{}},Component:class{},view:{setDesignResolutionSize(w,h,p){design={w,h};policy=p;}},ResolutionPolicy:{FIXED_WIDTH:4},Button:{EventType:{CLICK:'click'}},game:{on:noop},Game:{EVENT_SHOW:'show'}};
 const exports={};
 const code=ts.transpileModule(fs.readFileSync(`assets/scripts/${file}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,experimentalDecorators:true,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{exports,require:n=>n==='cc'?cc:new Proxy({}, {get:()=>service})});
 new exports[file]().onLoad();
 assert.equal(policy,4);assert.equal(design.w,750);
 const scale=750/design.w;assert.equal(750/scale,750);assert.equal(height/scale,height);
 for(const scene of [file==='loadScene'?'assets/scene/LoadScene.scene':'assets/gamescene/NewMainScene.scene']){
  const o=JSON.parse(fs.readFileSync(scene)),bg=o.find(n=>n.__type__==='cc.Node'&&['bg','LobbyBackground'].includes(n._name));
  const size=bg._components.map(r=>o[r.__id__]).find(c=>c.__type__==='cc.UITransform')._contentSize;
  assert(size.width>=750&&size.height>=height,'background covers both supported viewports');
 }
 console.log('PASS',file,750,height,'cold start / inherited policy reset');
}
