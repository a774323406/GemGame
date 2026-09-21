import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const WHITE_GOOSE_ASSET_ROOT = 'assets/res/whiteGooseFeed';

export function assetUuid(name) {
  const hash = crypto.createHash('sha256').update(`GemGame/whiteGooseFeed/${name}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function textureMeta(name, width, height, { spriteFrame = true, alpha = true } = {}) {
  const uuid = assetUuid(name);
  const extension = path.extname(name);
  const displayName = path.parse(name).name;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const subMetas = {
    '6c48a': {
      importer: 'texture',
      uuid: `${uuid}@6c48a`,
      displayName,
      id: '6c48a',
      name: 'texture',
      userData: {
        wrapModeS: 'clamp-to-edge',
        wrapModeT: 'clamp-to-edge',
        imageUuidOrDatabaseUri: uuid,
        isUuid: true,
        visible: false,
        minfilter: 'linear',
        magfilter: 'linear',
        mipfilter: 'none',
        anisotropy: 0,
      },
      ver: '1.0.22',
      imported: true,
      files: ['.json'],
      subMetas: {},
    },
  };
  if (spriteFrame) {
    subMetas.f9941 = {
      importer: 'sprite-frame',
      uuid: `${uuid}@f9941`,
      displayName,
      id: 'f9941',
      name: 'spriteFrame',
      userData: {
        trimType: 'none',
        trimThreshold: 1,
        rotated: false,
        offsetX: 0,
        offsetY: 0,
        trimX: 0,
        trimY: 0,
        width,
        height,
        rawWidth: width,
        rawHeight: height,
        borderTop: 0,
        borderBottom: 0,
        borderLeft: 0,
        borderRight: 0,
        packable: false,
        pixelsToUnit: 100,
        pivotX: 0.5,
        pivotY: 0.5,
        meshType: 0,
        vertices: {
          rawPosition: [
            -halfWidth, -halfHeight, 0,
            halfWidth, -halfHeight, 0,
            -halfWidth, halfHeight, 0,
            halfWidth, halfHeight, 0,
          ],
          indexes: [0, 1, 2, 2, 1, 3],
          uv: [0, height, width, height, 0, 0, width, 0],
          nuv: [0, 0, 1, 0, 0, 1, 1, 1],
          minPos: [-halfWidth, -halfHeight, 0],
          maxPos: [halfWidth, halfHeight, 0],
        },
        isUuid: true,
        imageUuidOrDatabaseUri: `${uuid}@6c48a`,
        atlasUuid: '',
      },
      ver: '1.0.12',
      imported: true,
      files: ['.json'],
      subMetas: {},
    };
  }
  return {
    ver: '1.0.27',
    importer: 'image',
    imported: true,
    uuid,
    files: spriteFrame ? ['.json', extension] : ['.json', extension],
    subMetas,
    userData: {
      type: spriteFrame ? 'sprite-frame' : 'texture',
      hasAlpha: alpha,
      fixAlphaTransparencyArtifacts: alpha,
      redirect: `${uuid}@6c48a`,
    },
  };
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function audioMeta(name) {
  return {
    ver: '1.0.0',
    importer: 'audio-clip',
    imported: true,
    uuid: assetUuid(name),
    files: ['.json', '.mp3'],
    subMetas: {},
    userData: { downloadMode: 0 },
  };
}

function atlasMeta(name) {
  return {
    ver: '1.0.0',
    importer: '*',
    imported: true,
    uuid: assetUuid(name),
    files: ['.atlas', '.json'],
    subMetas: {},
    userData: {},
  };
}

function spineMeta(name, atlasName) {
  return {
    ver: '1.2.7',
    importer: 'spine-data',
    imported: true,
    uuid: assetUuid(name),
    files: ['.json'],
    subMetas: {},
    userData: { atlasUuid: assetUuid(atlasName) },
  };
}

export function writeWhiteGooseAssetMetadata() {
  const sprites = [
    ['ditu.jpg', 720, 1680, false],
    ['ditulang.png', 720, 316, true],
    ['goose-shadow.png', 135, 63, true],
    ['ring-blue-bottom.png', 184, 117, true],
    ['ring-blue-top.png', 184, 117, true],
    ['ring-yellow-bottom.png', 184, 117, true],
    ['ring-yellow-top.png', 184, 117, true],
    ['ring-red-bottom.png', 184, 117, true],
    ['ring-red-top.png', 184, 117, true],
  ];
  for (const [name, width, height, alpha] of sprites) {
    writeJson(`${WHITE_GOOSE_ASSET_ROOT}/${name}.meta`, textureMeta(name, width, height, { alpha }));
  }
  writeJson(`${WHITE_GOOSE_ASSET_ROOT}/taodae.png.meta`, textureMeta('taodae.png', 731, 126, { spriteFrame: false }));
  writeJson(`${WHITE_GOOSE_ASSET_ROOT}/taodae2.png.meta`, textureMeta('taodae2.png', 912, 255, { spriteFrame: false }));
  writeJson(`${WHITE_GOOSE_ASSET_ROOT}/taodae.atlas.meta`, atlasMeta('taodae.atlas'));
  writeJson(`${WHITE_GOOSE_ASSET_ROOT}/taoquanshou.atlas.meta`, atlasMeta('taoquanshou.atlas'));
  writeJson(`${WHITE_GOOSE_ASSET_ROOT}/taodae.json.meta`, spineMeta('taodae.json', 'taodae.atlas'));
  writeJson(`${WHITE_GOOSE_ASSET_ROOT}/taoquanshou.json.meta`, spineMeta('taoquanshou.json', 'taoquanshou.atlas'));
  for (const name of [
    'white-goose-bgm.mp3',
    'white-goose-call-1.mp3',
    'white-goose-call-2.mp3',
    'white-goose-call-3.mp3',
  ]) {
    writeJson(`${WHITE_GOOSE_ASSET_ROOT}/${name}.meta`, audioMeta(name));
  }
  writeJson('assets/res/whiteGooseFeed.meta', {
    ver: '1.2.0',
    importer: 'directory',
    imported: true,
    uuid: assetUuid('directory'),
    files: [],
    subMetas: {},
    userData: {},
  });
  writeJson(
    'assets/res/newMain/preview_white_goose.png.meta',
    textureMeta('preview_white_goose.png', 540, 269, { alpha: true }),
  );
}

if (process.argv.includes('--write')) writeWhiteGooseAssetMetadata();
