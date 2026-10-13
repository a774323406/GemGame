import fs from 'node:fs';
import crypto from 'node:crypto';
import {SceneAuthor,compressUuid,ref,rgba} from './penguin_scene_authoring.mjs';
import {appendSceneGlobals,fitFeedResultOverlay} from './feed_result_layout.mjs';
import {standardizeLobbyCard} from './lobby_card_style.mjs';
export const uuid=name=>{const h=crypto.createHash('sha256').update('GemGame/driftFeed/'+name).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
export const SCENE_UUID=uuid('DriftFeedGameScene');
const frame=file=>JSON.parse(fs.readFileSync(file+'.meta')).uuid+'@f9941';
const white=()=>frame('assets/res/foodDeliveryFeed/white.png');
const asset=name=>frame('assets/res/driftFeed/'+name);
function label(a,n,p,t,y,size=36,w=650,h=65){return a.label(n,p,t,{y,w,h,size,outlineColor:rgba(28,43,44),outlineWidth:3});}
function button(a,n,p,t,y,color='orange'){const b=a.sprite(n,p,frame(`assets/res/feedResult/button-${color}.png`),{y,w:470,h:138});label(a,n+'Label',b,t,0,48,410,80);return a.button(b);}
export function buildDriftFeedScene(){
 const src=JSON.parse(fs.readFileSync('assets/gamescene/JuggleBallGameScene.scene'));
 const a=new SceneAuthor([],'driftFeed'),o=a.objects;
 a.add({__type__:'cc.SceneAsset',_name:'DriftFeedGameScene',_objFlags:0,__editorExtras__:{},_native:'',scene:ref(1)});
 a.add({...structuredClone(src[1]),_name:'DriftFeedGameScene',_children:[],_components:[],_globals:null,_id:SCENE_UUID});
 const canvas=a.node('Canvas',1,{x:375,y:812,w:750,h:1624});a.widget(canvas,45);
 const camera=a.node('Camera',canvas,{z:1000,w:1,h:1});o[camera]._layer=1073741824;
 const c=structuredClone(src.find(v=>v.__type__==='cc.Camera'));delete c.node;delete c._id;
 const cam=a.component(camera,'cc.Camera',{...c,_orthoHeight:812});a.component(canvas,'cc.Canvas',{_cameraComponent:ref(cam),_alignCanvasWithScreen:true});
 const bg=a.sprite('Background',canvas,white(),{w:750,h:1624,color:rgba(114,165,103)});a.widget(bg,45);
 const input=a.node('DriveSurface',canvas,{w:750,h:1624});a.widget(input,45);
 const world=a.node('World',canvas,{w:750,h:1624});
 const hud=a.node('HUD',canvas,{w:750,h:250});a.widget(hud,17,{_top:75});
 const score=label(a,'Score',hud,'0',-16,90,400,110);
 const best=label(a,'Best',hud,'最佳 0 弯',-92,26);
 const pauseNode=a.sprite('PauseButton',hud,frame('assets/res/newMain/card_round.png'),{x:-292,y:45,w:74,h:74,color:rgba(29,50,52,210)});label(a,'PauseCaption',pauseNode,'Ⅱ',0,40,70,70);const pause=a.button(pauseNode);
 const guide=a.node('Guide',canvas,{w:710,h:140});a.widget(guide,20,{_bottom:110});
 const hint=label(a,'Hint',guide,'按住漂移 · 松手出弯',30,40,710,70);label(a,'SubHint',guide,'挑战连续过弯纪录',-30,27);
 const message=label(a,'Message',canvas,'',160,55,700,120);
 const overlay=a.node('ResultOverlay',canvas,{w:750,h:1624,active:false});
 a.sprite('ResultDim',overlay,white(),{w:750,h:1624,color:rgba(0,0,0,145)});
 const panel=a.node('ResultPanel',overlay,{w:750,h:1624});label(a,'Kicker',panel,'拉 索 漂 移',550,42);
 const title=label(a,'ResultTitle',panel,'挑战失败',400,104,620,165);
 const detail=label(a,'ResultDetail',panel,'本次通过 0 弯\n最佳纪录 0 弯',145,42,660,240);o[detail.component]._enableWrapText=true;
 const revive=button(a,'ReviveButton',panel,'复活继续',-180),retry=button(a,'RetryButton',panel,'重新挑战',-345,'blue'),home=button(a,'HomeButton',panel,'返回主页',-510);
 a.sprite('VideoBadge',o[revive].node.__id__,frame('assets/res/penguinStackFeed/video-badge.png'),{x:-150,w:72,h:52});
 const clip=n=>({__uuid__:uuid(n+'.wav'),__expectedType__:'cc.AudioClip'});
 const ctrl=a.component(canvas,compressUuid(uuid('driftFeedGameScene.ts')),{world:ref(world),background:ref(o[bg]._components.find(r=>o[r.__id__].__type__==='cc.Sprite').__id__),driveSurface:ref(input),hud:ref(hud),guide:ref(guide),scoreLabel:ref(score.component),bestLabel:ref(best.component),hintLabel:ref(hint.component),messageLabel:ref(message.component),pauseButton:ref(pause),resultOverlay:ref(overlay),resultTitle:ref(title.component),resultDetail:ref(detail.component),reviveButton:ref(revive),retryButton:ref(retry),homeButton:ref(home),roadFrames:['road_straight_600','road_left_90_r300','road_180_r300'].map(n=>({__uuid__:asset('road/'+n+'.png'),__expectedType__:'cc.SpriteFrame'})),arrowFrame:{__uuid__:asset('road/speed-arrow.png'),__expectedType__:'cc.SpriteFrame'},carFrame:{__uuid__:asset('car/player-car.png'),__expectedType__:'cc.SpriteFrame'},audioClips:['engine','drift','attach','score','boost','crash'].map(clip).concat([{__uuid__:JSON.parse(fs.readFileSync('assets/res/sound/getUserBgm.mp3.meta')).uuid,__expectedType__:'cc.AudioClip'}])});
 o[1]._globals=ref(appendSceneGlobals(src,o));fitFeedResultOverlay(o,'DriftFeedGameScene');
 // Shared defaults use orange; this game's replay stays blue.
 o[o[o[retry].node.__id__]._components.find(r=>o[r.__id__].__type__==='cc.Sprite').__id__]._spriteFrame={__uuid__:frame('assets/res/feedResult/button-blue.png'),__expectedType__:'cc.SpriteFrame'};
 return o;
}
export function appendDriftCard(o){
 const ctrl=o.find(x=>x.gameList&&x.puzzleButton);if(!ctrl)throw Error('Lobby controller missing');
 if(ctrl.driftButton){repairDriftCard(o,o[ctrl.driftButton.__id__].node.__id__);return;}
 const parent=o[o[ctrl.puzzleButton.__id__].node.__id__]._parent.__id__,a=new SceneAuthor(o,'driftLobby');a.serial=o.length;
 const i=o[parent]._children.length,card=a.node('DriftCard',parent,{x:i%2?139:-139,y:-152-Math.floor(i/2)*294,w:252,h:268});
 a.sprite('Preview',card,asset('road/road_straight_600.png'),{y:25,w:218,h:177});label(a,'Title',card,'漂移',-94,31,230,60);ctrl.driftButton=ref(a.button(card));
 standardizeLobbyCard(o,card,'漂移');
 repairDriftCard(o,card);
 const mask=o[card]._children.find(r=>o[r.__id__]._name==='ArtworkMask');
 if(mask){const art=o[mask.__id__]._children.find(r=>o[r.__id__]._name==='Artwork');o[o[art.__id__]._components.find(r=>o[r.__id__].__type__==='cc.Sprite').__id__]._spriteFrame={__uuid__:asset('road/road_straight_600.png'),__expectedType__:'cc.SpriteFrame'};}
 if(mask)a.sprite('OrangeCar',mask.__id__,asset('car/player-car.png'),{w:76,h:144});
 const ui=o[o[parent]._components.find(r=>o[r.__id__].__type__==='cc.UITransform').__id__];ui._contentSize.height=18+Math.ceil((i+1)/2)*294-26+14;
}

// Existing editor-authored cards and newly generated cards use identical chrome.
function repairDriftCard(o,card){
 const a=new SceneAuthor(o,'driftCardChrome');a.serial=o.length;
 if(!o[card]._children.some(r=>o[r.__id__]._name==='CardSurface')){
  const chrome=[];
  for(const [name,x,y,w,h,color] of [
   ['CardShadow',6,-8,256,270,rgba(71,184,230,205)],
   ['CardOutline',0,0,256,268,rgba(31,29,30)],
   ['CardSurface',0,0,248,260,rgba(255,255,251)],
  ]){
   const node=a.sprite(name,card,frame('assets/res/newMain/card_round.png'),{x,y,w,h,color});
   o[o[node]._components.find(r=>o[r.__id__].__type__==='cc.Sprite').__id__]._type=1;
   chrome.push(ref(node));
  }
  o[card]._children=[...chrome,...o[card]._children.filter(r=>!chrome.some(c=>c.__id__===r.__id__))];
 }
 const plaque=o[card]._children.find(r=>o[r.__id__]._name==='TitlePlaque');
 const title=o[plaque.__id__]._children.find(r=>o[r.__id__]._name==='GameName');
 o[o[title.__id__]._components.find(r=>o[r.__id__].__type__==='cc.Label').__id__]._string='漂移';
}
