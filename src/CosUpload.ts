import * as COS from 'cos-nodejs-sdk-v5';
import * as fs from 'fs';

import config from './QuqiConfig';

export default {
  sliceUploadFile(data, bucket, key, uploadId, filePath) {
    return new Promise(async (resolve, reject) => {
      const cos = new COS({
        getAuthorization: function (options, callback) {
          const query = {
            TmpSecretId: data.credentials.tmpSecretId,
            TmpSecretKey: data.credentials.tmpSecretKey,
            SecurityToken: data.credentials.sessionToken,
            StartTime: data.startTime, // 时间戳，单位秒，如：1580000000
            ExpiredTime: data.expiredTime
          }
          // 异步获取临时密钥
          callback(query);
        }
      });

      // console.log(bucket, key, filePath);
      const buffer = fs.readFileSync(filePath)
      let partNumber = 1;
      const totalPart = Math.ceil(buffer.length / config.PART_SIZE)
      try {
        while (true) {
          console.log("正在上传", `${partNumber}/${totalPart}`);
          await this.multipartUpload(cos, {
            Bucket: bucket, /* 必须 */
            Region: config.Region,    /* 必须 */
            Key: key,              /* 必须 */
            UploadId: uploadId,
          }, buffer, partNumber);
          if (partNumber * config.PART_SIZE >= buffer.length) {
            break;
          }
          partNumber++;
        }
        resolve(true);
      } catch (e) {
        reject(e);
      }
    })
  },

  multipartUpload(cos, params, buffer, partNumber) {
    params.PartNumber = partNumber;
    params.Body = this.getBufferPart(buffer, partNumber);
    params.ContentLength = params.Body.length;
    return new Promise(async (resolve, reject) => {
      cos.multipartUpload(params, function (err, data) {
        console.log(err || JSON.stringify(data));
        if (err) {
          reject(err);
        } else {
          if (data.statusCode === 200) {
            resolve(data);
          } else {
            reject(JSON.stringify(data));
          }
        }
      });
    })
  },

  getBufferPart(buffer, partNumber) {
    const total = buffer.length;
    const partCount = Math.ceil(total / config.PART_SIZE)
    let targetSize = config.PART_SIZE
    if (partNumber === partCount) {
      targetSize = total - (partCount - 1) * config.PART_SIZE;
    }
    const newBuffer = new Buffer(targetSize);
    const startPos = (partNumber - 1) * config.PART_SIZE;
    const endPos = startPos + targetSize;
    // console.log(startPos, endPos);
    buffer.copy(newBuffer, 0, startPos, endPos);
    // console.log(newBuffer.length);
    return newBuffer;
  }
}
