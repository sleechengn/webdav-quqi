import {FileSystem} from "webdav-server/lib/manager/v2/fileSystem/FileSystem";
import {Path} from "webdav-server/lib/manager/v2/Path";
import {
  CreateInfo, CreationDateInfo, DeleteInfo, LastModifiedDateInfo,
  LockManagerInfo, MoveInfo, OpenReadStreamInfo, OpenWriteStreamInfo,
  PropertyManagerInfo, ReadDirInfo, SizeInfo,
  TypeInfo
} from "webdav-server/lib/manager/v2/fileSystem/ContextInfo";
import {ILockManager, LocalLockManager} from "webdav-server/lib/manager/v2/fileSystem/LockManager";
import {IPropertyManager, LocalPropertyManager} from "webdav-server/lib/manager/v2/fileSystem/PropertyManager";
import {ResourceType, ReturnCallback, SimpleCallback} from "webdav-server";
import {FileSystemSerializer} from "webdav-server/lib/manager/v2/fileSystem/Serialization";
import {join as pathJoin, basename, dirname} from 'path'
import {Readable, Writable, PassThrough} from "stream";
import QuqiAction from "./QuqiAction";
import QuqiUtils from "./QuqiUtils";


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
  }

  protected getRealPath(path: Path) {
    const sPath = path.toString();
    const parentPath = dirname(sPath);

    return {
      realPath: pathJoin('/', sPath.substr(1)),
      parentId: this.resources[parentPath]?.nid,
      nodeId: this.resources[sPath]?.nid,
      resource: this.resources[sPath]
    };
  }

  protected _create(path: Path, ctx: CreateInfo, _callback: SimpleCallback): void {
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
      _callback(null);
    }
  }

  protected _delete(path: Path, ctx: DeleteInfo, _callback: SimpleCallback): void {
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

  protected _openWriteStream(path: Path, ctx: OpenWriteStreamInfo, callback: ReturnCallback<Writable>): void {
    const {realPath, parentId} = this.getRealPath(path);
    let fileName = basename(realPath);
    this.quqiAction.upload(parentId, fileName).then(rs => {
      callback(null, rs.writeStream);
    }).catch(e => {
      callback(e, null)
    })
  }

  protected _openReadStream(path: Path, ctx: OpenReadStreamInfo, callback: ReturnCallback<Readable>): void {
    const {nodeId} = this.getRealPath(path);
    this.quqiAction.download(nodeId).then(readStream => {
      callback(null, readStream);
    }).catch(e => {
      callback(e, null)
    })
  }

  protected _move(pathFrom: Path, pathTo: Path, ctx: MoveInfo, callback: ReturnCallback<boolean>): void {
    if (dirname(pathFrom.toString()) !== dirname(pathTo.toString())) {
      console.log("_move 未实现");
      callback(new Error("未实现"), false)
    } else {
      const {nodeId} = this.getRealPath(pathFrom);
      this.quqiAction.rename(nodeId, basename(pathTo.toString())).then(rs => {
        console.log("_move 成功");
        callback(null, true);
      }).catch(e => {
        callback(e, false)
      })
    }
  }

  protected _size(path: Path, ctx: SizeInfo, callback: ReturnCallback<number>): void {
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
    console.log("getPropertyFromResource", propertyName);
    if (!resource) {
      callback(new Error("资源不存在"), null)
    } else {
      callback(null, resource[propertyName]);
    }
  }

  protected _lockManager(path: Path, ctx: LockManagerInfo, callback: ReturnCallback<ILockManager>): void {
    this.getPropertyFromResource(path, ctx, 'locks', callback);
  }

  protected _propertyManager(path: Path, ctx: PropertyManagerInfo, callback: ReturnCallback<IPropertyManager>): void {
    this.getPropertyFromResource(path, ctx, 'props', callback);
  }

  protected _readDir(path: Path, ctx: ReadDirInfo, callback: ReturnCallback<string[] | Path[]>): void {
    const {nodeId, realPath} = this.getRealPath(path);

    this.quqiAction.list(nodeId).then(rs => {
      const files = [];
      rs.data.dir.forEach(item => {
        let itemPath = pathJoin(realPath, item.name);
        files.push(itemPath)
        this.resources[itemPath] = new QuqiFileSystemResource(item.nid, ResourceType.Directory, item.parent_id, item.add_time, 0);
      })
      rs.data.file.forEach(item => {
        let itemPath = pathJoin(realPath, item.name);
        files.push(itemPath)
        this.resources[itemPath] = new QuqiFileSystemResource(item.nid, ResourceType.File, item.parent_id, item.add_time, item.size);
      })
      callback(null, files);
    }).catch(e => {
      callback(e, null)
    })
  }

  protected getStatProperty(path: Path, ctx: any, propertyName: string, callback: ReturnCallback<any>): void {
    const {resource} = this.getRealPath(path);
    console.log("getStatProperty", propertyName)
    let propertyNameInResource = "";
    switch (propertyName) {
      case "birthtime":
      case "mtime":
        propertyNameInResource = "addTime";
        break;
      case "size":
        propertyNameInResource = "size";
        break;
    }
    callback(null, resource ? resource[propertyNameInResource] : 0)
  }

  protected getStatDateProperty(path: Path, ctx: any, propertyName: string, callback: ReturnCallback<number>): void {
    this.getStatProperty(path, ctx, propertyName, (e, value) => callback(e, value ? (value as Date).valueOf() : value));
  }

  protected _creationDate(path: Path, ctx: CreationDateInfo, callback: ReturnCallback<number>): void {
    this.getStatDateProperty(path, ctx, 'birthtime', callback);
  }

  protected _lastModifiedDate(path: Path, ctx: LastModifiedDateInfo, callback: ReturnCallback<number>): void {
    this.getStatDateProperty(path, ctx, 'mtime', callback);
  }

  protected _type(path: Path, ctx: TypeInfo, callback: ReturnCallback<ResourceType>): void {
    const {resource} = this.getRealPath(path);
    if (!resource)
      callback(new Error("文件不存在"), null);
    else
      callback(null, resource.type);
  }
}
