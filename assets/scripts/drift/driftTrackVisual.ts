/** The original 180-degree road prefab places its 1200-wide sprite 300 units right of the root. */
export function roadSpritePosition(piece:{prefabName:string;x:number;y:number;heading:number;scaleX:number}):{x:number;y:number}{
 const offset=piece.prefabName==='road_180_r300'?300*piece.scaleX:0;
 return {x:piece.x+Math.cos(piece.heading)*offset,y:piece.y-Math.sin(piece.heading)*offset};
}
