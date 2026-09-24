const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const sceneFile='assets/gamescene/MotoRaceGameScene.scene';
assert(fs.existsSync(sceneFile),'new scene exists');
const scene=JSON.parse(fs.readFileSync(sceneFile));
function references(value,visit){if(!value||typeof value!=='object')return;if(Number.isInteger(value.__id__))visit(value.__id__);else Object.values(value).forEach(v=>references(v,visit));}
for(const item of scene)references(item,id=>assert(scene[id],`missing scene reference ${id}`));
const c=scene.find(v=>v.world&&v.steeringPad);assert(c,'scene controller is serialized');
for(const key of ['layoutRoot','world','artRoot','hud','rankLabel','armorLabel','speedLabel','distanceLabel','timeLabel','messageLabel','countdownLabel','steeringPad','steeringKnob','punchButton','kickButton','pauseButton','boostButton','boostTitle','boostBadge','boostDetail','backButton','overlay','resultTitle','resultDetail','resumeLabel','resumeButton','replayButton','homeButton','hitSound','music'])assert(scene[c[key]?.__id__],`bound ${key}`);
assert(c.riderAtlas?.__uuid__,'rider atlas is serialized');
const png=fs.readFileSync('assets/res/motoRace/riders-atlas.png');assert.equal(png.readUInt32BE(16),1024);assert.equal(png.readUInt32BE(20),2560);
const lobby=JSON.parse(fs.readFileSync('assets/gamescene/NewMainScene.scene'));
const main=lobby.find(v=>v.motoRaceButton);assert(main,'main menu entry is wired');assert.equal(lobby[lobby[main.motoRaceButton.__id__].node.__id__]._name,'MotoRaceCard');
const fileList=[sceneFile,sceneFile+'.meta',...['motoRaceRules','motoRaceRenderer','motoRaceGameScene','motoRaceArt'].flatMap(n=>[`assets/scripts/${n}.ts`,`assets/scripts/${n}.ts.meta`]),'assets/res/motoRace.meta',...fs.readdirSync('assets/res/motoRace').map(n=>'assets/res/motoRace/'+n)];
// Include all shared image dependencies at full source size, even if already in the game.
for(const n of ['assets/res/juggleBallGame/slowdown-button.png','assets/res/texture/UIs/ad_badge_cartoon_red.png','assets/res/foodDeliveryFeed/white.png','assets/res/newMain/card_round.png','assets/res/newMain/preview_border.png','assets/res/newMain/card_title_blank.png','assets/res/newMain/title_white_goose.jpg'])fileList.push(n,n+'.meta');
const base=fileList.reduce((n,f)=>n+fs.statSync(f).size,0);
const cardBytes=Buffer.byteLength(JSON.stringify(lobby.filter(v=>String(v._id||'').startsWith('motoLobby')),null,2));
const total=base+cardBytes+2048;assert(total<1000000,`new gameplay exceeds 1 MB: ${total}`);
console.log(JSON.stringify({files:fileList.length,sceneObjects:scene.length,sourceAndAssets:base,lobbyCard:cardBytes,integrationAllowance:2048,conservativeTotalBytes:total,budgetBytes:1000000},null,2));

const music=scene[c.music.__id__];assert.equal(music._clip.__uuid__,JSON.parse(fs.readFileSync('assets/res/sound/bgm.mp3.meta')).uuid);assert.equal(music._loop,true);
