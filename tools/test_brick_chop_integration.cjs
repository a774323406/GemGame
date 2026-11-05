const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const {buildBrickChopScene,appendBrickChopCard,SCENE_UUID}=await import('./brick_chop_authoring.mjs');
 const scene=JSON.parse(fs.readFileSync('assets/gamescene/BrickChopFeedGameScene.scene'));
 assert.deepEqual(scene,buildBrickChopScene(),'serialized scene matches authoring');
 assert.equal(JSON.parse(fs.readFileSync('assets/gamescene/BrickChopFeedGameScene.scene.meta')).uuid,SCENE_UUID);
 function refs(v){if(Array.isArray(v))return v.forEach(refs);if(!v||typeof v!=='object')return;if(Number.isInteger(v.__id__))assert(scene[v.__id__],'valid reference');Object.values(v).forEach(refs);}
 refs(scene);
 const nodes=scene.filter(o=>o.__type__==='cc.Node'),node=n=>nodes.find(o=>o._name===n),comp=(n,t)=>n._components.map(r=>scene[r.__id__]).find(c=>c.__type__===t);
 assert.equal(comp(node('Title'),'cc.Label')._string,'劈砖挑战');assert(!nodes.some(n=>/Rank|Skip|Leaderboard|LevelSelect/i.test(n._name)));
 for(const name of ['SlowdownButton','ExtraChanceButton']){assert(comp(node(name),'cc.Button'));assert.equal(comp(node(name),'cc.Widget')._bottom,100);}
 const dim=comp(node('ResultDim'),'cc.Sprite');assert.equal(dim._color.a,145);assert.equal(dim._color.r,0);
 assert(!comp(node('ResultPanel'),'cc.Sprite'));assert(comp(node('ResultOverlay'),'cc.BlockInputEvents'));
 const ctrl=scene.find(o=>o.bricks&&o.leftPieces);assert.equal(ctrl.bricks.length,12);assert.equal(ctrl.leftPieces.length,12);assert.equal(ctrl.rightPieces.length,12);
 const lobby=JSON.parse(fs.readFileSync('assets/gamescene/NewMainScene.scene')),before=JSON.stringify(lobby);appendBrickChopCard(lobby);assert.equal(JSON.stringify(lobby),before,'append is idempotent');assert(lobby.find(o=>o.gameList).brickChopButton);
 const imageBytes=fs.readdirSync('assets/res/brickChopFeed').filter(n=>/\.(png|jpg)$/.test(n)).reduce((n,p)=>n+fs.statSync('assets/res/brickChopFeed/'+p).size,0);assert(imageBytes<200*1024);
 console.log('PASS scene refs, repeatable authoring/lobby, title/controls, result mask, reused UI and image bytes:',imageBytes);
})().catch(e=>{console.error(e);process.exitCode=1});
