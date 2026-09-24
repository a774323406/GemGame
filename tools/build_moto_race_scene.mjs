import fs from 'node:fs';
import {uuid,SCENE_UUID,buildMotoScene,appendMotoCard} from './moto_race_authoring.mjs';
const write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
if(!process.argv.includes('--write')){console.log('Use --write to author the motorcycle scene and lobby entry.');process.exit(0);}
for(const file of ['motoRaceRules.ts','motoRaceRenderer.ts','motoRaceGameScene.ts','motoRaceArt.ts'])write('assets/scripts/'+file+'.meta',{ver:'4.0.24',importer:'typescript',imported:true,uuid:uuid(file),files:[],subMetas:{},userData:{}});
const dir='assets/res/motoRace';fs.mkdirSync(dir,{recursive:true});
write(dir+'.meta',{ver:'1.2.0',importer:'directory',imported:true,uuid:uuid('directory'),files:[],subMetas:{},userData:{}});
// Tiny deterministic PCM synthesis. No third-party audio files.
for(const name of ['Engine','Hit']){
 const rate=16000,length=name==='Engine'?rate:Math.round(rate*.18),data=Buffer.alloc(44+length*2);
 data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(length*2,40);
 let seed=19;for(let i=0;i<length;i++){const t=i/rate;seed=(seed*16807)%2147483647;const noise=seed/2147483647*2-1;
 const v=name==='Engine'?(Math.sin(t*Math.PI*2*64)*.45+Math.sin(t*Math.PI*2*128)*.2+Math.sin(t*Math.PI*2*192)*.12)*( .8+.2*Math.sin(t*Math.PI*2*16)):(noise*.7+Math.sin(t*Math.PI*2*90)*.3)*Math.exp(-t*24);
 data.writeInt16LE(Math.round(v*24000),44+i*2);}
 fs.writeFileSync(`${dir}/${name}.wav`,data);write(`${dir}/${name}.wav.meta`,{ver:'1.0.0',importer:'audio-clip',imported:true,uuid:uuid(name+'.wav'),files:['.json','.wav'],subMetas:{},userData:{downloadMode:0}});
}
const scene='assets/gamescene/MotoRaceGameScene.scene';write(scene,buildMotoScene());write(scene+'.meta',{ver:'1.1.50',importer:'scene',imported:true,uuid:SCENE_UUID,files:['.json'],subMetas:{},userData:{}});
const lobby='assets/gamescene/NewMainScene.scene',objects=JSON.parse(fs.readFileSync(lobby));appendMotoCard(objects);write(lobby,objects);
console.log({scene,uuid:SCENE_UUID});
// Scene-authored touch area and reward button; no runtime position overrides.
await import('./upgrade_moto_controls.mjs');
