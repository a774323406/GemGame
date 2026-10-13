import fs from 'node:fs';
import {buildDriftFeedScene,appendDriftCard,SCENE_UUID,uuid} from './drift_feed_authoring.mjs';
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
for(const f of ['driftFeedGameScene.ts',...fs.readdirSync('assets/scripts/drift').filter(n=>n.endsWith('.ts')).map(n=>'drift/'+n)]){
 const file='assets/scripts/'+f+'.meta';if(!fs.existsSync(file))write(file,{ver:'4.0.24',importer:'typescript',imported:true,uuid:uuid(f),files:[],subMetas:{},userData:{}});
}
if(!fs.existsSync('assets/scripts/drift.meta'))write('assets/scripts/drift.meta',{ver:'1.2.0',importer:'directory',imported:true,uuid:uuid('scripts/drift'),files:[],subMetas:{},userData:{}});
const arg=process.argv.indexOf('--output-dir'),dir=arg<0?'assets/gamescene':process.argv[arg+1];fs.mkdirSync(dir,{recursive:true});
write(dir+'/DriftFeedGameScene.scene',buildDriftFeedScene());write(dir+'/DriftFeedGameScene.scene.meta',{ver:'1.1.50',importer:'scene',imported:true,uuid:SCENE_UUID,files:['.json'],subMetas:{},userData:{}});
if(process.argv.includes('--lobby')){const file='assets/gamescene/NewMainScene.scene',o=JSON.parse(fs.readFileSync(file));appendDriftCard(o);write(file,o);}
console.log('Authored DriftFeedGameScene',SCENE_UUID);
