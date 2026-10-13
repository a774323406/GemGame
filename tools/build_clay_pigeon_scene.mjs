import fs from 'node:fs';
import {uuid,SCENE_UUID,buildClayScene,appendClayPigeonCard} from './clay_pigeon_authoring.mjs';
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
if(!process.argv.includes('--write')){console.log('Use --write to build the clay pigeon scene and append its lobby card.');process.exit(0);}
for(const f of ['clayPigeonRules.ts','clayPigeonGameScene.ts'])write('assets/scripts/'+f+'.meta',{ver:'4.0.24',importer:'typescript',imported:true,uuid:uuid(f),files:[],subMetas:{},userData:{}});
const dir='assets/res/clayPigeon';write(dir+'.meta',{ver:'1.2.0',importer:'directory',imported:true,uuid:uuid('directory'),files:[],subMetas:{},userData:{}});
for(const [f,w,h] of [['background.jpg',750,1624],['gun.png',448,672],['preview.jpg',384,300]]){
 const meta=JSON.parse(fs.readFileSync('assets/res/feedResult/button-orange.png.meta')),id=uuid(f),old=meta.uuid;
 const m=JSON.parse(JSON.stringify(meta).replaceAll(old,id).replaceAll('button-orange',f.split('.')[0]));m.files=['.json',f.endsWith('.jpg')?'.jpg':'.png'];m.userData.hasAlpha=f.endsWith('.png');
 const u=m.subMetas.f9941.userData;Object.assign(u,{width:w,height:h,rawWidth:w,rawHeight:h});u.vertices={rawPosition:[-w/2,-h/2,0,w/2,-h/2,0,-w/2,h/2,0,w/2,h/2,0],indexes:[0,1,2,2,1,3],uv:[0,h,w,h,0,0,w,0],nuv:[0,0,1,0,0,1,1,1],minPos:[-w/2,-h/2,0],maxPos:[w/2,h/2,0]};write(`${dir}/${f}.meta`,m);
}
// Short synthesized gun report and clay break: no additional licensed sound assets.
for(const name of ['Shot','Hit']){
 const rate=16000,length=Math.round(rate*(name==='Shot'?.22:.12)),data=Buffer.alloc(44+length*2);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(length*2,40);
 let seed=91;for(let i=0;i<length;i++){const t=i/rate;seed=seed*16807%2147483647;const noise=seed/2147483647*2-1;const v=name==='Shot'?(noise*.7+Math.sin(t*2*Math.PI*83)*.3)*Math.exp(-t*25):noise*Math.exp(-t*40)*.7+Math.sin(t*2*Math.PI*2400)*Math.exp(-t*70)*.2;data.writeInt16LE(Math.round(v*28000),44+i*2);}fs.writeFileSync(`${dir}/${name}.wav`,data);write(`${dir}/${name}.wav.meta`,{ver:'1.0.0',importer:'audio-clip',imported:true,uuid:uuid(name+'.wav'),files:['.json','.wav'],subMetas:{},userData:{downloadMode:0}});
}
const scene='assets/gamescene/ClayPigeonGameScene.scene';write(scene,buildClayScene());write(scene+'.meta',{ver:'1.1.50',importer:'scene',imported:true,uuid:SCENE_UUID,files:['.json'],subMetas:{},userData:{}});
const lobby='assets/gamescene/NewMainScene.scene',o=JSON.parse(fs.readFileSync(lobby));appendClayPigeonCard(o);write(lobby,o);console.log({scene,uuid:SCENE_UUID});
