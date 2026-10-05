'use strict';

/**
 * 地图画搭建模块（双机器人版）
 *
 * 职责：
 *   1. 解析 .schem / .litematic 转出的投影数据，生成"待放置方块"清单；
 *   2. 把清单按 X 轴一分为二，两个机器人账号并行搭建同一张地图画；
 *   3. 对外提供进度状态、俯视建造图和状态事件，供网页控制台使用。
 *
 * 文件结构：
 *   一、可调参数
 *   二、材料仓与地图配色
 *   三、通用工具
 *   四、投影解析（建造计划 / 分区 / 俯视视图）
 *   五、单机器人工作单元 BotWorker
 *   六、双机器人协调器 BuildCoordinator
 *   七、模块导出
 *
 * 对外接口（server.js 使用）：
 *   const { createBuild } = require('./painting');
 *   const session = createBuild({ usernames, schematic, startPos, connection, callbacks });
 *   session.start();              // 异步启动，失败会通过 onStatus 上报
 *   session.stop();               // 停止并断开两个机器人
 *   session.getProgressState();   // 进度（含两个机器人的状态）
 *   session.getMapState();        // 俯视建造图数据（base64 位图）
 *   session.getBotStates();       // 两个机器人的状态列表
 */

const path = require('path');
const mineflayer = require('mineflayer');
const fs = require('fs').promises;
const { Schematic } = require('prismarine-schematic');
const nbt = require('prismarine-nbt');
const { Vec3 } = require('vec3');
const notifier = require('node-notifier');

/* ============================================================
 * 一、可调参数
 * ============================================================ */

const SETTINGS = {
  // ---- 连接默认值（网页端传入的值会覆盖这里）----
  host: 'wolfx.jp',
  port: 25565,
  version: '1.20.4',
  auth: 'microsoft',
  spawnTimeoutMs: 5 * 60 * 1000,
  // 两个账号的连接间隔（毫秒）：部分服务器限制连接速度，太快会被踢
  connectIntervalMs: 5000,

  // ---- 放置节奏：防踢关键参数 ----
  // 每个机器人一次连续放置的方块数量（同一种材料、且在放置距离内）
  placeConcurrency: 4,
  // 每个机器人两批放置之间的固定间隔（毫秒），越小越快、发包越密
  placeIntervalMs: 30,
  // 从背包拿物品（搬进快捷栏 / 换到手上）后的等待时间（毫秒）
  takeItemDelayMs: 50,
  // 放置失败后的重试间隔与最大次数
  retryDelayMs: 120,
  placeRetries: 3,

  // ---- 极速模式（服务器无反作弊时使用）----
  // true = 不逐块等待服务器确认，在同一个 tick 里连续发出多个放置包
  fastPlace: true,
  // 每个爆发批次最多发多少个放置包，然后让出一次事件循环
  burstSize: 32,
  // 两个爆发批次之间的间隔（毫秒），同时也是自适应调节的起始值
  burstIntervalMs: 50,
  // 手持那一叠材料用完后，等服务器同步背包再补一叠的等待时间
  refillWaitMs: 150,
  // 极速放置后，最多等多久确认方块是否真的放上
  verifyTimeoutMs: 3000,
  // 根据每个区块的漏放率自动增减爆发间隔（尽量快，又不把服务器打爆）
  adaptiveBurst: true,

  // ---- 移动 / 传送 ----
  teleportWaitMs: 5000,
  jumpWaitMs: 400,
  // 服务器的瞬移限制：X/Z 每次最多 32 格、Y 每次最多 9 格，超出要分段，段间留 10ms
  teleportStepXZ: 32,
  teleportStepY: 9,
  teleportStepDelayMs: 10,
  // 任务处理失败后重新领取的延迟（毫秒）
  jobRetryDelayMs: 500,

  // ---- 食物 ----
  foodItem: 'cooked_cod',
  foodReserve: 64,
  foodThreshold: 15,

  // ---- 材料仓取货 ----
  // 当前箱子没货时，往上找同一 x/z 的 y+1 ... y+4 箱子（补货也是从下往上补）
  chestStackDepth: 4,
  // 只要机器人在材料箱这个范围内，就认为"已经到材料区了"，用分段瞬移过去开箱
  // （服务器的瞬移限制是 X/Z 32 格，所以这里也用 32）
  chestReach: 32,
  // 库存不足时原地等补货的间隔（毫秒），补货足够后自动继续搭建
  restockWaitMs: 15000,

  // ---- 地图所在的传送点（服务器地标）----
  storageTp: '/res tp hpdth',
  platformTp: '/res tp hpdth.dth',
  // 回搭建平台的传送失败判定：和要放的第一个方块差多少格算失败，以及最多重试几次
  platformTpMaxDistance: 32,
  platformTpRetries: 3,

  // ---- 放置时的站位 ----
  // 不悬空：直接站在目标方块 z-1 那一格（下一层/已建好的地毯）上放置，
  // 服务器不允许飞行时这样最稳（悬空超过 4 秒会被踢 multiplayer.disconnect.flying）
  standOnGround: true,
  standWaitMs: 120,   // 站好位置后等物理把机器人放到地面上的时间（毫秒）
  // 服务器的放置距离：眼睛到参考方块中心的距离超过它就先移动到方块旁边
  placeReach: 4,
  // 光边（平滑石那一排）放得更慢更稳：每次瞬移/放置后额外等待的毫秒数
  edgePlaceDelayMs: 100,

  // ---- 建造分区 ----
  regionSize: 32,     // 材料按 32x32 方块为一个区块领取
  chunkRetries: 3,    // 单个区块连续失败多少次后跳过
  // 每种颜色每批最多处理多少格（背包 36 格 × 64 ≈ 2304，留出食物等余量）
  colorBatchSize: 1600,
  // 先单独建造的“光边”方块（默认平滑石）；设为 null 表示不区分、直接一起建
  edgeBlock: 'smooth_stone',

  // ---- 调试 ----
  verbose: false,     // true 时打印每个方块的详细日志
};

/* ============================================================
 * 二、材料仓与地图配色
 * ============================================================ */

// 各颜色容器（木桶/箱子）的坐标，与服务器实地摆放一致
const materialChests = [
  { color: 'smooth_stone', pos: new Vec3(37520, 90, 13881), type: 'chest' },
  { color: 'white_carpet', pos: new Vec3(37541, 90, 13880), type: 'barrel' },
  { color: 'purple_carpet', pos: new Vec3(37540, 90, 13880), type: 'barrel' },
  { color: 'orange_carpet', pos: new Vec3(37539, 90, 13880), type: 'barrel' },
  { color: 'magenta_carpet', pos: new Vec3(37538, 90, 13880), type: 'barrel' },
  { color: 'light_gray_carpet', pos: new Vec3(37537, 90, 13880), type: 'barrel' },
  { color: 'cyan_carpet', pos: new Vec3(37536, 90, 13880), type: 'barrel' },
  { color: 'light_blue_carpet', pos: new Vec3(37535, 90, 13880), type: 'barrel' },
  { color: 'lime_carpet', pos: new Vec3(37534, 90, 13880), type: 'barrel' },
  { color: 'green_carpet', pos: new Vec3(37533, 90, 13880), type: 'barrel' },
  { color: 'red_carpet', pos: new Vec3(37532, 90, 13880), type: 'barrel' },
  { color: 'yellow_carpet', pos: new Vec3(37531, 90, 13880), type: 'barrel' },
  { color: 'brown_carpet', pos: new Vec3(37530, 90, 13880), type: 'barrel' },
  { color: 'blue_carpet', pos: new Vec3(37529, 90, 13880), type: 'barrel' },
  { color: 'pink_carpet', pos: new Vec3(37528, 90, 13880), type: 'barrel' },
  { color: 'black_carpet', pos: new Vec3(37527, 90, 13880), type: 'barrel' },
  { color: 'gray_carpet', pos: new Vec3(37526, 90, 13880), type: 'barrel' },
  { color: 'food', pos: new Vec3(37518, 90, 13881), type: 'chest', food: true },
];

const CONTAINER_BLOCKS = new Set(['chest', 'trapped_chest', 'barrel', 'ender_chest']);

// 地图俯视渲染用的近似颜色（Minecraft 染料色）
const DYE_COLORS = {
  white: '#f9fffe',
  orange: '#f07613',
  magenta: '#bd44b3',
  light_blue: '#3ab3da',
  yellow: '#f8c627',
  lime: '#80c71f',
  pink: '#f38baa',
  gray: '#474f52',
  light_gray: '#9d9d97',
  cyan: '#169c9c',
  purple: '#8932b8',
  blue: '#3c44aa',
  brown: '#835432',
  green: '#5e7c16',
  red: '#b02e26',
  black: '#1d1d21',
};

const BLOCK_COLORS = { smooth_stone: '#9d9d97' };
for (const [dyeName, color] of Object.entries(DYE_COLORS)) {
  BLOCK_COLORS[`${dyeName}_carpet`] = color;
}

/* ============================================================
 * 三、通用工具
 * ============================================================ */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function log(...args) {
  console.log('[painting]', ...args);
}

function vlog(...args) {
  if (SETTINGS.verbose) log(...args);
}

