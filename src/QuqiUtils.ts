import * as crypto from 'crypto';
import {ReadStream} from "fs";
const { Readable } = require('stream');

export default {

  bufferToStream(buffer) {
    return new Readable({
      read() {
        this.push(buffer);
        this.push(null);
      }
    });
  },

  streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
      let buffers = [];
      stream.on('error', reject);
      stream.on('data', (data) => buffers.push(data))
      stream.on('end', () => resolve(Buffer.concat(buffers)))
    });
  },

  async hash(readStream: ReadStream) {
    let buffer = await this.streamToBuffer(readStream);
    let fsMd5 = crypto.createHash('md5');
    fsMd5.update(buffer);
    let md5 = fsMd5.digest('hex');

    let fsSha = crypto.createHash('sha256');
    fsSha.update(buffer);
    let sha = fsSha.digest('hex');

    return {md5, sha}
  },

  httpParamsign(params) {
    let keys = Object.keys(params).sort();
    let a = {};
    for (let i in keys) {
      let k = keys[i];
      a[k] = params[k];
    }

    let uploadSalt = "&9r2ktaB1kFEgodx5";

    let i = this.queryStringify(a) + uploadSalt;
    let fsMd5 = crypto.createHash('md5');
    fsMd5.update(i);
    let md5 = fsMd5.digest('hex');
    return md5;
  },

  queryStringify(e) {
    var t = ""
      , i = !0;
    for (var n in e)
      if (e.hasOwnProperty(n)) {
        var r = e[n];
        i || (t += "&"),
          t += n + "=",
        null !== r && void 0 !== r && (t += r),
          i = !1
      }
    return t
  }
}
