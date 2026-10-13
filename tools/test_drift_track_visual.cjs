const assert=require('node:assert/strict'),{load}=require('./drift_feed_test_helpers.cjs');const {roadSpritePosition}=load('assets/scripts/drift/driftTrackVisual.ts');
assert.deepEqual(JSON.parse(JSON.stringify(roadSpritePosition({prefabName:'road_180_r300',x:0,y:300,heading:0,scaleX:1}))),{x:300,y:300});
const p=roadSpritePosition({prefabName:'road_180_r300',x:30,y:20,heading:Math.PI/2,scaleX:-1});assert(Math.abs(p.x-30)<1e-8);assert(Math.abs(p.y-320)<1e-8);
console.log('PASS original 180-degree prefab sprite offset and mirroring');
