const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');

function node() {
  const listeners = new Map();
  return { active: true, isValid: true, angle: 0, position: {x: 0, y: 0}, scale: {x: 1, y: 1},
    on(type, fn, owner) { listeners.set(type, () => fn.call(owner)); },
    off(type) { listeners.delete(type); },
    emit(type) { listeners.get(type)?.(); },
    setPosition(x, y) { this.position = {x, y}; },
    setScale(x, y) { this.scale = {x, y}; },
  };
}

function graphics() {
  const g = {commands: [], lineWidth: 1, strokeColor: null, fillColor: null, node: node()};
  for (const name of ['moveTo','lineTo','bezierCurveTo','quadraticCurveTo','circle','rect','roundRect','close']) {
    g[name] = (...args) => g.commands.push({name, args});
  }
  for (const name of ['fill','stroke']) {
    g[name] = () => g.commands.push({name, color: g[name + 'Color'], width: g.lineWidth});
  }
  g.clear = () => { g.commands = []; };
  return g;
}

function fixture({active = true, entered = false, exited = false, height = 1624, stored = null} = {}) {
  const f = {state: {active, entered, exited}, height, ready: [], schedules: [], cancelled: 0,
    completed: 0, enteredGames: 0, results: [], music: false, musicNames: [], writes: [],
    rewardBusy: false, interstitialBusy: false, listener: null, resolves: [], loadFailure: false, recoveries: 0};
  const cc = {_decorator: {ccclass: () => v => v, property: () => () => {}},
    Component: class {constructor() {this.node = node();}},
    Node: {EventType: {TOUCH_START: 'start', TOUCH_END: 'end', TOUCH_CANCEL: 'cancel'}},
    Button: {EventType: {CLICK: 'click'}}, Color: class {constructor(r, g, b, a = 255) {Object.assign(this, {r,g,b,a});}},
    Game: {EVENT_HIDE: 'hide', EVENT_SHOW: 'show'}, game: {on() {}, off() {}},
    ResolutionPolicy: {FIXED_WIDTH: 1}, view: {setDesignResolutionSize() {}, getVisibleSize: () => ({width: 750, height: f.height})},
    sys: {localStorage: {getItem: () => stored, setItem: (k,v) => f.writes.push([k,v])}},
  };
  const feed = {init() {}, isActive: () => f.state.active, getState: () => f.state,
    addListener: fn => {f.listener = fn;}, removeListener: () => {f.listener = null;},
    activateFromFirstTouch() {f.change({entered: true, exited: false});},
    reportSceneReadyAfterStableRender: async options => {f.ready.push(options);},
    completeSession: () => {f.completed++;},
  };
  const sdk = {isRewardedVideoBusy: () => f.rewardBusy,
    isFullscreenAdBusy: () => f.rewardBusy || f.interstitialBusy,
    showRewardedVideo: () => new Promise((resolve, reject) => f.resolves.push({resolve, reject})),
    vibrateShort() {},
  };
  const adc = {onEnterGame() {f.enteredGames++;}, onLevelResult: (...args) => f.results.push(args),
    scheduleFeedEntryInterstitial: fn => f.schedules.push(fn), cancelFeedEntryInterstitial: () => {f.cancelled++;}};
  const audio = {setSoundEvent() {}, playMusic(name) {f.music = true; f.musicNames.push(name);},
    restartMusic(name) {f.music = true; f.musicNames.push(name); f.recoveries++;},
    pauseBgmForVideo() {f.music = false;}, canPlaySound: () => true};
  const cache = {};
  function load(name) {
    if (cache[name]) return cache[name];
    const exports = cache[name] = {};
    const source = fs.readFileSync('assets/scripts/' + name, 'utf8');
    const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020, experimentalDecorators: true}}).outputText;
    vm.runInNewContext(compiled, {exports, console, require: name => {
      if (name === 'cc') return cc;
      if (name.endsWith('truckStackRules')) return load('truckStackRules.ts');
      if (name.endsWith('FeedAcquisitionService')) return {FeedAcquisitionService: feed};
      if (name.endsWith('SdkUtils')) return {SdkUtils: sdk};
      if (name.endsWith('ADController')) return {adc};
      if (name.endsWith('AudioManager')) return {default: audio};
      if (name.endsWith('gamePrefabMgr')) return {soundName: {getUserBgm: 'getUserBgm'}};
      if (name.endsWith('GameSceneBundle')) return {GameSceneName: {Main: 'NewMainScene'},
        GameSceneBundle: {loadScene: async () => {if (f.loadFailure) throw Error('simulated load failure');}}};
      throw Error('Unexpected dependency: ' + name);
    }});
    return exports;
  }
  f.change = patch => {Object.assign(f.state, patch); f.listener?.({...f.state});};
  const C = load('truckStackFeedGameScene.ts').truckStackFeedGameScene;
  const c = f.c = new C();
  for (const key of ['surface','hud','truck','heldBox','resultOverlay','exitOverlay']) c[key] = node();
  c.boxNodes = Array.from({length: 18}, node);
  c.clouds = Array.from({length: 3}, node);
  c.scenery = graphics(); c.rope = graphics(); c.effects = graphics();
  for (const key of ['heightLabel','bestLabel','hintLabel','slowdownLabel','resultTitle','resultDetail']) c[key] = {string: '', node: node()};
  for (const key of ['backButton','slowdownButton','reviveButton','replayButton','homeButton','continueButton','restartButton','exitButton']) c[key] = {node: node(), interactable: true};
  for (const key of ['dropAudio','landAudio','perfectAudio','fallAudio']) c[key] = {isValid: true, stop() {}, play() {}};
  c.onLoad(); c.start();
  return f;
}

const advance = (c, seconds) => {for (let i = 0; i < Math.ceil(seconds * 120); i++) c.update(1 / 120);};
function dropAt(c, x) {c.round.activeBox.x = x; c.onTouchStart();}
function land(c) {dropAt(c, c.round.boxes[c.round.boxes.length - 1].x); advance(c, 1.5);}
function fail(c) {dropAt(c, 450); advance(c, 3);}
module.exports = {fixture, advance, dropAt, land, fail};
