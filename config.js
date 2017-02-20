import json from 'rollup-plugin-json';
import buble from 'rollup-plugin-buble';
import npm from 'rollup-plugin-node-resolve';
import uglify from 'rollup-plugin-uglify';
import cjs from 'rollup-plugin-commonjs';
import replace from 'rollup-plugin-replace';

const production = process.env.NODE_ENV == 'production' ? true : false;
let plugins = [
  cjs({ include: ['node_modules/**'] }),
  npm({ jsnext: true, main: true, browser: true }),
  json(),
  buble()
];
if (production)
  plugins.push(
    uglify(),
    replace({ 'process.env.NODE_ENV': JSON.stringify('production') })
  );
export default {
  entry: 'src/run.js',
  format: 'iife',
  plugins: plugins,
  dest: 'build/bundle.js'
};
