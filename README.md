# 用途
将曲奇网盘的API转成webdav服务

# 用法
```
npm install
export QUQI_ACCOUNT=手机号; export QUQI_PASSWORD=密码; export QUQI_CLOUD_ID=私有云的ID; export QUQI_ROOT_DIR_ID=根目录ID;
npm start

```
![获取ID的方式](id.png)

## TODO
- [x] 列出子目录
- [x] 下载1G文件
- [x] 重命名
- [x] 上传1G文件
- [x] 上传目录
- [x] 极速上传
- [x] 删除文件
- [x] 新建目录
- [x] token不正确时自动注销
- [x] 文件修改时间
- [x] 自动遍历上级目录
