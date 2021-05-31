import QuqiAction from './QuqiAction';
import * as fs from 'fs';
import * as path from 'path';

(async function () {
  let cloudId = parseInt(process.env.QUQI_CLOUD_ID)
  let rootDirId = parseInt(process.env.QUQI_ROOT_DIR_ID)
  const quqiAction = new QuqiAction(process.env.QUQI_ACCOUNT, process.env.QUQI_PASSWORD, cloudId);
  await quqiAction.login();
  await quqiAction.list(rootDirId);
  // await quqiAction.mkdir(rootDirId, 'xxx1');
  const uploadFile = "/tmp/package.json";
  await quqiAction.uploadByPath(rootDirId, path.basename(uploadFile), uploadFile)
  // (await quqiAction.download(82)).pipe(fs.createWriteStream('/tmp/a'));
  // await quqiAction.rename(98, 'xxxe3')
})();
