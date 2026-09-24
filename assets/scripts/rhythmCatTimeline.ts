export interface CatAudioPort { play():void; pause():void; stop():void; seek(time:number):void; position():number; playing():boolean; }
export type CatPauseReason = 'background' | 'feed' | 'advert' | 'reward' | 'leaving' | 'result';
export const CAT_NORMAL_RATE=.85;
export const CAT_REWARD_RATE=.70;
/** Independent clock: lifecycle pauses never consume chart time. */
export class RhythmCatTimeline {
  time=0; started=false; awaitingGesture=false;
  private reasons=new Set<CatPauseReason>();
  private muted=false; private confirmed=false; private pending=0;
  private speed=CAT_NORMAL_RATE;
  constructor(private audio:CatAudioPort, private duration:number) {}
  get paused():boolean {return this.reasons.size>0;}
  get rate():number {return this.speed;}
  setRate(value:number):void {if(Number.isFinite(value)&&value>0&&value<=1)this.speed=value;}
  start(muted:boolean):boolean {
    if(this.started && !this.awaitingGesture)return true;
    this.muted=muted;this.pending=0;this.awaitingGesture=false;this.started=true;this.confirmed=muted;
    if(this.paused)return true;
    return this.play();
  }
  private play():boolean {
    if(this.muted){this.confirmed=true;return true;}
    try{this.audio.seek(this.time);this.audio.play();this.pending=0;this.confirmed=false;return true;}
    catch{this.started=false;this.awaitingGesture=true;return false;}
  }
  reset():void { this.audio.stop();this.time=0;this.speed=CAT_NORMAL_RATE;this.started=false;this.confirmed=false;this.awaitingGesture=false;this.pending=0;this.reasons.delete('result');this.reasons.delete('reward'); }
  setPaused(reason:CatPauseReason,value:boolean):void {
    const before=this.paused;if(value)this.reasons.add(reason);else this.reasons.delete(reason);
    if(!before&&this.paused)this.audio.pause();
    else if(before&&!this.paused&&this.started)this.play();
  }
  tick(dt:number):number {
    if(!this.started||this.paused||!Number.isFinite(dt)||dt<=0)return this.time;
    if(!this.confirmed){
      if(this.audio.playing())this.confirmed=true;
      else {this.pending+=dt;if(this.pending>=.5){this.audio.pause();this.started=false;this.awaitingGesture=true;}return this.time;}
    }
    const step=dt*this.speed, predicted=this.time+step;let next=predicted;
    if(!this.muted){const p=this.audio.position();if(Number.isFinite(p)&&p>this.time&&Math.abs(p-predicted)<.15)next=predicted+Math.max(-step*.1,Math.min(step*.1,(p-predicted)*.1));}
    this.time=Math.min(this.duration,Math.max(this.time,next));return this.time;
  }
}
