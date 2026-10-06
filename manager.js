/**
 * manager.js —— 机器人统一控制台（默认 http://localhost:8080）
 *
 * 功能：
 *   - 在网页上启动 / 停止 afkbot.js、killaurabot.js、smartbot.js（可单独控制，也可一键全部启停）
 *   - 进程意外退出（报错、掉线崩溃、被踢…）时自动重启，连续快速崩溃会指数退避（5s → 最多 60s）
 *   - afkbot.js 按"跑 30 分钟 → 停 3 分钟 → 再跑 30 分钟"循环
 *   - 网页实时显示每个程序的运行状态、PID、运行时长、重启次数，以及完整日志（带 ANSI 颜色）
 *   - 同时挂载地图画控制台（/painting），两个控制台共用一个端口
 *
 * 用法：
 *   npm run web              // 然后浏览器打开 http://localhost:8080
 */

const express = require('express')
const http = require('http')
const path = require('path')
const readline = require('readline')
const { spawn } = require('child_process')
const { Server } = require('socket.io')
const mountPaintingConsole = require('./painting-console')

const PORT = process.env.PORT || 8080
const ROOT = __dirname
const LOG_KEEP = 500              // 每个程序在内存里保留多少行日志
const RESTART_BASE_MS = 5000      // 崩溃后基础重启间隔
const RESTART_MAX_MS = 60000      // 退避上限
const FAST_CRASH_MS = 10000       // 运行不足这个时间算“快速崩溃”

/* ============================================================
 * 要管理的程序（想加/删程序改这里）
 * ============================================================ */
const PROGRAMS = [
  {
    id: 'afkbot',
    name: 'afkbot.js',
    caption: '挂机 / 迎宾（跑 30 分钟，停 3 分钟，循环）',
    autoRestart: true,
    schedule: { runMs: 30 * 60 * 1000, pauseMs: 3 * 60 * 1000 },
  },
  {
    id: 'killaurabot',
    name: 'killaurabot.js',
    caption: '下界杀疣猪',
    autoRestart: true,
  },
  {
    id: 'smartbot',
    name: 'smartbot.js',
    caption: '搬砖（收皮革 → 商店卖货）',
    autoRestart: true,
  },
]

/* ============================================================
 * 运行时状态
 * ============================================================ */
const states = new Map()

for (const program of PROGRAMS) {
  states.set(program.id, {
    status: 'stopped',      // stopped | running | restarting | paused
    enabled: false,         // 用户是否点了“启动”（enabled 时才会自动重启）
    proc: null,
    pid: null,
    startedAt: 0,
    restarts: 0,
    fastRestarts: 0,
    logs: [],
    runTimer: null,
    pauseTimer: null,
    restartTimer: null,
    nextPhaseAt: 0,
    killedByManager: false,
  })
}

const getProgram = (id) => PROGRAMS.find((p) => p.id === id)
const getState = (id) => states.get(id)

const app = express()
app.use(express.json())
const server = http.createServer(app)
const io = new Server(server, { serveClient: true })

/* ============================================================
 * 日志
 * ============================================================ */
function addLog(program, stream, line) {
  const state = getState(program.id)
  const entry = { time: Date.now(), stream, line }
  state.logs.push(entry)
  if (state.logs.length > LOG_KEEP) state.logs.splice(0, state.logs.length - LOG_KEEP)
  io.emit('log', { id: program.id, ...entry })
}

function clearTimers(state) {
  for (const key of ['runTimer', 'pauseTimer', 'restartTimer']) {
    if (state[key]) {
      clearTimeout(state[key])
      state[key] = null
    }
  }
}

/* ============================================================
 * 状态广播
 * ============================================================ */
