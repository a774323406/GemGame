import fs from 'node:fs';
import {createRequire} from 'node:module';
import {uuid} from './brick_chop_ids.mjs';
const require=createRequire(import.meta.url),sharp=require('/Users/skyhand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const dir='assets/res/brickChopFeed';fs.mkdirSync(dir,{recursive:true});
const raw='/Users/skyhand/.codex/generated_images/01a0cbf0-ddba-70f3-a6ee-b21f1e46c43c/';
const source={background:'exec-13b2775d-622a-42b9-bff9-e11fda8dc265.png',brick:'exec-5ac44578-5137-4b71-895e-fa689eaea859.png',hand:'exec-effd06aa-0a9e-401e-a304-facc3cf5acc1.png'};
const assets=[];
async function save(name,im,w,h){
 await im.toFile(dir+'/'+name);
 const template=fs.readFileSync('assets/res/foodDeliveryFeed/white.png.meta','utf8'),old=JSON.parse(template).uuid;
 const m=JSON.parse(template.replaceAll(old,uuid(name)).replaceAll('"white"',JSON.stringify(name.split('.')[0])));
 m.files=['.json',name.endsWith('.jpg')?'.jpg':'.png'];m.userData.hasAlpha=!name.endsWith('.jpg');
 const d=m.subMetas.f9941.userData;
 Object.assign(d,{width:w,height:h,rawWidth:w,rawHeight:h,packable:false});
 const x=w/2,y=h/2;
 d.vertices.rawPosition=[-x,-y,0,x,-y,0,-x,y,0,x,y,0];d.vertices.minPos=[-x,-y,0];d.vertices.maxPos=[x,y,0];
 d.vertices.uv=[0,h,w,h,0,0,w,0];
 fs.writeFileSync(dir+'/'+name+'.meta',JSON.stringify(m,null,2)+'\n');
 assets.push([name,fs.statSync(dir+'/'+name).size]);
}
const png={palette:true,colours:96,dither:0,effort:10};
await save('background.jpg',sharp(raw+source.background).resize(512,1109,{fit:'fill'}).jpeg({quality:76,mozjpeg:true}),512,1109);
const brick=await sharp(raw+source.brick).trim({threshold:20}).resize(240,76,{fit:'fill'}).png(png).toBuffer();
await save('brick.png',sharp(brick),240,76);
for(const [name,left] of [['brick-left.png',0],['brick-right.png',120]])await save(name,sharp(brick).extract({left,top:0,width:120,height:76}).png(png),120,76);
await save('hand.png',sharp(raw+source.hand).trim({threshold:20}).resize(400,114,{fit:'fill'}).png(png),400,114);
// A simple authored gradient for the power meter, not a new illustration.
const pixels=Buffer.alloc(8*256*4);
for(let y=0;y<256;y++){const t=1-y/255;const rgb=t<.75?[55+200*t/.75,242,80-50*t/.75]:[255,242-120*(t-.75)/.25,30];for(let x=0;x<8;x++){const i=(y*8+x)*4;pixels[i]=rgb[0];pixels[i+1]=rgb[1];pixels[i+2]=rgb[2];pixels[i+3]=255;}}
await save('power.png',sharp(pixels,{raw:{width:8,height:256,channels:4}}).png({palette:true}),8,256);
fs.writeFileSync(dir+'.meta',JSON.stringify({ver:'1.2.0',importer:'directory',imported:true,uuid:uuid('directory'),files:[],subMetas:{},userData:{}},null,2)+'\n');
console.log(assets,'Total:',assets.reduce((n,x)=>n+x[1],0));
