import * as COS from 'cos-nodejs-sdk-v5';
import * as when from 'when';

const config = {
  FOLDER_UPLOAD_FILE_LIMIT: 500,
  SINGLE_FILE_MAX_UPLOAD_SIZE: 1073741824,
  Simple_Size: 4194304,
  PART_SIZE: 2097152,
  MAX_PART_NUM: 1e4,
  Region: "ap-shanghai"
}

export default {
  sliceUploadFile(data, bucket, key, filePath) {
    return new Promise(async (resolve, reject) => {
      const cos = new COS({
        getAuthorization: function (options, callback) {
          console.log(options);
          const query = {
            TmpSecretId: data.credentials.tmpSecretId,
            TmpSecretKey: data.credentials.tmpSecretKey,
            SecurityToken: data.credentials.sessionToken,
            StartTime: data.startTime, // 时间戳，单位秒，如：1580000000
            ExpiredTime: data.expiredTime
          }
          console.log(query);
          console.log(new Date(), new Date(data.startTime*1000), new Date(data.expiredTime*1000))
          // 异步获取临时密钥
          setTimeout(()=>{
            callback(query);
          }, 1000);
        }
      });

      await when().delay(1000);

      console.log(bucket, key, filePath);
      cos.sliceUploadFile({
        Bucket: bucket, /* 必须 */
        Region: config.Region,    /* 必须 */
        Key: key,              /* 必须 */
        FilePath: filePath,                /* 必须 */
        onHashProgress: function (progressData) {       /* 非必须 */
          console.log(JSON.stringify(progressData));
        },
        onProgress: function (progressData) {           /* 非必须 */
          console.log(JSON.stringify(progressData));
        }
      }, function (err, data) {
        console.log(err || data);
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    })
  }
}