function hashString(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (value) => Math.round(255 * value).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

// 未知方块用名字哈希出一个稳定的颜色，保证俯视图不会因为新方块类型而崩掉
function colorForBlock(name) {
  if (BLOCK_COLORS[name]) return BLOCK_COLORS[name];
  if (name.endsWith('_carpet')) {
    const base = name.slice(0, -7);
    if (DYE_COLORS[base]) return DYE_COLORS[base];
  }
  return hslToHex(hashString(name) % 360, 55, 55);
}

// 蛇形排序：z 行递增，行内按 x 方向交替，避免每行结束都要折返
function serpentineSort(cells) {
  const rows = new Map();
  for (const cell of cells) {
    if (!rows.has(cell.z)) rows.set(cell.z, []);
    rows.get(cell.z).push(cell);
  }
  const result = [];
  const zValues = [...rows.keys()].sort((a, b) => a - b);
  zValues.forEach((z, rowIndex) => {
    const row = rows.get(z);
    const direction = rowIndex % 2 === 0 ? 1 : -1;
    row.sort((a, b) => (a.x - b.x) * direction);
    result.push(...row);
  });
  return result;
}

// 把方块按 regionSize x regionSize 划分为区块（区块内已经排好蛇形顺序）
function groupIntoChunks(cells, minX, minZ, regionSize) {
  const chunks = new Map();
  for (const cell of cells) {
    const cx = Math.floor((cell.x - minX) / regionSize);
    const cz = Math.floor((cell.z - minZ) / regionSize);
    const key = `${cx},${cz}`;
    if (!chunks.has(key)) chunks.set(key, { cx, cz, cells: [] });
    chunks.get(key).cells.push(cell);
  }
  const list = [...chunks.values()].sort((a, b) => (a.cz - b.cz) || (a.cx - b.cx));
  for (const chunk of list) {
    chunk.cells = serpentineSort(chunk.cells);
    chunk.attempts = 0;
  }
  return list;
}

// 兼容带/不带 _carpet 后缀的容器命名
function findMaterialChest(blockName) {
  let info = materialChests.find((chest) => chest.color === blockName);
  if (!info && blockName.endsWith('_carpet')) {
    const base = blockName.slice(0, -7);
    info = materialChests.find((chest) => chest.color === base);
  }
  return info;
}

/* ============================================================
 * 四、投影解析
 * ============================================================ */

/* ---------- 投影解析：litematic 原生读取 + .schem 兜底 ---------- */

function isGzipBuffer(buffer) {
  return buffer && buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

// prismarine-nbt 里的 long 可能是 BigInt / [高32位, 低32位] / {high, low}
function longToBigInt(value) {
  if (typeof value === 'bigint') return value;
  if (Array.isArray(value)) return (BigInt(value[0]) << 32n) | BigInt(value[1] >>> 0);
  if (value && typeof value === 'object' && 'high' in value) {
    return (BigInt(value.high) << 32n) | BigInt(value.low >>> 0);
  }
  return BigInt(value);
}

// 解包 litematic 的 BlockStates：两种打包方式都试，选索引全部合法的那个
//   perLong = true  ：每个 long 存 floor(64/bits) 个值，不跨 long（新版 Litematica）
//   perLong = false ：值可以跨 long 边界（旧版工具）
function decodeLitematicValues(longs, paletteSize, count) {
  const paletteBits = Math.max(2, Math.ceil(Math.log2(Math.max(2, paletteSize))));
  const candidates = [];
  for (const bits of [paletteBits, paletteBits + 1]) {
    candidates.push({ bits, perLong: true });
    candidates.push({ bits, perLong: false });
  }

  let best = null;
  for (const option of candidates) {
    const values = new Array(count);
    const mask = (1n << BigInt(option.bits)) - 1n;
    const perLongCount = Math.max(1, Math.floor(64 / option.bits));

    for (let i = 0; i < count; i++) {
      let value = 0;
      if (option.perLong) {
        const longIndex = Math.floor(i / perLongCount);
        if (longIndex >= longs.length) {
          value = 0;
        } else {
          value = Number((longs[longIndex] >> BigInt((i % perLongCount) * option.bits)) & mask);
        }
      } else {
        const bitPos = i * option.bits;
        const longIndex = Math.floor(bitPos / 64);
        const offset = bitPos % 64;
        if (longIndex >= longs.length) {
          value = 0;
        } else {
          value = Number((longs[longIndex] >> BigInt(offset)) & mask);
          if (offset + option.bits > 64 && longIndex + 1 < longs.length) {
            const spill = offset + option.bits - 64;
            value |= Number((longs[longIndex + 1] & ((1n << BigInt(spill)) - 1n)) << BigInt(64 - offset));
          }
        }
      }
      values[i] = value;
    }

    let bad = 0;
    for (let i = 0; i < count; i++) {
      if (values[i] >= paletteSize) bad++;
    }
    if (bad === 0) return values;
    if (!best || bad < best.bad) best = { bad, values, option };
  }

  log(`警告：litematic 数据中有 ${best.bad} 个越界索引，已按最接近的打包方式解析`);
  return best.values;
}

// 直接读取 .litematic（多个区域会合并成一个投影）
async function readLitematic(buffer) {
  const parsed = await nbt.parse(buffer);
  const simple = nbt.simplify(parsed.parsed);
  if (!simple || !simple.Regions || !Object.keys(simple.Regions).length) return null;

  const rawRegions = parsed.parsed.value.Regions.value;
  const regions = [];
  for (const [regionName, region] of Object.entries(simple.Regions)) {
    const rawRegion = rawRegions[regionName] && rawRegions[regionName].value;
    if (!rawRegion || !rawRegion.BlockStates) continue;

    const size = region.Size;
    const position = region.Position || { x: 0, y: 0, z: 0 };
    const paletteNames = (region.BlockStatePalette || []).map((state) => (
      String((state && state.Name) || 'air').replace('minecraft:', '').split('[')[0]
    ));
    const longs = rawRegion.BlockStates.value.map(longToBigInt);
    const count = size.x * size.y * size.z;
    const values = decodeLitematicValues(longs, paletteNames.length, count);
    regions.push({ name: regionName, size, position, paletteNames, values });
  }
  if (!regions.length) return null;

  // 归一化到最小角为 0,0,0（和 .schem 的行为保持一致）
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const region of regions) {
    minX = Math.min(minX, region.position.x);
    minY = Math.min(minY, region.position.y);
    minZ = Math.min(minZ, region.position.z);
    maxX = Math.max(maxX, region.position.x + region.size.x - 1);
    maxY = Math.max(maxY, region.position.y + region.size.y - 1);
    maxZ = Math.max(maxZ, region.position.z + region.size.z - 1);
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const length = maxZ - minZ + 1;
  const blockNames = ['air'];
  const nameIndex = new Map([['air', 0]]);
  const blocks = new Uint16Array(width * height * length);

  for (const region of regions) {
    const offsetX = region.position.x - minX;
    const offsetY = region.position.y - minY;
    const offsetZ = region.position.z - minZ;
    for (let y = 0; y < region.size.y; y++) {
      for (let z = 0; z < region.size.z; z++) {
        for (let x = 0; x < region.size.x; x++) {
          const localIndex = (y * region.size.z + z) * region.size.x + x;
          const name = region.paletteNames[region.values[localIndex]] || 'air';
          if (!nameIndex.has(name)) {
            nameIndex.set(name, blockNames.length);
            blockNames.push(name);
          }
          const globalIndex = ((y + offsetY) * length + (z + offsetZ)) * width + (x + offsetX);
          blocks[globalIndex] = nameIndex.get(name);
        }
      }
    }
  }

  const size = new Vec3(width, height, length);
  return {
    size,
    getBlock(pos) {
      const x = Math.floor(pos.x);
      const y = Math.floor(pos.y);
      const z = Math.floor(pos.z);
      if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= length) return { name: 'air' };
      return { name: blockNames[blocks[(y * length + z) * width + x]] || 'air' };
    },
  };
}

// 兜底：自己解析 sponge v2/v3 的 .schem（容忍 BlockData 尾部的多余字节）
async function readSpongeSchematic(buffer) {
  const parsed = await nbt.parse(buffer);
  const simple = nbt.simplify(parsed.parsed);
  if (!simple || !simple.Palette || !simple.BlockData || simple.Width === undefined) {
    throw new Error('无法识别的投影格式（既不是 litematic，也不是 sponge .schem）');
  }

  const width = simple.Width;
  const height = simple.Height;
  const length = simple.Length;
  const count = width * height * length;

  const paletteNames = [];
  let paletteSize = 0;
  for (const [name, id] of Object.entries(simple.Palette)) {
    paletteNames[id] = String(name).replace('minecraft:', '').split('[')[0];
    paletteSize = Math.max(paletteSize, id + 1);
  }

  const bytes = Array.from(simple.BlockData, (value) => value & 0xff);
  const values = new Array(count);
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    let value = 0;
    let lengthOfVarint = 0;
    let byte = 0;
    do {
      if (cursor >= bytes.length) throw new Error('投影数据不完整（BlockData 提前结束）');
      byte = bytes[cursor++];
      value |= (byte & 0x7f) << (lengthOfVarint * 7);
      lengthOfVarint++;
      if (lengthOfVarint > 5) throw new Error('投影数据损坏（varint 过长）');
    } while ((byte & 0x80) !== 0);
    if (value >= paletteSize) {
      throw new Error(`投影数据无效（第 ${i} 格引用了不存在的调色板项，请改用 .litematic 或重新导出 .schem）`);
    }
    values[i] = value;
  }

  const size = new Vec3(width, height, length);
  return {
    size,
    getBlock(pos) {
      const x = Math.floor(pos.x);
      const y = Math.floor(pos.y);
      const z = Math.floor(pos.z);
      if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= length) return { name: 'air' };
      return { name: paletteNames[values[(y * length + z) * width + x]] || 'air' };
    },
  };
}

