import type { CatNote } from './rhythmCatChart';
export interface CatPose { x: number; radius: number; }
export interface CatJudgment { note: CatNote; caught: boolean; }
export type CatRoundStatus = 'ready' | 'playing' | 'success' | 'failed';
/** Each food resolves once; a short late window permits a last-moment rescue. */
export class RhythmCatRound {
  score = 0; lives = 3; time = 0; status: CatRoundStatus = 'ready';
  private resolved = new Set<number>();
  private notes: readonly CatNote[];
  constructor(notes: readonly CatNote[], private duration: number, private lateGrace=0) { this.notes = [...notes].sort((a,b) => a.hitTime-b.hitTime); }
  reset(): void { this.score=0; this.lives=3; this.time=0; this.resolved.clear(); this.status='ready'; }
  isResolved(id:number): boolean { return this.resolved.has(id); }
  start(): void { if (this.status==='ready') this.status='playing'; }
  advance(toTime: number, from: readonly [CatPose, CatPose], to: readonly [CatPose, CatPose]): CatJudgment[] {
    if (this.status!=='playing' || !Number.isFinite(toTime) || toTime<this.time) return [];
    const end=Math.min(this.duration,toTime), span=toTime-this.time, results: CatJudgment[]=[];
    const events: {note:CatNote; caught:boolean; at:number; order:number}[]=[];
    for(let order=0;order<this.notes.length;order++) {
      const note=this.notes[order];
      if(note.hitTime>end)break;
      if(this.resolved.has(note.id))continue;
      const deadline=Math.min(this.duration,note.hitTime+this.lateGrace);
      const start=Math.max(this.time,note.hitTime), stop=Math.min(end,deadline);
      const xAt=(t:number)=>span>0 ? from[note.side].x+(to[note.side].x-from[note.side].x)*(t-this.time)/span : to[note.side].x;
      const x0=xAt(start), x1=xAt(stop), radius=to[note.side].radius;
      let caughtAt:number|null=null;
      if(start<=stop) {
        if(Math.abs(x0-note.x)<=radius+1e-9)caughtAt=start;
        else if(x1!==x0) {
          // Sweep the cat across the active interval, including delayed frames.
          const edge=x0<note.x ? note.x-radius : note.x+radius;
          const f=(edge-x0)/(x1-x0);
          if(f>=0 && f<=1)caughtAt=start+(stop-start)*f;
        }
      }
      if(caughtAt!==null)events.push({note,caught:true,at:caughtAt,order});
      else if(deadline<=end)events.push({note,caught:false,at:deadline,order});
    }
    // Pending food must not block other food; failure stops only later judgments.
    events.sort((a,b)=>a.at-b.at || a.order-b.order);
    let failedAt=Infinity;
    for(const {note,caught,at} of events) {
      if(at>failedAt+1e-9)break;
      this.resolved.add(note.id);
      if (caught) this.score++; else this.lives=Math.max(0,this.lives-1);
      results.push({note,caught});
      if (this.lives===0) {
        this.status='failed';
        failedAt=Math.min(failedAt,at);
      }
    }
    this.time=end;
    if (this.status==='playing' && end>=this.duration) this.status='success';
    return results;
  }
}
