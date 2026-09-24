// Exercise the loose array transforms used by the Creator mini-game build.
// Browser preview retains iterator spread, so plain TS tests miss this boundary.
const creator = '/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources';
const babelRoot = creator + '/resources/3d/engine/node_modules';
const babel = require(babelRoot + '/@babel/core');
module.exports = function miniGameTransform(javascript) {
  return babel.transformSync(javascript, {
    configFile: false, babelrc: false,
    plugins: [
      [require(babelRoot + '/@babel/plugin-transform-spread'), { loose: true }],
      [require(babelRoot + '/@babel/plugin-transform-destructuring'), { loose: true }],
    ],
  }).code;
};
