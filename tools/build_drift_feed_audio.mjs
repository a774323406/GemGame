import fs from 'node:fs';
import {uuid} from './drift_feed_authoring.mjs';
const dir='assets/res/driftFeed/audio';fs.mkdirSync(dir,{recursive:true});const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
write(dir+'.meta',{ver:'1.2.0',importer:'directory',imported:true,uuid:uuid('audio'),files:[],subMetas:{},userData:{}});
for(const [name,duration] of [['engine',1],['drift',1],['attach',.09],['score',.16],['boost',.7],['crash',.75]]){
 const rate=22050,len=Math.round(rate*duration),b=Buffer.alloc(44+len*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(len*2,40);
 let seed=815,low=0;
 for(let i=0;i<len;i++){const t=i/rate;seed=(seed*16807)%2147483647;const noise=seed/2147483647*2-1;low=low*.86+noise*.14;const envelope=Math.min(1,t/.008)*Math.min(1,(duration-t)/.014);let v=0;
  if(name==='engine')v=(Math.sin(t*Math.PI*2*70)*.2+Math.sin(t*Math.PI*2*140)*.12+Math.sin(t*Math.PI*2*210)*.05)*(1+.15*Math.sin(t*Math.PI*2*13));
  if(name==='drift')v=low*.7+Math.sin(t*2*Math.PI*870)*.04;
  if(name==='attach')v=(Math.sin(t*Math.PI*2*(1500-700*t/duration))*.45+noise*.1)*Math.exp(-t*28);
  if(name==='score')v=Math.sin(t*Math.PI*2*(t<.07?880:1320))*.32*Math.exp(-t*12);
  if(name==='boost')v=low*.9*Math.sin(Math.PI*t/duration)+Math.sin(t*2*Math.PI*(100+200*t))*.1;
  if(name==='crash')v=(noise*.34+low*.75+Math.sin(2*Math.PI*65*t)*.25)*Math.exp(-t*7);
  b.writeInt16LE(Math.round(Math.max(-.92,Math.min(.92,v*envelope))*32767),44+i*2);
 }
 fs.writeFileSync(`${dir}/${name}.wav`,b);write(`${dir}/${name}.wav.meta`,{ver:'1.0.0',importer:'audio-clip',imported:true,uuid:uuid(name+'.wav'),files:['.json','.wav'],subMetas:{},userData:{downloadMode:0}});
}
console.log('Generated 6 original synthesized drift sounds.');
