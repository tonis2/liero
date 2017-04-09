import json from "rollup-plugin-json";
import buble from "rollup-plugin-buble";
import npm from "rollup-plugin-node-resolve";
import uglify from "rollup-plugin-uglify";
import cjs from "rollup-plugin-commonjs";
import replace from "rollup-plugin-replace";
import scss from "rollup-plugin-scss";

const production = process.env.NODE_ENV == "production" ? true : false;
let plugins = [
  scss(),
  cjs({ include: ["node_modules/**"] }),
  npm({ jsnext: true, main: true, browser: true }),
  json(),
  buble({ jsx: "h" })
];
if (production)
  plugins.push(
    uglify(),
    replace({ "process.env.NODE_ENV": JSON.stringify("production") })
  );
export default {
  entry: "client/index.js",
  format: "iife",
  plugins: plugins,
  dest: "build/bundle.js"
};
