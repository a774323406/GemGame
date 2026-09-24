import fs from 'node:fs';
import crypto from 'node:crypto';
import { SceneAuthor, compressUuid, ref, rgba } from './penguin_scene_authoring.mjs';
import { appendSceneGlobals } from './feed_result_layout.mjs';
import { standardizeLobbyCard } from './lobby_card_style.mjs';
export const uuid=name=>{const h=crypto.createHash('sha256').update('GemGame/motoRace/'+name).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
export const SCENE_UUID=uuid('MotoRaceGameScene');
const frame=file=>`${JSON.parse(fs.readFileSync(file+'.meta')).uuid}@f9941`;
const white=()=>frame('assets/res/foodDeliveryFeed/white.png');
function rect(a,name,parent,x,y,w,h,c,round=false){const n=a.sprite(name,parent,round?frame('assets/res/newMain/card_round.png'):white(),{x,y,w,h,color:c});if(round)a.objects[a.objects[n]._components.find(r=>a.objects[r.__id__].__type__==='cc.Sprite').__id__]._type=1;return n;}
function label(a,name,parent,str,x,y,w,h,size,c=rgba(),extra={}){return a.label(name,parent,str,{x,y,w,h,size,color:c,outline:false,...extra});}
function graphics(a,name,parent,w=750,h=1334){const n=a.node(name,parent,{w,h});return a.component(n,'cc.Graphics',{_lineWidth:2,_strokeColor:rgba(),_fillColor:rgba(),_lineJoin:2,_lineCap:2,_miterLimit:10});}
function button(a,name,parent,str,x,y,w,h,size=28,background=false){const n=background?rect(a,name,parent,x,y,w,h,rgba(48,78,87,245),true):a.node(name,parent,{x,y,w,h});const text=label(a,name+'Label',n,str,0,0,w,h,size);return {node:n,component:a.button(n),label:text.component};}
export function buildMotoScene(){
 const source=JSON.parse(fs.readFileSync('assets/gamescene/JuggleBallGameScene.scene'));
 const a=new SceneAuthor([],'motoRace'),o=a.objects;
 a.add({__type__:'cc.SceneAsset',_name:'MotoRaceGameScene',_objFlags:0,__editorExtras__:{},_native:'',scene:ref(1)});
 a.add({...structuredClone(source[1]),_name:'MotoRaceGameScene',_children:[],_components:[],_globals:null,_id:SCENE_UUID});
 const canvas=a.node('Canvas',1,{x:375,y:812,w:750,h:1624});
 const camera=a.node('Camera',canvas,{z:1000,w:1,h:1});o[camera]._layer=1073741824;
 const cam=structuredClone(source.find(v=>v.__type__==='cc.Camera'));delete cam.node;delete cam._id;
 const camId=a.component(camera,'cc.Camera',{...cam,_orthoHeight:812});a.component(canvas,'cc.Canvas',{_cameraComponent:ref(camId),_alignCanvasWithScreen:true});a.widget(canvas,45);
 const bg=rect(a,'Backdrop',canvas,0,0,2400,3000,rgba(101,165,197));a.widget(bg,45);
 const root=a.node('LayoutRoot',canvas,{w:750,h:1334});
 const world=graphics(a,'RoadWorld',root);const artRoot=a.node('SpriteArtwork',root,{w:750,h:1334});const hud=graphics(a,'HudShapes',root);
 const armor=label(a,'Armor',root,'护甲                         100\n击倒 ×0',-193,590,265,78,23,rgba(245,248,244),{align:0,wrap:true,lineHeight:36,bold:false});
 const rank=label(a,'Rank',root,'第12名',239,609,194,44,37,rgba(255,218,94));
 const time=label(a,'Time',root,'0.0 秒',239,565,185,33,23,rgba(239,241,227),{bold:false});
 label(a,'Finish',root,'终点',195,431,60,30,19,rgba(255,226,113));
 const pause=button(a,'PauseButton',root,'Ⅱ',317,425,76,76,32);
 const back=button(a,'BackButton',root,'‹',-322,425,76,76,50);
 const speed=label(a,'Speed',root,'0 km/h',-193,490,265,40,31,rgba(245,248,244),{align:0});
 const distance=label(a,'SpeedUnit',root,'里程 0 / 10000 米',-193,535,265,32,21,rgba(225,237,223),{bold:false,align:0});
 const punch=button(a,'PunchButton',root,'拳',-259,-443,124,124,40);
 const kick=button(a,'KickButton',root,'踢',-259,-589,124,124,40);
 const pad=a.node('SteeringPad',root,{x:235,y:-557,w:210,h:210});
 const knob=rect(a,'SteeringKnob',pad,0,0,73,73,rgba(233,239,240,65),true);
 label(a,'SteeringHint',pad,'‹               ›',0,0,180,70,29,rgba(255,255,255,135));
 const message=label(a,'Message',root,'',0,-177,690,58,24,rgba(255,251,225),{wrap:true});
 const countdown=label(a,'Countdown',root,'3',0,180,550,150,105,rgba(255,242,188),{outline:true,outlineColor:rgba(43,74,77,150),outlineWidth:4});
 const overlay=a.node('Overlay',root,{w:750,h:1334,active:false});a.component(overlay,'cc.BlockInputEvents');
 rect(a,'Dimmer',overlay,0,0,2400,3000,rgba(15,28,37,185));
 const panel=rect(a,'Panel',overlay,0,0,596,720,rgba(240,245,236),true);
 label(a,'Kicker',panel,'狂  暴  摩  托',0,284,510,45,25,rgba(72,107,98));
 const title=label(a,'ResultTitle',panel,'比赛暂停',0,210,520,80,50,rgba(39,61,68));
 const detail=label(a,'ResultDetail',panel,'',0,69,510,164,29,rgba(69,89,93),{wrap:true,lineHeight:49,bold:false});
 const resume=button(a,'ResumeButton',panel,'继续比赛',0,-82,440,83,31,true);
 const replay=button(a,'ReplayButton',panel,'重新比赛',0,-181,440,83,31,true);
 const home=button(a,'HomeButton',panel,'返回大厅',0,-280,440,83,31,true);
 const audio=(name,loop)=>{const n=a.node(name,root);return a.component(n,'cc.AudioSource',{_clip:{__uuid__:uuid(name+'.wav'),__expectedType__:'cc.AudioClip'},_loop:loop,_playOnAwake:false,_volume:loop?.12:.4});};
 a.component(canvas,compressUuid(uuid('motoRaceGameScene.ts')),{layoutRoot:ref(root),world:ref(world),artRoot:ref(artRoot),riderAtlas:{__uuid__:uuid('riders-atlas.png')+'@6c48a',__expectedType__:'cc.Texture2D'},hud:ref(hud),armorLabel:ref(armor.component),rankLabel:ref(rank.component),timeLabel:ref(time.component),speedLabel:ref(speed.component),distanceLabel:ref(distance.component),messageLabel:ref(message.component),countdownLabel:ref(countdown.component),steeringPad:ref(pad),steeringKnob:ref(knob),punchButton:ref(punch.component),kickButton:ref(kick.component),pauseButton:ref(pause.component),backButton:ref(back.component),overlay:ref(overlay),resultTitle:ref(title.component),resultDetail:ref(detail.component),resumeLabel:ref(resume.label),resumeButton:ref(resume.component),replayButton:ref(replay.component),homeButton:ref(home.component),engineSound:ref(audio('Engine',true)),hitSound:ref(audio('Hit',false))});
 o[1]._globals=ref(appendSceneGlobals(source,o));return o;
}
export function appendMotoCard(objects){
 const controller=objects.find(v=>v.gameList&&v.puzzleButton&&v.whiteGooseButton);if(!controller)throw Error('Missing lobby controller');
 const contentId=objects[objects[controller.puzzleButton.__id__].node.__id__]._parent.__id__;
 if(objects[contentId]._children.some(r=>objects[r.__id__]._name==='MotoRaceCard'))return;
 const a=new SceneAuthor(objects,'motoLobby'),index=objects[contentId]._children.length;
 const card=a.node('MotoRaceCard',contentId,{x:index%2?139:-139,y:-152-Math.floor(index/2)*294,w:252,h:268});
 rect(a,'CardShadow',card,6,-8,256,270,rgba(71,184,230,205),true);
 rect(a,'CardOutline',card,0,0,256,268,rgba(31,29,30),true);
 rect(a,'CardSurface',card,0,0,248,260,rgba(255,255,251),true);
 const preview=rect(a,'Preview',card,0,25,218,177,rgba(123,188,229));
 rect(a,'Grass',preview,0,-48,218,80,rgba(91,178,71));
 // Tapered road thumbnail uses a rotated square clipped by the card artwork mask.
 const road=rect(a,'Road',preview,0,-65,115,165,rgba(91,93,103));objects[road]._lscale.x=1;
 for(const x of [-35,35])for(const y of [-70,-26,18])rect(a,'Lane',preview,x,y,3,20,rgba(246,244,229));
 for(const x of [-84,84])label(a,'Pine',preview,'▲',x,0,49,85,65,rgba(46,135,55));
 rect(a,'Wheel',preview,0,-50,12,35,rgba(28,35,45),true);
 rect(a,'Rider',preview,0,-22,31,45,rgba(215,52,57),true);
 rect(a,'Helmet',preview,0,9,23,20,rgba(242,244,240),true);
 rect(a,'Visor',preview,0,8,23,6,rgba(40,59,72));
 if(fs.existsSync('assets/res/motoRace/rider-preview.png.meta')) {
  for(const r of a.objects[preview]._children)if(['Wheel','Rider','Helmet','Visor'].includes(a.objects[r.__id__]._name))a.objects[r.__id__]._active=false;
  a.sprite('RiderArtwork',preview,uuid('rider-preview.png')+'@f9941',{x:0,y:8,w:184,h:184});
 }
 label(a,'Title',card,'狂暴摩托',0,-94,230,60,31,rgba(40,40,40));
 controller.motoRaceButton=ref(a.button(card));standardizeLobbyCard(objects,card,'狂暴摩托');
 const transform=objects[objects[contentId]._components.find(r=>objects[r.__id__].__type__==='cc.UITransform').__id__];
 transform._contentSize.height=18+Math.ceil((index+1)/2)*294-26+14;
}
