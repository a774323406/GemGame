const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const cache={};
function load(file){file=path.resolve(file);if(cache[file])return cache[file];const exports={};cache[file]=exports;const src=fs.readFileSync(file,'utf8');const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;vm.runInNewContext(code,{exports,require:n=>load(path.resolve(path.dirname(file),n+'.ts')),console,Math});return exports;}
module.exports={load};
