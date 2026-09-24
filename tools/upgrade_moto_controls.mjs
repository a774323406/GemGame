import fs from 'node:fs';
import {SceneAuthor,ref,rgba} from './penguin_scene_authoring.mjs';
const file='assets/gamescene/MotoRaceGameScene.scene',o=JSON.parse(fs.readFileSync(file));
const c=o.find(v=>v.steeringPad&&v.world),root=c.layoutRoot.__id__,a=new SceneAuthor(o,'motoControls');
const pad=c.steeringPad.__id__,padTransform=o[o[pad]._components.find(r=>o[r.__id__].__type__==='cc.UITransform').__id__];
o[pad]._lpos.x=0;o[pad]._lpos.y=0;padTransform._contentSize.width=750;padTransform._contentSize.height=4000;
for(const ch of o[pad]._children)o[ch.__id__]._active=false;
o[root]._children=[ref(pad),...o[root]._children.filter(r=>r.__id__!==pad)];
const pause=o[o[c.pauseButton.__id__].node.__id__];pause._lpos.x=-322;pause._lpos.y=724;
o[o[c.backButton.__id__].node.__id__]._active=false;
if(!c.boostButton){
 const texture=JSON.parse(fs.readFileSync('assets/res/newMain/card_round.png.meta')).uuid+'@f9941';
 const n=a.sprite('BoostButton',root,texture,{x:252,y:-162,w:190,h:86,color:rgba(39,101,124,240)});
 const sp=o[o[n]._components.find(r=>o[r.__id__].__type__==='cc.Sprite').__id__];sp._type=1;
 c.boostButton=ref(a.button(n));
 const title=a.label('BoostTitle',n,'看广告加速',{x:0,y:10,w:182,h:34,size:25,color:rgba(255,239,184),outline:false});
 c.boostTitle=ref(title.component);
 a.label('BoostDetail',n,'无敌冲刺 600米',{x:0,y:-23,w:182,h:26,size:19,color:rgba(238,249,251),outline:false});
 // Controls stay behind the existing pause/result overlay.
 o[root]._children=o[root]._children.filter(r=>r.__id__!==n);o[root]._children.splice(o[root]._children.findIndex(r=>r.__id__===c.overlay.__id__),0,ref(n));
}
// Match the cat game's illustrated reward button; all layout stays scene-authored.
if(!c.boostBadge){
 a.serial=o.length;
 const source=JSON.parse(fs.readFileSync('assets/gamescene/RhythmCatFeedGameScene.scene'));
 const sc=source.find(v=>v.slowdownButton&&v.slowdownBadge);
 const component=(list,n,type)=>list[list[n]._components.find(r=>list[r.__id__].__type__===type).__id__];
 const copy=(target,original)=>Object.assign(target,structuredClone(original),{_id:target._id,node:target.node});
 const n=o[c.boostButton.__id__].node.__id__,sn=source[sc.slowdownButton.__id__].node.__id__;
 for(const type of ['cc.UITransform','cc.Sprite'])copy(component(o,n,type),component(source,sn,type));
 const title=o[c.boostTitle.__id__].node.__id__,st=source[sc.slowdownTitle.__id__].node.__id__;
 o[title]._lpos=structuredClone(source[st]._lpos);
 copy(component(o,title,'cc.UITransform'),component(source,st,'cc.UITransform'));
 copy(o[c.boostTitle.__id__],source[sc.slowdownTitle.__id__]);o[c.boostTitle.__id__]._string='加速';
 const badge=a.node('BoostAdBadge',n),sb=sc.slowdownBadge.__id__;
 o[badge]._lpos=structuredClone(source[sb]._lpos);
 copy(component(o,badge,'cc.UITransform'),component(source,sb,'cc.UITransform'));
 const sprite=a.component(badge,'cc.Sprite');copy(o[sprite],component(source,sb,'cc.Sprite'));
 a.component(badge,'cc.UIOpacity',{_opacity:250});a.component(n,'cc.BlockInputEvents');
 c.boostBadge=ref(badge);
 const detail=o[n]._children.find(r=>o[r.__id__]._name==='BoostDetail').__id__;
 o[detail]._lpos.y=-88;o[detail]._active=false;
 c.boostDetail=ref(o[detail]._components.find(r=>o[r.__id__].__type__==='cc.Label').__id__);
 o[c.boostDetail.__id__]._string='';o[c.boostDetail.__id__]._enableOutline=true;
 o[c.boostDetail.__id__]._outlineColor=rgba(30,45,54);o[c.boostDetail.__id__]._outlineWidth=2;
}
// Keep the rank/time group below the progress bar, editable in the scene.
if(!o.some(v=>v._name==='RankPanel')){
 const rank=o[o[c.rankLabel.__id__].node.__id__],time=o[o[c.timeLabel.__id__].node.__id__];
 rank._lpos.x=-241;rank._lpos.y=374;time._lpos.x=-241;time._lpos.y=330;
 a.serial=o.length;
 const texture=JSON.parse(fs.readFileSync('assets/res/newMain/card_round.png.meta')).uuid+'@f9941';
 const panel=a.sprite('RankPanel',root,texture,{x:-241,y:355,w:198,h:94,color:rgba(29,51,63,150)});
 o[o[panel]._components.find(r=>o[r.__id__].__type__==='cc.Sprite').__id__]._type=1;
 o[root]._children=o[root]._children.filter(r=>r.__id__!==panel);
 o[root]._children.splice(o[root]._children.findIndex(r=>r.__id__===o[c.rankLabel.__id__].node.__id__),0,ref(panel));
}
if(!c.music){
 a.serial=o.length;
 const n=a.node('Music',root);
 const clip=JSON.parse(fs.readFileSync('assets/res/sound/bgm.mp3.meta')).uuid;
 c.music=ref(a.component(n,'cc.AudioSource',{_clip:{__uuid__:clip,__expectedType__:'cc.AudioClip'},_loop:true,_playOnAwake:false,_volume:.7}));
}
if(c.engineSound){
 const engine=o[c.engineSound.__id__];engine._clip=null;engine._enabled=false;o[engine.node.__id__]._active=false;delete c.engineSound;
}
o[c.music.__id__]._clip.__uuid__=JSON.parse(fs.readFileSync('assets/res/sound/bgm.mp3.meta')).uuid;
fs.writeFileSync(file,JSON.stringify(o,null,2)+'\n');
