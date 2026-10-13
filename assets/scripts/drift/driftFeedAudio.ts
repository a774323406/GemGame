import {Node,AudioClip,AudioSource,isValid} from 'cc';
import gameStorage from '../framework/gameStorage';
import {DriftFeedSnapshot,DriftFeedEvent} from './driftFeedRules';
export class DriftFeedAudio {
 private music:AudioSource;private engine:AudioSource;private drift:AudioSource;private one:AudioSource;private unlocked=false;private suspended=false;private disposed=false;
 constructor(private root:Node,private clips:AudioClip[]){this.music=this.source('Music',6);this.engine=this.source('Engine',0);this.drift=this.source('Tires',1);this.one=this.source('DriftOneShot',-1);}
 private source(name:string,index:number):AudioSource{const n=new Node(name);this.root.addChild(n);const a=n.addComponent(AudioSource);a.playOnAwake=false;if(index>=0){a.clip=this.clips[index]||null;a.loop=true;}return a;}
 unlock():void{if(!this.disposed)this.unlocked=true;}
 setSuspended(value:boolean):void{if(this.disposed)return;this.suspended=value;if(value){this.reset();this.music.pause();}}
 private get audible():boolean{return !this.disposed&&this.unlocked&&!this.suspended&&gameStorage.getSound()!==1;}
 consume(events:readonly DriftFeedEvent[]):void {
  if(this.disposed)return;
  const index:{[key:string]:number}={attach:2,curve:3,'boost-start':4,crash:5};
  for(const e of events){if(e.type==='crash')this.reset();if(this.audible&&index[e.type]!==undefined&&this.clips[index[e.type]]){this.one.stop();this.one.clip=this.clips[index[e.type]];this.one.volume=e.type==='crash'?.8:.65;this.one.play();}}
 }
 sync(s:DriftFeedSnapshot,dt:number):void{
  if(this.disposed)return;
  const musicAllowed=!this.disposed&&this.unlocked&&!this.suspended&&gameStorage.getMusic()!==1;
  this.music.volume=s.phase==='crashing'||s.phase==='result'?.08:.18;
  if(musicAllowed&&this.music.clip){if(!this.music.playing)this.music.play();}else this.music.pause();
  if(!this.audible)this.one.stop();
  const driving=this.audible&&s.phase==='driving';
  for(const [a,wanted,volume] of [[this.engine,driving,s.bursting?.25:.13],[this.drift,driving&&!!s.pin,.35]] as [AudioSource,boolean,number][]){
   if(wanted&&a.clip){a.volume+=(volume-a.volume)*Math.min(1,dt*10);if(!a.playing)a.play();}else{a.stop();a.volume=0;}
  }
 }
 reset():void{if(this.disposed)return;this.engine.stop();this.drift.stop();this.one.stop();}
 dispose():void{
  if(this.disposed)return;
  this.disposed=true;
  // Cocos tears down Canvas children before the controller's onDestroy.
  // Explicit disposal can still stop and remove live owned audio nodes.
  for(const source of [this.music,this.engine,this.drift,this.one]){
   if(!isValid(source,true)||!isValid(source.node,true))continue;
   source.stop();source.node.destroy();
  }
 }
}
