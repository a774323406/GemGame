import { SceneAuthor, ref } from './penguin_scene_authoring.mjs';
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
 if(sceneName==='MotoRaceGameScene') {
  anchor('PauseButton',9,{_top:64,_left:24},true);
  // Keep overlays above the reparented pause control.
  const overlay=find('Overlay');objects[canvas]._children=objects[canvas]._children.filter(r=>r.__id__!==overlay);objects[canvas]._children.push(ref(overlay));
 }
 if(sceneName==='PenguinStackFeedGameScene')anchor('BottomHUD',20,{_bottom:72});
 if(sceneName==='WhiteGooseFeedGameScene')anchor('AddRingsButton',36,{_bottom:80,_right:24});
}
