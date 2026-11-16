const fs=require('node:fs'),assert=require('node:assert/strict');
for(const name of ['JuggleBall','DuckGrabFeed','FoodDeliveryFeed','BrickChopFeed','RopeDuckFeed','TruckStackFeed','JellyCrushFeed']) {
 const o=JSON.parse(fs.readFileSync(`assets/gamescene/${name}GameScene.scene`));
 const node=n=>o.find(v=>v.__type__==='cc.Node'&&v._name===n),comp=(n,t)=>n._components.map(r=>o[r.__id__]).find(v=>v.__type__===t);
 for(const height of [1334,1624]) {
  for(const n of o.filter(v=>v.__type__==='cc.Node')) {
   const w=comp(n,'cc.Widget'),b=comp(n,'cc.Button');if(!b||!w||w._isAbsVerticalCenter!==false)continue;
   const size=comp(n,'cc.UITransform')._contentSize;
   assert(height/2+w._verticalCenter*height-size.height/2>=80,`${name} ${n._name} bottom margin ${height}`);
  }
 }
 if(name==='DuckGrabFeed')assert(comp(node('SlowdownButton'),'cc.Widget')._bottom>=80);
 console.log('PASS supported portrait sizes:',name);
}
