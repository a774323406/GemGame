// Install a local-only launcher in a fresh Creator Web build. Does not alter gameplay assets.
import fs from 'node:fs';
import path from 'node:path';
const dir=process.argv[2];if(!dir||!fs.existsSync(path.join(dir,'index.html')))throw Error('Usage: node tools/open_drift_preview.mjs <web-mobile-build-directory>');
fs.writeFileSync(path.join(dir,'drift-preview.html'),`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>漂移 · 第一版试玩</title><style>html,body,iframe{width:100%;height:100%;margin:0;border:0;display:block;background:#72a567;overflow:hidden}</style><script>localStorage.setItem('gem_first_direct_game_entry_v1','1');</script><iframe id="game" src="./index.html" allow="autoplay; fullscreen"></iframe><script>
let opened=false,busy=false;const timer=setInterval(async()=>{if(busy)return;const w=document.getElementById('game').contentWindow;if(!w.System)return;busy=true;try{const cc=await w.System.import('cc');cc.profiler?.hideStats();const scene=cc.director.getScene();if(scene?.name==='NewMainScene'&&!opened){const c=scene.getChildByName('Canvas')?.getComponent('newMainScene');if(c){opened=true;c.openDrift();}}if(scene?.name==='DriftFeedGameScene')clearInterval(timer);}catch{}finally{busy=false;}},150);
</script></html>`);
console.log('Local launcher ready: /drift-preview.html');
