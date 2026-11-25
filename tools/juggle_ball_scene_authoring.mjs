import fs from 'node:fs';
import { SceneAuthor, copySubtree, ref } from './feed_scene_authoring.mjs';

/** Keep pause UI editable in Creator and reuse the existing feed menu artwork. */
export function ensureJugglePauseMenu(objects) {
  const canvas = objects.findIndex(item => item.__type__ === 'cc.Node' && item._name === 'Canvas');
  const controller = objects.find(item => item.sceneBackButton && item.sceneResultOverlay);
  if (canvas < 0 || !controller) throw new Error('Juggle scene controller is missing');
  const author = new SceneAuthor(objects, 'jugglePause');
  author.serial = objects.length;
  let overlay = objects.findIndex(item => item.__type__ === 'cc.Node' && item._name === 'ExitConfirmation');
  if (overlay < 0) {
    const source = JSON.parse(fs.readFileSync('assets/gamescene/AirdropRescueFeedGameScene.scene', 'utf8'));
    overlay = copySubtree(source, author, canvas, 'ExitConfirmation');
  }
  objects[overlay]._active = false;
  const child = name => objects[overlay]._children.find(item => objects[item.__id__]._name === name).__id__;
  const component = (node, type) => objects[node]._components.find(item => objects[item.__id__].__type__ === type);
  const dim = child('ExitDim');
  if (!component(dim, 'cc.Widget')) author.widget(dim, 45);
  controller.scenePauseOverlay = ref(overlay);
  controller.sceneContinueButton = component(child('ContinueButton'), 'cc.Button');
  controller.sceneRestartButton = component(child('RestartButton'), 'cc.Button');
  controller.sceneExitButton = component(child('ExitButton'), 'cc.Button');
}
