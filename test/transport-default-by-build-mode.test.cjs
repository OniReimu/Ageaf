const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function findAgeafDefinePlugin(plugins) {
  if (!Array.isArray(plugins)) return null;
  return (
    plugins.find(
      (plugin) =>
        plugin &&
        plugin.constructor &&
        plugin.constructor.name === 'DefinePlugin' &&
        plugin.definitions &&
        Object.prototype.hasOwnProperty.call(plugin.definitions, '__AGEAF_DEFAULT_TRANSPORT__')
    ) ?? null
  );
}

test('webpack build defines Ageaf default transport by mode', () => {
  const configFactory = require(path.join(__dirname, '..', 'config', 'webpack.config.js'));

  const devConfig = configFactory({}, { mode: 'development' });
  const prodConfig = configFactory({}, { mode: 'production' });

  const devDefine = findAgeafDefinePlugin(devConfig.plugins);
  assert.ok(devDefine, 'expected DefinePlugin for dev build');
  assert.equal(devDefine.definitions.__AGEAF_DEFAULT_TRANSPORT__, JSON.stringify('http'));
  assert.equal(devDefine.definitions.__AGEAF_BUILD_MODE__, JSON.stringify('development'));

  const prodDefine = findAgeafDefinePlugin(prodConfig.plugins);
  assert.ok(prodDefine, 'expected DefinePlugin for prod build');
  assert.equal(prodDefine.definitions.__AGEAF_DEFAULT_TRANSPORT__, JSON.stringify('native'));
  assert.equal(prodDefine.definitions.__AGEAF_BUILD_MODE__, JSON.stringify('production'));
});

test('options defaults reference build-time transport constant', () => {
  const helperPath = path.join(__dirname, '..', 'src', 'utils', 'helper.ts');
  const contents = fs.readFileSync(helperPath, 'utf8');

  assert.match(contents, /__AGEAF_DEFAULT_TRANSPORT__/);
});

