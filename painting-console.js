'use strict';

/**
 * 地图画网页控制台（可挂载模块）
 *
 * 由 manager.js 挂载到同一个 express / socket.io 服务器上，所以两个控制台
 * 共用一个端口：
 *   - 页面：/painting
 *   - 接口：/api/upload、/api/start、/api/stop、/api/status（地图画专用）
 *   - socket 事件：progress / status / map / cell / bots
 *
 * 端口、静态资源、JSON 解析等由调用方（manager.js）统一负责。
 */

const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const express = require('express');
const { execFile } = require('child_process');
const painter = require('./painting');

// Lite2Edit.jar 路径，仅在 .litematic 无法直接解析时作为兜底转换
const LITE2EDIT_JAR = path.join(__dirname, 'Lite2Edit.jar');

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

/**
 * 把地图画控制台挂到已有的 express app / socket.io 上。
 * @param {import('express').Express} app
 * @param {import('socket.io').Server} io
 * @param {{ pagePath?: string }} [options]
 */
function mountPaintingConsole(app, io, options = {}) {
  const pagePath = options.pagePath || '/painting';

  let uploadedSchematic = null;   // 内存中保存的上传投影（Buffer）
  let uploadedName = '';
  let building = false;
  let session = null;             // 当前（或最近一次）建造会话

  /* ---------- 页面 ---------- */
  app.get(pagePath, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  /* ---------- 投影上传 ---------- */
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

  /* ---------- 开始 / 停止 / 状态 ---------- */
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

  /* ---------- 新连接补齐实时状态 ---------- */
  io.on('connection', (socket) => {
    if (!session) return;
    const map = session.getMapState();
    if (map) socket.emit('map', map);
    socket.emit('bots', session.getBotStates());
    socket.emit('progress', session.getProgressState());
  });
}

module.exports = mountPaintingConsole;
