import { Color, Node, Rect, Size, Sprite, SpriteFrame, Texture2D, UITransform } from 'cc';
import type { Attack } from './motoRaceRules';

/** Atlas contract: 3 player actions × 4 frames, 3 rival palettes × 4 driving frames, pine, three cars, three rival punch palettes. */
export function riderPose(steer:number,attackTime:number,kind:Attack,side:number,time:number):{frame:number;flip:boolean} {
  if(attackTime>0) return {frame:(kind==='kick'?8:4)+Math.min(3,Math.floor((.3-attackTime)/.3*4)),flip:side<0};
  return {frame:steer<-.2?1:steer>.2?2:Math.floor(time*9)%5===4?3:0,flip:false};
}
export function opponentFrame(drivingFrame:number,palette:number):number {return drivingFrame>=4?28+(palette-1)*4+(drivingFrame-4)%4:12+(palette-1)*4+drivingFrame;}

/** Reusable sprite pool. A single packed texture lets scenery and bikes share batches. */
export class MotoRaceArt {
  private frames:SpriteFrame[]=[];
  private pool:Sprite[]=[];
  private used=0;
  private white=new Color(255,255,255,255);
  private hurt=new Color(255,208,185,215);
  constructor(private root:Node,atlas:Texture2D) {
    for(let i=0;i<40;i++) {
      const frame=new SpriteFrame();frame.texture=atlas;
      frame.rect=new Rect(i%4*256,Math.floor(i/4)*256,256,256);
      frame.originalSize=new Size(256,256);frame.packable=false;
      this.frames.push(frame);
    }
  }
  begin():void {this.used=0;}
  private draw(frame:number,x:number,y:number,scale:number,flip=false,angle=0,flash=false,opacity=1):void {
    let sprite=this.pool[this.used];
    if(!sprite) {
      const node=new Node('RaceArt'+this.used);node.layer=this.root.layer;this.root.addChild(node);
      const transform=node.addComponent(UITransform);transform.setContentSize(256,256);
      // All processed frames share the rear-wheel / trunk contact anchor (128,237).
      transform.setAnchorPoint(.5,19/256);
      sprite=node.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;
      this.pool.push(sprite);
    }
    sprite.node.active=true;sprite.spriteFrame=this.frames[frame];const tint=flash?this.hurt:this.white;sprite.color=new Color(tint.r,tint.g,tint.b,Math.round(tint.a*opacity));
    sprite.node.setPosition(x,y,0);sprite.node.setScale(flip?-scale:scale,scale,1);sprite.node.angle=angle;
    this.used++;
  }
  rider(x:number,y:number,scale:number,steer:number,attackTime:number,kind:Attack,side:number,time:number,palette=0,fallen=false,flash=false,opacity=1):void {
    const pose=riderPose(steer,attackTime,kind,side,time);
    this.draw(palette?opponentFrame(pose.frame,palette):pose.frame,x,y,scale,pose.flip,fallen?-82:0,flash,opacity);
  }
  car(x:number,y:number,scale:number,kind=0):void {this.draw(25+Math.max(0,Math.min(2,kind)),x,y,scale);}
  tree(x:number,y:number,scale:number,flip:boolean):void {this.draw(24,x,y,scale,flip);}
  end():void {for(let i=this.used;i<this.pool.length;i++)this.pool[i].node.active=false;}
  destroy():void {this.frames.forEach(frame=>frame.destroy());this.frames.length=0;}
}
