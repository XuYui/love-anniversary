# 恋爱纪念册 Love Anniversary

一个响应式全栈恋爱纪念应用，用来记录相爱天数、城市足迹、100 件小事、时光邮局、每日打卡、许愿池和三周年回顾放映。

## 一键下载

下载最新源码压缩包：

[love-anniversary-source.zip](https://github.com/XuYui/love-anniversary/releases/latest/download/love-anniversary-source.zip)

也可以访问 [Releases 页面](https://github.com/XuYui/love-anniversary/releases) 查看历史版本。

## 项目亮点

- Express + SQLite 后端，提供清晰的 REST API。
- 原生 HTML/CSS/JavaScript 前端，无重型前端框架依赖。
- 支持足迹地图、相册、愿望清单、时光邮局、每日打卡、许愿池和纪念日放映。
- 支持图片上传与本地媒体素材库读取。
- 数据目录可配置，服务器更新代码时不会覆盖已有数据库、照片或音乐。
- 配置 GitHub Actions，每次推送都会执行语法检查。

## 技术栈

- Node.js 22+
- Express 5
- SQLite
- Multer
- Leaflet
- HTML / CSS / Vanilla JavaScript

## 快速启动

```bash
npm ci
npm start
```

启动后打开：

```text
http://localhost:3000
```

运行检查：

```bash
npm run check
```

部署或升级前备份数据：

```bash
npm run backup:data
```

## 数据与隐私

默认本地路径：

- 数据库：`memory.db`
- 音乐：`music/`
- 图片：`pictures/`

生产环境建议把数据放到仓库目录之外，例如：

```bash
PORT=3000
DATA_DIR=/srv/love-anniversary/shared
```

设置 `DATA_DIR` 后，运行数据会存放在：

- `/srv/love-anniversary/shared/memory.db`
- `/srv/love-anniversary/shared/music`
- `/srv/love-anniversary/shared/pictures`

这样后续执行 `git pull` 或重新部署代码时，不会删除或覆盖旧数据。

## 仓库内容说明

会提交到 GitHub：

- `public/` 前端代码
- `server.js` 后端服务
- `package.json` / `package-lock.json`
- `.env.example`
- `.github/workflows/ci.yml`
- `README.md`
- `DEVELOPERS.md`

不会提交到 GitHub：

- `memory.db`
- `.env`
- `node_modules/`
- `backups/`
- 真实照片文件
- 真实音乐文件

更多开发规范、上传 GitHub 要求和服务器部署流程见 [DEVELOPERS.md](./DEVELOPERS.md)。
