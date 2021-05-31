// TypeScript
import {v2 as webdav} from './npm-WebDAV-Server'

// User manager (tells who are the users)
const userManager = new webdav.SimpleUserManager();
const user = userManager.addUser('admin', 'admin', false);

// Privilege manager (tells which users can access which files/folders)
const privilegeManager = new webdav.SimplePathPrivilegeManager();
privilegeManager.setRights(user, '/', ['all']);

const server = new webdav.WebDAVServer({
  port: 1901,
  // HTTP Digest authentication with the realm 'Default realm'
  httpAuthentication: new webdav.HTTPDigestAuthentication(userManager, 'Default realm'),
  privilegeManager: privilegeManager
});
server.afterRequest((arg, next) => {
  console.log('>>', arg.request.method, arg.fullUri(), '>', arg.response.statusCode, arg.response.statusMessage);
  next();
})
server.setFileSystem('/dav', new webdav.PhysicalFileSystem('/Users/tongjun/Downloads/webdav-test'), (success) => {
  server.start(() => console.log('READY'));
})
