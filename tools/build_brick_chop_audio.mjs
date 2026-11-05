import fs from 'node:fs';
import {uuid} from './brick_chop_ids.mjs';
const dir='assets/res/brickChopFeed';
for(const [name,duration] of [['swing',.15],['impact',.46]]){
 const rate=22050,length=Math.round(rate*duration),buffer=Buffer.alloc(44+length*2);
 buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(length*2,40);
 let seed=7621,low=0,mid=0;
 for(let i=0;i<length;i++){
  const t=i/rate;seed=seed*16807%2147483647;const noise=seed/2147483647*2-1;low=low*.91+noise*.09;mid=mid*.55+noise*.45;
  let v=0;
  if(name==='swing')v=(mid-low)*Math.pow(Math.sin(Math.PI*t/duration),1.4)*1.6;
  else{
   const thud=Math.sin(2*Math.PI*(95*t-48*t*t))*Math.exp(-t*19)*.65;
   const crack=(noise*.34+mid*.5)*Math.exp(-t*38);
   const ceramic=(Math.sin(2*Math.PI*1930*t)+.45*Math.sin(2*Math.PI*2870*t))*Math.exp(-t*32)*.12;
   let crumble=0;for(const time of [.075,.15,.23,.31])if(t>=time)crumble+=(noise-mid)*Math.exp(-(t-time)*65)*.24;
   v=thud+crack+ceramic+crumble;
  }
  const envelope=Math.min(1,t/.0015)*Math.min(1,(duration-t)/.012);
  buffer.writeInt16LE(Math.round(Math.max(-.92,Math.min(.92,v*envelope))*32767),44+i*2);
 }
 fs.writeFileSync(`${dir}/${name}.wav`,buffer);
 fs.writeFileSync(`${dir}/${name}.wav.meta`,JSON.stringify({ver:'1.0.0',importer:'audio-clip',imported:true,uuid:uuid(name+'.wav'),files:['.json','.wav'],subMetas:{},userData:{downloadMode:0}},null,2)+'\n');
}
console.log('Built original short palm-swing and brick-impact sounds; no background music inside.');
