import { standardizeLobbyCard } from './lobby_card_style.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {SceneAuthor,compressUuid,ref,rgba} from './penguin_scene_authoring.mjs';
import {appendSceneGlobals} from './feed_result_layout.mjs';
export function catUuid(name){const h=crypto.createHash('sha256').update('GemGame/rhythmCatFeed/'+name).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}
export const SCENE_UUID=catUuid('RhythmCatFeedGameScene');
export const SCRIPT_UUID=catUuid('rhythmCatFeedGameScene.ts');
const sf=name=>`${catUuid(name)}@f9941`;
const frame=file=>JSON.parse(fs.readFileSync(file+'.meta')).uuid+'@f9941';
const ink=rgba(117,74,60),pink=rgba(233,78,112);
function text(a,name,parent,str,x,y,w,h,size=26){return a.label(name,parent,str,{x,y,w,h,size,color:ink,outline:false,bold:true});}
function panel(a,name,parent,x,y,w,h,color){const n=a.sprite(name,parent,frame('assets/res/newMain/card_round.png'),{x,y,w,h,color});a.objects[a.objects[n]._components.find(r=>a.objects[r.__id__].__type__==='cc.Sprite').__id__]._type=1;return n;}
function button(a,name,parent,str,x,y,w,h,color){const n=panel(a,name,parent,x,y,w,h,color);text(a,'Caption',n,str,0,0,w-16,h-8,29);return a.button(n);}
export function buildRhythmCatScene(){
 const source=JSON.parse(fs.readFileSync('assets/gamescene/JuggleBallGameScene.scene'));const a=new SceneAuthor([],'rhythmCat'),o=a.objects;
 a.add({__type__:'cc.SceneAsset',_name:'RhythmCatFeedGameScene',_objFlags:0,__editorExtras__:{},_native:'',scene:ref(1)});
 const scene=structuredClone(source[1]);Object.assign(scene,{_name:'RhythmCatFeedGameScene',_children:[],_components:[],_globals:null,_id:SCENE_UUID});a.add(scene);
 const canvas=a.node('Canvas',1,{x:375,y:739.5,w:750,h:1479});const camera=a.node('Camera',canvas,{z:1000,w:1,h:1});o[camera]._layer=1073741824;
 const fields=structuredClone(source.find(v=>v.__type__==='cc.Camera'));delete fields.node;delete fields._id;
 const cc=a.component(camera,'cc.Camera',{...fields,_orthoHeight:739.5});a.component(canvas,'cc.Canvas',{_cameraComponent:ref(cc),_alignCanvasWithScreen:true});a.widget(canvas,45);
 const bg=a.sprite('FullBackground',canvas,sf('background.jpg'),{w:750,h:1479});a.widget(bg,45);
 const root=a.node('LayoutRoot',canvas,{w:576,h:1136,sx:750/576,sy:750/576});
 const background=a.sprite('VideoBackground',root,sf('background.jpg'),{w:576,h:1136});
 const pool=[];for(let i=0;i<96;i++){const n=a.sprite(`Food${i}`,root,sf('brown-pop.png'),{w:46,h:74,active:false});pool.push(o[n]._components.find(r=>o[r.__id__].__type__==='cc.Sprite'));}
 const cats=[];for(let i=0;i<2;i++){const n=a.sprite(i?'WhiteCat':'BlackCat',root,sf(i?'white-idle.png':'black-idle.png'),{x:i?111:-212,y:-156,w:132,h:176});cats.push(o[n]._components.find(r=>o[r.__id__].__type__==='cc.Sprite'));}
 const mouthPoints=cats.map((r,i)=>ref(a.node('MouthPoint',o[r.__id__].node.__id__,{x:i?-11:12,y:3,w:84,h:20})));
 const movementBounds=[-245,-43,43,245].map((x,i)=>ref(a.node(`MovementBound${i}`,root,{x,y:-153,w:1,h:1})));
 const crumbPool=[];for(let i=0;i<24;i++){const n=a.sprite(`Crumb${i}`,root,sf('crumb-brown.png'),{w:13,h:16,active:false});crumbPool.push(o[n]._components.find(r=>o[r.__id__].__type__==='cc.Sprite'));}
 const score=text(a,'Score',root,'分数：0',-180,314,210,46,24);
 const hearts=[];for(let i=0;i<3;i++){const n=a.sprite(`Heart${i}`,root,sf('heart-full.png'),{x:144+i*45,y:314,w:36,h:33});hearts.push(o[n]._components.find(r=>o[r.__id__].__type__==='cc.Sprite'));}
 const feedback=[];for(let i=0;i<2;i++){const t=text(a,`CatchFeedback${i}`,root,'好耶！',-144+i*288,-51,200,40,25);o[t.node]._active=false;feedback.push(ref(t.component));}
 const hint=text(a,'Instruction',root,'左右各用一根手指，拖动猫咪接住冰淇淋',0,-348,544,65,22);
 const surface=a.node('TouchSurface',root,{w:576,h:1136});
 const back=button(a,'BackButton',root,'返回',-230,505,86,48,rgba(252,225,183));
 const audio=a.component(root,'cc.AudioSource',{_clip:{__uuid__:catUuid('track-normal.mp3'),__expectedType__:'cc.AudioClip'},_loop:false,_playOnAwake:false,_volume:1});
 const overlay=a.node('ResultOverlay',canvas,{w:2400,h:3000,active:false});a.widget(overlay,45);a.component(overlay,'cc.BlockInputEvents');
 const shade=a.sprite('Shade',overlay,frame('assets/res/foodDeliveryFeed/white.png'),{w:2400,h:3000,color:rgba(74,47,32,120)});a.widget(shade,45);
 const result=panel(a,'ResultPanel',overlay,0,0,610,610,rgba(255,238,217));
 for(let i=0;i<2;i++)a.sprite(i?'WhiteCat':'BlackCat',result,sf(i?'white-open.png':'black-open.png'),{x:i?92:-92,y:185,w:99,h:132});
 const title=text(a,'ResultTitle',result,'再来一首吧',0,69,540,70,42);
 const resultScore=text(a,'ResultScore',result,'接住了 0 份冰淇淋',0,-5,540,50,29);
 const replay=button(a,'ReplayButton',result,'再来一次',0,-116,420,85,rgba(255,177,188));
 const home=button(a,'HomeButton',result,'返回大厅',0,-217,420,72,rgba(247,215,169));
 const asset=name=>({__uuid__:sf(name),__expectedType__:'cc.SpriteFrame'});
 a.component(canvas,compressUuid(SCRIPT_UUID),{
  layoutRoot:ref(root),background:ref(background),touchSurface:ref(surface),cats,mouthPoints,movementBounds,crumbPool,crumbFrames:[asset('crumb-brown.png'),asset('crumb-pink.png')],catchRadius:52,blackCatCatchBonus:6,lateCatchGrace:.1,dragSensitivity:1.1,fallSpeed:220,foodPool:pool,hearts,feedback,
  catFrames:['black-idle.png','black-open.png','white-idle.png','white-open.png'].map(asset),
  foodFrames:['brown-pop.png','pink-pop.png','brown-cone.png','pink-cone.png','brown-scoop.png','pink-scoop.png','cream-scoop.png'].map(asset),heartFrames:['heart-full.png','heart-empty.png'].map(asset),
  scoreLabel:ref(score.component),hintLabel:ref(hint.component),track:ref(audio),backButton:ref(back),resultOverlay:ref(overlay),resultTitle:ref(title.component),resultScore:ref(resultScore.component),replayButton:ref(replay),homeButton:ref(home),
 });
 o[1]._globals=ref(appendSceneGlobals(source,o));appendRhythmCatSlowdown(o);return o;
}
/** Append only the reward controls; preserve existing editor layout and bindings. */
export function appendRhythmCatSlowdown(objects){
 const c=objects.find(v=>v.catFrames&&v.foodPool);if(!c)throw Error('Cat scene controller missing');
 objects[c.track.__id__]._clip={__uuid__:catUuid('track-normal.mp3'),__expectedType__:'cc.AudioClip'};
 if(c.slowdownBadge)return;
 const a=new SceneAuthor(objects,'rhythmCatSlowdown'),root=c.layoutRoot.__id__;
 a.serial=objects.length;
 const component=(o,n,type)=>o[o[n]._components.find(r=>o[r.__id__].__type__===type).__id__];
 // Reuse the exact sprite, caption and video badge from the referenced delivery game.
 const source=JSON.parse(fs.readFileSync('assets/gamescene/FoodDeliveryFeedGameScene.scene'));
 const sourceNode=source.findIndex(v=>v.__type__==='cc.Node'&&v._name==='SlowdownButton');
 const sourceTitle=source[sourceNode]._children.find(r=>source[r.__id__]._name==='Label').__id__;
 const sourceBadge=source[sourceNode]._children.find(r=>source[r.__id__]._name==='SlowdownAdBadge').__id__;
 const n=c.slowdownButton?objects[c.slowdownButton.__id__].node.__id__:a.sprite('SlowdownButton',root,frame('assets/res/juggleBallGame/slowdown-button.png'));
 const title=c.slowdownTitle?{component:c.slowdownTitle.__id__,node:objects[c.slowdownTitle.__id__].node.__id__}:text(a,'SlowdownTitle',n,'降速',0,-39,56,40.02,25);
 const detail=c.slowdownDetail?{component:c.slowdownDetail.__id__,node:objects[c.slowdownDetail.__id__].node.__id__}:text(a,'SlowdownDetail',root,'',0,-542,390,30,21);
 const copy=(target,original,fields={})=>Object.assign(target,structuredClone(original),{_id:target._id,node:target.node},fields);
 const node=objects[n];node._lpos={__type__:'cc.Vec3',x:0,y:-465,z:0};node._lscale={__type__:'cc.Vec3',x:.8,y:.8,z:1};
 copy(component(objects,n,'cc.UITransform'),component(source,sourceNode,'cc.UITransform'));
 copy(component(objects,n,'cc.Sprite'),component(source,sourceNode,'cc.Sprite'));
 objects[title.node]._lpos=structuredClone(source[sourceTitle]._lpos);
 copy(component(objects,title.node,'cc.UITransform'),component(source,sourceTitle,'cc.UITransform'));
 copy(objects[title.component],component(source,sourceTitle,'cc.Label'));
 // Status sits below the icon and is hidden until loading, reward or cancellation.
 const oldParent=objects[detail.node]._parent.__id__;
 objects[oldParent]._children=objects[oldParent]._children.filter(r=>r.__id__!==detail.node);
 objects[root]._children.push(ref(detail.node));objects[detail.node]._parent=ref(root);
 objects[detail.node]._lpos={__type__:'cc.Vec3',x:0,y:-542,z:0};objects[detail.node]._active=false;
 Object.assign(component(objects,detail.node,'cc.UITransform')._contentSize,{width:390,height:30});
 objects[detail.component]._string='';
 const badge=a.sprite('SlowdownAdBadge',n,frame('assets/res/texture/UIs/ad_badge_cartoon_red.png'));
 objects[badge]._lpos=structuredClone(source[sourceBadge]._lpos);
 copy(component(objects,badge,'cc.UITransform'),component(source,sourceBadge,'cc.UITransform'));
 copy(component(objects,badge,'cc.Sprite'),component(source,sourceBadge,'cc.Sprite'));
 a.component(badge,'cc.UIOpacity',{_opacity:250});
 if(!node._components.some(r=>objects[r.__id__].__type__==='cc.BlockInputEvents'))a.component(n,'cc.BlockInputEvents');
 if(!c.slowdownButton)c.slowdownButton=ref(a.button(n));
 copy(objects[c.slowdownButton.__id__],component(source,sourceNode,'cc.Button'),{_target:ref(n)});
 c.slowdownTitle=ref(title.component);c.slowdownDetail=ref(detail.component);c.slowdownBadge=ref(badge);
 c.slowTrack={__uuid__:catUuid('track-slow.mp3'),__expectedType__:'cc.AudioClip'};
}
export function appendRhythmCatCard(objects){
 const controller=objects.find(v=>v.gameList&&v.puzzleButton&&v.whiteGooseButton);if(!controller)throw Error('Lobby controller missing');
 const sourceCard=objects[objects[controller.puzzleButton.__id__].node.__id__],content=sourceCard._parent.__id__;
 const existing=objects[content]._children.find(r=>objects[r.__id__]._name==='RhythmCatCard');
 if(existing){standardizeLobbyCard(objects,existing.__id__,'节奏猫咪');return;}
 const a=new SceneAuthor(objects,'rhythmCatLobby'),index=objects[content]._children.length;
 const card=a.node('RhythmCatCard',content,{x:index%2?139:-139,y:-152-Math.floor(index/2)*294,w:252,h:268});
 panel(a,'Shadow',card,6,-8,256,270,rgba(71,184,230,205));panel(a,'Outline',card,0,0,256,268,rgba(31,29,30));panel(a,'Surface',card,0,0,248,260,rgba(255,255,251));
 const preview=panel(a,'Preview',card,0,25,218,177,rgba(255,233,213));
 a.sprite('BlackCat',preview,sf('black-open.png'),{x:-51,y:0,w:86,h:114});a.sprite('WhiteCat',preview,sf('white-open.png'),{x:49,y:0,w:86,h:114});
 a.sprite('IceCream',preview,sf('pink-cone.png'),{x:0,y:58,w:25,h:36});text(a,'Title',card,'节奏猫咪',0,-94,230,60,31);
 controller.rhythmCatButton=ref(a.button(card));
 standardizeLobbyCard(objects,card,'节奏猫咪');
 const transform=objects[objects[content]._components.find(r=>objects[r.__id__].__type__==='cc.UITransform').__id__];transform._contentSize.height=18+Math.ceil((index+1)/2)*294-26+14;
}
