import { SceneAuthor, ref } from './feed_scene_authoring.mjs';
// Keep interactive edge controls inside both supported portrait sizes.
export function fitFeedScreenControls(objects, sceneName) {
 const find=name=>objects.findIndex(o=>o.__type__==='cc.Node'&&o._name===name);
 const comp=(id,type)=>objects[id]._components.map(r=>objects[r.__id__]).find(o=>o.__type__===type);
 const canvas=find('Canvas');
 const author=new SceneAuthor(objects,'feedScreen');author.serial=objects.length;
 const anchor=(name,flags,offsets,reparent=false)=>{
  const id=find(name);if(id<0)return;
  if(reparent&&objects[id]._parent.__id__!==canvas){const old=objects[id]._parent.__id__;objects[old]._children=objects[old]._children.filter(r=>r.__id__!==id);objects[canvas]._children.push(ref(id));objects[id]._parent=ref(canvas);}
  let w=comp(id,'cc.Widget');if(!w){author.widget(id,flags,offsets);w=comp(id,'cc.Widget');}
  Object.assign(w,{_enabled:true,_alignFlags:flags,_alignMode:2,...offsets});
 };
 if(sceneName==='JuggleBallGameScene') {
  // Store the tall-screen layout for Creator; Widgets adapt it to shorter screens.
  comp(canvas,'cc.UITransform')._contentSize={__type__:'cc.Size',width:750,height:1624};
  objects[canvas]._lpos.x=375;objects[canvas]._lpos.y=812;
  const camera=find('Camera');
  if(camera>=0&&comp(camera,'cc.Camera'))comp(camera,'cc.Camera')._orthoHeight=812;
  for(const name of ['JuggleBackground','Level2Background']) {
   const id=find(name);if(id<0)continue;
   objects[id]._lpos={__type__:'cc.Vec3',x:0,y:0,z:0};
   objects[id]._lscale={__type__:'cc.Vec3',x:1,y:1,z:1};
   comp(id,'cc.UITransform')._contentSize={__type__:'cc.Size',width:750,height:1624};
   const sprite=comp(id,'cc.Sprite');if(sprite)sprite._sizeMode=0;
   anchor(name,45,{_left:0,_right:0,_top:0,_bottom:0,_horizontalCenter:0,_verticalCenter:0,
    _isAbsLeft:true,_isAbsRight:true,_isAbsTop:true,_isAbsBottom:true});
  }
 }
 if(sceneName==='JellyCrushFeedGameScene')anchor('BackButton',9,{_top:105,_left:24},true);
 if(sceneName==='AirdropRescueFeedGameScene') {
  const back=find('BackButton'),hud=find('HUD');
  // Keep the return button under HUD so pause/results hide it with the other controls.
  if(back>=0&&hud>=0&&objects[back]._parent.__id__!==hud) {
   const old=objects[back]._parent.__id__;
   objects[old]._children=objects[old]._children.filter(r=>r.__id__!==back);
   objects[hud]._children.push(ref(back));objects[back]._parent=ref(hud);
  }
  anchor('BackButton',9,{_top:80,_left:24});
 }
}
