const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');

const root = 'assets/res/whiteGooseFeed';
const required = [
  'ditu.jpg', 'ditulang.png', 'goose-shadow.png',
  'ring-blue-bottom.png', 'ring-blue-top.png',
  'ring-yellow-bottom.png', 'ring-yellow-top.png',
  'ring-red-bottom.png', 'ring-red-top.png',
  'taodae.json', 'taodae.atlas', 'taodae.png', 'taodae2.png',
  'taoquanshou.json', 'taoquanshou.atlas',
  'white-goose-bgm.mp3', 'white-goose-call-1.mp3',
  'white-goose-call-2.mp3', 'white-goose-call-3.mp3',
];

for (const file of required) {
  const assetPath = path.join(root, file);
  assert(fs.existsSync(assetPath), `missing ${file}`);
  assert(fs.existsSync(`${assetPath}.meta`), `missing meta for ${file}`);
  assert.equal(
    fs.statSync(assetPath).mode & 0o111,
    0,
    `${file} must not be marked executable`,
  );
}
assert(fs.existsSync('assets/res/whiteGooseFeed.meta'));
assert(fs.existsSync('assets/res/newMain/preview_white_goose.png'));
assert(fs.existsSync('assets/res/newMain/preview_white_goose.png.meta'));
assert.equal(
  fs.statSync('assets/res/newMain/preview_white_goose.png').mode & 0o111,
  0,
  'white goose lobby preview must not be marked executable',
);

for (const forbidden of [
  '+ 80.png', '套大鹅简介.png', '开心套大鹅.png',
  '拿多拿少全靠技术！.png', 'dqq_rk.png', 'zdingzi_jf.png', 'tde_1.png',
]) {
  assert(!fs.existsSync(path.join(root, forbidden)), `reward/intro asset copied: ${forbidden}`);
}

function meta(file) {
  return JSON.parse(fs.readFileSync(`${file}.meta`, 'utf8'));
}

for (const file of required.filter(file => /\.(png|jpg)$/.test(file))) {
  const value = meta(path.join(root, file));
  assert.equal(value.importer, 'image', `${file} must use the Creator 3.8 image importer`);
  if (file === 'taodae.png' || file === 'taodae2.png') {
    assert.equal(value.userData.type, 'texture', `${file} is a Spine texture page`);
    assert(value.subMetas['6c48a']);
  } else {
    assert.equal(value.userData.type, 'sprite-frame', `${file} must expose a SpriteFrame`);
    assert(value.subMetas.f9941);
  }
}

const gooseAtlas = meta(path.join(root, 'taodae.atlas'));
const handAtlas = meta(path.join(root, 'taoquanshou.atlas'));
const gooseSkeleton = meta(path.join(root, 'taodae.json'));
const handSkeleton = meta(path.join(root, 'taoquanshou.json'));
assert.equal(gooseAtlas.importer, '*');
assert.equal(handAtlas.importer, '*');
assert.equal(gooseSkeleton.importer, 'spine-data');
assert.equal(handSkeleton.importer, 'spine-data');
assert.equal(gooseSkeleton.ver, '1.2.6');
assert.equal(handSkeleton.ver, '1.2.6');
assert.equal(gooseSkeleton.userData.atlasUuid, gooseAtlas.uuid);
assert.equal(handSkeleton.userData.atlasUuid, handAtlas.uuid);

const expectedAudio = {
  whiteGooseBgm: 'b87e7117-2101-541c-a09a-d9098dc1999f',
  whiteGooseCall1: '29d5da10-dd9f-5055-a86e-bb35e3c94992',
  whiteGooseCall2: '5f156231-244b-5544-a6ee-34214f17ea77',
  whiteGooseCall3: '961f66b2-0c6a-59ec-a1fd-2110270be33d',
};
for (const [name, file] of [
  ['whiteGooseBgm', 'white-goose-bgm.mp3'],
  ['whiteGooseCall1', 'white-goose-call-1.mp3'],
  ['whiteGooseCall2', 'white-goose-call-2.mp3'],
  ['whiteGooseCall3', 'white-goose-call-3.mp3'],
]) {
  const value = meta(path.join(root, file));
  assert.equal(value.importer, 'audio-clip');
  assert.equal(value.uuid, expectedAudio[name]);
}

function loadSoundRegistry() {
  const source = fs.readFileSync('assets/scripts/gamePrefabMgr.ts', 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const output = {};
  const sandbox = {
    exports: output,
    module: { exports: output },
    require(id) {
      if (id === 'cc') return {};
      if (id === './framework/ResourceManager') return { ResourceManager: { ins: {} } };
      throw new Error(`unexpected dependency: ${id}`);
    },
    console,
    Promise,
    Map,
  };
  vm.runInNewContext(code, sandbox);
  return output;
}

const registry = loadSoundRegistry();
for (const [name, uuid] of Object.entries(expectedAudio)) {
  assert.equal(registry.soundName[name], name, `missing sound enum ${name}`);
  assert.equal(registry.SOUND_ASSET_UUIDS[name], uuid, `wrong sound UUID for ${name}`);
}

console.log('White goose asset tests passed');