function snapshot() {
  return PROGRAMS.map((program) => {
    const state = getState(program.id)
    return {
      id: program.id,
      name: program.name,
      caption: program.caption,
      status: state.status,
      enabled: state.enabled,
      pid: state.pid,
      restarts: state.restarts,
      uptimeMs: state.status === 'running' && state.startedAt ? Date.now() - state.startedAt : 0,
      nextPhaseAt: state.nextPhaseAt || 0,
      schedule: program.schedule
        ? { runMinutes: program.schedule.runMs / 60000, pauseMinutes: program.schedule.pauseMs / 60000 }
        : null,
    }
  })
}

function broadcastState() {
  io.emit('state', snapshot())
}

/* ============================================================
 * 进程管理
 * ============================================================ */
function startProgram(id, reason = 'user') {
  const program = getProgram(id)
  if (!program) return
  const state = getState(id)
  if (state.proc) return

  state.status = 'running'
  state.startedAt = Date.now()
  state.killedByManager = false

  const child = spawn(process.execPath, [path.join(ROOT, program.name)], {
    cwd: ROOT,
    env: process.env,
  })
  state.proc = child
  state.pid = child.pid

  addLog(program, 'sys', `[管理器] 启动 ${program.name}（pid ${child.pid}${reason === 'schedule' ? '，定时重启' : ''}）`)

  readline.createInterface({ input: child.stdout }).on('line', (line) => addLog(program, 'out', line))
  readline.createInterface({ input: child.stderr }).on('line', (line) => addLog(program, 'err', line))

  child.on('error', (err) => addLog(program, 'sys', `[管理器] 启动失败: ${err.message}`))
  child.on('exit', (code, signal) => handleExit(program, code, signal))

  // 定时休眠：跑够 runMs 后停一会再自动拉起
  if (program.schedule) {
    if (state.runTimer) clearTimeout(state.runTimer)
    state.nextPhaseAt = Date.now() + program.schedule.runMs
    state.runTimer = setTimeout(() => {
      state.runTimer = null
      addLog(program, 'sys', `[管理器] 已运行 ${program.schedule.runMs / 60000} 分钟，按计划停止 ${program.schedule.pauseMs / 60000} 分钟`)
      stopProcess(program, 'paused')
      state.pauseTimer = setTimeout(() => {
        state.pauseTimer = null
        if (!state.enabled) return
        addLog(program, 'sys', '[管理器] 休息结束，重新启动')
        startProgram(program.id, 'schedule')
      }, program.schedule.pauseMs)
    }, program.schedule.runMs)
  }

  broadcastState()
}

function stopProcess(program, nextStatus = 'stopped') {
  const state = getState(program.id)
  clearTimers(state)
  state.nextPhaseAt = 0

  if (!state.proc) {
    state.status = nextStatus
    state.pid = null
    broadcastState()
    return
  }

  state.killedByManager = true
  state.status = nextStatus
  addLog(program, 'sys', `[管理器] 停止 ${program.name}（pid ${state.pid}）`)
  try {
    state.proc.kill()
  } catch (err) {
    addLog(program, 'sys', `[管理器] 结束进程失败: ${err.message}`)
  }
  broadcastState()
}

function handleExit(program, code, signal) {
  const state = getState(program.id)
  const ranMs = state.startedAt ? Date.now() - state.startedAt : 0
  state.proc = null
  state.pid = null
  state.startedAt = 0

  const killedByManager = state.killedByManager
  state.killedByManager = false

  addLog(program, 'sys', `[管理器] 进程退出（code=${code}${signal ? '，signal=' + signal : ''}，运行 ${Math.round(ranMs / 1000)} 秒）`)

  if (!killedByManager && state.enabled && program.autoRestart) {
    // 意外退出 -> 自动重启（连续快速崩溃时退避）
    if (ranMs > 0 && ranMs < FAST_CRASH_MS) state.fastRestarts += 1
    else state.fastRestarts = 0
    const delay = Math.min(RESTART_BASE_MS * Math.pow(2, Math.max(0, state.fastRestarts - 1)), RESTART_MAX_MS)
    state.status = 'restarting'
    addLog(program, 'sys', `[管理器] ${Math.round(delay / 1000)} 秒后自动重启（累计重启 ${state.restarts + 1} 次）`)
    state.restartTimer = setTimeout(() => {
      state.restartTimer = null
      if (!state.enabled) return
      state.restarts += 1
      startProgram(program.id, 'restart')
    }, delay)
  } else if (state.status !== 'paused') {
    state.status = state.enabled ? 'stopped' : 'stopped'
  }

  broadcastState()
}

