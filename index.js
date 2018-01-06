const path = require("path");
const crypto = require("crypto");
const vm = require("vm");
const fs = require("fs");
const Context = require("@axetroy/context");

let secret = "secret";

/**
 * proxy require
 * @type {NodeRequire}
 */
const r = new Proxy(require, {
  get: function(target, property, receiver) {
    if (property === "secret") {
      return secret;
    } else {
      return Reflect.get(target, property, receiver);
    }
  },
  set: function(target, property, value, receiver) {
    if (property === "secret") {
      secret = value;
    } else {
      return Reflect.set(target, property, value, receiver);
    }
  },
  apply: function(target, ctx, args) {
    const id = args[0];
    const first = id[0];

    // 引用本地模块
    if (first === "/" || first === ".") {
      let absFilePath = path.isAbsolute(id) ? id : path.join(process.cwd(), id);

      let ext = path.extname(absFilePath);
      if (ext === "") {
        try {
          fs.statSync(absFilePath + ".json");
          ext = ".json";
          return require(absFilePath);
        } catch (err) {
          ext = ".js";
        }
        absFilePath = absFilePath + ext;
      }

      const raw = fs.readFileSync(absFilePath, "utf8");

      // if exist cache
      if (require.cache[id]) {
        return require.cache[id];
      }

      // if require npm id use native require
      if (absFilePath.indexOf("node_modules") >= 0) {
        return require(id);
      }

      const code = `
      const path = require('path');
      (function(require){
        ${decode(raw, secret)}
      })(function(id){
        const absFilePath = path.isAbsolute(id) ? id : path.join(__dirname, id);
        return require(absFilePath);
      })`;

      const context = new Context(absFilePath, {
        require: r
      });

      const script = new vm.Script(code);

      const output = script.runInNewContext(context);

      require.cache[id] = output;
    } else {
      return require(id);
    }
  }
});

/**
 * decode
 * @param text
 * @param secret
 * @returns {string}
 */
function decode(text, secret) {
  const cipherChunks = [];
  const decipher = crypto.createDecipher("aes-256-ecb", secret);
  decipher.setAutoPadding(true);
  cipherChunks.push(decipher.update(text, "base64", "utf8"));
  cipherChunks.push(decipher.final("utf8"));
  return cipherChunks.join("");
}

// export require proxy
module.exports = r;