// 读取投影文件（支持 .litematic / .schem，可传文件路径或上传得到的 Buffer）
async function loadSchematic(input) {
  const data = Buffer.isBuffer(input) ? input : await fs.readFile(input);

  // 1) 优先尝试 litematic（gzip + NBT 根节点带 Regions），不依赖 Lite2Edit
  if (isGzipBuffer(data)) {
    try {
      const schematic = await readLitematic(data);
      if (schematic) {
        return { schematic, width: schematic.size.x, height: schematic.size.y, length: schematic.size.z };
      }
    } catch (err) {
      vlog(`litematic 直接解析失败，改用 .schem 解析：${err.message}`);
    }
  }

  // 2) 标准 .schem（sponge v2/v3 或 MCEdit）
  try {
    const schematic = await Schematic.read(data);
    const size = schematic.size || new Vec3(
      schematic.width || 0,
      schematic.height || 0,
      schematic.length || 0
    );
    return { schematic, width: size.x, height: size.y, length: size.z };
  } catch (err) {
    // 3) 兜底：自己解析 sponge v2/v3（prismarine-schematic 解不开时）
    const schematic = await readSpongeSchematic(data);
    return { schematic, width: schematic.size.x, height: schematic.size.y, length: schematic.size.z };
  }
}

// 扫描投影，生成完整的建造计划（每一格要放的方块）
function analyzeSchematic({ schematic, width, height, length }) {
  const cells = [];
  const materials = {};

  for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        const block = schematic.getBlock(new Vec3(x, y, z));
        if (!block || block.name === 'air') continue;
        cells.push({ id: cells.length, x, y, z, name: block.name });
        materials[block.name] = (materials[block.name] || 0) + 1;
      }
    }
  }

  const xs = cells.map((cell) => cell.x);
  const zs = cells.map((cell) => cell.z);

  return {
    schematic,
    width,
    height,
    length,
    cells,
    materials,
    totalBlocks: cells.length,
    minX: xs.length ? Math.min(...xs) : 0,
    maxX: xs.length ? Math.max(...xs) : 0,
    minZ: zs.length ? Math.min(...zs) : 0,
    maxZ: zs.length ? Math.max(...zs) : 0,
  };
}

// 任务名（用于日志/网页状态）
function jobLabel(job) {
  return job.phase === 'edge' ? '光边' : `颜色 ${job.name}`;
}

// 把建造计划切成一串任务：
//   - 光边（默认平滑石）先做：按 32x32 区块分组；
//   - 地图画按颜色分组：一种颜色一起做，颜色内按行蛇形排序，
//     超过 colorBatchSize 就切成多批（背包一次装不下）。
function planJobs(
  plan,
  regionSize = SETTINGS.regionSize,
  edgeBlock = SETTINGS.edgeBlock,
  batchSize = SETTINGS.colorBatchSize
) {
  const edgeCells = [];
  const artCells = [];
  for (const cell of plan.cells) {
    if (edgeBlock && cell.name === edgeBlock) edgeCells.push(cell);
    else artCells.push(cell);
  }

  const edgeJobs = groupIntoChunks(edgeCells, plan.minX, plan.minZ, regionSize).map((chunk) => ({
    phase: 'edge',
    name: edgeBlock || 'edge',
    cells: chunk.cells,
    attempts: 0,
  }));

  const byColor = new Map();
  for (const cell of artCells) {
    if (!byColor.has(cell.name)) byColor.set(cell.name, []);
    byColor.get(cell.name).push(cell);
  }

  const colorStats = [...byColor.entries()]
    .map(([name, cells]) => ({ name, count: cells.length }))
    .sort((a, b) => b.count - a.count);

  const colorJobs = [];
  for (const { name } of colorStats) {
    const ordered = serpentineSort(byColor.get(name));   // 颜色内按行蛇形，走位最短
    for (let start = 0; start < ordered.length; start += batchSize) {
      colorJobs.push({
        phase: 'color',
        name,
        cells: ordered.slice(start, start + batchSize),
        attempts: 0,
      });
    }
  }

  return { edgeJobs, colorJobs, colorStats };
}

// 生成俯视建造图数据：
//   legend   : 颜色编号对应的方块名和颜色（0 号固定是空气）
//   planIndex: 每一格"计划要放的方块"编号（Uint8Array，0 = 空气）
function buildMapView(plan) {
  const viewWidth = plan.maxX - plan.minX + 1;
  const viewHeight = plan.maxZ - plan.minZ + 1;
  const legend = [{ name: 'air', color: null }];
  const legendIndex = new Map();
  const planIndex = new Uint8Array(viewWidth * viewHeight);

  // 同一列有多个方块时，只显示最上面的一格
  const ordered = [...plan.cells].sort((a, b) => a.y - b.y);
  for (const cell of ordered) {
    if (!legendIndex.has(cell.name)) {
      legendIndex.set(cell.name, legend.length);
      legend.push({ name: cell.name, color: colorForBlock(cell.name) });
    }
    planIndex[(cell.z - plan.minZ) * viewWidth + (cell.x - plan.minX)] = legendIndex.get(cell.name);
  }

  return { viewWidth, viewHeight, minX: plan.minX, minZ: plan.minZ, legend, planIndex };
}

/* ============================================================
 * 五、单机器人工作单元
 * ============================================================ */

/**
 * 一个 BotWorker 对应一个机器人账号，负责：
 *   - 连接服务器、开启飞行、清空背包、自动进食；
 *   - 从任务队列领取区块；
 *   - 回仓库取材料 → 按蛇形顺序放置 → 查漏补缺。
 */
class BotWorker {
  constructor({ index, username, coordinator }) {
    this.index = index;
    this.username = username;
    this.coordinator = coordinator;

    this.bot = null;
    this.alive = false;
    this.stopped = false;
    this.currentChunk = null;
    this.hungerTimer = null;
    this.fastHeld = null;           // 极速放置当前那一叠：{ name, remaining }
    this.burstIntervalMs = null;    // 每个机器人各自的自适应爆发间隔
    this.wantFlying = false;        // 是否处于飞行悬空状态（只有搭建阶段才开）
    this.waitingForEdgeLogged = false;
  }

  get label() {
    return `机器人${this.index + 1}(${this.username})`;
  }

  get settings() {
    return this.coordinator.settings;
  }

  get isBusy() {
    return this.alive && !this.stopped;
  }

  /* ---------- 连接 ---------- */

