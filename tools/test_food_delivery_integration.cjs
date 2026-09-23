// Node-side entry simulations; never requests a real Douyin feed or loads Cocos assets.
// Run from the project root: node tools/test_food_delivery_integration.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require(process.env.FOOD_DELIVERY_TEST_TYPESCRIPT_PATH ||
  '/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');

const scripts = path.join(__dirname, '../assets/scripts');

class Emitter {
  constructor() { this.listeners = []; }
  on(type, fn, owner) { this.listeners.push({ type, fn, owner }); }
  off(type, fn, owner) {
    this.listeners = this.listeners.filter(item =>
      item.type !== type || item.fn !== fn || item.owner !== owner);
  }
  emit(type, ...args) {
    for (const item of [...this.listeners]) {
      if (item.type === type) item.fn.apply(item.owner, args);
    }
  }
}

function fixture() {
  const game = new Emitter();
  const feed = {
    active: true,
    state: { active: true, mode: 'acquisition', contentId: '' },
    getState() { return this.state; },
    isActive() { return this.active; },
    init() {},
  };
  class Component {}
  class Button { static EventType = { CLICK: 'click' }; }
  class Node { static EventType = { TOUCH_END: 'touch-end' }; }
  class ScrollView {}
  const cc = {
    _decorator: {
      ccclass: () => type => type,
      property: () => () => {},
    },
    assetManager: { getBundle: () => null, removeBundle() {}, loadAny() {} },
    director: { runScene() {} },
    SceneAsset: class {}, Component, Button, Node, ScrollView,
    Label: class {}, ProgressBar: class {}, UITransform: class {}, Color: class {},
    HorizontalTextAlignment: { CENTER: 1 },
    game,
    Game: { EVENT_SHOW: 'show' },
  };
  const sidebar = {
    addListener() {}, removeListener() {}, init() {},
    checkAvailability: async () => {},
  };
  const cache = {};
  function load(file) {
    if (cache[file]) return cache[file];
    const exports = {};
    cache[file] = exports;
    const source = fs.readFileSync(path.join(scripts, file), 'utf8');
    const code = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        experimentalDecorators: true,
      },
    }).outputText;
    vm.runInNewContext(code, {
      exports,
      console: { log() {}, warn() {}, error() {} },
      require(name) {
        if (name === 'cc') return cc;
        if (name.endsWith('GameSceneBundle')) return load('framework/GameSceneBundle.ts');
        if (name.endsWith('FeedRevisitConfig')) return load('framework/Platform/FeedRevisitConfig.ts');
        if (name.endsWith('FeedAcquisitionService')) {
          return { FeedAcquisitionService: feed, FeedDirectPlayMode: {} };
        }
        if (name.endsWith('ResourceManager')) {
          return { ResourceManager: { ins: { loadBundle: async () => ({}), removeBundle() {} } } };
        }
        if (name.endsWith('SidebarRewardService')) return { SidebarRewardService: sidebar };
        if (name.endsWith('ShareRewardService')) {
          return { ShareRewardService: {
            refreshDailyState() {}, isHomeRewardAvailable: () => false,
            claimHomeMagicReward: () => false,
          } };
        }
        if (name.endsWith('ToolInventory')) {
          return { ToolInventory: { MAX_COUNT: 3, getCount: () => 0 } };
        }
        if (name.endsWith('AudioManager')) return { default: { setSoundEvent() {}, playDefaultBgm() {} } };
        if (name.endsWith('UIManager')) return { default: { instance: null } };
        if (name.endsWith('GameConfig')) return { GameConfig: {} };
        if (name.endsWith('gamePrefabMgr')) {
          return { default: { Instance: {} }, uiName: {}, soundName: {} };
        }
        if (name.endsWith('SdkUtils')) return { SdkUtils: { requireSDK() {}, share: async () => false } };
        if (name.endsWith('ADController')) return { adc: { initialize() {} } };
        return {};
      },
      setInterval: () => 1,
      clearInterval() {},
      setTimeout(fn) { fn(); return 1; },
      clearTimeout() {},
    });
    return exports;
  }
  return { load, feed, Button };
}

