// TypeScript
import { v2 as webdav } from 'webdav-server'
import {QuqiFileSystem} from "./QuqiFileSystem";

// User manager (tells who are the users)
const userManager = new webdav.SimpleUserManager();
const user = userManager.addUser('admin', 'admin', false);

// Privilege manager (tells which users can access which files/folders)
const privilegeManager = new webdav.SimplePathPrivilegeManager();
privilegeManager.setRights(user, '/', [ 'all' ]);

const server = new webdav.WebDAVServer({
  port: 1900,
  // HTTP Digest authentication with the realm 'Default realm'
  httpAuthentication: new webdav.HTTPDigestAuthentication(userManager, 'Default realm'),
  privilegeManager: privilegeManager
});
server.afterRequest((arg, next) => {
  console.log('>>', arg.request.method, arg.fullUri(), '>', arg.response.statusCode, arg.response.statusMessage);
  next();
})
// server.setFileSystem('/dav', new webdav.PhysicalFileSystem('/Users/tongjun/Downloads/webdav-test'), (success) => {
//   server.start(() => console.log('READY'));
// })

// server.rootFileSystem().addSubTree(server.createExternalContext(), '/', {
//   'folder1': {                                // /folder1
//     'file1.txt': webdav.ResourceType.File,  // /folder1/file1.txt
//     'file2.txt': webdav.ResourceType.File   // /folder1/file2.txt
//   },
//   'file0.txt': webdav.ResourceType.File       // /file0.txt
// }, ()=>{
//   server.start(() => console.log('READY'));
// })
//

server.setFileSystem('/dav', new QuqiFileSystem(process.env.QUQI_ACCOUNT, process.env.QUQI_PASSWORD, process.env.QUQI_USER_ID), (success) => {
  server.start(() => console.log('READY'));
})
