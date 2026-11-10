import fs from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {uuid} from './rope_duck_ids.mjs';
const require=createRequire(import.meta.url),sharp=require('/Users/skyhand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const source='/Users/skyhand/.codex/generated_images/01a0cbf0-ddba-70f3-a6ee-b21f1e46c43c/';
const dir='assets/res/ropeDuckFeed',processed='/tmp/rope-duck-sprites';fs.mkdirSync(dir,{recursive:true});
execFileSync('python3',['/Users/skyhand/.codex/skills/generate2dsprite/scripts/generate2dsprite.py','process','--input',source+'exec-bd2371f6-d5e7-40ab-b87b-1cca92d0c13d.png','--target','creature','--mode','idle','--rows','2','--cols','1','--output-dir',processed,'--cell-size','128','--fit-scale','.86','--align','feet','--shared-scale','--component-mode','largest','--strict-qc']);
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
write(dir+'.meta',{ver:'1.2.0',importer:'directory',imported:true,uuid:uuid('folder'),files:[],subMetas:{},userData:{}});
async function save(name,img,w,h){
 await img.toFile(dir+'/'+name);
 const raw=fs.readFileSync('assets/res/foodDeliveryFeed/white.png.meta','utf8'),old=JSON.parse(raw).uuid;
 const m=JSON.parse(raw.replaceAll(old,uuid(name)).replaceAll('"white"',JSON.stringify(name.split('.')[0])));
 m.files=['.json',name.endsWith('.jpg')?'.jpg':'.png'];m.userData.hasAlpha=!name.endsWith('.jpg');
 const d=m.subMetas.f9941.userData;Object.assign(d,{width:w,height:h,rawWidth:w,rawHeight:h,offsetX:0,offsetY:0,trimX:0,trimY:0,packable:false,trimType:'none'});
 d.vertices.rawPosition=[-w/2,-h/2,0,w/2,-h/2,0,-w/2,h/2,0,w/2,h/2,0];d.vertices.minPos=[-w/2,-h/2,0];d.vertices.maxPos=[w/2,h/2,0];d.vertices.uv=[0,h,w,h,0,0,w,0];d.vertices.nuv=[0,0,1,0,0,1,1,1];write(dir+'/'+name+'.meta',m);
}
for(const [name,index]of [['white-duck.png',1],['yellow-duck.png',2]])await save(name,sharp(processed+`/idle-${index}.png`).trim({threshold:8}).resize(64,96,{fit:'fill'}).png({palette:true,colours:64,dither:0,effort:10}),64,96);
await save('background.jpg',sharp(source+'exec-d3bc0d2b-890b-4a56-a551-f638e08a0143.png').resize(512,1109,{fit:'fill'}).jpeg({quality:76,mozjpeg:true}),512,1109);
// Short original synthesized game cues; no reference-video soundtrack is bundled.
function wav(name,seconds,fn){const rate=22050,n=Math.floor(seconds*rate),b=Buffer.alloc(44+n*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);let seed=19;for(let i=0;i<n;i++){seed=(seed*1664525+1013904223)>>>0;const v=fn(i/rate,seed/4294967296*2-1);b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*.68*32767),44+i*2);}fs.writeFileSync(dir+'/'+name,b);write(dir+'/'+name+'.meta',{ver:'1.0.1',importer:'audio-clip',imported:true,uuid:uuid(name),files:['.json','.wav'],subMetas:{},userData:{}});}
wav('jump.wav',.19,(t,n)=>Math.sin(2*Math.PI*(210*t+1550*t*t))*Math.exp(-t*20)*.65+n*.04*Math.exp(-t*30));
wav('land.wav',.13,(t,n)=>(Math.sin(2*Math.PI*100*t)*.45+n*.26)*Math.exp(-t*45));
wav('pickup.wav',.30,(t)=>Math.sin(2*Math.PI*(t<.12?880:1320)*t)*Math.min(1,t*100)*Math.exp(-t*9)*.6);
wav('fall.wav',.4,(t,n)=>Math.sin(2*Math.PI*(330*t-300*t*t))*Math.exp(-t*7)*.5+n*.06*Math.exp(-t*15));
console.log('Rope duck media bytes',fs.readdirSync(dir).filter(n=>!n.endsWith('.meta')).reduce((s,n)=>s+fs.statSync(dir+'/'+n).size,0));
