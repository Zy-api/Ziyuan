const { query, queryOne, run } = require('../lib/db');
const { signToken, verifyToken, ts, authMiddleware, randomHex } = require('../lib/utils');
const bcrypt = require('bcryptjs');

export default async function handler(req, res) {
  const { method, url } = req;
  const pathname = url.split('?')[0];

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (method === 'OPTIONS') return res.status(200).end();

  try {
    // ========== HEALTH ==========
    if (pathname === '/api/health') {
      return res.status(200).json({ success: true, message: 'DeployFlow API' });
    }

    // ========== AUTH ==========
    if (pathname === '/api/auth/register' && method === 'POST') {
      const { email, password, name } = req.body;
      if (!email || !password) return res.status(400).json({ success: false, error: '请填写所有必填字段' });
      const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) return res.status(400).json({ success: false, error: '该邮箱已注册' });
      const hashed = await bcrypt.hash(password, 10);
      const result = await run('INSERT INTO users (email, password, name, provider) VALUES (?, ?, ?, ?)', [email, hashed, name || email.split('@')[0], 'email']);
      const userId = result.insertId;
      const token = signToken({ userId, email, name: name || email.split('@')[0], avatar: null });
      return res.status(200).json({ success: true, token, user: { id: userId, email, name: name || email.split('@')[0], avatar: null } });
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ success: false, error: '请输入邮箱和密码' });
      const user = await queryOne('SELECT * FROM users WHERE email = ?', [email]);
      if (!user) return res.status(400).json({ success: false, error: '邮箱或密码错误' });
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(400).json({ success: false, error: '邮箱或密码错误' });
      const token = signToken({ userId: user.id, email: user.email, name: user.name, avatar: user.avatar });
      return res.status(200).json({ success: true, token, user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar } });
    }

    if (pathname === '/api/auth/me' && method === 'GET') {
      return authMiddleware(async (req, res) => {
        const u = req.user;
        return res.status(200).json({ success: true, user: { id: u.userId, email: u.email, name: u.name, avatar: u.avatar } });
      })(req, res);
    }

    if (pathname === '/api/auth/profile' && method === 'PUT') {
      return authMiddleware(async (req, res) => {
        const { name, avatar } = req.body;
        const fields = [];
        const params = [];
        if (name) { fields.push('name = ?'); params.push(name); }
        if (avatar) { fields.push('avatar = ?'); params.push(avatar); }
        if (fields.length === 0) return res.status(400).json({ success: false, error: '没有要更新的字段' });
        params.push(req.userId);
        await run('UPDATE users SET ' + fields.join(', ') + ' WHERE id = ?', params);
        const user = await queryOne('SELECT id, email, name, avatar FROM users WHERE id = ?', [req.userId]);
        const newToken = signToken({ userId: user.id, email: user.email, name: user.name, avatar: user.avatar });
        return res.status(200).json({ success: true, user, token: newToken });
      })(req, res);
    }

    if (pathname === '/api/auth/password' && method === 'PUT') {
      return authMiddleware(async (req, res) => {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) return res.status(400).json({ success: false, error: '请填写当前密码和新密码' });
        const user = await queryOne('SELECT * FROM users WHERE id = ?', [req.userId]);
        if (!user) return res.status(404).json({ success: false, error: '用户不存在' });
        const valid = await bcrypt.compare(currentPassword, user.password);
        if (!valid) return res.status(400).json({ success: false, error: '当前密码错误' });
        const hashed = await bcrypt.hash(newPassword, 10);
        await run('UPDATE users SET password = ? WHERE id = ?', [hashed, req.userId]);
        return res.status(200).json({ success: true, message: '密码修改成功' });
      })(req, res);
    }

    if (pathname === '/api/auth/github' && method === 'POST') {
      const { login, name, avatar, email } = req.body;
      if (!login) return res.status(400).json({ success: false, error: 'GitHub 信息不完整' });
      let user = await queryOne('SELECT * FROM users WHERE github_login = ?', [login]);
      if (!user && email) user = await queryOne('SELECT * FROM users WHERE email = ?', [email]);
      if (user) {
        await run('UPDATE users SET github_login=?, github_avatar=?, github_name=?, avatar=? WHERE id=?', [login, avatar, name, avatar || user.avatar, user.id]);
      } else {
        const result = await run('INSERT INTO users (email, name, avatar, provider, github_login, github_avatar, github_name) VALUES (?, ?, ?, ?, ?, ?, ?)', [email || (login + '@github.local'), name || login, avatar, 'github', login, avatar, name]);
        const newId = result.insertId;
        user = await queryOne('SELECT * FROM users WHERE id = ?', [newId]);
      }
      const token = signToken({ userId: user.id, email: user.email, name: user.name, avatar: user.avatar });
      return res.status(200).json({ success: true, token, user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar } });
    }

    if (pathname === '/api/auth/wechat' && method === 'POST') {
      const { openid, nickname, avatar } = req.body;
      if (!openid) return res.status(400).json({ success: false, error: '微信信息不完整' });
      let user = await queryOne('SELECT * FROM users WHERE email = ?', ['wx_' + openid + '@wechat.local']);
      if (!user) {
        const result = await run('INSERT INTO users (email, name, avatar, provider) VALUES (?, ?, ?, ?)', ['wx_' + openid + '@wechat.local', nickname || '微信用户', avatar, 'wechat']);
        const newId = result.insertId;
        user = await queryOne('SELECT * FROM users WHERE id = ?', [newId]);
      }
      const token = signToken({ userId: user.id, email: user.email, name: user.name, avatar: user.avatar });
      return res.status(200).json({ success: true, token, user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar } });
    }

    // ========== SEND EMAIL / VERIFY ==========
    if (pathname === '/api/send-email' && method === 'GET') {
      const { check, email } = req.query;
      if (check) {
        const rows = await query("SELECT code, email FROM verify_codes WHERE expires_at > NOW() ORDER BY created_at DESC LIMIT 1", []);
        if (rows.length > 0) return res.status(200).json({ success: true, code: rows[0].code, email: rows[0].email });
        return res.status(404).json({ success: false, message: '暂无有效验证码' });
      }
      if (!email) return res.status(400).json({ success: false, error: '请输入邮箱' });
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await run("INSERT INTO verify_codes (email, code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))", [email, code]);
      return res.status(200).json({ success: true, code, message: '验证码已生成' });
    }

    // ========== PROJECTS ==========
    if (pathname === '/api/projects' && method === 'GET') {
      return authMiddleware(async (req, res) => {
        const rows = await query('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
        return res.status(200).json({ success: true, list: rows.map(p => ({
          id: p.id, name: p.name, slug: p.slug, framework: p.framework,
          projectType: p.project_type, method: p.method, source: p.source,
          url: p.url, customDomain: p.custom_domain, fileList: p.file_list,
          entryDir: p.entry_dir, entryFile: p.entry_file,
          createdAt: ts(p.created_at), lastDeploy: ts(p.last_deploy)
        })) });
      })(req, res);
    }

    if (pathname === '/api/deploy' && method === 'POST') {
      return authMiddleware(async (req, res) => {
        const { name, files, framework = '静态文件', project_type = 'static', method = 'manual', source, url, custom_domain, entry_dir, entry_file } = req.body;
        if (!name || !files || !Array.isArray(files) || files.length === 0)
          return res.status(400).json({ success: false, error: '项目名称和文件不能为空' });
        const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
        let slug = slugBase;
        let counter = 1;
        while (await queryOne('SELECT id FROM projects WHERE slug = ?', [slug])) {
          slug = slugBase + '-' + counter++;
        }
        const projectId = randomHex(12);
        await run('INSERT INTO projects (id, user_id, name, slug, framework, project_type, method, source, url, custom_domain, file_list, entry_dir, entry_file, last_deploy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
          [projectId, req.userId, name, slug, framework, project_type, method, source || null, url || null, custom_domain || null, JSON.stringify(files.map(f => f.name)), entry_dir || null, entry_file || null]);
        for (const f of files) {
          const content = f.content || '';
          const b64 = Buffer.from(content).toString('base64');
          await run('INSERT INTO project_files (project_slug, filename, file_size, content) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content), file_size = VALUES(file_size)',
            [slug, f.name, content.length, b64]);
        }
        return res.status(200).json({ success: true, slug, url: '/deployed/' + slug + '/', projectId, project_type, process: null });
      })(req, res);
    }

    // ========== FILES ==========
    if (pathname.startsWith('/api/files/') && method === 'GET') {
      const parts = pathname.replace('/api/files/', '').split('/');
      const slug = parts[0];
      const filename = parts[1] || '';
      if (!slug || !filename) return res.status(400).json({ success: false, error: '缺少参数' });
      const rows = await query('SELECT content FROM project_files WHERE project_slug = ? AND filename = ?', [slug, filename]);
      if (rows.length === 0) return res.status(404).json({ success: false, error: '文件不存在' });
      return res.status(200).json({ success: true, content: Buffer.from(rows[0].content, 'base64').toString('utf-8') });
    }

    // ========== NOTIFICATIONS ==========
    if (pathname === '/api/notifications' && method === 'GET') {
      return authMiddleware(async (req, res) => {
        const rows = await query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
        return res.status(200).json({ success: true, list: rows.map(n => ({ ...n, created_at: ts(n.created_at), is_read: !!n.is_read })) });
      })(req, res);
    }

    if (pathname === '/api/notifications' && method === 'POST') {
      return authMiddleware(async (req, res) => {
        const { type = 'info', title, description } = req.body;
        if (!title) return res.status(400).json({ success: false, error: '标题不能为空' });
        await run('INSERT INTO notifications (user_id, type, title, description) VALUES (?, ?, ?, ?)', [req.userId, type, title, description || '']);
        return res.status(200).json({ success: true, message: '通知已创建' });
      })(req, res);
    }

    if (pathname.startsWith('/api/notifications/') && pathname.endsWith('/read') && method === 'PUT') {
      return authMiddleware(async (req, res) => {
        const id = pathname.replace('/api/notifications/', '').replace('/read', '');
        await run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, req.userId]);
        return res.status(200).json({ success: true, message: '已标记为已读' });
      })(req, res);
    }

    if (pathname === '/api/notifications/read-all' && method === 'PUT') {
      return authMiddleware(async (req, res) => {
        await run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.userId]);
        return res.status(200).json({ success: true, message: '全部已读' });
      })(req, res);
    }

    // ========== TEAM ==========
    if (pathname === '/api/team' && method === 'GET') {
      return authMiddleware(async (req, res) => {
        const rows = await query('SELECT * FROM team_members WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
        return res.status(200).json({ success: true, list: rows.map(r => ({ ...r, created_at: ts(r.created_at) })) });
      })(req, res);
    }

    if (pathname === '/api/team' && method === 'POST') {
      return authMiddleware(async (req, res) => {
        const { email, role = 'member' } = req.body;
        if (!email) return res.status(400).json({ success: false, error: '邮箱不能为空' });
        await run('INSERT INTO team_members (user_id, email, role) VALUES (?, ?, ?)', [req.userId, email, role]);
        return res.status(200).json({ success: true, message: '成员已添加' });
      })(req, res);
    }

    if (pathname.startsWith('/api/team/') && method === 'DELETE') {
      return authMiddleware(async (req, res) => {
        const id = pathname.replace('/api/team/', '');
        await run('DELETE FROM team_members WHERE id = ? AND user_id = ?', [id, req.userId]);
        return res.status(200).json({ success: true, message: '成员已移除' });
      })(req, res);
    }

    // ========== DATABASES ==========
    if (pathname === '/api/databases' && method === 'GET') {
      return authMiddleware(async (req, res) => {
        const rows = await query('SELECT * FROM user_databases WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
        return res.status(200).json({ success: true, list: rows.map(d => ({ ...d, created_at: ts(d.created_at) })) });
      })(req, res);
    }

    if (pathname === '/api/databases' && method === 'POST') {
      return authMiddleware(async (req, res) => {
        const { display_name } = req.body;
        if (!display_name) return res.status(400).json({ success: false, error: '数据库名称不能为空' });
        const cleanName = display_name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const realName = 'df_u' + req.userId + '_' + cleanName;
        const dbUser = realName + '_user';
        const dbPass = randomHex(16);
        const existing = await queryOne('SELECT id FROM user_databases WHERE real_name = ?', [realName]);
        if (existing) return res.status(400).json({ success: false, error: '数据库已存在' });
        await run('INSERT INTO user_databases (user_id, display_name, real_name, db_user, db_password) VALUES (?, ?, ?, ?, ?)', [req.userId, display_name, realName, dbUser, dbPass]);
        return res.status(200).json({ success: true, database: { display_name, real_name: realName, db_user: dbUser, db_password: dbPass, type: 'MySQL' } });
      })(req, res);
    }

    // ========== TOKENS ==========
    if (pathname === '/api/tokens' && method === 'GET') {
      return authMiddleware(async (req, res) => {
        const rows = await query('SELECT * FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
        return res.status(200).json({ success: true, list: rows });
      })(req, res);
    }

    if (pathname === '/api/tokens' && method === 'POST') {
      return authMiddleware(async (req, res) => {
        const { name } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Token 名称不能为空' });
        const tokenId = randomHex(8);
        const tokenStr = 'df_' + randomHex(24);
        await run('INSERT INTO api_tokens (id, user_id, name, token, scope) VALUES (?, ?, ?, ?, ?)', [tokenId, req.userId, name, tokenStr, 'sync']);
        return res.status(200).json({ success: true, token: { id: tokenId, name, token: tokenStr, scope: 'sync' } });
      })(req, res);
    }

    // ========== DOMAINS ==========
    if (pathname === '/api/domains' && method === 'POST') {
      return authMiddleware(async (req, res) => {
        const { domain, project_slug } = req.body;
        if (!domain || !project_slug) return res.status(400).json({ success: false, error: '域名和项目不能为空' });
        const existing = await queryOne('SELECT id FROM domains WHERE domain = ?', [domain]);
        if (existing) return res.status(400).json({ success: false, error: '该域名已被绑定' });
        await run('INSERT INTO domains (domain, project_slug, user_id) VALUES (?, ?, ?)', [domain, project_slug, req.userId]);
        return res.status(200).json({ success: true, message: '域名绑定成功' });
      })(req, res);
    }

    // ========== GUESTBOOK ==========
    if (pathname === '/api/guestbook' && method === 'GET') {
      const rows = await query('SELECT g.*, u.name as user_name, u.avatar as user_avatar FROM guestbook g LEFT JOIN users u ON g.user_id = u.id ORDER BY g.created_at DESC LIMIT 100', []);
      return res.status(200).json({ success: true, list: rows });
    }

    // ========== PROCESSES ==========
    if (pathname.startsWith('/api/processes/')) {
      if (method === 'POST') return res.status(501).json({ success: false, error: 'Vercel 环境不支持运行动态后端进程。仅支持静态文件部署。' });
      if (method === 'GET') return res.status(200).json({ success: true, status: 'static', message: 'Vercel Serverless 环境仅支持静态部署，无独立进程' });
    }

    // ========== DEPLOYED FILES SERVING ==========
    if (pathname.startsWith('/deployed/')) {
      const rest = pathname.substring('/deployed/'.length);
      const slashIdx = rest.indexOf('/');
      const slug = slashIdx === -1 ? rest : rest.substring(0, slashIdx);
      let filename = slashIdx === -1 ? 'index.html' : rest.substring(slashIdx + 1);
      if (!filename) filename = 'index.html';

      const rows = await query('SELECT content FROM project_files WHERE project_slug = ? AND filename = ?', [slug, filename]);
      if (rows.length === 0) {
        const fallback = await query('SELECT content FROM project_files WHERE project_slug = ? AND filename = ?', [slug, 'index.html']);
        if (fallback.length === 0) return res.status(404).send('Not Found');
        return res.status(200).send(Buffer.from(fallback[0].content, 'base64').toString('utf-8'));
      }
      const content = Buffer.from(rows[0].content, 'base64').toString('utf-8');
      const ext = (filename.split('.').pop() || '').toLowerCase();
      const types = {
        html: 'text/html', css: 'text/css', js: 'application/javascript',
        json: 'application/json', png: 'image/png', jpg: 'image/jpeg',
        jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml'
      };
      res.setHeader('Content-Type', types[ext] || 'text/html');
      return res.status(200).send(content);
    }

    // Default: Not Found
    return res.status(404).json({ success: false, error: 'Not found: ' + pathname });

  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ success: false, error: err.message || '服务器内部错误' });
  }
}