  async connect() {
    const { host, port, version, auth } = this.coordinator.connection;
    const bot = mineflayer.createBot({ host, port, username: this.username, version, auth });
    this.bot = bot;

    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
      const timer = setTimeout(() => finish(reject, new Error('连接超时')), this.settings.spawnTimeoutMs);

      bot.once('spawn', () => {
        this.alive = true;
        this.coordinator.updateBotState(this.index, '已连接');
        this.prepare()
          .then(() => finish(resolve))
          .catch((err) => finish(reject, err));
      });

      bot.on('error', (err) => {
        if (!settled) return finish(reject, err);
        log(`${this.label} 连接错误: ${err.message}`);
      });

      bot.on('kicked', (reason) => {
        const message = typeof reason === 'string' ? reason : JSON.stringify(reason);
        if (!settled) return finish(reject, new Error(`被踢出: ${message}`));
        this.handleDisconnect(`被踢出: ${message}`);
      });

      bot.on('end', () => {
        if (this.stopped) return;
        if (!settled) return finish(reject, new Error('连接已断开'));
        this.handleDisconnect('连接已断开');
      });

      bot.on('chat', (username, message) => vlog(`${this.label} 聊天 ${username}: ${message}`));

      // 搭建阶段重生后恢复飞行悬空
      bot.on('spawn', () => {
        if (this.wantFlying) this.setFlying(true);
      });
    });
  }

  // 连接成功后的准备工作：开飞行、清空背包、启动自动进食
  async prepare() {
    const bot = this.bot;
    // 刚进服保持正常落地状态，等开始搭建时才开飞行悬空
    this.setFlying(false);

    const items = bot.inventory.items();
    if (items.length) log(`${this.label} 丢弃背包中的 ${items.length} 组物品`);
    for (const item of items) {
      try {
        await bot.toss(item.type, null, item.count);
      } catch (err) {
        vlog(`${this.label} 丢弃 ${item.name} 失败: ${err.message}`);
      }
    }

    this.startHungerMonitor();
  }

  // 开关客户端的飞行悬空（mineflayer 的 creative 插件只改本地重力）
  setFlying(enabled) {
    if (!this.bot || !this.bot.creative) return;
    try {
      if (enabled) {
        if (!this.wantFlying) {
          this.bot.creative.startFlying();
          this.wantFlying = true;
          log(`${this.label} 已开启飞行悬空`);
        }
      } else if (this.wantFlying) {
        this.bot.creative.stopFlying();
        this.wantFlying = false;
        log(`${this.label} 已关闭飞行悬空`);
      }
    } catch (err) {
      log(`${this.label} 切换飞行状态失败: ${err.message}`);
    }
  }

  startHungerMonitor() {
    if (this.hungerTimer) return;
    this.hungerTimer = setInterval(() => {
      this.checkHunger().catch((err) => vlog(`${this.label} 自动进食失败: ${err.message}`));
    }, 5000);
    if (this.hungerTimer.unref) this.hungerTimer.unref();
  }

  async checkHunger() {
    if (!this.isBusy || !this.bot) return;
    if (this.bot.food >= this.settings.foodThreshold) return;
    log(`${this.label} 饥饿值 ${this.bot.food}，开始进食`);
    while (this.bot.food < 20 && !this.stopped) {
      const food = this.findItem(this.settings.foodItem);
      if (!food) break;
      try {
        await this.equipItem(food);
        await this.bot.activateItem();
      } catch (err) {
        break;
      }
      await sleep(1000);
    }
  }

  /* ---------- 主循环 ---------- */

  async run() {
    while (this.isBusy) {
      const job = this.coordinator.takeJob();
      if (!job) {
        // 光边还没全部造完时先等着，不提前去拿地毯材料
        if (this.coordinator.isEdgePhasePending()) {
          if (!this.waitingForEdgeLogged) {
            this.waitingForEdgeLogged = true;
            log(`${this.label} 等待光边完成，暂时没有任务`);
          }
          this.coordinator.updateBotState(this.index, '等待光边完成');
          await sleep(500);
          continue;
        }
        log(`${this.label} 任务队列已空`);
        break;
      }
      this.waitingForEdgeLogged = false;

      this.currentChunk = job;
      log(`${this.label} 领取任务 ${jobLabel(job)}（${job.cells.length} 格）`);
      try {
        await this.processJob(job);
        this.currentChunk = null;
        this.coordinator.onJobFinished(job);
        log(`${this.label} 完成任务 ${jobLabel(job)}`);
      } catch (err) {
        log(`${this.label} ${jobLabel(job)} 处理失败: ${err.message}`);
        if (!this.stopped) this.coordinator.requeueJob(job);
        this.currentChunk = null;
        if (!this.isBusy) break;
        await sleep(this.settings.jobRetryDelayMs);
      }
    }
    // 正常做完分配任务：恢复落地并更新状态；掉线/被停止时保留具体原因
    if (!this.stopped) {
      this.setFlying(false);
      this.coordinator.updateBotState(this.index, '已完成分配任务');
    }
  }

  /**
   * 处理一个任务：
   *   - 光边任务：一个 32x32 区块里的光边方块；
   *   - 颜色任务：同一种颜色的一批方块。
   * 一次只拿一种颜色的材料，放完再换下一种，避免反复切换快捷栏/背包。
   */
  async processJob(job) {
    const label = jobLabel(job);
    this.currentJobPhase = job.phase;
    this.currentJobLabel = label;
    this.coordinator.setCurrentRegion(this.index, label);
    this.coordinator.updateBotState(this.index, `正在搭建 ${label}`);

    // 1. 先清掉上一批剩下的旧材料，避免占背包
    await this.dropLeftoverMaterials();
    if (!this.isBusy) throw new Error('机器人已离线');

    // 2. 分批取料 + 放置，直到这个任务的所有方块都完成
    let lastPending = -1;
    while (this.isBusy) {
      const pending = job.cells.filter((cell) => !this.coordinator.isPlaced(cell));
      if (!pending.length) break;
      if (pending.length === lastPending) {
        log(`${this.label} ${label} 还有 ${pending.length} 个方块没放上，交给收尾补建`);
        break;
      }
      lastPending = pending.length;

      const deficit = this.materialDeficit({ [job.name]: pending.length });
      const need = deficit[job.name] || 0;
      if (need > 0) {
        await this.fetchMaterials({ [job.name]: need });
        // 回平台可能失败（还留在材料仓），离起始搭建坐标太远就重试传送
        await this.ensureAtPlatform();
      }
      if (!this.isBusy) throw new Error('机器人已离线');

      if (this.settings.fastPlace) {
        await this.fastPlaceCells(pending);
        await this.waitForChunkBlocks(pending, this.settings.verifyTimeoutMs);
      } else {
        await this.placeCells(pending);
      }
      if (!this.isBusy) throw new Error('机器人已离线');
    }

    const stillMissing = job.cells.filter((cell) => !this.coordinator.isPlaced(cell)).length;
    if (stillMissing) log(`${this.label} ${label} 仍有 ${stillMissing} 个方块未完成`);
    if (this.settings.fastPlace) this.adaptBurstInterval(stillMissing / Math.max(1, job.cells.length));
  }

  /* ---------- 材料 ---------- */

  async fetchMaterials(materialCount, options = {}) {
    const names = Object.keys(materialCount).filter((name) => materialCount[name] > 0);
    if (!names.length) return;

    await this.teleport(this.settings.storageTp);
    if (!options.skipFood && this.needsFood()) await this.ensureFood();

    for (const name of names) {
      if (!this.isBusy) return;
      await this.ensureEnoughMaterial(name, materialCount[name]);
      await sleep(250);
    }

    await this.teleport(this.settings.platformTp);
  }

  // 取够指定数量的材料；材料箱没货就往上找 y+1 ... y+4，全都没有就原地等补货
  async ensureEnoughMaterial(name, needCount) {
    let unreachedTries = 0;
    let lastHave = this.countInventory(name);
    while (this.isBusy && this.countInventory(name) < needCount) {
      const short = needCount - this.countInventory(name);
      const { taken, reached } = await this.withdrawMaterial(name, short);
      const have = this.countInventory(name);
      if (have >= needCount) break;

      // 根本没走到箱子旁边（传送/区块没加载/开箱都失败）：
      // 不是没库存，重新传送到 hpdth 再取
      if (!reached) {
        unreachedTries++;
        log(`${this.label} 没能到达 ${name} 的材料箱（第 ${unreachedTries} 次），重新传送到 hpdth 再取`);
        this.coordinator.updateBotState(this.index, `未到达${name}材料箱，重新传送取货`);
        await this.teleport(this.settings.storageTp);
        if (unreachedTries >= 5) await sleep(this.settings.restockWaitMs);
        continue;
      }

      unreachedTries = 0;
      if (taken <= 0 || have <= lastHave) {
        // 到达了箱子但确实没库存：原地等补货
        const missingCount = needCount - have;
        this.coordinator.updateBotState(this.index, `等待补货 ${name}（还差 ${missingCount}）`);
        log(`${this.label} ${name} 库存不足（还差 ${missingCount} 个），原地等待补货...`);
        await sleep(this.settings.restockWaitMs);
      }
      lastHave = have;
    }
  }

  // 清掉背包里上一批剩下的材料（食物除外），避免占满背包
  async dropLeftoverMaterials() {
    const items = this.bot.inventory.items().filter((item) => item.name !== this.settings.foodItem);
    if (!items.length) return;
    log(`${this.label} 清理背包里 ${items.length} 组上一批的材料`);
    for (const item of items) {
      try {
        await this.bot.toss(item.type, null, item.count);
      } catch (err) {
        vlog(`${this.label} 丢弃 ${item.name} 失败: ${err.message}`);
      }
    }
    this.fastHeld = null;
  }

  async teleport(command) {
    log(`${this.label} 传送: ${command}`);
    this.bot.chat(command);
    await sleep(this.settings.teleportWaitMs);
    if (typeof this.bot.waitForChunksToLoad === 'function') {
      await this.bot.waitForChunksToLoad().catch(() => {});
    }
  }

  /**
   * 确认已经回到搭建平台：
   * /res tp hpdth.dth 有时会失败，机器人还留在材料仓那边。
   * 如果机器人和起始搭建坐标差得很远（默认超过 32 格），就重发传送指令。
   */
  async ensureAtPlatform() {
    const referencePos = this.coordinator.startPos;
    for (let attempt = 1; attempt <= this.settings.platformTpRetries; attempt++) {
      const pos = this.bot.entity.position;
      const distance = Math.max(
        Math.abs(referencePos.x - pos.x),
        Math.abs(referencePos.z - pos.z)
      );
      if (distance <= this.settings.platformTpMaxDistance) return true;

      log(`${this.label} 回搭建平台似乎失败（离目标还有 ${Math.round(distance)} 格），重新传送 hpdth.dth（第 ${attempt} 次）`);
      this.coordinator.updateBotState(this.index, `回平台失败，重试传送（第 ${attempt} 次）`);
      await this.teleport(this.settings.platformTp);
    }
    return false;
  }

  // 直接瞬移到方块旁边（不再用寻路：pathfinder 默认会挖掉挡路的方块）
  async teleportNextTo(pos) {
    this.setFlying(false);
    const offsets = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    const isAir = (block) => !block || block.name === 'air';

    for (const [dx, dz] of offsets) {
      const standX = pos.x + dx;
      const standZ = pos.z + dz;
      const feet = this.bot.blockAt(new Vec3(standX, pos.y, standZ));       // 站位要空着
      const below = this.bot.blockAt(new Vec3(standX, pos.y - 1, standZ));  // 脚下要有地面
      if (isAir(feet) && !isAir(below)) {
        this.setFlying(true);
        await this.teleportPosition(standX + 0.5, pos.y, standZ + 0.5);
        this.setFlying(false);
        await sleep(this.settings.standWaitMs);
        return true;
      }
    }

    // 找不到合适的站位就站在方块正上方（同样能打开容器）
    this.setFlying(true);
    await this.teleportPosition(pos.x + 0.5, pos.y + 1, pos.z + 0.5);
    this.setFlying(false);
    await sleep(this.settings.standWaitMs);
    return false;
  }

  // 保证背包里有足够的食物（不足则补，过多则丢）
  async ensureFood() {
    const chestInfo = materialChests.find((chest) => chest.food);
    if (!chestInfo) return;

    // 没走到食物箱旁边就传送回 hpdth 再试一次
    let container = null;
    for (let attempt = 1; attempt <= 2 && this.isBusy; attempt++) {
      if (this.bot.entity.position.distanceTo(chestInfo.pos) > this.settings.chestReach) {
        log(`${this.label} 距离食物箱太远，传送回 hpdth 再取`);
        await this.teleport(this.settings.storageTp);
      }
      await this.teleportNextTo(chestInfo.pos);

      const block = this.bot.blockAt(chestInfo.pos);
      if (!block || !CONTAINER_BLOCKS.has(block.name)) {
        log(`${this.label} 没找到食物箱（第 ${attempt} 次），传送回 hpdth 重试`);
        await this.teleport(this.settings.storageTp);
        continue;
      }
      try {
        container = await this.bot.openContainer(block);
        break;
      } catch (err) {
        log(`${this.label} 打开食物箱失败: ${err.message}，传送回 hpdth 重试`);
        await this.teleport(this.settings.storageTp);
      }
    }
    if (!container) return;

    try {
      const have = this.countInventory(this.settings.foodItem);
      if (have < this.settings.foodReserve) {
        const taken = await this.withdrawFrom(container, this.settings.foodItem, this.settings.foodReserve - have);
        if (taken > 0) log(`${this.label} 补充食物 ${taken} 个`);
      } else if (have > this.settings.foodReserve) {
        let excess = have - this.settings.foodReserve;
        for (const item of this.bot.inventory.items()) {
          if (excess <= 0) break;
          if (item.name !== this.settings.foodItem) continue;
          const drop = Math.min(excess, item.count);
          try {
            await this.bot.toss(item.type, null, drop);
            excess -= drop;
          } catch (err) {
            break;
          }
        }
      }
    } finally {
      container.close();
    }
    await sleep(500);
  }

  // 只有饥饿值偏低或食物快用完时才去补食物，避免每个区块都绕路
  needsFood() {
    if (!this.bot) return false;
    return this.bot.food < this.settings.foodThreshold
      || this.countInventory(this.settings.foodItem) < 8;
  }

  // 从对应颜色的容器里取材料；地毯类会依次尝试 y、y+1、y+2 的容器
  async withdrawMaterial(name, needCount) {
    const info = findMaterialChest(name);
    if (!info) {
      log(`${this.label} 未找到 ${name} 对应的容器`);
      return { taken: 0, reached: false };
    }

    // 只往上找：y、y+1 ... y+chestStackDepth（x/z 不变，补货也是从下往上补）
    const candidates = [];
    for (let level = 0; level <= this.settings.chestStackDepth; level++) {
      candidates.push(info.pos.offset(0, level, 0));
    }

    let remaining = needCount;
    let taken = 0;
    let reached = false;   // 只要成功打开过一个材料箱，就说明确实到箱子旁边了
    for (const pos of candidates) {
      if (remaining <= 0 || !this.isBusy) break;

      // 离得太远（传送都没到材料区）就交给上层重新传送；32 格以内都算到了材料区
      if (this.bot.entity.position.distanceTo(pos) > this.settings.chestReach) continue;

      if (this.bot.entity.position.distanceTo(pos) > 3) {
        await this.teleportNextTo(pos);
      }

      const block = this.bot.blockAt(pos);
      if (!block || !CONTAINER_BLOCKS.has(block.name)) continue;

      let container = null;
      try {
        container = await this.bot.openContainer(block);
        reached = true;
        const got = await this.withdrawFrom(container, name, remaining);
        if (got > 0) {
          taken += got;
          remaining -= got;
        }
      } catch (err) {
        vlog(`${this.label} 从 (${pos.x},${pos.y},${pos.z}) 取 ${name} 失败: ${err.message}`);
      } finally {
        if (container) container.close();
      }
      await sleep(300);
    }

    if (taken > 0) log(`${this.label} 取出 ${taken} 个 ${name}`);
    return { taken, reached };
  }

  // 从容器里取出最多 maxCount 个物品，返回实际取出数量
  async withdrawFrom(container, name, maxCount) {
    let taken = 0;
    while (taken < maxCount) {
      const item = container.containerItems().find((slot) => slot.name === name && slot.count > 0);
      if (!item) break;
      const count = Math.min(maxCount - taken, item.count, 64);
      try {
        await container.withdraw(item.type, null, count);
      } catch (err) {
        log(`${this.label} 取出 ${name} 失败: ${err.message}`);
        break;
      }
      taken += count;
    }
    return taken;
  }

  // 计算背包里还缺多少材料
  materialDeficit(needed) {
    const deficit = {};
    for (const [name, count] of Object.entries(needed)) {
      const have = this.countInventory(name);
      if (have < count) deficit[name] = count - have;
    }
    return deficit;
  }

  /* ---------- 放置 ---------- */

  // 按顺序放置方块：连续的同材料方块会合成一小批并发放置（见 placeConcurrency）
  async placeCells(cells) {
    let index = 0;
    while (index < cells.length && this.isBusy) {
      const first = cells[index];
      if (this.coordinator.isPlaced(first)) {
        index++;
        continue;
      }

      const batch = [first];
      let next = index + 1;
      while (batch.length < this.settings.placeConcurrency && next < cells.length) {
        const candidate = cells[next];
        if (this.coordinator.isPlaced(candidate) || candidate.name !== first.name) break;
        batch.push(candidate);
        next++;
      }

      await this.placeBatch(batch);
      index = next;
      if (this.settings.placeIntervalMs > 0) await sleep(this.settings.placeIntervalMs);
    }
  }

  async placeBatch(batch) {
    const todo = [];
    for (const cell of batch) {
      const existing = this.bot.blockAt(this.coordinator.worldPos(cell));
      if (existing && existing.name !== 'air') {
        this.markPlaced(cell);
        continue;
      }
      todo.push(cell);
    }
    if (!todo.length) return;

    const name = todo[0].name;
    const item = this.findItem(name);
    if (!item) {
      log(`${this.label} 背包缺少 ${name}，跳过 ${todo.length} 个方块`);
      return;
    }

    if (!this.bot.heldItem || this.bot.heldItem.name !== name) {
      try {
        await this.equipItem(item);
      } catch (err) {
        log(`${this.label} 装备 ${name} 失败: ${err.message}`);
        return;
      }
    }

    await Promise.all(todo.map((cell) => this.placeOne(cell)));
  }

  async placeOne(cell) {
    const worldPos = this.coordinator.worldPos(cell);
    for (let attempt = 1; attempt <= this.settings.placeRetries; attempt++) {
      if (!this.isBusy) return false;
      try {
        const existing = this.bot.blockAt(worldPos);
        if (existing && existing.name !== 'air') {
          this.markPlaced(cell);
          return true;
        }

        // 先站到方块旁边，不在旁边服务器会拒绝放置
        if (!await this.ensureNextToBlock(worldPos)) {
          await sleep(this.settings.retryDelayMs);
          continue;
        }
        const reference = this.bot.blockAt(worldPos.offset(0, -1, 0));
        if (!reference || reference.name === 'air') {
          vlog(`${this.label} 缺少参考方块 (${worldPos.x},${worldPos.y - 1},${worldPos.z})，重试`);
          await sleep(this.settings.retryDelayMs);
          continue;
        }

        const item = this.findItem(cell.name);
        if (!item) return false;
        if (!this.bot.heldItem || this.bot.heldItem.name !== cell.name) {
          await this.equipItem(item);
        }

        await this.bot.placeBlock(reference, new Vec3(0, 1, 0));

        const placed = this.bot.blockAt(worldPos);
        if (placed && placed.name !== 'air') {
          this.markPlaced(cell);
          vlog(`${this.label} 放置 ${cell.name} (${worldPos.x},${worldPos.y},${worldPos.z})`);
          if (this.currentJobPhase === 'edge' && this.settings.edgePlaceDelayMs > 0) {
            await sleep(this.settings.edgePlaceDelayMs);
          }
          return true;
        }
      } catch (err) {
        vlog(`${this.label} 放置失败 (${attempt}/${this.settings.placeRetries}) ${cell.name} (${worldPos.x},${worldPos.y},${worldPos.z}): ${err.message}`);
        await sleep(this.settings.retryDelayMs);
      }
    }
    return false;
  }

  /* ---------- 极速放置（服务器无反作弊时使用） ---------- */

  /**
   * 极速模式：不逐块移动、不等服务器确认，在同一个 tick 里连续发出多个放置包。
   * - 先按颜色把本区块的方块分组，一种颜色只换一次手持，逐色批量连发；
   *   地毯有 16 种而快捷栏只有 9 格，靠快捷栏缓存放不下，分组后就不需要缓存；
   * - 每发满 burstSize 个包就让出一次事件循环，并留出 burstIntervalMs 给服务器消化；
   * - 没放上的方块由本区块的查漏阶段用稳定模式补建，所以不必逐块等待确认。
   */
  async fastPlaceCells(cells) {
    if (this.burstIntervalMs == null) this.burstIntervalMs = this.settings.burstIntervalMs;
    await this.prepareFastPosition(cells);

    // 按材料分组：同一颜色一起放，换手持的次数 = 本区块用到的颜色数（最多十几次）
    const groups = new Map();
    for (const cell of cells) {
      if (this.coordinator.isPlaced(cell)) continue;
      const existing = this.bot.blockAt(this.coordinator.worldPos(cell));
      if (existing && existing.name !== 'air') {
        this.markPlaced(cell);
        continue;
      }
      const list = groups.get(cell.name);
      if (list) list.push(cell);
      else groups.set(cell.name, [cell]);
    }

    // 数量多的颜色先放，进度推进更直观
    const orderedGroups = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    const burstSize = Math.max(1, Math.floor(this.settings.burstSize));
    let lastMarkCheck = Date.now();

    for (const [name, list] of orderedGroups) {
      if (!this.isBusy) break;

      const ready = await this.prepareHeldFast(name);
      if (!ready) {
        log(`${this.label} 背包缺少 ${name}，跳过 ${list.length} 个方块，稍后补建`);
        continue;
      }

      let budget = 0;
      const fired = new Set();
      for (let index = 0; index < list.length; index++) {
        if (!this.isBusy) break;
        const cell = list[index];
        if (this.coordinator.isPlaced(cell) || fired.has(cell.id)) continue;

        // 这一叠发完了：换下一叠同色材料（每 64 个才需要一次）
        if (!this.fastHeld || this.fastHeld.remaining <= 0) {
          const refilled = await this.prepareHeldFast(name, true);
          if (!refilled) {
            log(`${this.label} ${name} 材料不足，剩余方块稍后补建`);
            break;
          }
        }

        // 不在方块旁边就先移过去，否则服务器不会让放
        const worldPos = this.coordinator.worldPos(cell);
        if (!await this.ensureNextToBlock(worldPos)) continue;

        // 当前位置如果还能放到附近的同色方块，就一次多发几个（placeConcurrency）
        let placedNow = 0;
        if (this.fireFastPlace(worldPos)) {
          fired.add(cell.id);
          placedNow++;
        }
        if (placedNow > 0 && this.settings.placeConcurrency > 1) {
          const lookAhead = Math.min(list.length, index + 64);
          for (let probe = index + 1; probe < lookAhead && placedNow < this.settings.placeConcurrency; probe++) {
            const other = list[probe];
            if (fired.has(other.id) || this.coordinator.isPlaced(other)) continue;
            if (!this.fastHeld || this.fastHeld.remaining <= 0) break;
            const otherPos = this.coordinator.worldPos(other);
            if (!this.isNextToBlock(otherPos)) continue;
            if (this.fireFastPlace(otherPos)) {
              fired.add(other.id);
              placedNow++;
            }
          }
        }
        if (placedNow > 0) {
          budget += placedNow;
          this.fastHeld.remaining -= placedNow;
          // 光边放得更慢更稳：每发一批额外等一会儿
          if (this.currentJobPhase === 'edge' && this.settings.edgePlaceDelayMs > 0) {
            await sleep(this.settings.edgePlaceDelayMs);
          }
        }

        if (budget >= burstSize) {
          budget = 0;
          await sleep(this.burstIntervalMs);
        }

        // 持续把已经确认放上的方块同步到进度和俯视建造图
        if (Date.now() - lastMarkCheck > 1000) {
          lastMarkCheck = Date.now();
          this.markPresentCells(cells);
        }
      }

      if (budget > 0) await sleep(Math.max(this.burstIntervalMs, 30));
    }

    this.markPresentCells(cells);
  }

  /**
   * 切到指定颜色的手持：
   * - 手上已经是这种材料就直接用；
   * - 快捷栏里有就只切手持（不消耗背包操作）；
   * - 快捷栏没有就先把背包里这种材料的整组尽量填进空快捷栏，再切手持；
   * - force = true 表示上一叠已经用完，需要再拿一组。
   */
  async prepareHeldFast(name, force = false) {
    const held = this.bot.heldItem;
    if (!force && held && held.name === name && this.fastHeld
      && this.fastHeld.name === name && this.fastHeld.remaining > 0) {
      return true;
    }

    // 上一叠按预测用完了：先等服务器把背包变化同步回来，避免拿着空气继续发包
    if (force) {
      await sleep(this.settings.refillWaitMs);
    }

    // 优先用快捷栏：有这一种材料就只切手持栏位
    let hotbarSlot = this.findHotbarSlot(name);
    if (hotbarSlot === null) {
      // 快捷栏没有：把背包里这种材料的整组尽量搬进空快捷栏（拿取次数最少）
      await this.fillHotbarWith(name);
      hotbarSlot = this.findHotbarSlot(name);
    }
    if (hotbarSlot !== null) {
      this.bot.setQuickBarSlot(hotbarSlot);
      const stack = this.bot.inventory.slots[36 + hotbarSlot];
      this.fastHeld = { name, remaining: stack ? stack.count : 1 };
      return true;
    }

    // 快捷栏满了且手上不是这种材料：直接从背包换一组到手上
    const item = this.findItem(name);
    if (!item) {
      this.fastHeld = null;
      return false;
    }
    try {
      await this.equipItem(item);
    } catch (err) {
      log(`${this.label} 切换手持 ${name} 失败: ${err.message}`);
      return false;
    }
    this.fastHeld = { name, remaining: this.bot.heldItem ? this.bot.heldItem.count : 1 };
    return true;
  }

  // 直接写放置包：跳过“看向方块”和等待服务器确认（mineflayer 内部 API）
  fireFastPlace(worldPos) {
    if (!this.bot.heldItem) return false;
    const reference = this.bot.blockAt(worldPos.offset(0, -1, 0));
    if (!reference || reference.name === 'air') return false;

    const face = new Vec3(0, 1, 0);
    try {
      if (typeof this.bot._genericPlace === 'function') {
        Promise.resolve(this.bot._genericPlace(reference, face, { forceLook: 'ignore' })).catch(() => {});
      } else {
        Promise.resolve(this.bot.placeBlock(reference, face)).catch(() => {});
      }
    } catch (err) {
      vlog(`${this.label} 极速发包失败: ${err.message}`);
      return false;
    }
    return true;
  }

  // 爆发前先瞬移到本区块中心并等一个物理 tick：
  // 整块都在中心 23 格以内，既满足服务端的位置校验，又不用逐块移动
  async prepareFastPosition(cells) {
    if (!cells.length) return;
    // 站到本区块第一格 z-1 的地毯上（不悬空），然后整块连发
    await this.standForPlacement(this.coordinator.worldPos(cells[0]));
  }

  // 把已经在世界里出现的方块同步进进度/俯视图，返回仍然缺失的数量
  markPresentCells(cells) {
    let missing = 0;
    for (const cell of cells) {
      if (this.coordinator.isPlaced(cell)) continue;
      const block = this.bot.blockAt(this.coordinator.worldPos(cell));
      if (block && block.name !== 'air') this.markPlaced(cell);
      else missing++;
    }
    return missing;
  }

  // 等服务器把方块更新发回来（最多 timeoutMs），返回还没放上的数量
  async waitForChunkBlocks(cells, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let missing = this.markPresentCells(cells);
    let lastMissing = missing;
    let stalled = 0;
    while (missing > 0 && this.isBusy && Date.now() < deadline) {
      await sleep(150);
      missing = this.markPresentCells(cells);
      // 连续 600ms 没有新方块被确认，说明剩下的放不上去了，别干等满超时
      if (missing >= lastMissing) {
        stalled++;
        if (stalled >= 4) break;
      } else {
        stalled = 0;
      }
      lastMissing = missing;
    }
    return missing;
  }

  // 根据漏放率自动调整爆发间隔：漏得多就放慢，几乎不漏就加速
  adaptBurstInterval(missingRatio) {
    if (!this.settings.adaptiveBurst) return;
    const before = this.burstIntervalMs;
    if (missingRatio > 0.15) {
      this.burstIntervalMs = Math.min(500, Math.round(this.burstIntervalMs * 1.5) + 10);
    } else if (missingRatio < 0.02) {
      this.burstIntervalMs = Math.max(0, Math.round(this.burstIntervalMs * 0.8) - 5);
    }
    if (this.burstIntervalMs !== before) {
      log(`${this.label} 爆发间隔自动调整为 ${this.burstIntervalMs}ms（上区块漏放率 ${(missingRatio * 100).toFixed(1)}%）`);
    }
  }

  /**
   * 分段瞬移：服务器的瞬移有距离上限（X/Z 每次最多 32 格、Y 每次最多 9 格），
   * 超过就会被拒绝。所以这里先分步把 Y 调到位，再分步调 X/Z，每步之间留 delay。
   */
  async teleportPosition(targetX, targetY, targetZ) {
    const pos = this.bot.entity.position;

    // 1) 先调 Y（每步最多 9 格）
    while (Math.abs(targetY - pos.y) > 0.01) {
      const step = Math.max(-this.settings.teleportStepY, Math.min(this.settings.teleportStepY, targetY - pos.y));
      pos.y += step;
      // 整段 ≤9 格一次到位 → 不等；走满 9 格（需要分段）→ 每段等 10ms
      if (Math.abs(step) >= this.settings.teleportStepY - 0.001) {
        await sleep(this.settings.teleportStepDelayMs);
      }
    }

    // 2) 再调 X/Z（每步最多 32 格）
    while (Math.abs(targetX - pos.x) > 0.01 || Math.abs(targetZ - pos.z) > 0.01) {
      const dx = Math.max(-this.settings.teleportStepXZ, Math.min(this.settings.teleportStepXZ, targetX - pos.x));
      const dz = Math.max(-this.settings.teleportStepXZ, Math.min(this.settings.teleportStepXZ, targetZ - pos.z));
      pos.x += dx;
      pos.z += dz;
      // 整段 ≤32 格一次到位 → 不等；走满 32 格（需要分段）→ 每段等 10ms
      if (Math.abs(dx) >= this.settings.teleportStepXZ - 0.001
        || Math.abs(dz) >= this.settings.teleportStepXZ - 0.001) {
        await sleep(this.settings.teleportStepDelayMs);
      }
    }

  }

  // 找落脚点：优先站在目标方块 z-1 那一格（下一层/已建好的地毯表面），
  // 没有地面就试 z+1；返回精确的落脚坐标 { x, y, z } 或 null
  findStandSpot(worldPos) {
    // 地毯高 1/16 格，其它方块按整格算
    const blockTop = (block, baseY) => {
      if (!block || block.name === 'air') return null;
      return baseY + (block.name.endsWith('_carpet') ? 0.0625 : 1);
    };
    for (const dz of [-1, 1]) {
      const z = worldPos.z + dz;
      const hereTop = blockTop(this.bot.blockAt(new Vec3(worldPos.x, worldPos.y, z)), worldPos.y);       // 本层已铺好的一排
      if (hereTop != null) return { x: worldPos.x, y: hereTop, z };
      const belowTop = blockTop(this.bot.blockAt(new Vec3(worldPos.x, worldPos.y - 1, z)), worldPos.y - 1); // 下一层的方块
      if (belowTop != null) return { x: worldPos.x, y: belowTop, z };
    }
    return null;
  }

  // 站到地面上准备放置（不悬空）。找不到落脚点时才退回短暂的悬空方式。
  async standForPlacement(worldPos) {
    // 光边：站在光边方块正上方一格（X/Z 保持不变），悬空从上往下放
    if (this.currentJobPhase === 'edge') {
      this.setFlying(true);
      await this.teleportPosition(worldPos.x + 0.5, worldPos.y + 1, worldPos.z + 0.5);
      await sleep(this.settings.standWaitMs);
      if (this.settings.edgePlaceDelayMs > 0) await sleep(this.settings.edgePlaceDelayMs);
      return true;
    }

    // 普通地图画：站在 z-1 那一格已建好的地毯上（落地）
    const spot = this.settings.standOnGround ? this.findStandSpot(worldPos) : null;
    const travelY = worldPos.y + 1;   // 移动高度比方块高一格，这一层没有方块，水平瞬移不会卡住
    const finalX = spot ? spot.x + 0.5 : worldPos.x + 0.5;
    const finalZ = spot ? spot.z + 0.5 : worldPos.z + 0.5;
    const finalY = spot ? spot.y + 0.02 : travelY;

    // 瞬移过程中保持悬空，避免被重力拉走导致分段瞬移的 Y 又跑偏
    this.setFlying(true);
    await this.teleportPosition(finalX, travelY, finalZ);   // 先到安全高度，再水平移动
    await this.teleportPosition(finalX, finalY, finalZ);    // 最后落到站位高度

    if (spot) {
      this.setFlying(false);   // 有地面就落地站稳
    } else {
      vlog(`${this.label} 目标 (${worldPos.x},${worldPos.y},${worldPos.z}) 附近没有地面，临时悬空放置`);
    }
    await sleep(this.settings.standWaitMs);
    // 光边放得更慢更稳
    if (this.currentJobPhase === 'edge' && this.settings.edgePlaceDelayMs > 0) {
      await sleep(this.settings.edgePlaceDelayMs);
    }
    return !!spot;
  }

  // 判断机器人是不是站在目标方块旁边（按服务器的放置距离算：
  // 眼睛到参考方块中心的距离），不在旁边就放不过去
  isNextToBlock(worldPos) {
    const pos = this.bot.entity.position;
    const dx = worldPos.x + 0.5 - pos.x;
    const dy = worldPos.y - 0.5 - (pos.y + 1.62);   // 参考方块在目标方块下方一格
    const dz = worldPos.z + 0.5 - pos.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) <= this.settings.placeReach;
  }

  // 不在旁边就移动到旁边（站到 z-1 那格已建好的地毯上）
  async ensureNextToBlock(worldPos) {
    if (this.isNextToBlock(worldPos)) return true;
    await this.standForPlacement(worldPos);
    if (!this.isNextToBlock(worldPos)) {
      vlog(`${this.label} 无法站到 (${worldPos.x},${worldPos.y},${worldPos.z}) 旁边，跳过这个方块`);
      return false;
    }
    return true;
  }

  markPlaced(cell) {
    if (this.coordinator.markPlaced(cell, this.index)) {
      this.coordinator.setCurrentBlock(this.index, cell);
    }
  }

  /* ---------- 寻路 / 背包 ---------- */

  findItem(name) {
    return this.bot.inventory.items().find((item) => item.name === name);
  }

  countInventory(name) {
    return this.bot.inventory.items()
      .filter((item) => item.name === name)
      .reduce((sum, item) => sum + item.count, 0);
  }

  async equipItem(item) {
    // 物品已经在快捷栏里时，equip 只是切换选中栏位，不需要等待；
    // 只有真的从背包搬物品才等一下
    const fromHotbar = item.slot >= 36 && item.slot < 45;
    await this.bot.equip(item, 'hand');
    if (!fromHotbar) await sleep(this.settings.takeItemDelayMs);
  }

  // 快捷栏里这种材料的槽位（0~8），没有返回 null
  findHotbarSlot(name) {
    for (let slot = 0; slot < 9; slot++) {
      const item = this.bot.inventory.slots[36 + slot];
      if (item && item.name === name && item.count > 0) return slot;
    }
    return null;
  }

  // 把背包里这种材料的整组尽量搬进空的快捷栏格（最多 9 格），
  // 这样以后换这一种材料就不用再动背包，拿取次数最少。
  async fillHotbarWith(name) {
    let moved = 0;
    for (let slot = 0; slot < 9; slot++) {
      if (this.bot.inventory.slots[36 + slot]) continue;   // 这一格已经有东西
      const item = this.bot.inventory.items()
        .find((slotItem) => slotItem.name === name && slotItem.slot >= 9 && slotItem.slot < 36);
      if (!item) break;
      try {
        await this.bot.moveSlotItem(item.slot, 36 + slot);
        moved++;
        await sleep(this.settings.takeItemDelayMs);        // 拿完物品后等 50ms
      } catch (err) {
        vlog(`${this.label} 把 ${name} 放进快捷栏失败: ${err.message}`);
        break;
      }
    }
    if (moved > 0) vlog(`${this.label} 把 ${moved} 组 ${name} 放进快捷栏`);
    return moved;
  }

  /* ---------- 生命周期 ---------- */

  handleDisconnect(reason) {
    if (this.stopped || !this.alive) return;
    this.alive = false;
    this.stopped = true;
    this.coordinator.onWorkerDown(this.index, reason);
  }

  stop() {
    this.stopped = true;
    this.alive = false;
    this.setFlying(false);
    if (this.hungerTimer) {
      clearInterval(this.hungerTimer);
      this.hungerTimer = null;
    }
    if (this.bot) {
      try {
        this.bot.quit();
      } catch (err) {
        // 忽略退出时的错误
      }
    }
  }
}

