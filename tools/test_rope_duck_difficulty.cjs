const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/scripts/ropeDuckRules.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:out});
const {RopeDuckRound,ropeDuckDifficultyAt}=out;
assert.equal(typeof ropeDuckDifficultyAt,'function','distance difficulty profile is explicit');
assert.deepEqual(ropeDuckDifficultyAt(650),ropeDuckDifficultyAt(10000),'difficulty is capped');
function catalog(){const r=new RopeDuckRound(),all=new Map();for(let x=130;x<42000;x+=700){r.ducks.forEach((d,i)=>Object.assign(d,{x:x+i*85,y:600,vx:0,vy:0,grounded:false}));r.tick(1/120);for(const p of r.platforms)all.set(p.id,{...p});assert(r.platforms.length<14);}return [...all.values()].sort((a,b)=>a.id-b.id);}
const route=catalog();assert.equal(JSON.stringify(route),JSON.stringify(catalog()),'same early and late route on restart');
let firstFive=[];
for(let i=1;i<route.length;i++){
 const p=route[i],prev=route[i-1],distance=(p.start-175)/14,width=p.end-p.start,gap=p.start-prev.end,dy=Math.abs(p.y-prev.y);
 assert.equal(p.id,prev.id+1);assert(gap>=55&&gap<=170);assert(dy<=40);assert(width>=240);assert(Math.abs(p.y)<=50);
 if(distance<80){assert(width>=420);assert(gap<=85);assert.equal(dy,0);}
 if(distance<140)assert.equal(p.spikeX,null,'tutorial never spawns spikes');
 if(distance>=200&&p.id%4===0){assert(p.recovery);assert(width>=440);assert(gap<=80);assert.equal(dy,0);assert.equal(p.spikeX,null);assert.notEqual(p.energyX,null);}
 if(p.spikeX!==null){assert(width>=360);assert(gap<=110);assert(dy<=12);assert(p.spikeX-p.start>=200);assert(p.end-(p.spikeX+48)>=100);if(p.energyX!==null)assert(p.spikeX-p.energyX>=80);}
 if(p.energyX!==null&&firstFive.length<5)firstFive.push((p.energyX-175)/14);
}
assert(firstFive[4]>=160&&firstFive[4]<=220,'first five energy opportunities arrive by 160–220m');
assert(route.some(p=>p.spikeX!==null));assert(route.some(p=>(p.start-175)/14>650&&p.end-p.start<300));
// Restore a late checkpoint after pruning: use map position, never the retained high score.
const r=new RopeDuckRound();r.ducks.forEach(d=>{d.x=10000;d.y=600;d.grounded=false});r.tick(1/120);
const safe=r.platforms.find(p=>p.id>10&&p.spikeX===null);assert(safe);
r.checkpoint={id:safe.id,x:safe.start+60,y:safe.y};r.phase='failure';r.distance=2000;assert(r.revive());
for(const p of r.platforms){const original=route.find(q=>q.id===p.id);for(const k of ['start','end','y','spikeX','energyX','recovery'])assert.equal(p[k],original[k],`regenerated ${p.id}.${k}`);}
assert.equal(r.distance,2000);
console.log('PASS difficulty caps, tutorial, recovery rhythm, safe hazards, early energy, deterministic revival, bounded terrain; fifth energy at',firstFive[4].toFixed(1),'m');
const pickups=new RopeDuckRound();
for(const p of route.filter(p=>p.energyX!==null).slice(0,5)){
 pickups.platforms=[{...p,energyTaken:false}];pickups.ducks.forEach((d,i)=>Object.assign(d,{x:p.energyX-i*85,y:p.y+75,vx:0,vy:0,grounded:false}));pickups.tick(1/120);
}
assert.equal(pickups.energy,0);assert(pickups.boost>3&&pickups.invulnerable>4,'fifth reachable pickup triggers the existing boost');
const hazardCheckpoint=new RopeDuckRound(),hazard=route.find(p=>p.spikeX!==null);
hazardCheckpoint.platforms.push({...hazard});hazardCheckpoint.ducks.forEach((d,i)=>Object.assign(d,{x:hazard.start+55+i*85,y:hazard.y,vx:0,vy:0,grounded:true}));hazardCheckpoint.tick(1/120);
assert.equal(hazardCheckpoint.checkpoint.id,0,'hazard platforms are not selected for revival checkpoints');
// Try a bounded set of real charge/release timings on representative transitions.
const samples=[50,150,250,450,700,1200].map(m=>route.findIndex(p=>(p.start-175)/14>=m));
for(const index of samples){
 const target=route[index],previous=route[index-1];let crossed=false;
 for(const power of [.08,.12,.16,.2])for(const first of [0,1]){
  if(crossed)continue;const attempt=new RopeDuckRound();attempt.platforms=route.slice(index-1,index+5).map(p=>({...p,energyTaken:true}));attempt.selected=first;
  attempt.ducks.forEach((d,i)=>Object.assign(d,{x:previous.end-80+i*55,y:previous.y,vx:0,vy:0,grounded:true}));
  for(let t=0;t<120*8&&attempt.phase==='playing';t++){
   if(!attempt.charging)attempt.beginCharge();else if(attempt.charge>=power-1e-6)attempt.release();attempt.tick(1/120);attempt.drainEvents();
   if(attempt.ducks.every(d=>d.x>=target.start)&&attempt.ducks.some(d=>d.grounded&&Math.abs(d.y-target.y)<1)){crossed=true;break;}
  }
 }
 assert(crossed,`representative transition near ${Math.floor((target.start-175)/14)}m has a playable jump route`);
}
console.log('PASS five-pickup boost, safe revival checkpoint and real-input transitions across all difficulty stages');
