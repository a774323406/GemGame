const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
function loadTs(file, imports = {}) {
 const exports={}; const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true}}).outputText;
 vm.runInNewContext(code,{exports,require(name){assert(Object.hasOwn(imports,name),`Unmocked import: ${name}`);return imports[name];},console,Math,Number,String,Set,Map,Symbol});return exports;
}
module.exports={loadTs};