/* ============================================================
 * 六、双机器人协调器
 * ============================================================ */

/**
 * BuildCoordinator 负责：
 *   - 解析投影、分区、维护进度与俯视建造图；
 *   - 创建两个 BotWorker 并行搭建；
 *   - 某个机器人掉线时把它没做完的区块交给另一个机器人。
 */
class BuildCoordinator {
  constructor({ usernames, schematic, startPos, connection = {}, settings = {}, callbacks = {} }) {
    this.usernames = usernames;
    this.schematicInput = schematic;
    this.startPos = new Vec3(startPos.x, startPos.y, startPos.z);
    this.callbacks = callbacks;
    this.settings = { ...SETTINGS, ...settings };

    this.connection = {
      host: connection.host || this.settings.host,
      port: connection.port || this.settings.port,
      version: connection.version || this.settings.version,
      auth: connection.auth || this.settings.auth,
    };

    this.started = false;
    this.stopped = false;
    this.status = 'idle';
    this.startTime = null;
    this.progressTimer = null;

    this.plan = null;
    this.view = null;
    this.workers = [];
    this.edgeQueue = [];
    this.colorQueue = [];
    this.edgeTotal = 0;
    this.edgeDone = 0;
    this.edgePhaseDone = true;
    this.failedChunks = [];
    this.workerAlive = [false, false];
    this.workerStates = [];
    this.anyWorkerConnected = false;
    this.completedBlocks = 0;
    this.currentRegion = '[0,0]';
    this.currentBlockInfo = 'X: 0, Y: 0, Z: 0, 方块: none';
  }

