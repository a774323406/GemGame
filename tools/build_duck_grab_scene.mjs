import fs from 'node:fs';import {buildDuckGrabScene,replaceLobbyCard,uuid,SCENE_UUID} from './duck_grab_authoring.mjs';
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
for(const name of ['duckGrabFeedGameScene.ts','duckGrabRules.ts'])write('assets/scripts/'+name+'.meta',{ver:'4.0.24',importer:'typescript',imported:true,uuid:uuid(name),files:[],subMetas:{},userData:{}});
const i=process.argv.indexOf('--output-dir'),dir=i<0?'assets/gamescene':process.argv[i+1];fs.mkdirSync(dir,{recursive:true});
write(dir+'/DuckGrabFeedGameScene.scene',buildDuckGrabScene());write(dir+'/DuckGrabFeedGameScene.scene.meta',{ver:'1.1.50',importer:'scene',imported:true,uuid:SCENE_UUID,files:['.json'],subMetas:{},userData:{}});
if(process.argv.includes('--lobby')){const p='assets/gamescene/NewMainScene.scene',o=JSON.parse(fs.readFileSync(p));replaceLobbyCard(o);write(p,o);}
const p='assets/scripts/framework/GameSceneBundle.ts';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/(\[GameSceneName.DuckGrabFeedGame\]: ")[^"]+/,`$1${SCENE_UUID}`));console.log('Authored DuckGrabFeedGameScene',SCENE_UUID);
