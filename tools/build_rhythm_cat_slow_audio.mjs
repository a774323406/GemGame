// Pitch-preserving alternate recording for platforms without runtime playbackRate.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {catUuid} from './rhythm_cat_authoring.mjs';
const root='assets/res/rhythmCatFeed';
for(const [name,rate] of [['track-normal.mp3',.85],['track-slow.mp3',.70]]){
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',`${root}/track.mp3`,
  '-af',`atempo=${rate},apad`,'-t',String(32.666667/rate),'-codec:a','libmp3lame','-b:a','96k',`${root}/${name}`],{stdio:'inherit'});
 const meta=JSON.parse(fs.readFileSync(`${root}/track.mp3.meta`));meta.uuid=catUuid(name);
 fs.writeFileSync(`${root}/${name}.meta`,JSON.stringify(meta,null,2)+'\n');
 console.log(`${rate*100}% tempo soundtrack generated from the original recording`);
}
