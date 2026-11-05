const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
let muted=false;const channels=[],sources=[];
class AudioSource {
 constructor(){this.playing=false;this._volume=1;this.currentTime=0;sources.push(this);}
 set clip(value){this._clip=value;if(value){this.channel={audible:false,volume:this._volume};channels.push(this.channel);}else this.channel=null;}
 get clip(){return this._clip;}
 set volume(v){this._volume=v;if(this.channel)this.channel.volume=v;}
 get volume(){return this._volume;}
 play(){this.playing=true;this.channel.audible=true;}
 stop(){this.playing=false;if(this.channel)this.channel.audible=false;}
 pause(){this.stop();}
 destroy(){this.destroyed=true;}
}
class Node {addComponent(){return new AudioSource();}}
const clips={getUserBgm:{}},exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/scripts/framework/AudioManager.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
 exports:exportsObject,console,setTimeout,
 require:n=>n==='cc'?{Node,AudioSource,director:{addPersistRootNode(){},on(){}}}:n.endsWith('gameStorage')?{default:{getMusic:()=>muted?1:0,getSound:()=>0}}:n.endsWith('gamePrefabMgr')?{default:{Instance:{soundRes:clips}},soundName:{getUserBgm:'getUserBgm',bgm:'bgm'},SOUND_ASSET_UUIDS:{}}:{ResourceManager:{}}
});
const A=exportsObject.default,live=()=>channels.filter(c=>c.audible&&c.volume>0).length;
A.playMusic('getUserBgm');const source=sources[0];source.currentTime=8;const count=channels.length;
A.restartMusic('getUserBgm');A.restartMusic('getUserBgm');
assert.equal(channels.length,count,'already playing music must not create more players');assert.equal(source.currentTime,8);assert.equal(live(),1);
// Simulate a stale native play-state callback: the old source can be audible while playing is false.
source.playing=false;A.restartMusic('getUserBgm');assert.equal(live(),1,'replacement must silence the old channel before discarding it');
A.pauseBgmForVideo();assert.equal(live(),0,'no orphaned music may remain on pause');
A.restartMusic('getUserBgm');assert.equal(live(),1);
muted=true;A.restartMusic('getUserBgm');assert.equal(live(),0,'recovery must obey the music toggle');
console.log('PASS BGM recovery idempotence, stale native state, old-channel cleanup, pause and mute');
