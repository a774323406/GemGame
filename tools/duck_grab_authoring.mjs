import fs from 'node:fs';
import crypto from 'node:crypto';
import {SceneAuthor,compressUuid,ref,rgba,vec} from './feed_scene_authoring.mjs';
import {appendSceneGlobals,fitFeedResultOverlay} from './feed_result_layout.mjs';
export const uuid=n=>{const h=crypto.createHash('sha256').update('GemGame/duckGrab/'+n).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
export const SCENE_UUID=uuid('DuckGrabFeedGameScene');
const frame=p=>JSON.parse(fs.readFileSync(p+'.meta')).uuid+'@f9941';
const art=n=>frame('assets/res/duckGrabFeed/'+n);
const component=(o,id,type)=>o[id]._components.map(r=>r.__id__).find(i=>o[i].__type__===type);
// Clone only a node subtree and components, never external scene state.
function cloneNode(src,o,root){const ids=[];function walk(id){ids.push(id);for(const r of src[id]._components)ids.push(r.__id__);for(const r of src[id]._children)walk(r.__id__);}walk(root);const map=new Map(ids.map((id,i)=>[id,o.length+i]));function remap(v){if(Array.isArray(v))return v.map(remap);if(!v||typeof v!=='object')return v;if(Number.isInteger(v.__id__))return map.has(v.__id__)?ref(map.get(v.__id__)):null;return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,remap(x)]));}for(const id of ids){const c=remap(src[id]);if(c._id)c._id='duckClone_'+map.get(id);o.push(c);}return map.get(root);}
export function buildDuckGrabScene(){
 const src=JSON.parse(fs.readFileSync('assets/gamescene/FoodDeliveryFeedGameScene.scene'));
 const a=new SceneAuthor([],'duckGrab'),o=a.objects;
 a.add({__type__:'cc.SceneAsset',_name:'DuckGrabFeedGameScene',_objFlags:0,__editorExtras__:{},_native:'',scene:ref(1)});
 a.add({...structuredClone(src[1]),_name:'DuckGrabFeedGameScene',_children:[],_components:[],_globals:null,_id:SCENE_UUID});
 const canvas=a.node('Canvas',1,{x:375,y:812,w:750,h:1624});a.widget(canvas,45);
 const camera=a.node('Camera',canvas,{z:1000,w:1,h:1});o[camera]._layer=1073741824;
 const cam=structuredClone(src.find(v=>v.__type__==='cc.Camera'));delete cam.node;delete cam._id;
 const camId=a.component(camera,'cc.Camera',{...cam,_orthoHeight:812});a.component(canvas,'cc.Canvas',{_cameraComponent:ref(camId),_alignCanvasWithScreen:true});
 const bg=a.sprite('Meadow',canvas,art('meadow.jpg'),{w:750,h:1624});a.widget(bg,45);
 const surface=a.node('TapSurface',canvas,{w:750,h:1624});a.widget(surface,45);
 const pivot=a.node('DuckPivot',canvas,{y:-220,w:1,h:1});a.sprite('Duck',pivot,art('duck.png'),{y:0,w:180,h:310,ay:0});
 const hand=a.sprite('GrabHand',canvas,art('hand.png'),{y:162,w:112,h:154,ay:0});
 const caught=a.sprite('CaughtPose',canvas,art('caught.png'),{x:58,y:-65,w:300,h:310,active:false});
 const taunt=a.label('Taunt',canvas,'?',{y:125,w:60,h:65,size:46,color:rgba(255,222,87),outlineWidth:3,active:false});
 const hud=a.node('HUD',canvas,{w:750,h:1624});a.widget(hud,45);
 const backNode=a.sprite('BackButton',hud,frame('assets/res/foodDeliveryFeed/back.png'),{w:76,h:76});a.widget(backNode,9,{_left:24,_top:105});const back=a.button(backNode);
 const top=a.node('TopHUD',hud,{w:710,h:210});a.widget(top,17,{_top:85});
 const plaque=a.sprite('TitlePlaque',top,frame('assets/res/newMain/card_title_blank.png'),{x:35,y:60,w:560,h:115});
 a.label('Title',plaque,'抓鸭子挑战',{w:530,h:85,size:48,outlineWidth:5});
 const clock=a.label('Time',top,'剩余时间：60s',{y:-22,w:500,h:60,size:32,outlineWidth:4});
 const hint=a.label('Hint',top,'看准时机，一把抓住',{y:-83,w:680,h:55,size:30,outlineWidth:4});
 const count=a.label('Attempts',hud,'次数 0',{x:-263,y:-120,w:210,h:65,size:40,outlineWidth:4});
 const slowSource=src.findIndex(v=>v.__type__==='cc.Node'&&v._name==='SlowdownButton');if(slowSource<0)throw Error('Delivery slowdown button missing');
 const slow=cloneNode(src,o,slowSource);o[slow]._parent=ref(hud);o[slow]._lpos=vec();hud>=0&&o[hud]._children.push(ref(slow));
 // A centered bottom button preserves the exact delivery artwork and ad badge.
 const oldWidget=component(o,slow,'cc.Widget');if(oldWidget!==undefined)o[oldWidget]._enabled=false;
 a.widget(slow,20,{_bottom:100});
 const slowButton=component(o,slow,'cc.Button');
 const overlay=a.node('ResultOverlay',canvas,{w:750,h:1624,active:false});
 a.sprite('ResultDim',overlay,frame('assets/res/foodDeliveryFeed/white.png'),{w:750,h:1624,color:rgba(0,0,0,145)});
 const panel=a.node('ResultPanel',overlay,{w:750,h:1624});
 const title=a.label('ResultTitle',panel,'挑战成功',{y:400,w:620,h:165,size:104});
 a.label('Kicker',panel,'抓鸭子挑战',{y:550,w:650,h:60,size:42});
 const detail=a.label('ResultDetail',panel,'抓住啦！',{y:120,w:650,h:230,size:42,wrap:true});
 function button(name,text,y){const n=a.sprite(name,panel,frame('assets/res/feedResult/button-orange.png'),{y,w:470,h:138});a.label('Caption',n,text,{w:410,h:85,size:52});return a.button(n);}
 const replay=button('ReplayButton','再玩一次',-270),home=button('HomeButton','返回主页',-445);
 const exitOverlay=a.node('ExitConfirmation',canvas,{w:750,h:1624,active:false});a.widget(exitOverlay,45);a.component(exitOverlay,'cc.BlockInputEvents',{});
 const exitDim=a.sprite('ExitDim',exitOverlay,frame('assets/res/foodDeliveryFeed/white.png'),{w:750,h:1624,color:rgba(0,0,0,145)});a.widget(exitDim,45);
 a.label('PauseTitle',exitOverlay,'游戏暂停',{y:245,w:650,h:130,size:80,outlineWidth:5});
 a.label('PauseDetail',exitOverlay,'确定退出本局吗？',{y:100,w:650,h:90,size:42});
 const pauseAction=(name,text,y)=>{const n=a.sprite(name,exitOverlay,frame('assets/res/feedResult/button-orange.png'),{y,w:470,h:138});a.label('Caption',n,text,{w:420,h:90,size:48});return a.button(n);};
 const continueButton=pauseAction('ContinueButton','继续游戏',-80),exitButton=pauseAction('ExitButton','退出本局',-255);
 a.component(canvas,compressUuid(uuid('duckGrabFeedGameScene.ts')),{backButton:ref(back),continueButton:ref(continueButton),exitButton:ref(exitButton),exitOverlay:ref(exitOverlay),surface:ref(surface),duckPivot:ref(pivot),hand:ref(hand),caughtPose:ref(caught),taunt:ref(taunt.node),hud:ref(hud),resultOverlay:ref(overlay),timeLabel:ref(clock.component),attemptLabel:ref(count.component),hintLabel:ref(hint.component),resultTitle:ref(title.component),resultDetail:ref(detail.component),slowdownButton:ref(slowButton),replayButton:ref(replay),homeButton:ref(home)});
 o[1]._globals=ref(appendSceneGlobals(src,o));fitFeedResultOverlay(o,'DuckGrabFeedGameScene');return o;
}
export function replaceLobbyCard(o){
 const ctrl=o.find(x=>x.puzzleButton&&x.gameList),button=ctrl.duckGrabButton||ctrl.penguinButton;if(!button)throw Error('Replacement lobby slot missing');
 ctrl.duckGrabButton=button;delete ctrl.penguinButton;
 const id=o[button.__id__].node.__id__;o[id]._name='DuckGrabCard';
 const a=new SceneAuthor(o,'duckLobby');a.serial=o.length;
 const descendants=[];function walk(i){descendants.push(i);for(const r of o[i]._children||[])walk(r.__id__);}walk(id);
 for(const i of descendants){for(const r of o[i]._components||[]){const c=o[r.__id__];if(c.__type__==='cc.Label'&&c._string==='企鹅叠叠乐')c._string='抓鸭子挑战';if(c.__type__!=='cc.Sprite')continue;const u=c._spriteFrame?.__uuid__||'';if(u.startsWith('9ded1a28'))c._spriteFrame={__uuid__:art('meadow.jpg'),__expectedType__:'cc.SpriteFrame'};if(u.startsWith('a9b70d4b')){c._spriteFrame={__uuid__:frame('assets/res/newMain/card_title_blank.png'),__expectedType__:'cc.SpriteFrame'};a.label('DuckTitle',i,'抓鸭子挑战',{w:230,h:54,size:30});}}}
 const mask=descendants.find(i=>o[i]._name==='ArtworkMask')??id;
 if(!o[mask]._children.some(r=>o[r.__id__]._name==='DuckPreview'))a.sprite('DuckPreview',mask,art('duck.png'),{y:8,w:70,h:140,rotation:-18});
}
