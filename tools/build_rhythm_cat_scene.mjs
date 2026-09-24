import fs from 'node:fs';import {buildRhythmCatScene,appendRhythmCatCard,catUuid,SCENE_UUID} from './rhythm_cat_authoring.mjs';
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
write('assets/gamescene/RhythmCatFeedGameScene.scene',buildRhythmCatScene());
write('assets/gamescene/RhythmCatFeedGameScene.scene.meta',{ver:'1.1.50',importer:'scene',imported:true,uuid:SCENE_UUID,files:['.json'],subMetas:{},userData:{}});
for(const n of ['rhythmCatChart','rhythmCatRules','rhythmCatInput','rhythmCatTimeline','rhythmCatFeedGameScene'])write(`assets/scripts/${n}.ts.meta`,{ver:'4.0.24',importer:'typescript',imported:true,uuid:catUuid(n+'.ts'),files:[],subMetas:{},userData:{}});
if(process.argv.includes('--main-card')){const p='assets/gamescene/NewMainScene.scene',o=JSON.parse(fs.readFileSync(p));appendRhythmCatCard(o);write(p,o);}
console.log('RhythmCatFeedGameScene authored',SCENE_UUID);