async function main() {
  const f = fixture();
  const config = f.load('framework/Platform/FeedRevisitConfig.ts');
  const sceneBundle = f.load('framework/GameSceneBundle.ts');
  const loader = new (f.load('loadScene.ts').loadScene)();

  assert.equal(config.FEED_FOOD_DELIVERY_CONTENT_ID, 'CONTENT15252968962');
  f.feed.state.contentId = 'CONTENT15252968962';
  assert.equal(loader.resolveFeedEntry().sceneName, 'FoodDeliveryFeedGameScene');
  f.feed.state.contentId = 'UNKNOWN_CONTENT_ID';
  assert.equal(loader.resolveFeedEntry().sceneName, 'ShootingGlassBottlesGame',
    'an unknown Content ID must keep the existing shooting-game fallback');

  const { appendFoodDeliveryCard } = await import('./food_delivery_authoring.mjs');
  const serializedMenu = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../assets/gamescene/NewMainScene.scene'), 'utf8'));
  const serializedFoodCardId = serializedMenu.findIndex(item =>
    item?.__type__ === 'cc.Node' && item._name === 'FoodDeliveryCard');
  assert(serializedFoodCardId > 0, 'the formal scene must serialize the food-delivery card');
  const menuScene = structuredClone(serializedMenu.slice(0, serializedFoodCardId));
  const nodeId = name => menuScene.findIndex(item => item?.__type__ === 'cc.Node' && item._name === name);
  const contentId = nodeId('Content');
  const content = menuScene[contentId];
  const transformId = content._components
    .map(reference => reference.__id__)
    .find(id => menuScene[id].__type__ === 'cc.UITransform');
  const controllerId = menuScene.findIndex(item =>
    item?.puzzleButton && item?.balloonWheelButton && item?.gameList);
  content._children = content._children.filter(reference => reference.__id__ < serializedFoodCardId);
  menuScene[transformId]._contentSize.height = 888;
  delete menuScene[controllerId].foodDeliveryButton;
  const originalLength = menuScene.length;
  const allowedMutations = new Set([contentId, transformId, controllerId]);
  const untouchedBefore = menuScene.slice(0, originalLength).map((item, id) =>
    allowedMutations.has(id) ? null : JSON.stringify(item));

  const buttonId = appendFoodDeliveryCard(menuScene);
  assert(buttonId >= originalLength, 'homepage append must return the new serialized Button index');
  assert.equal(menuScene[buttonId].__type__, 'cc.Button');
  assert.equal(content._children.length, 7);
  const cardId = content._children.at(-1).__id__;
  assert.equal(menuScene[cardId]._name, 'FoodDeliveryCard');
  assert.deepEqual(
    [menuScene[cardId]._lpos.x, menuScene[cardId]._lpos.y],
    [-139, -1034],
    'the seventh card must start a fourth row without moving existing cards',
  );
  assert.equal(menuScene[transformId]._contentSize.height, 1182);
  assert.equal(menuScene[controllerId].foodDeliveryButton.__id__, buttonId);
  const titlePlaqueId = menuScene[cardId]._children
    .map(reference => reference.__id__)
    .find(id => menuScene[id]?._name === 'TitlePlaque');
  const titleSpriteId = menuScene[titlePlaqueId]._components
    .map(reference => reference.__id__)
    .find(id => menuScene[id]?.__type__ === 'cc.Sprite');
  assert.equal(
    menuScene[titleSpriteId]._spriteFrame.__uuid__,
    'a21b33ea-e748-44dd-a2af-092a25be28fa@f9941',
    'the homepage card must use the common baked-title-image style',
  );
  assert.equal(menuScene[titlePlaqueId]._children.length, 0,
    'the baked title must not retain a mismatched runtime label');
  const courierPreviewId = menuScene.findIndex(item =>
    item?.__type__ === 'cc.Node' && item._name === 'CourierPreview');
  const courierPreviewTransform = menuScene[menuScene[courierPreviewId]._components
    .map(reference => reference.__id__)
    .find(id => menuScene[id].__type__ === 'cc.UITransform')];
  assert.deepEqual(
    [courierPreviewTransform._contentSize.width, courierPreviewTransform._contentSize.height],
    [96, 101],
    'the homepage courier preview must preserve the rider artwork aspect ratio',
  );
  for (let id = 0; id < originalLength; id += 1) {
    if (!allowedMutations.has(id)) {
      assert.equal(JSON.stringify(menuScene[id]), untouchedBefore[id],
        `existing serialized object ${id} changed while appending the card`);
    }
  }
  const appendedLength = menuScene.length;
  assert.equal(appendFoodDeliveryCard(menuScene), buttonId,
    'rebuilding an already-migrated scene must return the existing button');
  assert.equal(menuScene.length, appendedLength, 'homepage migration must be idempotent');

  const requests = [];
  let rejectNext = true;
  sceneBundle.GameSceneBundle.loadScene = async sceneName => {
    requests.push(sceneName);
    if (rejectNext) {
      rejectNext = false;
      throw new Error('simulated scene load failure');
    }
  };
  const buttonNode = new Emitter();
  buttonNode.isValid = true;
  const button = { node: buttonNode, interactable: true };
  const menu = new (f.load('newMainScene.ts').newMainScene)();
  menu.node = { isValid: true };
  menu.foodDeliveryButton = button;
  menu.onLoad();
  buttonNode.emit(f.Button.EventType.CLICK);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(button.interactable, true, 'failed navigation must unlock the new button');
  buttonNode.emit(f.Button.EventType.CLICK);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(requests, ['FoodDeliveryFeedGameScene', 'FoodDeliveryFeedGameScene']);
  menu.onDestroy();

  console.log('Food delivery entry integration checks passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
