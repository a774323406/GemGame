import fs from 'node:fs';
import {buildBrickChopScene,appendBrickChopCard,uuid,SCENE_UUID} from './brick_chop_authoring.mjs';
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
for(const name of ['brickChopFeedGameScene.ts','brickChopRules.ts','brickChopFeedback.ts'])write('assets/scripts/'+name+'.meta',{ver:'4.0.24',importer:'typescript',imported:true,uuid:uuid(name),files:[],subMetas:{},userData:{}});
const i=process.argv.indexOf('--output-dir'),dir=i<0?'assets/gamescene':process.argv[i+1];fs.mkdirSync(dir,{recursive:true});
write(dir+'/BrickChopFeedGameScene.scene',buildBrickChopScene());write(dir+'/BrickChopFeedGameScene.scene.meta',{ver:'1.1.50',importer:'scene',imported:true,uuid:SCENE_UUID,files:['.json'],subMetas:{},userData:{}});
if(process.argv.includes('--lobby')){const p='assets/gamescene/NewMainScene.scene',o=JSON.parse(fs.readFileSync(p));appendBrickChopCard(o);write(p,o);}
console.log('Authored BrickChopFeedGameScene',SCENE_UUID);
