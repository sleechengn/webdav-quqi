import axios from 'axios';
import * as fs from 'fs';
import * as when from 'when';
import * as _ from 'lodash';
import * as FormData from 'form-data';

import QuqiUtils from './QuqiUtils';

export default class QuqiAction {
  session: string = "";
  passportId: string = "";

  constructor(private username: string, private password: string, private quqiId: number) {
    this.login();
  }

  public login() {
    let url = 'https://quqi.com/auth/person/login/password';
    let postData = `phone=${this.username}&password=${this.password}`;
    return axios.post(url, postData).then((response) => {
      const {data, headers} = response;
      console.log('login result', JSON.stringify(data));
      if (!data.err) {
        this.session = data.data.session_key;
        this.passportId = data.data.passport_id;
      } else {
        throw new Error(data.msg);
      }
    });
  }

  public list(dirId: number) {
    let url = 'https://quqi.com/api/dir/ls';
    let postData = `quqi_id=${this.quqiId}&node_id=${dirId}`;
    return this.doAction(url, postData);
  }

  public async uploadByPath(dirId: number, fileName: string, filePath: string) {
    const stat = fs.statSync(filePath);
    const readStream = fs.createReadStream(filePath)
    const hash = await QuqiUtils.hash(filePath);
    console.log(JSON.stringify(hash));

    const url = 'https://quqi.com/api/upload/v1/file/init';
    const postData = `quqi_id=${this.quqiId}&parent_id=${dirId}&size=${stat.size}&file_name=${fileName}&md5=${hash.md5}&sha=${hash.sha}&is_slice=false`;
    const job = await this.doAction(url, postData);
    console.log(JSON.stringify(job));
    if (job.data.exist) {
      console.log("极速上传成功");
      return true;
    }

    if (job.data.upload_id) {
      // 大文件需要分片上传
      console.error("大文件需要分片上传");
    } else {
      // 小文件直接上传
      let uploadUrl = `${job.data.url}/upload/v1/simpleUpload`;
      let params = {
        quqi_id: this.quqiId,
        token: job.data.token,
        task_id: job.data.task_id,
        is_dir: 0,
        upload_time: Math.floor(new Date().getTime() / 1000)
      };
      // @ts-ignore
      params.sign = QuqiUtils.httpParamsign(params);
      uploadUrl += "?" + QuqiUtils.queryStringify(params);

      let formData = new FormData();
      for (let i in params) {
        formData.append(i, params[i]);
      }
      console.log("params", JSON.stringify(params));
      formData.append('file', readStream);

      let headers = formData.getHeaders();//获取headers
      return new Promise((resolve, reject) => {
        //获取form-data长度
        formData.getLength(async function (err, length) {
          if (err) {
            reject(err);
            return;
          }
          //设置长度，important!!!
          headers['content-length'] = length;

          console.log(uploadUrl);
          await axios.post(uploadUrl, formData, {headers}).then(res => {
            console.log("上传成功", JSON.stringify(res.data));
            resolve(res.data);
          }).catch(res => {
            console.log(res);
            reject(res.data);
          })
        })
      })
    }
  }

  public async download(nid: number) {
    let url = `https://quqi.com/api/doc/getDownload?quqi_id=115540&node_id=${nid}`;
    return await this.doAction(url, null, {responseType: "stream"});
  }

  public async mkdir(parentId: number, dirName: string) {
    let url = `https://quqi.com/api/dir/mkDir`;
    let postData = `quqi_id=${this.quqiId}&parent_id=${parentId}&name=${dirName}`;
    return this.doAction(url, postData);
  }

  public async rename(nid: number, newName: string) {
    let url = `https://quqi.com/api/doc/renameDoc`;
    let postData = `quqi_id=${this.quqiId}&node_id=${nid}&rename=${newName}`;
    return this.doAction(url, postData);
  }

  public async delete(nid: number) {
    let url = `https://quqi.com/api/node/del`;
    let postData = `quqi_id=${this.quqiId}&node_id=${nid}`;
    return this.doAction(url, postData);
  }

  public async stat(nid: number) {
    let url = `https://quqi.com/api/doc/getDoc`;
    let postData = `quqi_id=${this.quqiId}&node_id=${nid}&url_type=get_doc`;
    return this.doAction(url, postData);
  }

  private doAction(url, postData = null, setting = null) {
    console.log(url, postData)
    let options = {
      headers: {
        'Cookie': `quqiid=${this.quqiId}; passport_id=${this.passportId}; session_key=${this.session}`
      }
    }
    if (setting) {
      options = _.extend(options, setting);
    }
    return when().then(() => {
      if (postData) {
        return axios.post(url, postData, options)
      } else {
        return axios.get(url, options)
      }
    }).then((response) => {
      const {data, headers} = response;
      if (headers['content-type'] !== "application/force-download") {
        console.log('request result', JSON.stringify(data));
      }
      if (!data.err) {
        return data;
      } else {
        if (data.err === 98) {
          return this.login().then(() => {
            return this.doAction(url, postData, setting);
          })
        } else {
          throw new Error(data.msg);
        }
      }
    });
  }
}
