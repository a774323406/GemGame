const assert = require('node:assert/strict');
const fs = require('node:fs');
const names=['JuggleBallGameScene','PenguinStackFeedGameScene','ShootingGlassBottlesGame','FoodDeliveryFeedGameScene','WhiteGooseFeedGameScene','RhythmCatFeedGameScene','MathExamFeedGameScene','MotoRaceGameScene'];
function check(o,name) {
 const id=n=>o.findIndex(v=>v.__type__==='cc.Node'&&v._name===n);
 const comp=(i,t)=>o[i]._components.map(r=>o[r.__id__]).find(v=>v.__type__===t);
 const overlay=id(name==='MotoRaceGameScene'?'Overlay':'ResultOverlay');
 assert(overlay>=0,name);
 assert(comp(o[overlay]._parent.__id__,'cc.Canvas'),name+' overlay must be attached to Canvas');
 assert(comp(overlay,'cc.BlockInputEvents'),name+' must block gameplay input');
 const stretch=i=>{const w=comp(i,'cc.Widget');assert(w?._enabled&&w._alignFlags===45,name+' must stretch');for(const k of ['_left','_right','_top','_bottom'])assert.equal(w[k],0);};
 stretch(overlay);
 if(name==='JuggleBallGameScene'){assert(!comp(overlay,'cc.Sprite')._enabled,'dim must not fade result children');assert.equal(o[o[overlay]._children[0].__id__]._name,'ResultDim');}
 const descendants=[];function visit(i){descendants.push(i);for(const r of o[i]._children||[])visit(r.__id__);}visit(overlay);
 for(const i of descendants){
  if(['ResultPanel','CuteResultPanel','Panel'].includes(o[i]._name)){
   stretch(i);for(const t of ['cc.Sprite','cc.Graphics'])assert(!comp(i,t)?._enabled,name+' must not draw a popup panel');
   assert.equal(o[i]._lscale.x,1);assert.equal(o[i]._lscale.y,1);
  }
  assert(o[i]._name!=='ShareButton'||!o[i]._active,'penguin sharing must be removed');
  if(comp(i,'cc.Button')){
   const w=comp(i,'cc.Widget'),s=comp(i,'cc.UITransform')._contentSize;
   assert(w&&w._alignFlags===18&&w._isAbsVerticalCenter===false,name+' button uses relative vertical layout: '+o[i]._name);
   for(const height of [1200,1334,1624,1800]){
    const center=w._verticalCenter*height;
    assert(center-s.height/2>=-height/2+24&&center+s.height/2<=height/2-24,name+' button stays inside screen');
   }
  }
 }
 const presenter=o.find(v=>v.titles&&v.artworks&&v.gameplayHud);
 assert(presenter&&presenter.titles.length===presenter.artworks.length,name+' heading bindings');
 assert(presenter.gameplayHud.length>0,name+' gameplay HUD must be restored by presentation lifecycle');
 for(const r of presenter.artworks){const sprite=o[r.__id__],node=sprite.node.__id__;assert(comp(node,'cc.UITransform')._contentSize.width>=560,name+' needs large reference-style title art');}
 for(const i of descendants){
  if(['Mask','Shade','Dimmer','DimBackground','ResultDim','ResultDimBackground'].includes(o[i]._name)){
   const sprite=comp(i,'cc.Sprite'),opacity=comp(i,'cc.UIOpacity');
   assert.deepEqual([sprite._color.r,sprite._color.g,sprite._color.b],[0,0,0]);
   assert.equal(opacity?opacity._opacity:sprite._color.a,145,name+' one consistent black dim opacity');
  }
 }
 const allRefs=v=>{if(!v||typeof v!=='object')return;if(Number.isInteger(v.__id__))assert(o[v.__id__],name+' dangling serialized reference');else for(const x of Object.values(v))allRefs(x);};allRefs(o);
}
(async()=>{
 const {fitFeedResultOverlay}=await import('./feed_result_layout.mjs');
 for(const name of names){const o=JSON.parse(fs.readFileSync(`assets/gamescene/${name}.scene`));check(o,name);const before=JSON.stringify(o);fitFeedResultOverlay(o,name);assert.equal(JSON.stringify(o),before,name+' authoring must be idempotent');console.log('PASS '+name);}
 for(const [file,fn,name] of [['food_delivery','buildFoodDeliveryScene',names[3]],['white_goose','buildWhiteGooseScene',names[4]],['rhythm_cat','buildRhythmCatScene',names[5]],['math_exam','buildMathExamScene',names[6]],['moto_race','buildMotoScene',names[7]]]){const mod=await import(`./${file}_authoring.mjs`);check(mod[fn](),name);}
 const p=fs.readFileSync('tools/build_penguin_scene.mjs','utf8');assert(!p.includes('ShareButton')&&!p.includes('shareButton:'));
 assert(fs.readFileSync('tools/build_shooting_scene.mjs','utf8').includes('resultRestartButton: ref(resultRestartButton)'));
 console.log('PASS rebuilt layouts and retained actions');
})().catch(e=>{console.error(e);process.exitCode=1;});