  /* ---------- 生命周期 ---------- */

  async start() {
    if (this.started) throw new Error('该建造会话已经启动');
    this.started = true;
    this.startTime = Date.now();
    this.status = 'connecting';

    const ready = await this.preparePlan();
    if (!ready || this.stopped) return;

    this.emitStatus('connecting', '正在连接两个机器人账号...');
    this.workers = this.usernames.map((username, index) => new BotWorker({
      index,
      username,
      coordinator: this,
    }));

    if (this.stopped) return;
    // 1. 逐个连接机器人，中间留出间隔（服务器有连接限速）
    await this.connectWorkers();

    // 2. 两个机器人并行搭建（先光边，后地图画；每个机器人开始放置时才开飞行）
    if (!this.stopped) await Promise.all(this.workers.map((worker) => this.runWorker(worker)));
    await this.finish();
  }

  // 依次连接两个账号，中间等待 connectIntervalMs，避免"连接速度过快"被踢
  async connectWorkers() {
    for (let index = 0; index < this.workers.length; index++) {
      if (this.stopped) return;
      await this.connectWorker(this.workers[index]);

      const isLast = index === this.workers.length - 1;
      if (!isLast && !this.stopped && this.settings.connectIntervalMs > 0) {
        const seconds = (this.settings.connectIntervalMs / 1000).toFixed(
          this.settings.connectIntervalMs % 1000 === 0 ? 0 : 1
        );
        log(`等待 ${seconds} 秒后连接下一个账号...`);
        this.emitStatus('connecting', `等待 ${seconds} 秒后连接下一个账号...`);
        await sleep(this.settings.connectIntervalMs);
      }
    }
  }

