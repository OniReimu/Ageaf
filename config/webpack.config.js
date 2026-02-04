'use strict';

const webpack = require('webpack');
const { merge } = require('webpack-merge');
const TerserPlugin = require('terser-webpack-plugin');

const common = require('./webpack.common.js');
const PATHS = require('./paths');

// Merge webpack configuration files
const config = (env, argv) =>
  merge(common, {
    plugins: [
      new webpack.DefinePlugin({
        __AGEAF_BUILD_MODE__: JSON.stringify(argv.mode === 'production' ? 'production' : 'development'),
        __AGEAF_DEFAULT_TRANSPORT__: JSON.stringify(argv.mode === 'production' ? 'native' : 'http'),
      }),
    ],
    entry: {
      contentMainScript: PATHS.src + '/main/contentScript.ts',
      contentIsoScript: PATHS.src + '/iso//contentScript.ts',
      background: PATHS.src + '/background.ts',
    },
    devtool: argv.mode === 'production' ? false : 'source-map',
    optimization:
      argv.mode === 'production'
        ? {
            minimizer: [
              new TerserPlugin({
                terserOptions: {
                  format: {
                    // Chrome extension loader can be finicky about non-ASCII bytes.
                    // Force output to ASCII-only to avoid "isn't UTF-8 encoded" errors.
                    ascii_only: true,
                  },
                },
              }),
            ],
          }
        : undefined,
    resolve: {
      fallback: {
        http: false,
        https: false,
        url: false,
        timers: false,
        string_decoder: require.resolve('string_decoder/'),
        buffer: require.resolve('buffer/'),
      },
    },
  });

module.exports = config;
