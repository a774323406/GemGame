import { fitFeedScreenControls } from './feed_screen_layout.mjs';
import fs from "node:fs";
import { SceneAuthor, compressUuid, ref } from "./penguin_scene_authoring.mjs";
// Offline scene-authoring helper only. Runtime UI stays serialized in Creator.
export function appendSceneGlobals(source, destination) {
  const start = source.findIndex(o => o.__type__ === "cc.SceneGlobals");
  if (start < 0) throw new Error("SceneGlobals is missing");
  const ids = new Map();
  const copy = id => {
    if (ids.has(id)) return ids.get(id);
    const newId = destination.length;
    ids.set(id, newId);
    destination.push(null);
    const remap = value => {
      if (Array.isArray(value)) return value.map(remap);
      if (!value || typeof value !== "object") return value;
      if (Number.isInteger(value.__id__)) return { __id__: copy(value.__id__) };
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, remap(child)]));
    };
    destination[newId] = remap(source[id]);
    return newId;
  };
  // Widgets may follow SceneGlobals in editor-saved files; copy only the
  // referenced globals, never unrelated components from the rest of the file.
  return copy(start);
}

export function fitFeedResultOverlay(objects, sceneName) {
  const nodeId = name => objects.findIndex(o => o.__type__ === "cc.Node" && o._name === name);
  const overlayId = nodeId(sceneName === "MotoRaceGameScene" ? "Overlay" : "ResultOverlay");
  if (overlayId < 0) throw new Error(`${sceneName}: ResultOverlay is missing`);
  const component = (id, type) => objects[id]._components
    .map(ref => objects[ref.__id__]).find(o => o.__type__ === type);
  const addComponent = (id, type, suffix, fields) => {
    const result = {
      __type__: type, _name: "", _objFlags: 0, __editorExtras__: {},
      node: { __id__: id }, _enabled: true, __prefab: null,
      ...fields, _id: `feedResult_${sceneName}_${suffix}`,
    };
    objects[id]._components.push({ __id__: objects.length });
    objects.push(result);
    return result;
  };
  const stretch = id => {
    const fields = {
      _enabled: true, _alignFlags: 45, _target: null,
      _left: 0, _right: 0, _top: 0, _bottom: 0,
      _horizontalCenter: 0, _verticalCenter: 0,
      _isAbsLeft: true, _isAbsRight: true, _isAbsTop: true, _isAbsBottom: true,
      _isAbsHorizontalCenter: true, _isAbsVerticalCenter: true,
      _originalWidth: 0, _originalHeight: 0,
      _alignMode: 2, _lockFlags: 0,
    };
    const widget = component(id, "cc.Widget");
    if (widget) Object.assign(widget, fields);
    else addComponent(id, "cc.Widget", `${objects[id]._name}_Widget`, fields);
  };
  // Always attach the blocking overlay to the actual Canvas, not a fitted gameplay root.
  const canvasId = objects.findIndex(o => o.__type__ === "cc.Node" &&
    o._components?.some(r => objects[r.__id__].__type__ === "cc.Canvas"));
  if (canvasId >= 0 && objects[overlayId]._parent?.__id__ !== canvasId) {
    const previous = objects[objects[overlayId]._parent.__id__];
    previous._children = previous._children.filter(r => r.__id__ !== overlayId);
    objects[canvasId]._children.push({ __id__: overlayId });
    objects[overlayId]._parent = { __id__: canvasId };
  }
  stretch(overlayId);
  for (const child of objects[overlayId]._children) {
    if (["ResultDim", "ResultDimBackground", "DimBackground", "Shade", "Mask", "Dimmer"].includes(objects[child.__id__]._name)) {
      stretch(child.__id__);
    }
  }
  if (!component(overlayId, "cc.BlockInputEvents")) {
    addComponent(overlayId, "cc.BlockInputEvents", "BlockInput", {});
  }
  if (sceneName === "JuggleBallGameScene") {
    // Replace its runtime fixed rectangle with the existing single-color sprite.
    if (!component(overlayId, "cc.Sprite")) {
      addComponent(overlayId, "cc.Sprite", "DimSprite", {
        _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4,
        _color: { __type__: "cc.Color", r: 13, g: 50, b: 78, a: 175 },
        _spriteFrame: {
          __uuid__: "b900cef1-182a-4426-a80e-8a842d396eec@f9941",
          __expectedType__: "cc.SpriteFrame",
        },
        _type: 0, _fillType: 0, _sizeMode: 0,
        _fillCenter: { __type__: "cc.Vec2", x: 0, y: 0 },
        _fillStart: 0, _fillRange: 0, _isTrimmedMode: true,
        _useGrayscale: false, _atlas: null,
      });
    }
    const graphics = component(overlayId, "cc.Graphics");
    if (graphics) graphics._enabled = false;
  }
  styleFullscreenResult(objects, sceneName, overlayId, component, addComponent, stretch);
  fitFeedScreenControls(objects, sceneName);
}

