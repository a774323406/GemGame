import fs from 'node:fs';
import crypto from 'node:crypto';
import {SceneAuthor,compressUuid,ref,rgba} from './penguin_scene_authoring.mjs';
import {appendSceneGlobals,fitFeedResultOverlay} from './feed_result_layout.mjs';
import {standardizeLobbyCard} from './lobby_card_style.mjs';
export const uuid=name=>{const h=crypto.createHash('sha256').update('GemGame/clayPigeon/'+name).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
export const SCENE_UUID=uuid('ClayPigeonGameScene');
const frame=file=>JSON.parse(fs.readFileSync(file+'.meta')).uuid+'@f9941';
const white=()=>frame('assets/res/foodDeliveryFeed/white.png');
const label=(a,name,parent,str,x,y,w,h,size,extra={})=>a.label(name,parent,str,{x,y,w,h,size,color:rgba(246,255,251),outline:false,bold:false,...extra});
function rect(a,name,parent,x,y,w,h,color=rgba(22,61,59,220)){const n=a.sprite(name,parent,name==='ResultDim'?white():frame('assets/res/newMain/card_round.png'),{x,y,w,h,color});if(name!=='ResultDim')a.objects[a.objects[n]._components.find(r=>a.objects[r.__id__].__type__==='cc.Sprite').__id__]._type=1;return n;}
function button(a,name,parent,str,x,y,w,h){const n=a.sprite(name,parent,frame('assets/res/feedResult/button-orange.png'),{x,y,w,h});label(a,name+'Label',n,str,0,0,w-20,h,30,{bold:true});return a.button(n);}
export function buildClayScene(){
 const source=JSON.parse(fs.readFileSync('assets/gamescene/JuggleBallGameScene.scene'));
 const a=new SceneAuthor([],'clayPigeon'),o=a.objects;
 a.add({__type__:'cc.SceneAsset',_name:'ClayPigeonGameScene',_objFlags:0,__editorExtras__:{},_native:'',scene:ref(1)});
 a.add({...structuredClone(source[1]),_name:'ClayPigeonGameScene',_children:[],_components:[],_globals:null,_id:SCENE_UUID});
 const canvas=a.node('Canvas',1,{x:375,y:812,w:750,h:1624});a.widget(canvas,45);
 const camera=a.node('Camera',canvas,{z:1000,w:1,h:1});o[camera]._layer=1073741824;
 const cam=structuredClone(source.find(v=>v.__type__==='cc.Camera'));delete cam.node;delete cam._id;
 const camId=a.component(camera,'cc.Camera',{...cam,_orthoHeight:812});a.component(canvas,'cc.Canvas',{_cameraComponent:ref(camId),_alignCanvasWithScreen:true});
 // Full-bleed backdrop; gameplay/HUD remain inside a 1334-high safe region.
 const backdrop=a.sprite('Backdrop',canvas,uuid('background.jpg')+'@f9941',{w:750,h:1624});a.widget(backdrop,45);
 const aim=a.node('AimSurface',canvas,{w:750,h:1624});a.widget(aim,45);
 const root=a.node('LayoutRoot',canvas,{w:750,h:1334});
 const gun=a.sprite('Shotgun',root,uuid('gun.png')+'@f9941',{x:165,y:-350,w:448,h:672});
 const drawNode=a.node('FlyingClays',root,{w:750,h:1334});
 const drawing=a.component(drawNode,'cc.Graphics',{_lineWidth:2,_strokeColor:rgba(),_fillColor:rgba(),_lineJoin:2,_lineCap:2,_miterLimit:10});
 // Keep the entire match HUD in the upper-left safe area, clear of platform controls.
 const top=a.node('TopHUD',canvas,{w:350,h:210});a.widget(top,9,{_top:65,_left:32});
 label(a,'MatchCaption',top,'比赛时间 · 十轮380碟',55,76,250,28,18,{align:0});
 const clock=label(a,'Clock',top,'00:00',55,22,250,72,58,{align:0,bold:true});
 const round=label(a,'Round',top,'第 01 / 10 轮',0,-37,330,36,25,{align:0});
 const combo=label(a,'Combo',top,'连中 0    命中 0',0,-77,330,36,24,{align:0});
 // Square sliced artwork avoids squeezing the wide result capsule into a toolbar icon.
 const pauseNode=rect(a,'PauseButton',top,-130,22,80,80);
 for(const x of [-8,8])a.sprite(x<0?'PauseBarLeft':'PauseBarRight',pauseNode,white(),{x,y:0,w:6,h:26});
 const pause=a.button(pauseNode);
 Object.assign(o[pause],{_transition:1,_zoomScale:1,_duration:.08,_normalColor:rgba(22,61,59,220),_hoverColor:rgba(30,78,73,240),_pressedColor:rgba(45,105,96,255)});
 const tip=label(a,'RoundTip',root,'第 1 轮\n热身起飞 · 左右抛物线',0,310,710,90,25,{wrap:true,lineHeight:36,outline:true,outlineColor:rgba(34,64,60),outlineWidth:2});
 const bottom=a.node('BottomHUD',canvas,{w:750,h:250});a.widget(bottom,20,{_bottom:80});
 label(a,'AimHint',bottom,'滑动移动准星\n对准自动开火\n固定霰弹枪 · 多弹丸散射',-183,66,320,100,23,{align:0,wrap:true,lineHeight:33});
 rect(a,'AmmoPanel',bottom,192,65,294,99);
 const status=label(a,'Status',bottom,'瞄准自动射击',192,83,285,35,27);
 const ammo=label(a,'Ammo',bottom,'弹药 28 · 命中 0/20',192,43,285,32,22);
 const stats=[];for(const [i,name,text] of [[0,'Spawned','0 / 20\n已出飞碟'],[1,'Hits','0 / 20\n本轮命中'],[2,'Accuracy','—\n射击命中率']]){const x=(i-1)*232;rect(a,name+'Panel',bottom,x,-58,218,98);stats.push(label(a,name,bottom,text.split('\n')[0],x,-36,208,42,27,{bold:true,color:rgba(255,225,137)}));label(a,name+'Caption',bottom,text.split('\n')[1],x,-80,208,32,21,{color:rgba(205,222,215)});}
 const overlay=a.node('ResultOverlay',canvas,{w:750,h:1624,active:false});rect(a,'ResultDim',overlay,0,0,750,1624,rgba(0,0,0,145));
 const panel=a.node('ResultPanel',overlay,{w:750,h:1624});
 label(a,'Kicker',panel,'飞 碟 射 击',0,550,640,60,42);
 const title=label(a,'ResultTitle',panel,'比赛暂停',0,420,620,165,104);
 const detail=label(a,'ResultDetail',panel,'',0,140,660,310,42,{wrap:true,lineHeight:58});
 const resume=button(a,'ResumeButton',panel,'继续比赛',0,-170,470,138),replay=button(a,'ReplayButton',panel,'重新挑战',0,-335,470,138),home=button(a,'HomeButton',panel,'返回主页',0,-500,470,138);
 const audio=name=>{const n=a.node(name,root);return a.component(n,'cc.AudioSource',{_clip:{__uuid__:uuid(name+'.wav'),__expectedType__:'cc.AudioClip'},_loop:false,_playOnAwake:false,_volume:name==='Shot'?.4:.2});};
 a.component(canvas,compressUuid(uuid('clayPigeonGameScene.ts')),{layoutRoot:ref(root),aimSurface:ref(aim),gun:ref(gun),drawing:ref(drawing),clock:ref(clock.component),roundLabel:ref(round.component),comboLabel:ref(combo.component),tip:ref(tip.component),statusLabel:ref(status.component),ammoLabel:ref(ammo.component),spawnedLabel:ref(stats[0].component),hitsLabel:ref(stats[1].component),accuracyLabel:ref(stats[2].component),pauseButton:ref(pause),resultOverlay:ref(overlay),resultTitle:ref(title.component),resultDetail:ref(detail.component),resumeButton:ref(resume),replayButton:ref(replay),homeButton:ref(home),shotAudio:ref(audio('Shot')),hitAudio:ref(audio('Hit'))});
 o[1]._globals=ref(appendSceneGlobals(source,o));fitFeedResultOverlay(o,'ClayPigeonGameScene');return o;
}
export function appendClayPigeonCard(objects){
 const controller=objects.find(v=>v.gameList&&v.puzzleButton&&v.whiteGooseButton);if(!controller)throw Error('Missing lobby controller');
 const parent=objects[objects[controller.puzzleButton.__id__].node.__id__]._parent.__id__;
 const existing=objects[parent]._children.find(r=>objects[r.__id__]._name==='ClayPigeonCard');if(existing){repairClayCard(objects,existing.__id__);return;}
 const a=new SceneAuthor(objects,'clayLobby'),index=objects[parent]._children.length;
 const card=a.node('ClayPigeonCard',parent,{x:index%2?139:-139,y:-152-Math.floor(index/2)*294,w:252,h:268});
 a.sprite('Preview',card,uuid('preview.jpg')+'@f9941',{x:0,y:25,w:218,h:177});label(a,'Title',card,'飞碟射击',0,-94,230,60,31,{color:rgba(40,40,40)});
 controller.clayPigeonButton=ref(a.button(card));standardizeLobbyCard(objects,card,'飞碟射击');repairClayCard(objects,card);
 objects[objects[parent]._components.find(r=>objects[r.__id__].__type__==='cc.UITransform').__id__]._contentSize.height=18+Math.ceil((index+1)/2)*294-26+14;
}

function repairClayCard(objects,card){
 const a=new SceneAuthor(objects,'clayCardChrome');a.serial=objects.length;
 if(!objects[card]._children.some(r=>objects[r.__id__]._name==='CardSurface')){
  const chrome=[];for(const [name,x,y,w,h,c] of [['CardShadow',6,-8,256,270,rgba(71,184,230,205)],['CardOutline',0,0,256,268,rgba(31,29,30)],['CardSurface',0,0,248,260,rgba(255,255,251)]]){
   const n=a.sprite(name,card,frame('assets/res/newMain/card_round.png'),{x,y,w,h,color:c});objects[objects[n]._components.find(r=>objects[r.__id__].__type__==='cc.Sprite').__id__]._type=1;chrome.push(ref(n));
  }objects[card]._children=[...chrome,...objects[card]._children.filter(r=>!chrome.some(c=>c.__id__===r.__id__))];
 }
 const mask=objects[card]._children.find(r=>objects[r.__id__]._name==='ArtworkMask');const art=objects[mask.__id__]._children.find(r=>objects[r.__id__]._name==='Artwork');
 objects[objects[art.__id__]._components.find(r=>objects[r.__id__].__type__==='cc.Sprite').__id__]._spriteFrame={__uuid__:uuid('preview.jpg')+'@f9941',__expectedType__:'cc.SpriteFrame'};
}