function enableProgram(id) {
  const program = getProgram(id)
  if (!program) return
  const state = getState(id)
  state.enabled = true
  state.fastRestarts = 0
  if (!state.proc && state.status !== 'restarting') startProgram(id, 'user')
  else broadcastState()
}

function disableProgram(id) {
  const program = getProgram(id)
  if (!program) return
  const state = getState(id)
  state.enabled = false
  stopProcess(program, 'stopped')
}

/* ============================================================
 * HTTP 接口
 * ============================================================ */
app.get('/api/state', (req, res) => res.json(snapshot()))

// 查看某个程序最近的日志（网页走 socket 实时推送，这里方便排查/外部调用）
app.get('/api/logs/:id', (req, res) => {
  const program = getProgram(req.params.id)
  if (!program) return res.status(404).json({ error: '没有这个程序' })
  const limit = Math.min(Number(req.query.limit) || 200, LOG_KEEP)
  res.json({ id: program.id, logs: getState(program.id).logs.slice(-limit) })
})

app.post('/api/start/:id', (req, res) => {
  if (!getProgram(req.params.id)) return res.status(404).json({ error: '没有这个程序' })
  enableProgram(req.params.id)
  res.json({ ok: true })
})

app.post('/api/stop/:id', (req, res) => {
  if (!getProgram(req.params.id)) return res.status(404).json({ error: '没有这个程序' })
  disableProgram(req.params.id)
  res.json({ ok: true })
})

