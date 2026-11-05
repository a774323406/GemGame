import fs from 'node:fs';
import {SceneAuthor,compressUuid,ref,rgba,vec} from './feed_scene_authoring.mjs';
import {appendSceneGlobals,fitFeedResultOverlay} from './feed_result_layout.mjs';
import {standardizeLobbyCard} from './lobby_card_style.mjs';
import {uuid,SCENE_UUID} from './brick_chop_ids.mjs';
export {uuid,SCENE_UUID};
const frame=p=>JSON.parse(fs.readFileSync(p+'.meta')).uuid+'@f9941';
const art=n=>frame('assets/res/brickChopFeed/'+n);
const component=(o,id,type)=>o[id]._components.map(r=>r.__id__).find(i=>o[i].__type__===type);
function cloneNode(src,o,root){
 const ids=[];function walk(id){ids.push(id);for(const r of src[id]._components)ids.push(r.__id__);for(const r of src[id]._children)walk(r.__id__);}walk(root);
 const map=new Map(ids.map((id,i)=>[id,o.length+i]));
 function remap(v){if(Array.isArray(v))return v.map(remap);if(!v||typeof v!=='object')return v;if(Number.isInteger(v.__id__))return map.has(v.__id__)?ref(map.get(v.__id__)):null;return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,remap(x)]));}
 for(const id of ids){const c=remap(src[id]);if(c._id)c._id='brickClone_'+map.get(id);o.push(c);}return map.get(root);
}
export function buildBrickChopScene(){
 const src=JSON.parse(fs.readFileSync('assets/gamescene/FoodDeliveryFeedGameScene.scene'));
 const a=new SceneAuthor([],'brickChop'),o=a.objects;
 a.add({__type__:'cc.SceneAsset',_name:'BrickChopFeedGameScene',_objFlags:0,__editorExtras__:{},_native:'',scene:ref(1)});
 a.add({...structuredClone(src[1]),_name:'BrickChopFeedGameScene',_children:[],_components:[],_globals:null,_id:SCENE_UUID});
 const canvas=a.node('Canvas',1,{x:375,y:812,w:750,h:1624});a.widget(canvas,45);
 const camera=a.node('Camera',canvas,{z:1000,w:1,h:1});o[camera]._layer=1073741824;
 const cam=structuredClone(src.find(v=>v.__type__==='cc.Camera'));delete cam.node;delete cam._id;
 const camId=a.component(camera,'cc.Camera',{...cam,_orthoHeight:812});a.component(canvas,'cc.Canvas',{_cameraComponent:ref(camId),_alignCanvasWithScreen:true});
 const bg=a.sprite('Hall',canvas,art('background.jpg'),{w:750,h:1624});a.widget(bg,45);
 const surface=a.node('TapSurface',canvas,{w:750,h:1624});a.widget(surface,45);
 const impactRoot=a.node('ImpactRoot',canvas,{w:750,h:1624});
 const bricks=[],leftPieces=[],rightPieces=[],dust=[];
 for(let i=0;i<12;i++)bricks.push(a.sprite('Brick'+i,impactRoot,art('brick.png'),{y:-536+i*34,w:240,h:76,ay:0}));
 for(let i=0;i<12;i++){
  leftPieces.push(a.sprite('LeftPiece'+i,impactRoot,art('brick-left.png'),{w:120,h:76,ay:0,active:false}));
  rightPieces.push(a.sprite('RightPiece'+i,impactRoot,art('brick-right.png'),{w:120,h:76,ay:0,active:false}));
 }
 for(let i=0;i<16;i++)dust.push(a.sprite('Dust'+i,impactRoot,frame('assets/res/foodDeliveryFeed/white.png'),{w:i%2?7:10,h:i%2?11:6,rotation:i*31,color:i%3?rgba(250,241,202):rgba(120,163,230),active:false}));
 const hand=a.sprite('ChopHand',impactRoot,art('hand.png'),{x:420,y:260,w:440,h:126,ax:1});
 const hud=a.node('HUD',canvas,{w:750,h:1624});a.widget(hud,45);
 const backNode=a.sprite('BackButton',hud,frame('assets/res/foodDeliveryFeed/back.png'),{w:76,h:76});a.widget(backNode,9,{_left:24,_top:105});const back=a.button(backNode);
 const top=a.node('TopHUD',hud,{w:710,h:210});a.widget(top,17,{_top:85});
 const plaque=a.sprite('TitlePlaque',top,frame('assets/res/newMain/card_title_blank.png'),{x:35,y:60,w:560,h:115});
 a.label('Title',plaque,'劈砖挑战',{w:530,h:85,size:48,outlineWidth:5});
 const chances=a.label('Chances',top,'剩余次数：3次',{y:-22,w:500,h:60,size:32,outlineWidth:4});
 const hint=a.label('Hint',top,'在蓄力合适的时机劈下',{y:-83,w:680,h:55,size:28,outlineWidth:3});
 const track=a.sprite('PowerTrack',hud,frame('assets/res/newMain/card_round.png'),{x:-320,y:-30,w:46,h:720,color:rgba(121,66,27)});a.widget(track,13,{_left:30,_top:.29,_bottom:.27,_isAbsTop:false,_isAbsBottom:false});
 o[component(o,track,'cc.Sprite')]._type=1;
 const inner=a.sprite('PowerInner',track,frame('assets/res/newMain/card_round.png'),{w:34,h:708,color:rgba(55,28,15)});a.widget(inner,45,{_left:6,_right:6,_top:6,_bottom:6});o[component(o,inner,'cc.Sprite')]._type=1;
 const power=a.sprite('PowerFill',inner,art('power.png'),{w:24,h:690});a.widget(power,45,{_left:5,_right:5,_top:7,_bottom:7});
 const fill=component(o,power,'cc.Sprite');Object.assign(o[fill],{_type:3,_fillType:1,_fillStart:0,_fillRange:.5});
 const hit=a.label('HitMessage',canvas,'',{y:60,w:660,h:80,size:48,color:rgba(255,232,88),outlineWidth:4});
 const sourceButton=src.findIndex(v=>v.__type__==='cc.Node'&&v._name==='SlowdownButton');
 function prop(name,x,extra=false){
  const n=cloneNode(src,o,sourceButton);o[n]._name=name;o[n]._parent=ref(hud);o[n]._lpos=vec(x,-648);o[hud]._children.push(ref(n));
  a.widget(n,20,{_bottom:100,_horizontalCenter:x});
  if(extra){
   o[component(o,n,'cc.Sprite')]._spriteFrame={__uuid__:frame('assets/res/juggleBallGame/extra-chance-button.png'),__expectedType__:'cc.SpriteFrame'};
   const label=o[n]._children.map(r=>r.__id__).find(i=>component(o,i,'cc.Label')!==undefined);
   const c=o[component(o,label,'cc.Label')];c._string='次数+3';c._fontSize=24;c._lineHeight=32;c._actualFontSize=24;
   o[component(o,label,'cc.UITransform')]._contentSize.width=118;
   for(const r of o[n]._children)if(o[r.__id__]._name==='SlowdownAdBadge')o[r.__id__]._name='ExtraAdBadge';
  }
  return component(o,n,'cc.Button');
 }
 const slow=prop('SlowdownButton',-110),extra=prop('ExtraChanceButton',110,true);
 const overlay=a.node('ResultOverlay',canvas,{w:750,h:1624,active:false});
 a.sprite('ResultDim',overlay,frame('assets/res/foodDeliveryFeed/white.png'),{w:750,h:1624,color:rgba(0,0,0,145)});
 const panel=a.node('ResultPanel',overlay,{w:750,h:1624});
 a.label('Kicker',panel,'劈砖挑战',{y:550,w:650,h:60,size:42});
 const title=a.label('ResultTitle',panel,'挑战成功',{y:400,w:620,h:165,size:104});
 const detail=a.label('ResultDetail',panel,'全部劈开！',{y:120,w:650,h:230,size:42,wrap:true});
 function button(parent,name,text,y){const n=a.sprite(name,parent,frame('assets/res/feedResult/button-orange.png'),{y,w:470,h:138});a.label('Caption',n,text,{w:410,h:85,size:48});return a.button(n);}
 const replay=button(panel,'ReplayButton','再次挑战',-270),home=button(panel,'HomeButton','返回主页',-445);
 const exitOverlay=a.node('ExitConfirmation',canvas,{w:750,h:1624,active:false});a.widget(exitOverlay,45);a.component(exitOverlay,'cc.BlockInputEvents',{});
 const exitDim=a.sprite('ExitDim',exitOverlay,frame('assets/res/foodDeliveryFeed/white.png'),{w:750,h:1624,color:rgba(0,0,0,145)});a.widget(exitDim,45);
 a.label('PauseTitle',exitOverlay,'游戏暂停',{y:245,w:650,h:130,size:80,outlineWidth:5});
 a.label('PauseDetail',exitOverlay,'确定退出本局吗？',{y:100,w:650,h:90,size:42});
 const resume=button(exitOverlay,'ContinueButton','继续游戏',-80),exit=button(exitOverlay,'ExitButton','退出本局',-255);
 const sound=name=>a.component(canvas,'cc.AudioSource',{_clip:{__uuid__:uuid(name+'.wav'),__expectedType__:'cc.AudioClip'},_loop:false,_playOnAwake:false,_volume:1});
 const swingAudio=sound('swing'),impactAudio=sound('impact');
 a.component(canvas,compressUuid(uuid('brickChopFeedGameScene.ts')),{impactRoot:ref(impactRoot),dust:dust.map(ref),swingAudio:ref(swingAudio),impactAudio:ref(impactAudio),surface:ref(surface),hand:ref(hand),bricks:bricks.map(ref),leftPieces:leftPieces.map(ref),rightPieces:rightPieces.map(ref),gaugeFill:ref(fill),hud:ref(hud),chanceLabel:ref(chances.component),hintLabel:ref(hint.component),hitLabel:ref(hit.component),resultOverlay:ref(overlay),resultTitle:ref(title.component),resultDetail:ref(detail.component),slowdownButton:ref(slow),extraButton:ref(extra),replayButton:ref(replay),homeButton:ref(home),backButton:ref(back),exitOverlay:ref(exitOverlay),continueButton:ref(resume),exitButton:ref(exit)});
 o[1]._globals=ref(appendSceneGlobals(src,o));fitFeedResultOverlay(o,'BrickChopFeedGameScene');return o;
}
export function appendBrickChopCard(o){
 const ctrl=o.find(v=>v.gameList&&v.puzzleButton);if(!ctrl)throw Error('Missing lobby controller');
 const parent=o[o[ctrl.puzzleButton.__id__].node.__id__]._parent.__id__;
 if(o[parent]._children.some(r=>o[r.__id__]._name==='BrickChopCard'))return;
 const a=new SceneAuthor(o,'brickLobby');a.serial=o.length;const index=o[parent]._children.length;
 const card=a.node('BrickChopCard',parent,{x:index%2?139:-139,y:-152-Math.floor(index/2)*294,w:252,h:268});
 a.sprite('Preview',card,art('background.jpg'),{y:25,w:218,h:177});
 a.label('Title',card,'劈砖挑战',{y:-94,w:230,h:60,size:31});
 ctrl.brickChopButton=ref(a.button(card));standardizeLobbyCard(o,card,'劈砖挑战');
 const mask=o[card]._children.find(r=>o[r.__id__]._name==='ArtworkMask').__id__;
 for(let i=0;i<6;i++)a.sprite('PreviewBrick'+i,mask,art('brick.png'),{x:0,y:-60+i*14,w:96,h:30,ay:0});
 a.sprite('PreviewHand',mask,art('hand.png'),{x:120,y:53,w:150,h:43,ax:1});
 const chrome=[];
 for(const [name,x,y,w,h,color] of [['CardShadow',6,-8,256,270,rgba(71,184,230,205)],['CardOutline',0,0,256,268,rgba(31,29,30)],['CardSurface',0,0,248,260,rgba(255,255,251)]]){
  const n=a.sprite(name,card,frame('assets/res/newMain/card_round.png'),{x,y,w,h,color});o[component(o,n,'cc.Sprite')]._type=1;chrome.push(ref(n));
 }
 o[card]._children=[...chrome,...o[card]._children.filter(r=>!chrome.some(c=>c.__id__===r.__id__))];
 o[component(o,parent,'cc.UITransform')]._contentSize.height=18+Math.ceil((index+1)/2)*294-26+14;
}
