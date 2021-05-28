import QuqiAction from './QuqiAction';

(async function () {
  const quqiAction = new QuqiAction(process.env.QUQI_ACCOUNT, process.env.QUQI_PASSWORD, parseInt(process.env.QUQI_USER_ID));
  await quqiAction.login();
  await quqiAction.list(43);
  await quqiAction.upload(43, '/tmp/1622171281916.jpg')
})();
