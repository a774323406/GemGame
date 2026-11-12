import fs from 'node:fs';
import {SceneAuthor,compressUuid,ref,rgba} from './feed_scene_authoring.mjs';
import {appendSceneGlobals,fitFeedResultOverlay} from './feed_result_layout.mjs';
import {standardizeLobbyCard} from './lobby_card_style.mjs';
import {uuid,SCENE_UUID} from './rope_duck_ids.mjs';
export {uuid,SCENE_UUID};
const frame=p=>JSON.parse(fs.readFileSync(p+'.meta')).uuid+'@f9941';
const art=n=>frame('assets/res/ropeDuckFeed/'+n);
const comp=(o,n,t)=>o[n]._components.map(r=>r.__id__).find(i=>o[i].__type__===t);
export function buildRopeDuckScene(){
 const src=JSON.parse(fs.readFileSync('assets/gamescene/FoodDeliveryFeedGameScene.scene'));
 const a=new SceneAuthor([],'ropeDuck'),o=a.objects;
 a.add({__type__:'cc.SceneAsset',_name:'RopeDuckFeedGameScene',_objFlags:0,__editorExtras__:{},_native:'',scene:ref(1)});
 a.add({...structuredClone(src[1]),_name:'RopeDuckFeedGameScene',_children:[],_components:[],_globals:null,_id:SCENE_UUID});
 const canvas=a.node('Canvas',1,{x:375,y:812,w:750,h:1624});a.widget(canvas,45);
 const camera=a.node('Camera',canvas,{z:1000,w:1,h:1});o[camera]._layer=1073741824;
 const cam=structuredClone(src.find(v=>v.__type__==='cc.Camera'));delete cam.node;delete cam._id;
 const camId=a.component(camera,'cc.Camera',{...cam,_orthoHeight:812});a.component(canvas,'cc.Canvas',{_cameraComponent:ref(camId),_alignCanvasWithScreen:true});
 const bg=a.sprite('CanyonSky',canvas,art('background.jpg'),{w:750,h:1624});a.widget(bg,45);
 const surface=a.node('TouchSurface',canvas,{w:750,h:1624});a.widget(surface,45);
 const drawing=name=>{const n=a.node(name,canvas,{w:750,h:1624});a.widget(n,45);return a.component(n,'cc.Graphics',{_lineWidth:3,_strokeColor:rgba(55,47,35),_fillColor:rgba(255,255,255),_lineJoin:2,_lineCap:1,_miterLimit:10});};
 const terrain=drawing('Terrain'),effects=drawing('RopeAndEffects');
 const ducks=['white-duck.png','yellow-duck.png'].map((n,i)=>a.sprite('Duck'+i,canvas,art(n),{x:-245+i*90,y:-113,w:56,h:84,ay:0}));
 const hud=a.node('HUD',canvas,{w:750,h:1624});a.widget(hud,45);
 const back=a.sprite('BackButton',hud,frame('assets/res/foodDeliveryFeed/back.png'),{w:76,h:76});a.widget(back,9,{_left:24,_top:105});
 const title=a.label('GameTitle',hud,'双鸭跳跃',{w:400,h:65,size:36,outlineWidth:3});a.widget(title.node,17,{_top:110});
 const distance=a.label('Distance',hud,'0 米',{w:500,h:95,size:64,outlineWidth:3,outlineColor:rgba(56,70,72)});a.widget(distance.node,17,{_top:195});
 const energy=a.label('Energy',hud,'能量 0/5',{w:180,h:48,size:26,outlineWidth:3,outlineColor:rgba(38,80,83)});a.widget(energy.node,9,{_left:25,_top:295});
 const hint=a.label('Hint',hud,'按住蓄力，松手起跳',{w:650,h:60,size:30,outlineWidth:3,outlineColor:rgba(57,97,95)});a.widget(hint.node,17,{_top:345});
 function button(parent,name,text,y){const n=a.sprite(name,parent,frame('assets/res/feedResult/button-orange.png'),{y,w:470,h:138});a.label('Caption',n,text,{w:405,h:80,size:44});return {node:n,component:a.button(n)};}
 const overlay=a.node('ResultOverlay',canvas,{w:750,h:1624,active:false});
 a.sprite('ResultDim',overlay,frame('assets/res/foodDeliveryFeed/white.png'),{w:750,h:1624,color:rgba(0,0,0,145)});
 const panel=a.node('ResultPanel',overlay,{w:750,h:1624});
 a.label('Kicker',panel,'双鸭跳跃',{w:650,h:65,y:550,size:42});
 const resultTitle=a.label('ResultTitle',panel,'挑战失败',{w:620,h:165,y:400,size:104});
 const detail=a.label('ResultDetail',panel,'本次跳了 0 米',{w:660,h:240,y:140,size:40,wrap:true});
 const revive=button(panel,'ReviveButton','复活继续',-180),replay=button(panel,'ReplayButton','重新挑战',-345),home=button(panel,'HomeButton','返回主页',-510);
 a.sprite('ReviveAdBadge',revive.node,frame('assets/res/feedShared/video-badge.png'),{x:-145,w:72,h:52});
 const exitOverlay=a.node('ExitConfirmation',canvas,{w:750,h:1624,active:false});a.widget(exitOverlay,45);a.component(exitOverlay,'cc.BlockInputEvents',{});
 const dim=a.sprite('ExitDim',exitOverlay,frame('assets/res/foodDeliveryFeed/white.png'),{w:750,h:1624,color:rgba(0,0,0,145)});a.widget(dim,45);
 a.label('PauseTitle',exitOverlay,'游戏暂停',{w:650,h:130,y:340,size:80,outlineWidth:5});
 a.label('PauseDetail',exitOverlay,'可以继续，也可以重新开始',{w:650,h:90,y:200,size:36});
 const resume=button(exitOverlay,'ContinueButton','继续游戏',20),restart=button(exitOverlay,'RestartButton','重新开始',-155),exit=button(exitOverlay,'ExitButton','退出本局',-330);
 const sounds=Object.fromEntries(['jump','land','pickup','fall'].map(name=>[name+'Audio',ref(a.component(canvas,'cc.AudioSource',{_clip:{__uuid__:uuid(name+'.wav'),__expectedType__:'cc.AudioClip'},_loop:false,_playOnAwake:false,_volume:.6}))]));
 a.component(canvas,compressUuid(uuid('ropeDuckFeedGameScene.ts')),{surface:ref(surface),terrain:ref(terrain),effects:ref(effects),ducks:ducks.map(ref),hud:ref(hud),distanceLabel:ref(distance.component),energyLabel:ref(energy.component),hintLabel:ref(hint.component),resultOverlay:ref(overlay),resultTitle:ref(resultTitle.component),resultDetail:ref(detail.component),reviveButton:ref(revive.component),replayButton:ref(replay.component),homeButton:ref(home.component),backButton:ref(a.button(back)),exitOverlay:ref(exitOverlay),continueButton:ref(resume.component),restartButton:ref(restart.component),exitButton:ref(exit.component),...sounds});
 o[1]._globals=ref(appendSceneGlobals(src,o));fitFeedResultOverlay(o,'RopeDuckFeedGameScene');return o;
}
export function appendRopeDuckCard(o){
 const ctrl=o.find(v=>v.gameList&&v.puzzleButton);if(!ctrl)throw Error('Missing lobby controller');
 const parent=o[o[ctrl.puzzleButton.__id__].node.__id__]._parent.__id__;
 if(o[parent]._children.some(r=>o[r.__id__]._name==='RopeDuckCard'))return;
 const a=new SceneAuthor(o,'ropeDuckLobby');a.serial=o.length;const index=o[parent]._children.length;
 const card=a.node('RopeDuckCard',parent,{x:index%2?139:-139,y:-152-Math.floor(index/2)*294,w:252,h:268});
 a.sprite('Preview',card,art('background.jpg'),{y:25,w:218,h:177});a.label('Title',card,'双鸭跳跃',{y:-94,w:230,h:60,size:31});
 ctrl.ropeDuckButton=ref(a.button(card));standardizeLobbyCard(o,card,'双鸭跳跃');
 const mask=o[card]._children.find(r=>o[r.__id__]._name==='ArtworkMask').__id__;
 const white=frame('assets/res/foodDeliveryFeed/white.png');
 a.sprite('PreviewSoil',mask,white,{x:0,y:-60,w:228,h:54,color:rgba(236,174,111)});
 a.sprite('PreviewGrass',mask,white,{x:0,y:-30,w:228,h:8,color:rgba(177,216,38)});
 a.sprite('PreviewWhite',mask,art('white-duck.png'),{x:-42,y:26,w:49,h:74});a.sprite('PreviewYellow',mask,art('yellow-duck.png'),{x:38,y:6,w:49,h:74});
 const chrome=[];
 for(const [name,x,y,w,h,color]of [['CardShadow',6,-8,256,270,rgba(71,184,230,205)],['CardOutline',0,0,256,268,rgba(31,29,30)],['CardSurface',0,0,248,260,rgba(255,255,251)]]){const n=a.sprite(name,card,frame('assets/res/newMain/card_round.png'),{x,y,w,h,color});o[comp(o,n,'cc.Sprite')]._type=1;chrome.push(ref(n));}
 o[card]._children=[...chrome,...o[card]._children.filter(r=>!chrome.some(c=>c.__id__===r.__id__))];o[comp(o,parent,'cc.UITransform')]._contentSize.height=18+Math.ceil((index+1)/2)*294-26+14;
}
