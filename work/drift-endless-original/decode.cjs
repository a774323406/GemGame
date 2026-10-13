const fs=require('fs'),vm=require('vm'),zlib=require('zlib'),crypto=require('crypto');const dir=__dirname;
const src=fs.readFileSync('/Users/skyhand/.codex/attachments/16b1be8e-9f6e-4d4f-8a1f-7040c4238926/pasted-text.txt','utf8');
let a=src.indexOf("eval('")+5,parts=[];
while(src[a]==="'"){let b=a+1;for(;b<src.length;b++){if(src[b]==='\\'){b++;continue;}if(src[b]==="'")break;}parts.push(vm.runInNewContext(src.slice(a,b+1),{}, {timeout:5000}));a=b+1;while(/\s/.test(src[a]))a++;if(src[a]!=='+')break;a++;while(/\s/.test(src[a]))a++;}
const decoded=parts.join('');fs.writeFileSync(dir+'/original.asm.js',decoded);console.log('decoded',decoded.length,crypto.createHash('sha256').update(src).digest('hex'));
const har=JSON.parse(fs.readFileSync('/Users/skyhand/Downloads/poki.com.har','utf8'));for(const e of har.log.entries){const u=e.request.url;if(!/asm.memory|data.unityweb/.test(u))continue;const c=e.response.content;let buf=Buffer.from(c.text,'base64');try{buf=zlib.gunzipSync(buf)}catch{}const name=u.includes('memory')?'memory.bin':'data.bin';fs.writeFileSync(dir+'/'+name,buf);console.log(name,buf.length,buf.subarray(0,25).toString());}
