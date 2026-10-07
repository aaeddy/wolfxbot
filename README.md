# WolfxBot —— Minecraft 机器人合集 + 统一网页控制台

基于 [Mineflayer](https://github.com/PrismarineJS/mineflayer) 的 Minecraft 机器人项目，包含地图画搭建、挂机迎宾、搬砖、杀怪等机器人，
以及一个**统一网页控制台**（`manager.js`）在浏览器里管理它们的启停与日志。

| 页面 | 地址 | 说明 |
| --- | --- | --- |
| 机器人进程管理器 | <http://localhost:8080/> | 启停/自动重启 afkbot、killaurabot、smartbot，实时日志，给机器人的 stdin 发指令 |
| 地图画控制台 | <http://localhost:8080/painting> | 上传投影、双账号搭建地图画、实时俯视建造图 |

两个页面共用一个端口（默认 8080），页面上有互相跳转的入口。

---

## 1. 环境要求

| 项目 | 要求 |
| --- | --- |
| Node.js | 建议 18 及以上（当前开发环境为 Node 26） |
| Java | 可选。只有 `.litematic` 无法直接解析、需要退回 Lite2Edit 转换时才用得到 |
| Minecraft 账号 | 各机器人使用的账号（正版 `microsoft` 或离线 `offline`），首次微软登录需要完成一次验证 |
| 服务器权限 | 地图画机器人需要创造飞行、开箱、放置权限；其它机器人按各自功能需要传送/领地权限 |

---

## 2. 安装

```bash
npm install
```

---

## 3. 启动

```bash
npm run web
```

`npm run web` 实际执行的是 `package.json` 里 `scripts.web` 指定的 `node manager.js`。
启动成功后终端会输出：

```text
机器人进程管理器已启动
  浏览器打开: http://localhost:8080
  地图画控制台: http://localhost:8080/painting
  管理的程序: afkbot.js, killaurabot.js, smartbot.js
```

改端口（默认 8080）：

```powershell
# PowerShell
$env:PORT = 8090
npm run web
```

```bash
# CMD / bash
set PORT=8090 && npm run web
```

> 说明：旧的 `npm start`（单机器人命令行入口）已经删除，统一用 `npm run web` 启动。

---

## 4. 开机自动启动（Windows）

`service/` 目录里提供了开机自启脚本，**不需要管理员权限**：

| 文件 | 作用 |
| --- | --- |
| `service/install-service.bat` | 安装开机自启（优先创建计划任务，失败会自动放进"启动"文件夹），并立即启动一次 |
| `service/uninstall-service.bat` | 删除开机自启，并停掉 8080 端口上的控制台 |
| `service/status.bat` | 查看自启项状态和 8080 端口占用 |
| `service/run-manager.bat` | 手动启动（有窗口，方便看日志）；`service/run-manager-hidden.vbs` 是无窗口版本 |

安装完成后，每次登录 Windows 都会在后台隐藏启动统一控制台，浏览器打开 <http://localhost:8080> 即可看到；
后台日志写在 `logs/manager.log`（超过 5MB 自动转存为 `manager.log.old`）。

如果希望做成"开机即启、不依赖登录"的真正 Windows 服务，需要管理员权限 + [NSSM](https://nssm.cc/)，例如（管理员 CMD）：

```bat
nssm install WolfxBotManager "C:\Program Files\nodejs\node.exe" "C:\Users\abc18\Desktop\wolfxbot\manager.js"
nssm set WolfxBotManager AppDirectory C:\Users\abc18\Desktop\wolfxbot
nssm set WolfxBotManager AppStdout C:\Users\abc18\Desktop\wolfxbot\logs\manager.log
nssm set WolfxBotManager AppStderr C:\Users\abc18\Desktop\wolfxbot\logs\manager.log
nssm set WolfxBotManager Start SERVICE_AUTO_START
nssm start WolfxBotManager
```

> 注意：微软登录令牌是**按 Windows 用户**缓存的，所以服务要以你自己的账号运行（NSSM 里配置登录凭据），
> 不要用 `SYSTEM`，否则每个机器人都会要求重新登录。

---

## 5. 机器人进程管理器（`/`）

由 `manager.js` 提供，管理 `PROGRAMS` 列表里的程序（想加/删程序改 `manager.js` 顶部的数组）：

| 程序 | 说明 | 特性 |
| --- | --- | --- |
| `afkbot.js` | 挂机 / 迎宾 | 定时作息：跑 30 分钟 → 停 3 分钟 → 循环 |
| `killaurabot.js` | 自动砍怪 | 意外退出自动重启 |
| `smartbot.js` | 搬砖（收皮革 → 商店卖货） | 意外退出自动重启 |

功能：

- 单个启动/停止、一键全部启动/全部停止；
- 进程意外退出（报错、掉线崩溃、被踢）自动重启，连续快速崩溃按 5s → 10s → … → 60s 指数退避；
- `afkbot.js` 按"跑 30 分钟 → 停 3 分钟"循环，网页显示本轮剩余/休息剩余时间；
- 实时显示状态、PID、运行时长、重启次数；日志带 ANSI 颜色完整展示；
- 网页输入框可给程序 stdin 发内容（等同于在命令行里输入，机器人会当作聊天发出）。

HTTP 接口（方便脚本调用）：`/api/state`、`/api/logs/:id`、`/api/start/:id`、`/api/stop/:id`、`/api/input/:id`、`/api/start-all`、`/api/stop-all`。

---

## 6. 地图画控制台（`/painting`）

双机器人并行搭建地图画：上传投影 → 两个账号各领任务 → 实时看俯视建造图。

### 使用步骤

1. **填写服务器连接信息**：地址/端口/版本/认证方式（默认 `wolfx.jp:25565`、`1.20.4`、`microsoft`），填两个**不同**的机器人账号；
   两个账号会**间隔 5 秒依次连接**（页面可调），避免服务器提示"连接速度过快"。
2. **上传投影文件**：支持 `.schem` 和 `.litematic`；`.litematic` 优先直接解析（不经过 Lite2Edit，避免部分转换把数据解错位），
   上传时就会校验格式，解析不了才回退 Lite2Edit（需要 Java）。上限 200MB。
3. **设置搭建坐标**：起始 X/Y/Z = 投影原点 `(0,0,0)` 对应的实际世界坐标；每往上叠一层把 Y +1，X/Z 不变。
4. **开始建造**：放置模式默认"极速"（同一 tick 连发，适合无反作弊的服务器）；被踢或卡顿时改"稳定"（逐块等确认）；
   "每个机器人连续放置数"默认 4。随时可点"停止"。

### 界面

- 状态徽章 + 两个机器人状态条（搭建光边 / 颜色 xxx / 等待补货 / 未到达材料箱…）；
- 进度条与统计：方块进度、已用时间、预计剩余、当前区域、当前方块；
- **实时俯视建造图**：暗色 = 待建预览，彩色 = 已建，鼠标悬停查看坐标/方块/状态；
- 运行日志与提示。

### 建造原理

1. 解析投影，统计每种颜色的总数量；
2. 两个账号间隔若干秒进服，进服后保持正常落地；
3. **先建光边**（默认 `smooth_stone`）：两个机器人合力整条造完，只取光边的材料；
   光边时站在**光边方块正上方一格**（X/Z 不变）从上往下放，并额外放慢（`edgePlaceDelayMs`）保证稳；
4. **再按颜色施工**：一种颜色一次取料、连续放完再换下一种；颜色内部按行蛇形排序；数量超过 `colorBatchSize`（默认 1600）自动分批；
5. **取材料**：先开基准箱子（y），不够就找同一 x/z 的 `y+1 … y+4`；全都缺货就**原地等补货**（每 `restockWaitMs` 检查一次，补足自动继续）；
   在材料区（`chestReach`，默认 32 格）内直接分段瞬移过去开箱；够不到箱子会自动 `/res tp hpdth` 重试，不会误判成"没库存"；
6. **回平台**：取完材料 `/res tp hpdth.dth` 回搭建平台；如果和**网页输入的起始搭建坐标**差超过 `platformTpMaxDistance`（默认 32 格），
   说明传送失败，会自动重发传送指令，最多 `platformTpRetries`（默认 3）次；
7. **放置**：每一格先检查是否在方块旁边（眼睛到参考方块中心 ≤ `placeReach`），不在就移动过去；
   - 地图画（非光边）：站到目标方块 **z-1** 那一格（本层已建好的地毯 / 下一层地毯）落地站稳；
   - 移动用**分段瞬移**：服务器限制 X/Z 每次最多 32 格、Y 每次最多 9 格，程序先分段调 Y 到"比方块高一格"的安全高度，
     再分段移动 X/Z，段与段之间留 `teleportStepDelayMs`（默认 10ms）；
   - 从背包拿材料会**先把整组搬进空的快捷栏格**（尽量填满 9 格），搬完等 `takeItemDelayMs`（默认 50ms）；
     之后换这一种颜色**只切快捷栏栏位（不等待）**；
8. 每个任务放完后检查实际结果，没放上的交给收尾补建；漏放率偏高自动放慢爆发间隔，几乎不漏自动加快；
   某个机器人掉线时它的任务回到队列由另一个接手，结束前还会做一轮收尾补建。

### 可调参数（`painting.js` 顶部 `SETTINGS`）

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `host` / `port` / `version` / `auth` | `wolfx.jp` / `25565` / `1.20.4` / `microsoft` | 连接默认值，网页填写会覆盖 |
| `spawnTimeoutMs` | 5 分钟 | **仅**限连接+登录+准备，不影响建造时长 |
| `connectIntervalMs` | 5000 | 两个账号的连接间隔（毫秒），"连接速度过快"时调大（页面可改） |
| `placeConcurrency` | 4 | 每个机器人一次连续放置的方块数（网页可调 1~4） |
| `fastPlace` | true | 极速模式开关；false = 稳定模式（逐块等确认） |
| `burstSize` / `burstIntervalMs` | 32 / 50 | 极速模式每批包数与批间隔（自适应会在此基础上调整） |
| `adaptiveBurst` | true | 按每个任务的漏放率自动增减爆发间隔 |
| `standOnGround` | true | 地图画站在 z-1 落地放置；false = 悬空 |
| `standWaitMs` | 120 | 站好位置后等位置同步的时间（毫秒） |
| `placeReach` | 4 | 放置距离上限（眼睛到参考方块中心） |
| `takeItemDelayMs` | 50 | 从背包搬物品后的等待（毫秒）；切快捷栏不等待 |
| `teleportStepXZ` / `teleportStepY` / `teleportStepDelayMs` | 32 / 9 / 10 | 分段瞬移的每段上限与段间延迟 |
| `edgePlaceDelayMs` | 100 | 建造光边时每次瞬移/放置后的额外等待（毫秒） |
| `retryDelayMs` / `placeRetries` | 120 / 3 | 放置失败后的重试间隔与次数 |
| `jobRetryDelayMs` | 500 | 任务处理失败后重新领取的延迟（毫秒） |
| `chestStackDepth` | 4 | 箱子没货时往上找 `y+1 … y+4`（只变 Y） |
| `chestReach` | 32 | 与材料箱的距离在这个范围内算"已到材料区"，直接分段瞬移过去开箱 |
| `restockWaitMs` | 15000 | 箱子都缺货时，原地等补货的检查间隔（毫秒） |
| `platformTpMaxDistance` / `platformTpRetries` | 32 / 3 | 回搭建平台传送失败的判定距离与重试次数 |
| `storageTp` / `platformTp` | `/res tp hpdth` / `/res tp hpdth.dth` | 材料仓与搭建平台的传送指令 |
| `materialChests` | 见文件 | 各颜色材料箱坐标、食物箱（`food: true`） |
| `regionSize` | 32 | 光边任务的区块尺寸 |
| `colorBatchSize` | 1600 | 每种颜色每批最多处理多少格（背包 36 格上限约 2304） |
| `foodItem` / `foodReserve` / `foodThreshold` | `cooked_cod` / 64 / 15 | 食物种类、携带数量、低于多少饥饿值自动进食 |
| `verbose` | false | true 时打印每个方块的详细日志 |

### 材料仓摆放要求

- 每种颜色一个容器（木桶或箱子均可），容器内的方块名要和 `color` 一致（如 `white_carpet`）；
- 箱子没货时会往上找同一 x/z 的 `y+1 … y+4`，所以补货可以叠成"从下往上"补；
- 食物箱里放 `cooked_cod`，机器人不足时会自动补到 64 个；
- 机器人在材料区 32 格内能自动走过去开箱，容器必须允许机器人打开。

---

## 7. 各个机器人脚本

### `afkbot.js` —— 挂机 / 迎宾

- 连接 `wolfx.jp`，账号 `afkbot`（1.20.1 / microsoft），进服后 `/res tp dyyz` 到领地，并把抗击退调满；
- **定时发言**：广告（60 分钟）、签到提示（1000 分钟）、`/pm`（3 分钟）。时间戳写入 `afk_timers.json`，
  管理器每 30 分钟重启一次也不会漏发（到点补发一次）；
- **玩家进出播报**：识别 `whitelist.txt`（VIP 名单）与内置 OP 名单，特殊玩家单独播报；
- **聊天指令**（需要白名单/OP）：`$ping` 查延迟、`$tps` 查服务器 TPS、`$bal` 查余额、`$重连`、
  `$viplist add/remove`、`$blacklist add/remove`、`$100w` 转账、`$tpaccept`、`$res tp <领地>`、
  `$go/$goTo <玩家>`（用 `Let_it_move` 飞过去）、`$refreshOnlinePlayers`、`$removeAllOnlinePlayers`、
  `$removeTabData`，还会唱歌（`$只因你太美`、`$only my railgun`）；
- 收到 `从 XXX 收到了$300,000。` 会自动把对方加入 VIP 名单并回复；
- 数据文件：`afk_timers.json`（定时发言）、`onlinePlayers.txt`（在线名单）、`whitelist.txt`、`blacklist.txt`、`tab.json`、`check_in_data.json`；
- 每 100ms 转头看向最近玩家（防挂机判定），掉线 5 秒自动重连，未处理的异步错误只记录不退出。

### `smartbot.js` —— 搬砖

连上服务器后循环执行：

1. `/res tp best` 回农场，直接瞬移到第一个点位；
2. 从 `(-47002, 256, 21270)` 开始翻箱子收皮革，同一个点位先拿底层箱子、拿不满往上找（最多 `y+5`），
   还不满就按 `chestStepX`（默认 -1）换下一个点位（x 最远到 -47031）；
3. 背包塞满后 `/warp shop`，瞬移到商店站位，左键点一下商店箱子（只点击不挖掉），发 `/qs amount all` 卖货；
4. 回到第 1 步继续。

坐标、传送点、节奏都在文件顶部 `CONFIG` 里改；保留皮革和装备，自动进食；打开箱子 5 秒超时跳过；掉线 5 秒重连。

### `killaurabot.js` —— 自动砍怪

- 两个账号（`killaurabot`、`killaurabot2`）**间隔 5 秒**依次登录（`CONFIG.loginIntervalMs`），
  避免服务器提示"连接速度过快"；登录后各自 `/res tp best.mmo` 站到自己的位置
  （`-46993, 242, 21272` 和 `21274`）；
- 每 780ms 找 10 格内最近的 5 只疣猪，挑"周围同类最多"的目标（配合横扫之刃一次打一片），两个账号交替出手
  （单账号冷却 640ms，交替后大约每 320ms 出一刀）；
- 被服务器拉走会自己站回原位；掉线 5 秒自动重连；自动进食；
- 在终端/管理页输入的内容会**同时发给两个账号**（例如 `/res tp xxx`）。

### `inventorybot.js` —— 查看背包

```bash
node inventorybot.js          # 用文件里的默认账号
node inventorybot.js afkbot   # 指定账号登录
```

进服后打印一次背包（主背包 + 装备 + 副手），背包变化时自动重新打印；终端输入 `inv` / `i` / `背包` 手动刷新，
其它内容会当作聊天发出；掉线 5 秒重连。

### `kkkkkkk001.js` / `kkkkkkk01.js` —— 早期挂机脚本

项目早期的实验脚本（硬编码账号登录 + `Let_it_move` 移动），保留作参考，功能已被 `afkbot.js` 取代。

### `Let_it_move.js` —— 移动库（混淆代码）

被 `afkbot.js`、`kkkkkkk*.js` 引用的移动/飞行库，代码经过混淆无法直接阅读，
对外接口是 `Let_it_move(bot)` 返回的对象（如 `relax_time`、`long_long`、`fly` 等）。**当作黑盒使用，不要改**。

### `start.js` —— 旧的多进程启动器

用 `child_process` 同时拉起 `smartbot`、`killaurabot`（可选 `aeddykillaurabot`）、`afkbot`，崩溃自动重启。
现在请用网页控制台 `npm run web` 代替。

---

## 10. 文件说明

| 文件/目录 | 说明 |
| --- | --- |
| `manager.js` | 统一入口：进程管理器 + 挂载地图画控制台（端口 8080） |
| `painting.js` | 地图画核心：投影解析、双机器人协调、分段瞬移、放置与查漏 |
| `painting-console.js` | 地图画控制台后端（上传/启动/停止/实时推送），挂在 `/painting` |
| `public/index.html` | 地图画控制台页面（进度、俯视建造图、机器人状态、日志） |
| `afkbot.js` | 挂机/迎宾机器人（定时发言、播报、聊天指令） |
| `smartbot.js` | 搬砖机器人（收皮革 → 商店卖货循环） |
| `killaurabot.js` | 双账号下界砍疣猪 |
| `aeddykillaurabot.js` | 单账号杀怪（作者自用） |
| `inventorybot.js` | 查看指定账号背包 |
| `Let_it_move.js` | 混淆的移动/飞行库（黑盒使用） |
| `kkkkkkk001.js` / `kkkkkkk01.js` | 早期挂机脚本（保留作参考） |
| `start.js` | 旧的多进程启动器（已由网页控制台取代） |
| `service/` | Windows 开机自启脚本（安装/卸载/状态/启动） |
| `Lite2Edit.jar` | `.litematic` → `.schem` 转换工具（兜底用） |
| `logs/` | 开机自启方式运行时写出的控制台日志 |
| `afk_timers.json` | afkbot 定时发言时间戳 |
| `onlinePlayers.txt` / `whitelist.txt` / `blacklist.txt` / `tab.json` / `check_in_data.json` | afkbot 的在线名单、VIP 名单、黑名单等数据 |

---

## 免责声明

本项目部分代码由 AI 工具生成，仅供学习和参考。作者不对其完全准确性和潜在版权问题负责，
使用者请自行判断和审查；请遵守所连接服务器的规则，避免因自动化行为导致封禁。
