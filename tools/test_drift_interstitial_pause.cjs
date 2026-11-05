// Offline controller behavior; no native ad requests.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
let interstitial=true,rewarded=false;const out={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/scripts/driftFeedGameScene.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText,{exports:out,require:n=>n==='cc'?{_decorator:{ccclass:()=>x=>x,property:()=>()=>{}},Component:class{}}:n.endsWith('SdkUtils')?{SdkUtils:{isFullscreenAdBusy:()=>interstitial||rewarded,isInterstitialBusy:()=>interstitial}}:{}});
const g=Object.create(out.driftFeedGameScene.prototype);Object.assign(g,{disposed:false,leaving:false,hidden:false,paused:false,feed:false,gate:{busy:false},touchId:12,run:{snapshot:{phase:'driving'},setPressed(value){this.pressed=value}},audio:{setSuspended(value){this.suspended=value}},resultOverlay:{active:false},showResult(pause){this.resultOverlay.active=true;this.pauseShown=pause;}});
assert.equal(g.blocked(),false,'request/loading must not silently freeze driving');
g.onInterstitialShown?.();assert.equal(g.paused,false,'interstitial must not open pause');assert.equal(g.resultOverlay.active,false);assert.equal(g.touchId,12);
interstitial=false;assert.equal(g.blocked(),false,'closing ad keeps driving');
rewarded=true;assert.equal(g.blocked(),true);rewarded=false;
g.setPaused(true);assert.equal(g.blocked(),true,'manual pause remains supported');g.requestRevive();assert.equal(g.paused,false);
g.hidden=true;assert.equal(g.blocked(),true,'background remains blocked');
console.log('PASS interstitial loading/show/close keeps driving; rewarded, manual and background pause preserved');