  // 解析投影、生成建造计划与任务队列（光边单独一组）
  async preparePlan() {
    this.emitStatus('connecting', '正在解析投影文件...');
    const schematicData = await loadSchematic(this.schematicInput);
    if (this.stopped) return false;
    this.plan = analyzeSchematic(schematicData);
    if (!this.plan.totalBlocks) throw new Error('投影文件中没有需要放置的方块');

    this.view = buildMapView(this.plan);
    const { edgeJobs, colorJobs, colorStats } = planJobs(
      this.plan,
      this.settings.regionSize,
      this.settings.edgeBlock,
      this.settings.colorBatchSize
    );
    this.edgeQueue = edgeJobs.slice();
    this.colorQueue = colorJobs.slice();
    this.edgeTotal = edgeJobs.length;
    this.edgeDone = 0;
    this.edgePhaseDone = this.edgeTotal === 0;
    this.blockFlags = new Uint8Array(this.plan.cells.length);
    this.viewPlaced = new Uint8Array(this.view.viewWidth * this.view.viewHeight);
    this.workerAlive = [true, true];
    this.workerStates = this.usernames.map((username) => ({ username, state: '准备中' }));

    log(`投影解析完成：${this.plan.totalBlocks} 个方块`);
    log(`施工顺序：先光边（${edgeJobs.length} 批），再按颜色分 ${colorJobs.length} 批（每批最多 ${this.settings.colorBatchSize} 格）`);
    log(`材料统计：${colorStats.map((item) => `${item.name} ${item.count}`).join('，')}`);
    if (this.edgeTotal) {
      log(`光边（${this.settings.edgeBlock}）共 ${this.plan.materials[this.settings.edgeBlock] || 0} 个方块，将优先搭建`);
    }

    this.emitBots();
    this.emitMap();
    this.emitProgress(true);
    return true;
  }

