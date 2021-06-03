import {FileSystem} from "./npm-WebDAV-Server/manager/v2/fileSystem/FileSystem";
import {Path} from "./npm-WebDAV-Server/manager/v2/Path";
import {Errors} from "./npm-WebDAV-Server";
import {
  CreateInfo, CreationDateInfo, DeleteInfo, LastModifiedDateInfo,
  LockManagerInfo, MoveInfo, OpenReadStreamInfo, OpenWriteStreamInfo,
  PropertyManagerInfo, ReadDirInfo, SizeInfo,
  TypeInfo
} from "./npm-WebDAV-Server/manager/v2/fileSystem/ContextInfo";
import {ILockManager, LocalLockManager} from "./npm-WebDAV-Server/manager/v2/fileSystem/LockManager";
import {IPropertyManager, LocalPropertyManager} from "./npm-WebDAV-Server/manager/v2/fileSystem/PropertyManager";
import {ResourceType, ReturnCallback, SimpleCallback} from "./npm-WebDAV-Server";
import {FileSystemSerializer} from "./npm-WebDAV-Server/manager/v2/fileSystem/Serialization";
import {join as pathJoin, basename, dirname} from 'path'
import {Readable, Writable} from "stream";
import * as when from "when";
import * as fs from "fs";

import QuqiAction from "./QuqiAction";

const tmpDir = pathJoin(__dirname, "tmp")

export class QuqiFileSystemResource {
  props: LocalPropertyManager
  locks: LocalLockManager

  constructor(public nid: number, public type: ResourceType, public parentId: number, public addTime: number, public size: number) {
    this.props = new LocalPropertyManager();
    this.locks = new LocalLockManager();
  }
}

export class QuqiSerializer implements FileSystemSerializer {
  uid(): string {
    return 'QuqiSerializer-1.0.0';
  }

  serialize(fs: QuqiFileSystem, callback: ReturnCallback<any>): void {
    callback(null, {
      resources: fs.resources,
      username: fs.username,
      password: fs.password,
      cloudId: fs.cloudId,
      rootDirId: fs.rootDirId
    });
  }

  unserialize(serializedData: any, callback: ReturnCallback<FileSystem>): void {
    const fs = new QuqiFileSystem(serializedData.username, serializedData.password, serializedData.cloudId, serializedData.rootDirId);
    fs.resources = serializedData.resources;
    callback(null, fs);
  }
}

export class QuqiFileSystem extends FileSystem {
  quqiAction = null;

  resources: {
    [path: string]: QuqiFileSystemResource
  }

  constructor(public username: string, public password: string, public cloudId: number, public rootDirId: number) {
    super(new QuqiSerializer());
    this.quqiAction = new QuqiAction(username, password, cloudId);

    this.resources = {
      '/': new QuqiFileSystemResource(rootDirId, ResourceType.Directory, 0, 0, 0)
    };

    // 自动创建临时目录
    try {
      fs.statSync(tmpDir)
    } catch (e) {
      fs.mkdirSync(tmpDir)
    }
  }

  protected getRealPath(path: Path) {
    const sPath = path.toString();
    const parentPath = dirname(sPath);

    return {
      realPath: sPath,
      parentId: this.resources[parentPath]?.nid,
      nodeId: this.resources[sPath]?.nid,
      resource: this.resources[sPath]
    };
  }

  protected _create(path: Path, ctx: CreateInfo, _callback: SimpleCallback): void {
    console.log("_create", path.toString());
    const {parentId, realPath} = this.getRealPath(path);
    let fileName = basename(realPath);

    if (ctx.type.isDirectory) {
      this.quqiAction.mkdir(parentId, fileName).then(rs => {
        let now = Math.floor(new Date().getTime() / 1000);
        this.resources[path.toString()] = new QuqiFileSystemResource(rs.data.node_id, ResourceType.Directory, parentId, now, 0);
        _callback(null);
      }).catch(e => {
        _callback(e);
      })
    } else {
      // TODO 曲奇不支持覆盖上传，跳过创建文件的步骤
      _callback(null);
    }
  }

