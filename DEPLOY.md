# DeployFlow Vercel Deployment Guide

## DeployFlow Vercel部署指南

---

## 项目结构

```
deployflow/
├── api/
│   └── index.js          # Vercel API 路由入口（所有 API 端点）
├── lib/
│   ├── db.js             # MySQL 数据库连接池
│   └── utils.js          # JWT / 密码 / 认证中间件 / 工具函数
├── public/
│   ├── index.html        # 前端主页面（SPA）
│   └── verify.html       # 邮箱验证页面
├── deployed/             # 静态部署文件存储目录（开发时占位）
├── schema.sql            # MySQL 数据库表结构
├── package.json          # 依赖声明
└── vercel.json           # Vercel 部署配置
```

---

## 快速开始

### 第一步：准备 MySQL 数据库

1. 启动 MySQL 数据库（本地或云端）
   - 推荐：Railway（免费 MySQL）、PlanetScale（免费）、腾讯云/阿里云 MySQL

2. 创建数据库
   ```sql
   CREATE DATABASE deployflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

3. 导入表结构
   ```bash
   mysql -u root -p deployflow < schema.sql
   ```

### 第二步：部署到 Vercel

#### 方式一：GitHub 导入（推荐）

1. 将本目录推送到 GitHub 仓库
   ```bash
   git init
   git add .
   git commit -m "DeployFlow v2.0"
   git push origin main
   ```

2. 在 [Vercel Dashboard](https://vercel.com) 点击 "Add New Project"
3. 选择 GitHub 仓库，点击 Import
4. 设置环境变量（见下方）
5. 点击 Deploy

#### 方式二：Vercel CLI

1. 全局安装 Vercel CLI
   ```bash
   npm i -g vercel
   ```

2. 登录 Vercel
   ```bash
   vercel login
   ```

3. 在项目目录执行
   ```bash
   vercel --prod
   ```

---

## 环境变量配置

在 Vercel Dashboard → Project Settings → Environment Variables 中配置：

| 变量名 | 说明 | 示例 |
|---|---|---|
| `MYSQL_HOST` | MySQL 主机地址 | `mysql.railway.internal` |
| `MYSQL_PORT` | MySQL 端口 | `3306` |
| `MYSQL_USER` | MySQL 用户名 | `root` |
| `MYSQL_PASSWORD` | MySQL 密码 | `your_password` |
| `MYSQL_DATABASE` | 数据库名 | `deployflow` |
| `JWT_SECRET` | JWT 签名密钥（可自定义） | `deployflow_secret_key_2026` |

> **注意**：`JWT_SECRET` 建议设置一个长随机字符串，用于 JWT 签名，不设置则使用默认值。

---

## 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 设置环境变量
# 创建 .env.local 文件：
cat > .env.local << 'EOF'
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=deployflow
JWT_SECRET=deployflow_secret_key_2026
EOF

# 3. 导入数据库表结构
mysql -u root -p deployflow < schema.sql

# 4. 启动开发服务器
npm run dev
```

---

## 功能清单

| 功能 | API 端点 | 状态 |
|---|---|---|
| 健康检查 | `GET /api/health` | ✅ |
| 用户注册 | `POST /api/auth/register` | ✅ |
| 用户登录 | `POST /api/auth/login` | ✅ |
| 获取当前用户 | `GET /api/auth/me` | ✅ |
| 更新用户信息 | `PUT /api/auth/profile` | ✅ |
| 修改密码 | `PUT /api/auth/password` | ✅ |
| GitHub 登录 | `POST /api/auth/github` | ✅ |
| 微信登录 | `POST /api/auth/wechat` | ✅ |
| 发送验证码 | `GET/POST /api/send-email` | ✅ |
| 项目列表 | `GET /api/projects` | ✅ |
| 部署项目 | `POST /api/deploy` | ✅ |
| 获取项目文件 | `GET /api/files/:project/:filename` | ✅ |
| 通知列表 | `GET /api/notifications` | ✅ |
| 团队管理 | `GET/POST /api/team` | ✅ |
| Token 管理 | `GET/POST /api/tokens` | ✅ |
| 域名绑定 | `POST /api/domains` | ✅ |
| 数据库管理 | `GET/POST /api/databases` | ✅ |
| SQL 查询 | `POST /api/databases/:id/query` | ✅ |
| 留言板 | `GET/POST /api/guestbook` | ✅ |
| 访问已部署文件 | `GET /deployed/:slug/:filename` | ✅ |
| 进程管理 | `GET/POST /api/processes/*` | ⚠️ 仅返回提示（Vercel 不支持） |

---

## 已知限制

1. **动态后端进程**：Vercel 是 Serverless 平台，不支持长时间运行的 Node.js/PHP/Python 后端进程。动态网站（如 Next.js/Express 全栈应用）可部署为静态文件，但无法通过本平台启动独立后端服务。

2. **MySQL 连接**：Vercel Functions 为无状态执行，需使用外部 MySQL 服务（如 Railway、PlanetScale、腾讯云 MySQL）。推荐在生产环境配置连接池参数以优化性能。

3. **文件上传**：前端 ZIP 文件上传后，文件内容经 base64 编码存储在 MySQL 的 `project_files` 表中。部署的文件通过 `/deployed/:slug/:filename` 路由动态读取并返回。

4. **邮件发送**：平台不内置邮件发送功能。验证码通过 API 直接返回给前端展示（请用户查看 API 响应中的 `code` 字段）。

---

## 技术栈

- **前端**：原生 HTML/CSS/JS（SPA，响应式，浅色/深色主题）
- **后端**：Vercel Node.js API Routes (Serverless Functions)
- **数据库**：MySQL (mysql2/promise)
- **认证**：JWT (jsonwebtoken) + bcryptjs
- **部署**：Vercel (静态托管 + Serverless Functions)

---

## 从旧版本迁移

如果你之前使用的是 Cloudflare Pages + D1 版本：

1. 数据库从 SQLite (D1) 迁移到 MySQL：运行 `schema.sql` 创建新表
2. API 端点路径不变，仍为 `/api/...`
3. 前端 `index.html` 无需修改，直接兼容
4. 部署地址从 `*.pages.dev` 变为 `*.vercel.app`
