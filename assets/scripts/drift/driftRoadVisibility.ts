import {EndlessRoadVisual} from './TrackRuntime';
import {roadSpritePosition} from './driftTrackVisual';
export type ViewBounds={left:number;right:number;bottom:number;top:number};
export function roadBounds(piece:EndlessRoadVisual):ViewBounds{
 const p=roadSpritePosition(piece),w=piece.prefabName==='road_180_r300'?1200:600;
 const cos=Math.abs(Math.cos(piece.heading)),sin=Math.abs(Math.sin(piece.heading));
 const x=(w*cos+600*sin)/2,y=(w*sin+600*cos)/2;
 return {left:p.x-x,right:p.x+x,bottom:p.y-y,top:p.y+y};
}
export function overlaps(a:ViewBounds,b:ViewBounds):boolean{return a.left<=b.right&&a.right>=b.left&&a.bottom<=b.top&&a.top>=b.bottom;}
export function driftViewport(car:{x:number;y:number},look:{x:number},height:number,margin=360):ViewBounds{
 const x=car.x*.78+look.x*.22,y=car.y+235;
 return {left:x-375-margin,right:x+375+margin,bottom:y-height/2-margin,top:y+height/2+margin};
}