  async connectWorker(worker) {
    try {
      await worker.connect();
    } catch (err) {
      log(`${worker.label} 连接失败: ${err.message}`);
      this.onWorkerDown(worker.index, `连接失败: ${err.message}`);
      worker.stop();
      return false;
    }

    this.anyWorkerConnected = true;
    this.emitStatus('building', `${worker.label} 已连接`);
    return true;
  }

  async runWorker(worker) {
    if (!worker.alive || worker.stopped) return;
    try {
      await worker.run();
    } catch (err) {
      log(`${worker.label} 运行异常: ${err.message}`);
      this.onWorkerDown(worker.index, `运行异常: ${err.message}`);
    }
  }

  async finish() {
    // 收尾：如果还有遗漏方块，让仍在线的机器人补一轮
    if (!this.stopped) {
      const missing = this.plan.cells.filter((cell) => !this.blockFlags[cell.id]);
      const aliveWorkers = this.workers.filter((worker) => worker.alive && !worker.stopped);
      if (missing.length && aliveWorkers.length) {
        log(`收尾检查：仍有 ${missing.length} 个方块未完成，尝试补建`);
        // 把遗漏方块重新切成任务，分给还在线的机器人补建
        const repair = planJobs(
          { ...this.plan, cells: missing },
          this.settings.regionSize,
          this.settings.edgeBlock,
          this.settings.colorBatchSize
        );
        const repairJobs = [...repair.edgeJobs, ...repair.colorJobs];
        await Promise.all(aliveWorkers.map(async (worker, workerOffset) => {
          for (let index = workerOffset; index < repairJobs.length; index += aliveWorkers.length) {
            if (this.stopped || !worker.alive) break;
            try {
              await worker.processJob(repairJobs[index]);
            } catch (err) {
              log(`${worker.label} 补建 ${jobLabel(repairJobs[index])} 失败: ${err.message}`);
            }
          }
        }));
      }
    }

    const leftover = this.plan.cells.filter((cell) => !this.blockFlags[cell.id]).length;
    this.workers.forEach((worker) => worker.stop());
    this.emitProgress(true);
    this.emitMap();
    this.emitBots();

    if (this.stopped) return;

    if (leftover === 0) {
      this.status = 'done';
      this.emitStatus('done', '建造完成');
      notifier.notify({
        appID: 'PaintingBot',
        icon: path.join(__dirname, 'success.png'),
        title: '建造完成',
        message: ' ',
        sound: true,
      });
    } else if (!this.anyWorkerConnected) {
      this.status = 'error';
      this.emitStatus('error', '两个机器人都未能连接，搭建未开始');
    } else {
      this.status = 'done';
      this.emitStatus('done', `搭建结束，仍有 ${leftover} 个方块未完成`);
    }
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.status = 'stopped';
    this.workerStates.forEach((state) => { state.state = '已停止'; });
    this.workers.forEach((worker) => worker.stop());
    this.emitStatus('stopped', '已停止搭建');
    this.emitProgress(true);
    this.emitBots();
  }

  /* ---------- 任务队列 ---------- */

  takeJob() {
    // 光边优先：两个机器人一起先把光边整条造完
    if (this.edgeQueue.length) return this.edgeQueue.shift();
    if (!this.edgePhaseDone) return null;
    // 之后是按颜色的批次任务，两个机器人共享同一个队列
    return this.colorQueue.length ? this.colorQueue.shift() : null;
  }

  requeueJob(job) {
    if (this.stopped) return;
    job.attempts = (job.attempts || 0) + 1;
    if (job.attempts > this.settings.chunkRetries) {
      log(`${jobLabel(job)} 批次连续失败 ${job.attempts - 1} 次，跳过（交给收尾补建）`);
      this.failedChunks.push(job);
      // 光边如果彻底失败也要放行，否则后面会一直卡在等待阶段
      if (job.phase === 'edge') this.completeEdgeChunk();
      return;
    }
    if (job.phase === 'edge') this.edgeQueue.push(job);
    else this.colorQueue.push(job);
  }

  // 光边阶段是否还没结束（没结束时机器人只等待，不去拿地毯材料）
  isEdgePhasePending() {
    return !this.edgePhaseDone;
  }

  onJobFinished(job) {
    if (job.phase === 'edge') this.completeEdgeChunk();
  }

  completeEdgeChunk() {
    this.edgeDone++;
    if (!this.edgePhaseDone && this.edgeDone >= this.edgeTotal) {
      this.edgePhaseDone = true;
      log('光边搭建完成，开始搭建地图画');
      this.emitStatus('building', '光边搭建完成，开始取材料搭建地图画');
    }
  }

  onWorkerDown(index, reason) {
    if (this.stopped) return;
    this.workerAlive[index] = false;
    this.updateBotState(index, reason);

    const worker = this.workers[index];
    if (worker && worker.currentChunk) {
      const chunk = worker.currentChunk;
      worker.currentChunk = null;
      this.requeueJob(chunk);
    }

    const other = 1 - index;
    if (this.workerAlive[other]) {
      this.emitStatus('building', `机器人${index + 1} ${reason}，剩余任务交给机器人${other + 1}`);
    } else {
      this.emitStatus('error', `两个机器人都已断开：${reason}`);
    }
  }

  /* ---------- 进度 / 俯视图 ---------- */

  markPlaced(cell, workerIndex) {
    if (this.blockFlags[cell.id]) return false;
    this.blockFlags[cell.id] = 1;
    this.completedBlocks++;

    const viewIndex = (cell.z - this.view.minZ) * this.view.viewWidth + (cell.x - this.view.minX);
    if (!this.viewPlaced[viewIndex]) {
      this.viewPlaced[viewIndex] = 1;
      if (typeof this.callbacks.onCell === 'function') {
        this.callbacks.onCell({ x: cell.x, z: cell.z, block: cell.name, worker: workerIndex });
      }
    }

    if (this.completedBlocks % 200 === 0) {
      log(`进度 ${this.completedBlocks}/${this.plan.totalBlocks}（${(this.completedBlocks / this.plan.totalBlocks * 100).toFixed(1)}%）`);
    }
    this.emitProgress();
    return true;
  }

  isPlaced(cell) {
    return !!this.blockFlags[cell.id];
  }

  worldPos(cell) {
    return this.startPos.offset(cell.x, cell.y, cell.z);
  }

  setCurrentRegion(workerIndex, region) {
    this.currentRegion = `${workerIndex + 1}号 ${region}`;
  }

  setCurrentBlock(workerIndex, cell) {
    const worldPos = this.worldPos(cell);
    this.currentBlockInfo = `X: ${worldPos.x}, Y: ${worldPos.y}, Z: ${worldPos.z}, 方块: ${cell.name}`;
  }

  getProgressState() {
    const totalBlocks = this.plan ? this.plan.totalBlocks : 0;
    const completedBlocks = this.completedBlocks;
    const progress = totalBlocks > 0 ? (completedBlocks / totalBlocks) * 100 : 0;

    let remainingSeconds = null;
    if (this.startTime && completedBlocks > 0 && progress < 100) {
      const elapsedSeconds = (Date.now() - this.startTime) / 1000;
      const estimatedTotalSeconds = elapsedSeconds / (completedBlocks / totalBlocks);
      remainingSeconds = Math.max(0, Math.round(estimatedTotalSeconds - elapsedSeconds));
    }

    return {
      completedBlocks,
      totalBlocks,
      progress,
      currentRegion: this.currentRegion,
      currentBlockInfo: this.currentBlockInfo,
      elapsedSeconds: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
      remainingSeconds,
      status: this.status,
      bots: this.getBotStates(),
    };
  }

  getBotStates() {
    return this.workerStates.map((state) => ({ ...state }));
  }

  getMapState() {
    if (!this.plan || !this.view) return null;
    return {
      viewWidth: this.view.viewWidth,
      viewHeight: this.view.viewHeight,
      minX: this.view.minX,
      minZ: this.view.minZ,
      legend: this.view.legend,
      plan: Buffer.from(this.view.planIndex).toString('base64'),
      placed: Buffer.from(this.viewPlaced).toString('base64'),
      totalBlocks: this.plan.totalBlocks,
      completedBlocks: this.completedBlocks,
    };
  }

  updateBotState(index, state) {
    if (!this.workerStates[index]) return;
    this.workerStates[index].state = state;
    this.emitBots();
  }

  emitProgress(force = false) {
    if (typeof this.callbacks.onProgress !== 'function') return;
    if (!this.plan) return;
    if (!force) {
      if (this.progressTimer) return;
      this.progressTimer = setTimeout(() => {
        this.progressTimer = null;
        this.emitProgress(true);
      }, 300);
      if (this.progressTimer.unref) this.progressTimer.unref();
      return;
    }
    this.callbacks.onProgress(this.getProgressState());
  }

  emitStatus(state, message) {
    if (typeof this.callbacks.onStatus === 'function') {
      this.callbacks.onStatus({ state, message });
    }
  }

  emitBots() {
    if (typeof this.callbacks.onBots === 'function') {
      this.callbacks.onBots(this.getBotStates());
    }
  }

  emitMap() {
    if (typeof this.callbacks.onMap !== 'function') return;
    const map = this.getMapState();
    if (map) this.callbacks.onMap(map);
  }
}

/* ============================================================
 * 七、模块导出
 * ============================================================ */

function createBuild(options) {
  return new BuildCoordinator(options);
}

module.exports = {
  SETTINGS,
  materialChests,
  loadSchematic,
  analyzeSchematic,
  planJobs,
  buildMapView,
  createBuild,
  BotWorker,
  BuildCoordinator,
};

// 直接运行本文件时给出提示（正式使用请启动网页控制台）
if (require.main === module) {
  console.log('地图画机器人请通过网页控制台启动：npm run web');
  console.log('然后访问 http://localhost:8080');
}
