import {SpeedArrowEffect} from './SpeedArrowEffect';
import { Node, Sprite, SpriteFrame, UITransform, Graphics, Color, view } from 'cc';
import { DriftFeedRun, DriftFeedSnapshot } from './driftFeedRules';
import { roadSpritePosition } from './driftTrackVisual';
import {driftViewport,roadBounds,overlaps} from './driftRoadVisibility';
import { TrackRuntime, EndlessRoadVisual } from './TrackRuntime';
import {ENDLESS_COLORS} from './driftEndlessStages';
export const DRIFT_THEMES=ENDLESS_COLORS;
export class DriftFeedView {
 readonly roadRoot:Node;
 readonly markerRoot:Node;readonly upperMarkerRoot:Node;
 private markerTiles=new Map<Node,Node>();
 private markerPool:Node[]=[];
 private orderedLayer=-1;
 private carTint: boolean=null;
 readonly detail:Graphics;
 readonly car:Node;
 readonly effectRoot:Node;
 readonly trailsRoot:Node;readonly upperTrailsRoot:Node;readonly bridgeRoot:Node;
 private roads=new Map<number,Node>();
 private pool:Node[]=[];
 private railKinds=new WeakMap<Node,string>();
 private pieces=new Map<number,EndlessRoadVisual>();
 constructor(readonly root:Node,private frames:SpriteFrame[],carFrame:SpriteFrame,private arrowFrame:SpriteFrame){
  this.roadRoot=this.node('Roads',root);this.trailsRoot=this.node('WheelTrails',root);this.bridgeRoot=this.node('Bridges',root);this.upperTrailsRoot=this.node('BridgeTrails',root);this.detail=this.node('RopeAndPins',root).addComponent(Graphics);
  this.car=this.node('OrangeCar',root);this.car.addComponent(UITransform);const sp=this.car.addComponent(Sprite);sp.spriteFrame=carFrame;sp.sizeMode=Sprite.SizeMode.CUSTOM;sp.trim=false;this.car.getComponent(UITransform).setContentSize(125,238);this.car.setScale(.58,.58,1);
  const approach=this.node('ApproachRoad',this.roadRoot);approach.addComponent(UITransform);const road=approach.addComponent(Sprite);road.spriteFrame=this.frames[0];road.sizeMode=Sprite.SizeMode.CUSTOM;approach.getComponent(UITransform).setContentSize(600,600);approach.setPosition(0,-300);
  this.effectRoot=this.node('Effects',root);
  this.markerRoot=this.node('BoostArrows',root);this.upperMarkerRoot=this.node('BridgeBoostArrows',root);
  // Prepare the original 10-tile boost plus spare groups before driving starts.
  if(this.arrowFrame)for(let i=0;i<12;i++){const markers=this.createMarkerTile();markers.active=false;this.markerPool.push(markers);}
 }
 private node(name:string,parent:Node):Node{const n=new Node(name);n.layer=parent.layer;parent.addChild(n);return n;}
 render(s:DriftFeedSnapshot,track:TrackRuntime,dt:number):void {
  // Original endless view: fixed orientation and scale, original world-to-screen offset.
  const look=track.getTrackPoint(s.progress+240);
  this.root.angle=0;this.root.setScale(1,1,1);
  this.root.setPosition(-(s.car.x*.78+look.x*.22),-(s.car.y+235));
  const keep=new Set<number>(),viewport=driftViewport(s.car,look,view.getVisibleSize().height);
  for(const piece of track.getEndlessRoadVisuals()){
   keep.add(piece.id);let n=this.roads.get(piece.id);
   if(n)continue;
   // Only create offscreen visuals close enough to be needed; static tiles are configured once.
   if(!overlaps(roadBounds(piece),viewport))continue;
   this.pieces.set(piece.id,piece);
   if(!n){n=this.pool.pop()||this.node('RoadTile',this.roadRoot);n.active=true;this.roads.set(piece.id,n);if(!n.getComponent(Sprite)){n.addComponent(UITransform);n.addComponent(Sprite);}}
   n.setParent(piece.layer?this.bridgeRoot:this.roadRoot);
   this.configureMarkers(n,piece,track);
   const index=piece.prefabName==='road_straight_600'?0:piece.prefabName==='road_left_90_r300'?1:2;
   const sp=n.getComponent(Sprite);sp.spriteFrame=this.frames[index];sp.sizeMode=Sprite.SizeMode.CUSTOM;
   n.getComponent(UITransform).setContentSize(index===2?1200:600,600);const pos=roadSpritePosition(piece);n.setPosition(pos.x,pos.y);n.angle=-piece.heading*180/Math.PI;n.setScale(piece.scaleX,1,1);
   const railKind=piece.layer?String(index):'ground';if(this.railKinds.get(n)!==railKind){this.railKinds.set(n,railKind);
   let rails=n.getChildByName('Guardrails')?.getComponent(Graphics);if(piece.layer){if(!rails)rails=this.node('Guardrails',n).addComponent(Graphics);rails.clear();rails.lineWidth=10;rails.strokeColor=new Color(35,39,42,220);
    if(index===0){for(const x of [-190,190]){rails.moveTo(x,-300);rails.lineTo(x,300);rails.stroke();}rails.lineWidth=5;rails.strokeColor=new Color(214,216,203);for(const x of [-181,181]){rails.moveTo(x,-300);rails.lineTo(x,300);rails.stroke();}}
    else{rails.lineWidth=8;rails.strokeColor=new Color(203,208,192,180);for(const radius of [113,487]){rails.arc(index===1?-300:0,-300,radius,0,index===1?Math.PI/2:Math.PI,true);rails.stroke();}}
   }else rails?.clear();
   }
  }
  for(const [id,n] of this.roads)if(!keep.has(id)&&!overlaps(roadBounds(this.pieces.get(id)),viewport)){n.active=false;this.recycleMarkers(n);this.pool.push(n);this.roads.delete(id);this.pieces.delete(id);}
  if(this.orderedLayer!==s.roadLayer){this.orderedLayer=s.roadLayer;
  const order=s.roadLayer?[this.roadRoot,this.markerRoot,this.trailsRoot,this.bridgeRoot,this.upperMarkerRoot,this.upperTrailsRoot,this.detail.node,this.car,this.effectRoot]:[this.roadRoot,this.markerRoot,this.trailsRoot,this.car,this.bridgeRoot,this.upperMarkerRoot,this.upperTrailsRoot,this.detail.node,this.effectRoot];
  order.forEach((n,i)=>n.setSiblingIndex(i));}
  this.car.setPosition(s.car.x,s.car.y);this.car.angle=-s.car.heading*180/Math.PI;
  this.car.active=true;
  const tint=s.phase==='crashing'||s.phase==='result';if(tint!==this.carTint){this.carTint=tint;this.car.getComponent(Sprite).color=tint?new Color(106,102,92):new Color(255,255,255);}
  this.drawDetails(s,track);
 }
 private recycleMarkers(tile:Node):void {
  const markers=this.markerTiles.get(tile);if(!markers)return;
  markers.active=false;this.markerTiles.delete(tile);this.markerPool.push(markers);
 }
 private createMarkerTile():Node {
  const markers=this.node('BoostTile',this.markerRoot);
  // Original speedArrow prefab geometry: 230x140 sprites at y=-60,0,60.
  for(let group=0;group<2;group++){
   const node=this.node('speedArrow',markers);node.setPosition(0,-150+group*300);
   for(let i=0;i<3;i++){const arrow=this.node('Arrow'+(i+1),node);const transform=arrow.addComponent(UITransform);const sprite=arrow.addComponent(Sprite);sprite.spriteFrame=this.arrowFrame;sprite.sizeMode=Sprite.SizeMode.CUSTOM;transform.setContentSize(230,140);arrow.setPosition(0,(i-1)*60);}
   node.addComponent(SpeedArrowEffect);
  }
  return markers;
 }
 private configureMarkers(tile:Node,piece:EndlessRoadVisual,track:TrackRuntime):void {
  const isBoost=piece.prefabName==='road_straight_600'&&track.speedStages.some(z=>piece.startS>=z.startS-1&&piece.startS<z.endS+600-1);
  let markers=this.markerTiles.get(tile);
  if(!isBoost||!this.arrowFrame){if(markers)markers.active=false;return;}
  if(!markers){markers=this.markerPool.pop()||this.createMarkerTile();this.markerTiles.set(tile,markers);}
  markers.active=true;markers.setParent(piece.layer?this.upperMarkerRoot:this.markerRoot);
  markers.setPosition(piece.x,piece.y);markers.angle=-piece.heading*180/Math.PI;
  markers.children.forEach((node,index)=>node.getComponent(SpeedArrowEffect).setPhaseOffset(((piece.startS+150+index*300)/600)*.12));
 }
 private drawDetails(s:DriftFeedSnapshot,track:TrackRuntime):void {
  const g=this.detail;g.clear();
  for(const a of track.anchors){
   if(a.recoverS<s.progress-500||a.constraintStartS>s.progress+1900)continue;
   const point=a.x!==undefined&&a.y!==undefined?{x:a.x,y:a.y}:track.pointWithOffset(a.s,a.offset);
   const {x,y}=point;
   g.fillColor=new Color(29,47,53,100);g.circle(x+5,y-8,34);g.fill();
   g.fillColor=new Color(255,188,49);g.circle(x,y,26);g.fill();g.lineWidth=7;g.strokeColor=new Color(255,239,174);g.circle(x,y,26);g.stroke();
   g.fillColor=new Color(49,58,58);g.circle(x,y,9);g.fill();
  }
  if(s.pin){g.lineWidth=7;g.strokeColor=new Color(255,223,100);g.moveTo(s.car.x,s.car.y);g.lineTo(s.pin.x,s.pin.y);g.stroke();}

 }
 reset():void{for(const n of this.roads.values()){n.active=false;this.recycleMarkers(n);this.pool.push(n);}this.roads.clear();this.pieces.clear();}
 dispose():void{this.markerRoot.destroy();this.upperMarkerRoot.destroy();this.markerTiles.clear();this.roadRoot.destroy();this.bridgeRoot.destroy();this.trailsRoot.destroy();this.upperTrailsRoot.destroy();this.detail.node.destroy();this.car.destroy();this.effectRoot.destroy();}
}