  protected _delete(path: Path, ctx: DeleteInfo, _callback: SimpleCallback): void {
    console.log("_delete", path.toString());
    const {nodeId} = this.getRealPath(path);

    const callback = (e) => {
      if (!e)
        delete this.resources[path.toString()];
      _callback(e);
    }

    return this.quqiAction.delete(nodeId).then(() => {
      callback(null);
    }).catch(callback);
  }

  protected _openWriteStream(path: Path, ctx: OpenWriteStreamInfo, callback: ReturnCallback<[Writable, (SimpleCallback)=>void]>): void {
    console.log("_openWriteStream", path.toString());
    const {realPath, parentId, resource} = this.getRealPath(path);
    let fileName = basename(realPath);
    // 把文件内容接收到本地临时文件再上传
    const tmpFile = pathJoin(tmpDir, `tmp-file-${new Date().getTime()}`);
    const stream = fs.createWriteStream(tmpFile);
    callback(null, [stream, (_callback)=>{
      console.log("文件内容接收完成");
      this.quqiAction.uploadByPath(parentId, fileName, tmpFile).then(rs => {
        console.log("文件内容上传完成", JSON.stringify(rs));
        let now = Math.floor(new Date().getTime() / 1000);
        let size = fs.statSync(tmpFile).size;
        this.resources[realPath] = new QuqiFileSystemResource(rs.node_id, ResourceType.File, parentId, now, size)
      }).then(() => {
        fs.unlinkSync(tmpFile)
      }).then(()=>{
        _callback();
      });
    }]);
  }

  protected _afterWriteStreamFinished() {
    console.log("_afterWriteStreamFinished");
  }

  protected _openReadStream(path: Path, ctx: OpenReadStreamInfo, callback: ReturnCallback<Readable>): void {
    console.log("_openReadStream", path.toString());
    const {nodeId} = this.getRealPath(path);
    this.quqiAction.download(nodeId).then(readStream => {
      callback(null, readStream);
    }).catch(e => {
      callback(e, null)
    })
  }

  protected _move(pathFrom: Path, pathTo: Path, ctx: MoveInfo, callback: ReturnCallback<boolean>): void {
    console.log("_move", pathFrom.toString(), "=>", pathTo.toString());
    if (dirname(pathFrom.toString()) !== dirname(pathTo.toString())) {
      console.error("_move 未实现");
      callback(new Error("未实现"), false)
    } else {
      const {nodeId} = this.getRealPath(pathFrom);
      this.quqiAction.rename(nodeId, basename(pathTo.toString())).then(rs => {
        console.log("_move 成功", pathFrom.toString(), "=>", pathTo.toString());
        callback(null, true);
      }).catch(e => {
        callback(e, false)
      })
    }
  }

  protected _size(path: Path, ctx: SizeInfo, callback: ReturnCallback<number>): void {
    console.log("_size", path.toString());
    this.getStatProperty(path, ctx, 'size', callback);
  }

  /**
   * Get a property of an existing resource (object property, not WebDAV property). If the resource doesn't exist, it is created.
   *
   * @param path Path of the resource
   * @param ctx Context of the method
   * @param propertyName Name of the property to get from the resource
   * @param callback Callback returning the property object of the resource
   */
  protected getPropertyFromResource(path: Path, ctx: any, propertyName: string, callback: ReturnCallback<any>): void {
    let resource = this.resources[path.toString()];
    console.log("getPropertyFromResource", path.toString(), propertyName);
    if (!resource) {
      resource = new QuqiFileSystemResource(0, ResourceType.File, 0, 0, 0);
      // TODO 不能保存?
      // this.resources[path.toString()] = resource;
    }
    console.log("getPropertyFromResource", propertyName, resource[propertyName]);
    callback(null, resource[propertyName]);
  }

  protected _lockManager(path: Path, ctx: LockManagerInfo, callback: ReturnCallback<ILockManager>): void {
    console.log("_lockManager", path.toString());
    this.getPropertyFromResource(path, ctx, 'locks', callback);
  }

