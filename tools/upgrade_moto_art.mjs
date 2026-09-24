import fs from 'node:fs';
import {uuid} from './moto_race_authoring.mjs';
import {SceneAuthor,ref} from './penguin_scene_authoring.mjs';
const write=(file,v)=>fs.writeFileSync(file,JSON.stringify(v,null,2)+'\n');
const template=JSON.parse(fs.readFileSync('assets/res/mathExamFeed/correction-fluid.png.meta'));
for(const [name,w,h] of [['riders-atlas.png',1024,1792],['rider-preview.png',256,256]]){
 const id=uuid(name),meta=JSON.parse(JSON.stringify(template).replaceAll(template.uuid,id));
 for(const [key,sub] of Object.entries(meta.subMetas)){
  sub.displayName=name.replace('.png','');
  if(key==='f9941'){
   const data=sub.userData;Object.assign(data,{width:w,height:h,rawWidth:w,rawHeight:h,trimX:0,trimY:0,offsetX:0,offsetY:0,packable:false});
   Object.assign(data.vertices,{rawPosition:[-w/2,-h/2,0,w/2,-h/2,0,-w/2,h/2,0,w/2,h/2,0],uv:[0,h,w,h,0,0,w,0],minPos:[-w/2,-h/2,0],maxPos:[w/2,h/2,0]});
  }
 }
 write('assets/res/motoRace/'+name+'.meta',meta);
}
write('assets/scripts/motoRaceArt.ts.meta',{ver:'4.0.24',importer:'typescript',imported:true,uuid:uuid('motoRaceArt.ts'),files:[],subMetas:{},userData:{}});
// Patch only the new presentation bindings. Preserve scene edits and existing UI references.
const sceneFile='assets/gamescene/MotoRaceGameScene.scene',scene=JSON.parse(fs.readFileSync(sceneFile));
const controller=scene.find(v=>v.world&&v.steeringPad),root=controller.layoutRoot.__id__;
if(!controller.artRoot){
 const a=new SceneAuthor(scene,'motoArt');const id=a.node('SpriteArtwork',root,{w:750,h:1334});
 const world=scene[controller.world.__id__].node.__id__;
 const siblings=scene[root]._children;siblings.splice(siblings.findIndex(r=>r.__id__===id),1);siblings.splice(siblings.findIndex(r=>r.__id__===world)+1,0,ref(id));
 controller.artRoot=ref(id);
}
controller.riderAtlas={__uuid__:uuid('riders-atlas.png')+'@6c48a',__expectedType__:'cc.Texture2D'};
write(sceneFile,scene);
const file='assets/gamescene/NewMainScene.scene',lobby=JSON.parse(fs.readFileSync(file));
const card=lobby.findIndex(v=>v._name==='MotoRaceCard');
const descendants=[];function walk(id){descendants.push(id);for(const c of lobby[id]._children||[])walk(c.__id__);}walk(card);
const preview=descendants.find(id=>lobby[id]._name==='Artwork');
if(!descendants.some(id=>lobby[id]._name==='RiderArtwork')){
 for(const id of descendants)if(['Wheel','Rider','Helmet','Visor'].includes(lobby[id]._name))lobby[id]._active=false;
 new SceneAuthor(lobby,'motoLobbyArt').sprite('RiderArtwork',preview,uuid('rider-preview.png')+'@f9941',{x:0,y:8,w:184,h:184});
}
write(file,lobby);
console.log('Updated sprite assets, preserved scene layout, and upgraded lobby rider thumbnail.');
