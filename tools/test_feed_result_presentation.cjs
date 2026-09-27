const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const source='assets/scripts/feedResultPresentation.ts';
assert(fs.existsSync(source),'A shared result presenter must synchronize artwork and restore gameplay HUD');
class Component {scheduleOnce(f){this.pending=f;}unscheduleAllCallbacks(){this.pending=null;}}
class Label{};class Sprite{};class Node{};class SpriteFrame{};class Widget{};
const decorators={ccclass:()=>c=>c,property:()=>()=>{}};
const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,experimentalDecorators:true,target:ts.ScriptTarget.ES2020}}).outputText,{exports:out,require:n=>({_decorator:decorators,Component,Label,Sprite,Node,SpriteFrame,Widget})});
const p=new out.FeedResultPresentation();
p.titles=[{string:'挑战失败',enabled:true}];p.artworks=[{node:{active:false},spriteFrame:null}];p.successFrame={success:1};p.failureFrame={fail:1};
const hud={isValid:true,active:true},hidden={isValid:true,active:false};p.gameplayHud=[hud,hidden];
p.onEnable();p.pending();assert.equal(hud.active,false);assert.equal(p.titles[0].enabled,false);assert.equal(p.artworks[0].spriteFrame,p.failureFrame);
p.onDisable();assert.equal(hud.active,true);assert.equal(hidden.active,false);
p.titles[0].string='比赛暂停';p.onEnable();p.pending();assert.equal(p.titles[0].enabled,true);assert.equal(p.artworks[0].node.active,false);p.onDisable();
p.titles[0].string='挑战成功';const w={verticalCenter:-0.3,updateAlignment(){}};p.successButtons=[w];p.successLift=0.075;p.onEnable();p.pending();assert.equal(p.artworks[0].spriteFrame,p.successFrame);assert.equal(w.verticalCenter,-0.22499999999999998);p.onDisable();assert.equal(w.verticalCenter,-0.3);
console.log('PASS result heading state, pause fallback, HUD restore and re-entry');
