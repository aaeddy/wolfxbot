'use strict';

/**
 * 地图画搭建网页控制台
 *
 * 提供：
 *   - 投影文件上传（.schem / .litematic，后者用 Lite2Edit 自动转换）
 *   - 双机器人并行搭建的启动 / 停止 / 状态查询
 *   - 通过 Socket.IO 实时推送：进度、机器人状态、俯视建造图（每个已放置的格子）
 */

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const { execFile } = require('child_process');
const { Server } = require('socket.io');
const painter = require('./painting');

// Lite2Edit.jar 路径，用于把 .litematic 转换成 .schem
const LITE2EDIT_JAR = path.join(__dirname, 'Lite2Edit.jar');
const PORT = process.env.PORT || 8080;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { serveClient: true });

/* ============================================================
 * 运行状态
 * ============================================================ */

let uploadedSchematic = null;   // 内存中保存的上传投影（Buffer）
let uploadedName = '';
let building = false;
let session = null;             // 当前（或最近一次）建造会话

/* ============================================================
 * 工具函数
 * ============================================================ */

function runExec(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 10 * 1024 * 1024, ...options }, (err, stdout, stderr) => {
      if (err) {
        const message = (stderr || err.message || '').toString().trim() || err.message;
        reject(new Error(message));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

// 把 .litematic 文件转换成 .schem，返回转换后的 Buffer
async function convertLitematicToSchem(inputPath) {
  const dir = path.dirname(inputPath);
  const { stderr } = await runExec('java', ['-jar', LITE2EDIT_JAR, '--convert', inputPath], { cwd: dir });

  const base = path.basename(inputPath).replace(/\.litematic$/i, '');
  let outPath = path.join(dir, base + '.schem');

  if (!fs.existsSync(outPath)) {
    // 兜底：在目录中查找最新生成的 .schem 文件
    const files = await fsp.readdir(dir);
    const candidates = files
      .filter((name) => name.toLowerCase().endsWith('.schem'))
      .map((name) => path.join(dir, name))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (!candidates.length) {
      const detail = (stderr || '').toString().trim();
      throw new Error(detail || '转换完成但未找到生成的 .schem 文件');
    }
    outPath = candidates[0];
  }

  return fsp.readFile(outPath);
}

/* ============================================================
 * 接口：投影上传
 * ============================================================ */

app.use(express.static(path.join(__dirname, 'public')));

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
      // 优先由 painting.js 直接解析 litematic（部分 Lite2Edit 转换会解错数据）
      uploadedName = filename;
      try {
        await painter.loadSchematic(rawBuffer);
        console.log(`[upload] ${filename} 直接解析成功，跳过 Lite2Edit`);
      } catch (err) {
        console.log(`[upload] ${filename} 直接解析失败（${err.message}），改用 Lite2Edit 转换`);
        const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lite2edit-'));
        const inputPath = path.join(tmpDir, path.basename(filename));
        await fsp.writeFile(inputPath, rawBuffer);
        finalBuffer = await convertLitematicToSchem(inputPath);
        converted = true;
        uploadedName = filename.replace(/\.litematic$/i, '.schem');
      }
    } else if (ext === '.schem') {
      uploadedName = filename;
    } else {
      return res.status(400).json({ error: '仅支持 .schem 或 .litematic 文件' });
    }

    uploadedSchematic = finalBuffer;
    res.json({ name: uploadedName, size: uploadedSchematic.length, converted });
  } catch (err) {
    res.status(500).json({ error: '文件处理失败: ' + err.message });
  }
});

app.use(express.json());

/* ============================================================
 * 接口：开始 / 停止 / 状态
 * ============================================================ */

app.post('/api/start', (req, res) => {
  if (building) {
    return res.status(409).json({ error: '正在建造中，请先停止' });
  }
  if (!uploadedSchematic) {
    return res.status(400).json({ error: '请先上传投影文件' });
  }

  const cfg = req.body || {};
  const usernames = Array.isArray(cfg.usernames)
    ? cfg.usernames.map((name) => String(name || '').trim()).filter(Boolean)
    : [];
  if (usernames.length !== 2) {
    return res.status(400).json({ error: '需要提供两个机器人账号（usernames）' });
  }
  if (usernames[0] === usernames[1]) {
    return res.status(400).json({ error: '两个机器人账号不能相同' });
  }

  const startX = Number(cfg.startX);
  const startY = Number(cfg.startY);
  const startZ = Number(cfg.startZ);
  if ([startX, startY, startZ].some((value) => Number.isNaN(value))) {
    return res.status(400).json({ error: '搭建坐标不完整或不合法' });
  }

  // 每个机器人一次连续放置的方块数：1~4，默认 4
  const placeConcurrency = Math.min(4, Math.max(1, Number(cfg.placeConcurrency) || 4));
  // 放置模式：fast = 同一 tick 连发多个放置包（默认）；false = 逐块等待服务器确认
  const fastPlace = cfg.fastPlace !== false && cfg.fastPlace !== 'false';
  // 两个账号的连接间隔（毫秒），默认 5 秒，避免服务器提示"连接速度过快"踢人
  const connectIntervalMs = Number.isFinite(Number(cfg.connectIntervalMs)) && Number(cfg.connectIntervalMs) >= 0
    ? Math.min(60000, Number(cfg.connectIntervalMs))
    : 5000;

  const schematicBuffer = uploadedSchematic;
  building = true;

  session = painter.createBuild({
    usernames,
    schematic: schematicBuffer,
    startPos: { x: startX, y: startY, z: startZ },
    connection: {
      host: cfg.host,
      port: Number(cfg.port),
      version: cfg.version,
      auth: cfg.auth,
    },
    settings: { placeConcurrency, fastPlace, connectIntervalMs },
    callbacks: {
      onProgress: (progress) => io.emit('progress', progress),
      onStatus: (status) => {
        io.emit('status', status);
        if (['done', 'error', 'stopped'].includes(status.state)) building = false;
      },
      onMap: (map) => io.emit('map', map),
      onCell: (cell) => io.emit('cell', cell),
      onBots: (bots) => io.emit('bots', bots),
    },
  });

  session.start().catch((err) => {
    building = false;
    io.emit('status', { state: 'error', message: '启动失败: ' + err.message });
  });

  res.json({ started: true, usernames, placeConcurrency, fastPlace, connectIntervalMs });
});

app.post('/api/stop', (req, res) => {
  if (session) {
    session.stop();
  } else {
    io.emit('status', { state: 'stopped', message: '已停止' });
  }
  building = false;
  res.json({ stopped: true });
});

app.get('/api/status', (req, res) => {
  res.json({
    building,
    uploaded: uploadedSchematic ? { name: uploadedName, size: uploadedSchematic.length } : null,
    progress: session ? session.getProgressState() : null,
    bots: session ? session.getBotStates() : [],
  });
});

/* ============================================================
 * 实时推送
 * ============================================================ */

io.on('connection', (socket) => {
  if (!session) return;
  const map = session.getMapState();
  if (map) socket.emit('map', map);
  socket.emit('bots', session.getBotStates());
  socket.emit('progress', session.getProgressState());
});

server.listen(PORT, () => {
  console.log('地图画搭建网页 UI 已启动');
  console.log(`  本地访问: http://localhost:${PORT}`);
});
