const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const { execFile } = require('child_process');
const { Server } = require('socket.io');
const painter = require('./painting');

// Lite2Edit.jar 路径，用于将 .litematic 转换为 .schem
const LITE2EDIT_JAR = path.join(__dirname, 'Lite2Edit.jar');

function runExec(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 10 * 1024 * 1024, ...options }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || err.message || '').toString().trim() || err.message;
        reject(new Error(msg));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

// 将 .litematic 文件转换为 .schem，返回转换后的 Buffer
async function convertLitematicToSchem(inputPath) {
  const dir = path.dirname(inputPath);
  const { stderr } = await runExec('java', ['-jar', LITE2EDIT_JAR, '--convert', inputPath], { cwd: dir });

  const base = path.basename(inputPath).replace(/\.litematic$/i, '');
  let outPath = path.join(dir, base + '.schem');

  if (!fs.existsSync(outPath)) {
    // 回退：在目录中查找最新生成的 .schem 文件
    const files = await fsp.readdir(dir);
    const schemCandidates = files
      .filter((f) => f.toLowerCase().endsWith('.schem'))
      .map((f) => path.join(dir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (schemCandidates.length === 0) {
      const detail = (stderr || '').toString().trim();
      throw new Error(detail || '转换完成但未找到生成的 .schem 文件');
    }
    outPath = schemCandidates[0];
  }

  return fsp.readFile(outPath);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { serveClient: true });

const PORT = process.env.PORT || 8080;

// 内存中保存的上传投影数据
let uploadedSchematic = null;
let uploadedName = '';
let building = false;

// 静态资源（网页 UI）
app.use(express.static(path.join(__dirname, 'public')));

// 投影文件上传（原始二进制），支持 .schem 与 .litematic
app.post('/api/upload', express.raw({ type: '*/*', limit: '200mb' }), async (req, res) => {
  try {
    if (!req.body || !req.body.length) {
      return res.status(400).json({ error: '没有接收到文件数据' });
    }
    const filename = req.headers['x-filename'] || 'uploaded.schem';
    const ext = path.extname(filename).toLowerCase();
    const rawBuffer = Buffer.from(req.body);

    let finalBuffer = rawBuffer;
    let converted = false;

    if (ext === '.litematic') {
      // 写入临时目录并用 Lite2Edit 转换为 .schem
      const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lite2edit-'));
      const inputPath = path.join(tmpDir, path.basename(filename));
      await fsp.writeFile(inputPath, rawBuffer);
      finalBuffer = await convertLitematicToSchem(inputPath);
      converted = true;
      uploadedName = filename.replace(/\.litematic$/i, '.schem');
    } else if (ext === '.schem') {
      uploadedName = filename;
    } else {
      return res.status(400).json({ error: '仅支持 .schem 或 .litematic 文件' });
    }

    uploadedSchematic = finalBuffer;
    res.json({
      name: uploadedName,
      size: uploadedSchematic.length,
      converted
    });
  } catch (err) {
    res.status(500).json({ error: '文件处理失败: ' + err.message });
  }
});

// JSON 请求解析
app.use(express.json());

// 开始建造
app.post('/api/start', (req, res) => {
  if (building) {
    return res.status(409).json({ error: '正在建造中，请先停止' });
  }
  if (!uploadedSchematic) {
    return res.status(400).json({ error: '请先上传投影文件' });
  }

  const cfg = req.body || {};
  const startX = Number(cfg.startX);
  const startY = Number(cfg.startY);
  const startZ = Number(cfg.startZ);
  if ([startX, startY, startZ].some((n) => Number.isNaN(n))) {
    return res.status(400).json({ error: '搭建坐标不完整或不合法' });
  }

  const schematicBuffer = uploadedSchematic;
  building = true;

  // 进度实时推送到网页
  painter.setProgressHandler((p) => {
    io.emit('progress', p);
  });

  io.emit('status', { state: 'connecting', message: '正在连接服务器...' });

  try {
    painter.createBot(
      {
        host: cfg.host,
        port: Number(cfg.port),
        username: cfg.username,
        version: cfg.version,
        auth: cfg.auth
      },
      async () => {
        io.emit('status', { state: 'building', message: '机器人已连接，开始建造...' });
        try {
          await painter.main({
            schematic: schematicBuffer,
            startPos: { x: startX, y: startY, z: startZ }
          });
          io.emit('status', { state: 'done', message: '建造完成' });
        } catch (err) {
          io.emit('status', { state: 'error', message: '建造出错: ' + err.message });
        } finally {
          building = false;
        }
      }
    );

    // 转发机器人事件到网页
    const bot = painter.getBot();
    if (bot) {
      bot.on('kicked', (reason) => {
        building = false;
        io.emit('status', { state: 'error', message: '机器人被踢出: ' + reason });
      });
    }

    res.json({ started: true });
  } catch (err) {
    building = false;
    res.status(500).json({ error: err.message });
  }
});

// 停止建造
app.post('/api/stop', (req, res) => {
  const bot = painter.getBot();
  if (bot) {
    try {
      bot.quit();
    } catch (e) {
      // 忽略
    }
  }
  building = false;
  io.emit('status', { state: 'stopped', message: '已停止' });
  res.json({ stopped: true });
});

// 查询当前状态
app.get('/api/status', (req, res) => {
  res.json({
    building,
    uploaded: uploadedSchematic ? { name: uploadedName, size: uploadedSchematic.length } : null,
    progress: painter.getProgressState()
  });
});

server.listen(PORT, () => {
  console.log('地图画搭建网页 UI 已启动:');
  console.log(`  本地访问: http://localhost:${PORT}`);
});