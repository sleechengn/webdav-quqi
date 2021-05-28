import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as FormData from 'form-data';

import QuqiUtils from './QuqiUtils';

export default class QuqiAction {
  session: string = "";
  passportId: string = "";

  constructor(private username: string, private password: string, private quqiId: number) {

  }

  public login() {
    let url = 'https://quqi.com/auth/person/login/password';
    let postData = `phone=${this.username}&password=${this.password}`;
    return axios.post(url, postData).then((response) => {
      const {data, headers} = response;
      console.log('login result', data);
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

  public async upload(dirId: number, filePath: string) {
    let stat = fs.statSync(filePath);
    let fileName = path.basename(filePath);
    let hash = QuqiUtils.hash(filePath);
    console.log(hash);
    let url = 'https://quqi.com/api/upload/v1/file/init?quqiid=115540';
    let postData = `quqi_id=${this.quqiId}&parent_id=${dirId}&size=${stat.size}&file_name=${fileName}&md5=${hash.md5}&sha=${hash.sha}&is_slice=false`;
    let job = await this.doAction(url, postData);
    console.log(job);
    if(job.data.exist){
      console.log("极速上传成功");
      return true;
    }

    if(job.data.upload_id){
      // 大文件需要分片上传
      console.error("大文件需要分片上传");
    }else{
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
      uploadUrl += "?"+QuqiUtils.queryStringify(params);

      let localFile = fs.createReadStream(filePath);

      let formData = new FormData();
      for (let i in params) {
        console.log(i, params[i]);
        formData.append(i, params[i]);
      }
      formData.append('file', localFile);

      let headers = formData.getHeaders();//获取headers
      //获取form-data长度
      formData.getLength(async function (err, length) {
        if (err) {
          return;
        }
        //设置长度，important!!!
        headers['content-length'] = length;

        console.log(uploadUrl);
        console.log(formData);
        await axios.post(uploadUrl, formData, {headers}).then(res => {
          console.log("上传成功", res.data);
        }).catch(res => {
          console.log(res);
        })
      })
    }
  }

  private doAction(url, postData) {
    console.log(url, postData)
    return axios.post(url, postData,
      {
        headers: {
          'Cookie': `quqiid=${this.quqiId}; passport_id=${this.passportId}; session_key=${this.session}`
        }
      }).then((response) => {
      const {data, headers} = response;
      console.log('request result', JSON.stringify(data));
      if (!data.err) {
        return data;
      } else {
        throw new Error(data.msg);
      }
    });
  }
}