// 往程序的 stdin 写一行：等同于在命令行里输入内容后回车，bot 会把它当聊天发出去
app.post('/api/input/:id', (req, res) => {
  const program = getProgram(req.params.id)
  if (!program) return res.status(404).json({ error: '没有这个程序' })

  const state = getState(program.id)
  const text = req.body && typeof req.body.text === 'string' ? req.body.text : ''
  if (!text.trim()) return res.status(400).json({ error: '内容不能为空' })
  if (!state.proc || !state.proc.stdin || state.proc.stdin.destroyed) {
    return res.status(409).json({ error: '程序未在运行' })
  }

  try {
    state.proc.stdin.write(text.replace(/[\r\n]+/g, ' ') + '\n')
    addLog(program, 'in', `> ${text}`)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/start-all', (req, res) => {
  for (const program of PROGRAMS) enableProgram(program.id)
  res.json({ ok: true })
})

app.post('/api/stop-all', (req, res) => {
  for (const program of PROGRAMS) disableProgram(program.id)
  res.json({ ok: true })
})

app.get('/', (req, res) => res.type('html').send(PAGE))

/* ============================================================
 * 网页
 * ============================================================ */
const PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>机器人进程管理器</title>
<style>
  :root {
    --bg:#0f1115; --panel:#181b22; --panel2:#1f232d; --border:#2a2f3a;
    --text:#e7eaf0; --muted:#8b93a3;
    --green:#22c55e; --blue:#4f8cff; --orange:#f59e0b; --red:#ef4444; --gray:#6b7280;
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
    font-family: system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif; }
  .wrap { max-width:1200px; margin:0 auto; padding:24px 20px 60px; }
  h1 { font-size:22px; margin:0 0 4px; }
  .sub { color:var(--muted); font-size:13px; margin-bottom:20px; }
  .actions { display:flex; gap:10px; margin-bottom:20px; }
  .btn { border:none; border-radius:8px; cursor:pointer; font-size:14px; font-weight:600;
    padding:9px 16px; color:#fff; background:var(--panel2); border:1px solid var(--border); }
  .btn.primary { background:var(--blue); border-color:var(--blue); }
  .btn.danger { background:var(--red); border-color:var(--red); }
  .btn.ok { background:var(--green); border-color:var(--green); }
  .btn:disabled { opacity:.45; cursor:not-allowed; }
  a.btn { text-decoration:none; display:inline-flex; align-items:center; }
  .grid { display:grid; grid-template-columns:1fr; gap:18px; }
  .card { background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:16px; }
  .card-head { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .name { font-size:16px; font-weight:700; }
  .caption { color:var(--muted); font-size:12px; }
  .badge { display:inline-flex; align-items:center; gap:6px; font-size:12px; padding:4px 10px;
    border-radius:999px; background:var(--panel2); border:1px solid var(--border); }
  .dot { width:8px; height:8px; border-radius:50%; background:var(--gray); }
  .dot.running { background:var(--green); animation:pulse 1.2s infinite; }
  .dot.restarting { background:var(--orange); animation:pulse 1.2s infinite; }
  .dot.paused { background:var(--blue); }
  .dot.stopped { background:var(--gray); }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
  .meta { display:flex; gap:14px; flex-wrap:wrap; color:var(--muted); font-size:12px; margin:10px 0 12px; }
  .meta b { color:var(--text); font-weight:600; }
  .log { background:#0a0c10; border:1px solid var(--border); border-radius:10px; padding:10px 12px;
    height:260px; overflow-y:auto; font-family: ui-monospace,Consolas,monospace; font-size:12px;
    line-height:1.5; white-space:pre-wrap; word-break:break-all; }
  .log .err { color:#ff9b9b; }
  .log .sys { color:#8b93a3; }
  .log .in { color:#8ab4ff; }
  .inputrow { display:flex; gap:8px; margin:0 0 10px; }
  .inputrow .cmd { flex:1; background:var(--panel2); border:1px solid var(--border); border-radius:8px;
    color:var(--text); padding:8px 12px; font-size:13px; outline:none; font-family:inherit; }
  .inputrow .cmd:focus { border-color:var(--blue); }
  .inputrow .cmd:disabled { opacity:.5; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>机器人进程管理器</h1>
    <div class="sub">localhost:${PORT} · 自动重启 · afkbot 跑 30 分钟停 3 分钟 · 地图画控制台在 /painting</div>
    <div class="actions">
      <button class="btn ok" id="startAll">全部启动</button>
      <button class="btn danger" id="stopAll">全部停止</button>
      <a class="btn primary" href="/painting">地图画控制台 →</a>
    </div>
    <div class="grid" id="cards"></div>
  </div>

<script src="/socket.io/socket.io.js"></script>
<script>
  const socket = io();
  const cards = {};
  const cmdHistory = {};
  const colors = {30:'#000',31:'#e06c75',32:'#98c379',33:'#e5c07b',34:'#61afef',35:'#c678dd',36:'#56b6c2',37:'#dcdfe4',
                  90:'#5c6370',91:'#e06c75',92:'#98c379',93:'#e5c07b',94:'#61afef',95:'#c678dd',96:'#56b6c2',97:'#ffffff'};

  function esc(s){ return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

  // 把 ANSI 颜色转成 HTML，日志就能像终端一样带颜色
  function ansiToHtml(text){
    let html = '';
    const st = { fg:null, bg:null, bold:false, italic:false, underline:false };
    const apply = (c) => {
      if (c === 0) { st.fg=null; st.bg=null; st.bold=false; st.italic=false; st.underline=false; }
      else if (c === 1) st.bold = true;
      else if (c === 3) st.italic = true;
      else if (c === 4) st.underline = true;
      else if (c === 22) st.bold = false;
      else if (c === 23) st.italic = false;
      else if (c === 24) st.underline = false;
      else if (c >= 30 && c <= 37) st.fg = colors[c];
      else if (c >= 90 && c <= 97) st.fg = colors[c];
      else if (c === 39) st.fg = null;
      else if (c >= 40 && c <= 47) st.bg = colors[c - 10];
      else if (c === 49) st.bg = null;
    };
    const push = (t) => {
      t = t.replace(/\\x1b\\[[0-9;?]*[A-Za-z]/g, '');
      if (!t) return;
      const styles = [];
      if (st.fg) styles.push('color:' + st.fg);
      if (st.bg) styles.push('background:' + st.bg);
      if (st.bold) styles.push('font-weight:600');
      if (st.italic) styles.push('font-style:italic');
      if (st.underline) styles.push('text-decoration:underline');
      const safe = esc(t);
      html += styles.length ? '<span style="' + styles.join(';') + '">' + safe + '</span>' : safe;
    };
    const re = /\\x1b\\[([0-9;]*)m/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      push(text.slice(last, m.index));
      for (const c of (m[1] ? m[1].split(';').map(Number) : [0])) apply(c);
      last = re.lastIndex;
    }
    push(text.slice(last));
    return html;
  }

  function fmtTime(ms){
    if (!ms) return '--';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h) return h + 'h ' + m + 'm ' + sec + 's';
    if (m) return m + 'm ' + sec + 's';
    return sec + 's';
  }

  function makeCard(p){
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML =
      '<div class="card-head">' +
        '<span class="name">' + p.name + '</span>' +
        '<span class="caption">' + (p.caption || '') + '</span>' +
        '<span class="badge"><span class="dot" id="dot-' + p.id + '"></span><span id="status-' + p.id + '">已停止</span></span>' +
        '<span style="flex:1"></span>' +
        '<button class="btn ok" id="start-' + p.id + '">启动</button>' +
        '<button class="btn danger" id="stop-' + p.id + '">停止</button>' +
      '</div>' +
      '<div class="meta">' +
        '<span>PID: <b id="pid-' + p.id + '">-</b></span>' +
        '<span>运行时长: <b id="up-' + p.id + '">-</b></span>' +
        '<span>重启次数: <b id="rs-' + p.id + '">0</b></span>' +
        '<span id="phase-' + p.id + '"></span>' +
      '</div>' +
      '<div class="inputrow">' +
        '<input class="cmd" id="cmd-' + p.id + '" placeholder="输入要发送的内容，回车发送（等同于在命令行输入，会作为聊天发出）" />' +
        '<button class="btn" id="send-' + p.id + '">发送</button>' +
      '</div>' +
      '<div class="log" id="log-' + p.id + '"></div>';
    document.getElementById('cards').appendChild(el);
    document.getElementById('start-' + p.id).onclick = () => fetch('/api/start/' + p.id, { method:'POST' });
    document.getElementById('stop-' + p.id).onclick = () => fetch('/api/stop/' + p.id, { method:'POST' });

    // 输入框：回车发送，↑/↓ 翻历史
    const input = document.getElementById('cmd-' + p.id);
    const history = (cmdHistory[p.id] = []);
    let histIndex = 0;
    const send = () => {
      const text = input.value.trim();
      if (!text) return;
      history.push(text);
      if (history.length > 50) history.shift();
      histIndex = history.length;
      input.value = '';
      fetch('/api/input/' + p.id, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      })
        .then((r) => r.json())
        .then((d) => { if (d && d.error) console.log('发送失败:', d.error); })
        .catch((err) => console.log('发送失败:', err));
    };
    document.getElementById('send-' + p.id).onclick = send;
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        send();
      } else if (ev.key === 'ArrowUp') {
        if (histIndex > 0) { histIndex -= 1; input.value = history[histIndex] || ''; }
        ev.preventDefault();
      } else if (ev.key === 'ArrowDown') {
        if (histIndex < history.length - 1) { histIndex += 1; input.value = history[histIndex] || ''; }
        else { histIndex = history.length; input.value = ''; }
        ev.preventDefault();
      }
    });
    return el;
  }

  const statusText = { running:'运行中', stopped:'已停止', restarting:'重启中', paused:'暂停中' };

  function render(list){
    for (const p of list) {
      if (!cards[p.id]) { makeCard(p); cards[p.id] = true; }
      document.getElementById('dot-' + p.id).className = 'dot ' + p.status;
      document.getElementById('status-' + p.id).textContent = statusText[p.status] || p.status;
      document.getElementById('pid-' + p.id).textContent = p.pid || '-';
      document.getElementById('up-' + p.id).textContent = fmtTime(p.uptimeMs);
      document.getElementById('rs-' + p.id).textContent = p.restarts;
      document.getElementById('start-' + p.id).disabled = (p.status === 'running' || p.status === 'restarting');
      document.getElementById('stop-' + p.id).disabled = (p.status === 'stopped');
      const canSend = (p.status === 'running');
      document.getElementById('cmd-' + p.id).disabled = !canSend;
      document.getElementById('send-' + p.id).disabled = !canSend;
      let phase = '';
      if (p.nextPhaseAt) {
        const left = Math.max(0, p.nextPhaseAt - Date.now());
        phase = p.status === 'paused'
          ? '休息中，' + fmtTime(left) + '后重启'
          : '本轮剩余 ' + fmtTime(left);
      } else if (p.schedule) {
        phase = '计划: 跑 ' + p.schedule.runMinutes + ' 分钟 / 停 ' + p.schedule.pauseMinutes + ' 分钟';
      }
      document.getElementById('phase-' + p.id).textContent = phase;
    }
  }

  function appendLog(id, entry){
    const box = document.getElementById('log-' + id);
    if (!box) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    const time = new Date(entry.time).toLocaleTimeString();
    const div = document.createElement('div');
    if (entry.stream === 'err') div.className = 'err';
    if (entry.stream === 'sys') div.className = 'sys';
    if (entry.stream === 'in') div.className = 'in';
    div.innerHTML = '[' + time + '] ' + ansiToHtml(entry.line);
    box.appendChild(div);
    while (box.childNodes.length > 600) box.removeChild(box.firstChild);
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }

  socket.on('state', render);
  socket.on('log', (data) => appendLog(data.id, data));
  socket.on('logs', (data) => { for (const entry of data) appendLog(data.id, entry); });
  socket.on('history', (data) => {
    for (const [id, entries] of Object.entries(data)) for (const e of entries) appendLog(id, e);
  });

  document.getElementById('startAll').onclick = () => fetch('/api/start-all', { method:'POST' });
  document.getElementById('stopAll').onclick = () => fetch('/api/stop-all', { method:'POST' });

  setInterval(() => fetch('/api/state').then(r => r.json()).then(render).catch(() => {}), 3000);
</script>
</body>
</html>`

/* ============================================================
 * Socket 连接
 * ============================================================ */
io.on('connection', (socket) => {
  socket.emit('state', snapshot())
  const history = {}
  for (const program of PROGRAMS) history[program.id] = getState(program.id).logs
  socket.emit('history', history)
})

/* ============================================================
 * 启动
 * ============================================================ */
// 挂载地图画控制台（同一个端口，页面在 /painting）
mountPaintingConsole(app, io, { pagePath: '/painting' })

// 端口被占用时给出清晰提示（例如开机自启已经启动了一个，又手动启动一次）
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用：可能控制台已经在运行，直接打开 http://localhost:${PORT} 即可；`)
    console.error('确实要重启的话，先运行 service\\uninstall-service.bat 停止，或结束占用该端口的进程。')
  } else {
    console.error('服务器启动失败:', err.message)
  }
  process.exit(1)
})

server.listen(PORT, () => {
  console.log(`[${new Date().toLocaleString()}] 机器人统一控制台已启动`)
  console.log(`  浏览器打开: http://localhost:${PORT}`)
  console.log(`  地图画控制台: http://localhost:${PORT}/painting`)
  console.log(`  管理的程序: ${PROGRAMS.map((p) => p.name).join(', ')}`)
})