  protected _propertyManager(path: Path, ctx: PropertyManagerInfo, callback: ReturnCallback<IPropertyManager>): void {
    console.log("_propertyManager", path.toString());
    this.getPropertyFromResource(path, ctx, 'props', callback);
  }

  protected _readDir(path: Path, ctx: ReadDirInfo, callback: ReturnCallback<string[] | Path[]>): void {
    console.log("_readDir", path.toString());
    const {nodeId, realPath} = this.getRealPath(path);

    this.requestDirList(nodeId, realPath).then(files => {
      callback(null, files);
    }).catch(e => {
      callback(e, null)
    })
  }

  protected getStatProperty(path: Path, ctx: any, propertyName: string, callback: ReturnCallback<any>): void {
    const {resource} = this.getRealPath(path);
    console.log("getStatProperty", path.toString(), propertyName)
    let value = resource ? resource[propertyName] : 0
    switch (propertyName) {
      case "birthtime":
      case "mtime":
        value = resource ? resource.addTime * 1000 : 0
        break;
    }
    console.log("getStatProperty", propertyName, value);
    callback(null, value);
  }

  protected getStatDateProperty(path: Path, ctx: any, propertyName: string, callback: ReturnCallback<number>): void {
    console.log("getStatDateProperty", path.toString(), propertyName)
    this.getStatProperty(path, ctx, propertyName, (e, value) => callback(e, value ? (value as Date).valueOf() : value));
  }

  protected _creationDate(path: Path, ctx: CreationDateInfo, callback: ReturnCallback<number>): void {
    console.log("_creationDate", path.toString());
    this.getStatDateProperty(path, ctx, 'birthtime', callback);
  }

  protected _lastModifiedDate(path: Path, ctx: LastModifiedDateInfo, callback: ReturnCallback<number>): void {
    console.log("_lastModifiedDate", path.toString());
    this.getStatDateProperty(path, ctx, 'mtime', callback);
  }

  protected _type(path: Path, ctx: TypeInfo, callback: ReturnCallback<ResourceType>): void {
    console.log("_type", path.toString());
    const {resource} = this.getRealPath(path);

    const _callback = function (resource) {
      if (!resource) {
        let errorMessage = "文件不存在: " + path.toString();
        console.error("_type", errorMessage);
        callback(Errors.ResourceNotFound, null);
      } else
        callback(null, resource.type);
    }

    if (!resource) {
      this.reloadParentsDirectories(path.toString()).then(() => {
        const {resource} = this.getRealPath(path);
        _callback(resource);
      });
    } else
      _callback(resource);
  }

  private reloadParentsDirectories(path: string) {
    const parentDir = dirname(path);
    const resource = this.resources[parentDir];
    return when().then(() => {
      if (!resource) {
        if (parentDir === '/') {
          return this.requestDirList(this.rootDirId, "/")
        } else {
          return this.reloadParentsDirectories(parentDir);
        }
      } else {
        return;
      }
    }).then(() => {
      const resource = this.resources[parentDir];
      return this.requestDirList(resource.nid, parentDir)
    })
  }

  private requestDirList(nid, dir) {
    const files = [];
    return this.quqiAction.list(nid).then(rs => {
      rs.data.dir.forEach(item => {
        let itemPath = pathJoin(dir, item.name);
        files.push(itemPath)
        this.resources[itemPath] = new QuqiFileSystemResource(item.nid, ResourceType.Directory, item.parent_id, item.add_time, 0);
      })
      rs.data.file.forEach(item => {
        let fileName = item.name;
        // TODO 确认文件名是否显示后缀的规则
        if (item.filetype !== "q-default" && item.ext) {
          fileName += "." + item.ext;
        }
        let itemPath = pathJoin(dir, fileName);
        files.push(itemPath)
        this.resources[itemPath] = new QuqiFileSystemResource(item.nid, ResourceType.File, item.parent_id, item.add_time, item.size);
      })
    }).catch(e => {
      console.error(e);
    }).then(() => {
      console.log("requestDirList", files);
      return files;
    });
  }
}