function styleFullscreenResult(objects, sceneName, overlayId, component, addComponent, stretch) {
  const descendants = [];
  const visit = id => { descendants.push(id); for (const r of objects[id]._children || []) visit(r.__id__); };
  visit(overlayId);
  const find = name => descendants.find(id => objects[id]._name === name);
  const color = (r,g,b,a=255) => ({ __type__: "cc.Color",r,g,b,a });
  const position = (name, y, width, height, font, x=0) => {
    const id = find(name); if (id === undefined) return;
    const n = objects[id]; n._lpos.x=x; n._lpos.y=y;
    const ui = component(id,"cc.UITransform");
    if (ui) { if(width) ui._contentSize.width=width; if(height) ui._contentSize.height=height; }
    const label=component(id,"cc.Label");
    if(label && font) { label._fontSize=font; label._lineHeight=Math.ceil(font*1.35); label._overflow=2; }
    const fields = { _enabled:true, _alignFlags:18, _target:null, _left:0,_right:0,_top:0,_bottom:0,
      _horizontalCenter:x, _verticalCenter:y/1334, _isAbsHorizontalCenter:true,_isAbsVerticalCenter:false,
      _isAbsLeft:true,_isAbsRight:true,_isAbsTop:true,_isAbsBottom:true,
      _originalWidth:0,_originalHeight:0,_alignMode:2,_lockFlags:0 };
    const widget=component(id,"cc.Widget");
    if(widget) Object.assign(widget,fields); else addComponent(id,"cc.Widget",name+"_Position",fields);
  };
  const asset = name => JSON.parse(fs.readFileSync(new URL('../assets/res/feedResult/'+name+'.png.meta', import.meta.url))).uuid + '@f9941';
  const whiteFrame=JSON.parse(fs.readFileSync(new URL('../assets/res/foodDeliveryFeed/white.png.meta',import.meta.url))).uuid+'@f9941';
  const videoFrame=JSON.parse(fs.readFileSync(new URL('../assets/res/penguinStackFeed/video-badge.png.meta',import.meta.url))).uuid+'@f9941';
  const buttonFrame = name => asset(sceneName === 'PenguinStackFeedGameScene' ? (name === 'RetryButton' ? 'button-blue' : name === 'NextButton' ? 'button-green' : 'button-orange') : sceneName === 'RhythmCatFeedGameScene' && name === 'ReplayButton' ? 'button-pink' : 'button-orange');
  for(const id of descendants) {
    const n=objects[id], name=n._name;
    if(["ResultPanel","CuteResultPanel","Panel","SuccessActions","FailureActions"].includes(name)) {
      n._lpos.x=0;n._lpos.y=0;n._lscale.x=1;n._lscale.y=1;
      const ui=component(id,"cc.UITransform"); if(ui) ui._contentSize={...component(overlayId,"cc.UITransform")._contentSize};
      stretch(id);
      for(const type of ["cc.Sprite","cc.Graphics"]) {const c=component(id,type);if(c)c._enabled=false;}
    }
    if(["ResultDivider","ShareButton"].includes(name)) n._active=false;
    if (component(id,"cc.Button") || ["SuccessButtonBackground","AdButtonBackground"].includes(name)) {
      let sprite=component(id,"cc.Sprite");
      if (!sprite && sceneName === "JuggleBallGameScene") {
        const template=component(overlayId,"cc.Sprite");
        const fields={...template}; delete fields.node; delete fields._id;
        sprite=addComponent(id,"cc.Sprite",name+"_Background",fields);
      }
      if(sprite) { sprite._spriteFrame={__uuid__:buttonFrame(name),__expectedType__:"cc.SpriteFrame"};sprite._color=color(255,255,255);sprite._type=0;sprite._sizeMode=0; }
    }
    const label=component(id,"cc.Label");
    if(label) {
      label._color=color(255,255,255);label._isBold=true;
      label._enableOutline=true;label._outlineColor=color(47,36,31);label._outlineWidth=3;
      const parent=objects[n._parent?.__id__];
      if(parent && component(n._parent.__id__,"cc.Button")) {
        label._fontSize=52;label._lineHeight=68;label._overflow=2;
        label._outlineWidth=4;label._outlineColor=color(104,44,19);
        component(id,"cc.UITransform")._contentSize={__type__:"cc.Size",width:390,height:86};
        n._lpos.y=0;
      }
    }
    if(sceneName === 'PenguinStackFeedGameScene' && ['SuccessCat','FailCat'].includes(name)) {
      const sprite=component(id,'cc.Sprite');if(sprite)sprite._enabled=false;
    }
    if(["ResultDim","ResultDimBackground","DimBackground","Shade","Mask","Dimmer"].includes(name)) {
      const sprite=component(id,"cc.Sprite"), opacity=component(id,"cc.UIOpacity");
      if(sprite) {sprite._color=color(0,0,0,opacity ? 255 : 145);sprite._spriteFrame={__uuid__:whiteFrame,__expectedType__:"cc.SpriteFrame"};}
      if(opacity) opacity._opacity=145;
    }
  }
  const layouts = {
    PenguinStackFeedGameScene: [
      ["ResultTitle",395,620,165,104],["ResultDetail",225,650,160,42],
      ["NextButton",-180,470,138],["ReviveButton",-180,470,138],["RetryButton",-345,470,138],["HomeButton",-510,470,138]],
    ShootingGlassBottlesGame: [["ResultTitleLabel",395,620,165,104],["ResultDetailLabel",180,640,245,42],
      ["ResultActionButton",-300,470,138],["ResultRestartButton",-465,470,138]],
    MotoRaceGameScene: [["Kicker",550,640,60,42],["ResultTitle",420,620,165,104],
      ["ResultDetail",140,660,310,42],["ResumeButton",-170,470,138],["ReplayButton",-335,470,138],["HomeButton",-500,470,138]],
    RhythmCatFeedGameScene: [["ResultTitle",395,620,165,104],["ResultScore",170,650,170,44],
      ["BlackCat",-550,150,200,null,-215],["WhiteCat",-550,150,200,null,215],
      ["ReplayButton",-165,470,138],["HomeButton",-330,470,138]],
    MathExamFeedGameScene: [["ResultKicker",550,640,60,42],["ResultTitle",395,620,165,104],
      ["ResultScore",185,630,150,100],["ResultDetail",30,640,100,42],["Best",-65,640,50,28],
      ["ReviveButton",-180,470,138],["ReplayButton",-345,470,138],["HomeButton",-510,470,138]],
    WhiteGooseFeedGameScene: [["ResultGameTitle",550,640,60,42],["SuccessTitle",405,620,165,104],
      ["FailureTitle",405,620,165,104],["ProgressLabel",200,660,110,60],["DetailLabel",80,670,120,42],
      ["HomeButton",-160,470,138],["ReplayButton",-325,470,138],["ReviveButton",-325,470,138],["RestartButton",-490,470,138]],
    FoodDeliveryFeedGameScene: [["ResultGameTitle",550,650,60,42],["SuccessTitle",405,620,165,104],
      ["FailureTitle",405,620,165,104],["SuccessContent",170,660,210],["FailureContent",170,660,210],
      ["HomeButton",-260,470,138],["RetryButton",-425,470,138],["NextButton",-425,470,138]],
    JuggleBallGameScene: [["ResultTitle",395,620,165,104],["ResultDetail",185,650,190,44],
      ["ResultHomeButton",-300,470,138],["ResultActionButton",-465,470,138]],
  };
  if(sceneName === "JuggleBallGameScene") {
    const button=find("ResultHomeButton");
    const row=objects[button]._parent.__id__;
    objects[row]._lpos.x=0; objects[row]._lpos.y=0; stretch(row);
    const layout=component(row,"cc.Layout");if(layout)layout._enabled=false;
    const badge=find("ad_badge_cartoon_red");
    if(badge!==undefined) {objects[badge]._lpos.x=-145;objects[badge]._lpos.y=0;}

  }
  for(const id of descendants) {
    const n=objects[id],parent=n._parent?.__id__;
    if(parent===undefined || !component(parent,'cc.Button'))continue;
    if(/badge/i.test(n._name)) {
      const sprite=component(id,'cc.Sprite');if(sprite)sprite._spriteFrame={__uuid__:videoFrame,__expectedType__:'cc.SpriteFrame'};
      n._lpos.x=-115;n._lpos.y=0;
      component(id,'cc.UITransform')._contentSize={__type__:'cc.Size',width:72,height:52};
      for(const r of objects[parent]._children) {
        const label=component(r.__id__,'cc.Label');if(!label)continue;
        objects[r.__id__]._lpos.x=42;
        component(r.__id__,'cc.UITransform')._contentSize.width=340;
      }
    }
  }
  const overlaySprite=component(overlayId,'cc.Sprite');
  if(overlaySprite) { overlaySprite._enabled=false; overlaySprite._color=color(255,255,255); }
  for(const args of layouts[sceneName] || []) position(...args);
  for(const name of ['SuccessMessage','FailureMessage']) {
    const id=find(name);if(id===undefined)continue;
    const label=component(id,'cc.Label');label._fontSize=44;label._lineHeight=62;label._overflow=2;
    component(id,'cc.UITransform')._contentSize={__type__:'cc.Size',width:650,height:190};
  }
  for(const name of ['SuccessButtonBackground','AdButtonBackground']) {
    const id=find(name);if(id!==undefined)component(id,'cc.UITransform')._contentSize={__type__:'cc.Size',width:470,height:138};
  }
  const author=new SceneAuthor(objects,'feedResult_'+sceneName);author.serial=objects.length;
  if (sceneName === 'JuggleBallGameScene') {
    let dimId=find('ResultDim');
    if(dimId===undefined) dimId=author.sprite('ResultDim',overlayId,whiteFrame,{w:750,h:1334});
    component(dimId,'cc.Sprite')._color=color(0,0,0,145);
    stretch(dimId);
    objects[overlayId]._children=[ref(dimId),...objects[overlayId]._children.filter(r=>r.__id__!==dimId)];
  }
  const panelId=find('ResultPanel') ?? find('CuteResultPanel') ?? find('Panel');
  const gameTitles={PenguinStackFeedGameScene:'企鹅叠叠乐',ShootingGlassBottlesGame:'打瓶子挑战',RhythmCatFeedGameScene:'节奏猫咪',JuggleBallGameScene:'乒乓球挑战'};
  if(gameTitles[sceneName]) {
    let id=find('ResultGameKicker');
    if(id===undefined) {const created=author.label('ResultGameKicker',panelId,gameTitles[sceneName],{w:650,h:65,size:42,bold:true,outline:true,outlineWidth:3});id=created.node;descendants.push(id);}
    position('ResultGameKicker',550,650,65,42);
    component(id,'cc.Label')._outlineColor=color(47,36,31);
  }
  if(sceneName==='MathExamFeedGameScene')component(find('ResultKicker'),'cc.Label')._string='口算大挑战';
  if(sceneName==='RhythmCatFeedGameScene')for(const [name,file] of [['BlackCat','black-idle'],['WhiteCat','white-idle']]) {
    const id=find(name),frame=JSON.parse(fs.readFileSync(new URL('../assets/res/rhythmCatFeed/'+file+'.png.meta',import.meta.url))).uuid+'@f9941';
    component(id,'cc.Sprite')._spriteFrame={__uuid__:frame,__expectedType__:'cc.SpriteFrame'};
  }
  const titleIds=['ResultTitle','ResultTitleLabel','SuccessTitle','FailureTitle'].map(find).filter(id=>id!==undefined);
  const artworks=[];
  for(const id of titleIds) {
    let artworkId=objects[id]._children.map(r=>r.__id__).find(i=>objects[i]._name==='ResultHeadingArtwork');
    if(artworkId===undefined)artworkId=author.sprite('ResultHeadingArtwork',id,asset(objects[id]._name==='FailureTitle'?'title-failure':'title-success'),{w:580,h:157});
    artworks.push(ref(objects[artworkId]._components.find(r=>objects[r.__id__].__type__==='cc.Sprite').__id__));
  }
  const hudNames={
    PenguinStackFeedGameScene:['TopHUD','BottomHUD','CaughtLabel','MoveGuide','CatchFeedback'],
    ShootingGlassBottlesGame:['TopHUD','RewardControls'],
    RhythmCatFeedGameScene:[...Array.from({length:96},(_,i)=>'Food'+i),'BlackCat','WhiteCat','Score','Heart0','Heart1','Heart2','Instruction','BackButton','SlowdownButton','SlowdownDetail','CatchFeedback0','CatchFeedback1'],
    MathExamFeedGameScene:['BackButton','AddTimeButton','CorrectionFluid'],
    MotoRaceGameScene:['HudShapes','Armor','RankPanel','Rank','Time','PauseButton','BackButton','Speed','SpeedUnit','PunchButton','KickButton','Message','Countdown','BoostButton','SteeringPad'],
    JuggleBallGameScene:['HeaderPanel','GoalPanel','LevelLabel','GoalLabel','ChanceLabel','BackButton','ScoreLabel','StatusLabel','ReadyArrow','MoveHint','SlowdownButton','ExtraChanceButton'],
    WhiteGooseFeedGameScene:['SafeArea','AddRingsButton'],
    FoodDeliveryFeedGameScene:['SafeArea','SlowdownButton','ChanceLabel','TapHint'],
  };
  const scriptUuid=JSON.parse(fs.readFileSync(new URL('../assets/scripts/feedResultPresentation.ts.meta',import.meta.url))).uuid;
  const fields={successLift:0.075,successButtons:sceneName==='MathExamFeedGameScene'?['ReplayButton','HomeButton'].map(name=>ref(objects[find(name)]._components.find(r=>objects[r.__id__].__type__==='cc.Widget').__id__)):[],titles:titleIds.map(id=>ref(objects[id]._components.find(r=>objects[r.__id__].__type__==='cc.Label').__id__)),artworks,
    successFrame:{__uuid__:asset('title-success'),__expectedType__:'cc.SpriteFrame'},failureFrame:{__uuid__:asset('title-failure'),__expectedType__:'cc.SpriteFrame'},
    gameplayHud:objects.flatMap((o,i)=>o.__type__==='cc.Node' && !descendants.includes(i) && hudNames[sceneName]?.includes(o._name)?[ref(i)]:[])};
  const existing=component(overlayId,compressUuid(scriptUuid));
  if(existing)Object.assign(existing,fields);else addComponent(overlayId,compressUuid(scriptUuid),'Presentation',fields);

  for(const name of ["ResultTitle","ResultTitleLabel","SuccessTitle"]) {
    const id=find(name);const label=id===undefined?null:component(id,"cc.Label");
    if(label)label._color=color(255,232,153);
  }
}
