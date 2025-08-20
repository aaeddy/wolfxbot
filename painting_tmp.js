const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const { GoalNear } = require('mineflayer-pathfinder').goals;
const fs = require('fs');
const { Schematic } = require('prismarine-schematic');
const { Vec3 } = require('vec3');
const inventoryViewer = require('mineflayer-web-inventory');

// Bot 配置
const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'paintingbot',
  version: '1.20.4',
  auth: 'offline'
});

// 重连配置
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 5000; // 5秒

bot.loadPlugin(pathfinder);

// 初始化 Web Inventory
inventoryViewer(bot);

// 初始化变量
let buildingIndex = 0; // 当前正在建造的大区块索引 (0-15)
let completedChunks = 0; // 已完成的大区块数量
const totalChunks = 16; // 总大区块数量
const totalBlocks = 128 * 128;
const chunkSize = 32;
const chunksPerRow = 128 / chunkSize;

// 材料箱坐标 (示例数据，需根据实际修改)
const materialChests = [
  { color: 'white', pos: new Vec3(109, -60, 18) },
  { color: 'purple', pos: new Vec3(108, -60, 18) },
  { color: 'orange', pos: new Vec3(107, -60, 18) },
  { color: 'magenta', pos: new Vec3(106, -60, 18) },
  { color: 'light_gray', pos: new Vec3(105, -60, 18) },
  { color: 'cyan', pos: new Vec3(104, -60, 18) },
  { color: 'light_blue', pos: new Vec3(103, -60, 18) },
  { color: 'lime', pos: new Vec3(102, -60, 18) },
  { color: 'green', pos: new Vec3(101, -60, 18) },
  { color: 'red', pos: new Vec3(100, -60, 18) },
  { color: 'yellow', pos: new Vec3(99, -60, 18) },
  { color: 'brown', pos: new Vec3(98, -60, 18) },
  { color: 'blue', pos: new Vec3(97, -60, 18) },
  { color: 'pink', pos: new Vec3(96, -60, 18) },
  { color: 'black', pos: new Vec3(95, -60, 18) },
  { color: 'gray', pos: new Vec3(94, -60, 18) }
];

// 建造平面起始坐标 (示例数据，需根据实际修改)
const buildStartPos = new Vec3(8, 32, 26);

// 获取指定颜色地毯的物品 ID
function getCarpetItemId(color) {
  const carpetMap = {
    white: 'white_carpet',
    orange: 'orange_carpet',
    magenta: 'magenta_carpet',
    light_blue: 'light_blue_carpet',
    yellow: 'yellow_carpet',
    lime: 'lime_carpet',
    pink: 'pink_carpet',
    gray: 'gray_carpet',
    light_gray: 'light_gray_carpet',
    cyan: 'cyan_carpet',
    purple: 'purple_carpet',
    blue: 'blue_carpet',
    brown: 'brown_carpet',
    green: 'green_carpet',
    red: 'red_carpet',
    black: 'black_carpet'
  };
  return carpetMap[color];
}

// 显示当前材料库存
function showInventoryStatus() {
  const carpets = {};
  for (const chest of materialChests) {
    const carpetId = getCarpetItemId(chest.color);
    const item = bot.inventory.items().find(item => item.name === carpetId);
    carpets[chest.color] = item ? item.count : 0;
  }
  
  console.log('当前材料库存:');
  for (const [color, count] of Object.entries(carpets)) {
    console.log(`  ${color}: ${count}`);
  }
  bot.chat(`/msg AEddyQWQ 当前材料库存: ${JSON.stringify(carpets)}`);
}

// 加载投影文件
async function loadSchematic(filePath) {
  try {
    const data = await fs.promises.readFile(filePath);
    return await Schematic.read(data);
  } catch (err) {
    console.error('加载投影文件失败:', err);
    throw err;
  }
}

// 计算第 n 个大区块的起始坐标
function getChunkStartPos(n) {
  const row = Math.floor(n / chunksPerRow);
  const col = n % chunksPerRow;
  return new Vec3(
    buildStartPos.x + col * chunkSize,
    buildStartPos.y,
    buildStartPos.z + row * chunkSize
  );
}

// 获取当前区块所需材料清单
function getMaterialsNeeded(n, schematic) {
  // 根据投影文件计算所需材料
  const materials = {};
  const startPos = getChunkStartPos(n);
  
  // 初始化材料计数
  for (const chest of materialChests) {
    materials[chest.color] = 0;
  }
  
  // 遍历大区块中的每个方块位置
  for (let dz = 0; dz < chunkSize; dz++) {
    for (let dx = 0; dx < chunkSize; dx++) {
      const x = startPos.x + dx;
      const y = startPos.y;
      const z = startPos.z + dz;
      
      // 获取投影文件中对应位置的方块
      const block = schematic.getBlock(new Vec3(x, y, z));
      if (block && block.name.includes('carpet')) {
        // 提取颜色信息
        const color = block.name.replace('_carpet', '');
        materials[color] = (materials[color] || 0) + 1;
      }
    }
  }
  
  return materials;
}

// 移动到指定位置附近
async function moveToPosition(pos, usePathfinder = true) {
  if (usePathfinder) {
    // 使用寻路功能
    const movements = new Movements(bot);
    bot.pathfinder.setMovements(movements);
    const goal = new GoalNear(pos.x, pos.y, pos.z, 1);
    try {
      await bot.pathfinder.goto(goal);
    } catch (err) {
      console.error(`移动到位置 ${pos.x}, ${pos.y}, ${pos.z} 失败:`, err);
      bot.chat(`/msg AEddyQWQ 移动到位置 ${pos.x}, ${pos.y}, ${pos.z} 失败`);
    }
  } else {
    // 直接移动到指定位置，不使用寻路
    await bot.chat(`/tp ${pos.x} ${pos.y} ${pos.z}`);
  }
}

// 打开箱子并拿取材料
async function fetchMaterials(materialsNeeded) {
  // 传送到材料区域
  await bot.chat(`/tp tmpbot2`);
  await new Promise(resolve => setTimeout(resolve, 3000)); // 等待传送
  
  for (const [color, count] of Object.entries(materialsNeeded)) {
    if (count <= 0) continue;
    
    // 查找对应颜色的箱子
    const chestInfo = materialChests.find(chest => chest.color === color);
    if (!chestInfo) {
      bot.chat(`/msg AEddyQWQ 未找到 ${color} 颜色地毯的木桶`);
      console.error(`未找到 ${color} 颜色地毯的木桶`)
      continue;
    }
    
    // 移动到木桶附近（z+1格上）
    const targetPos = new Vec3(chestInfo.pos.x, chestInfo.pos.y, chestInfo.pos.z + 1);
    await moveToPosition(targetPos);
    
    // 查找并打开木桶
    const chestBlock = bot.findBlock({
      matching: block => block.name === 'barrel',
      maxDistance: 5,
      point: chestInfo.pos
    });
    
    if (!chestBlock) {
      bot.chat(`/msg AEddyQWQ 未在指定位置找到木桶`);
      console.error(`未在指定位置找到木桶`);
      continue;
    }
    
    const chest = await bot.openChest(chestBlock);
    const carpetId = getCarpetItemId(color);
    
    // 拿取所需材料
    try {
      await chest.withdraw(carpetId, null, count);
      bot.chat(`/msg AEddyQWQ 已拿取 ${count} 个 ${color} 地毯`);
      console.log(`已拿取 ${count} 个 ${color} 地毯`);
    } catch (err) {
      bot.chat(`/msg AEddyQWQ 拿取 ${color} 地毯失败: ${err.message}`);
      console.error(`拿取 ${color} 地毯失败: ${err.message}`);
    }
    
    chest.close();
  }
  
  // 返回建造区域
  await bot.chat(`/tp tmpbot`);
  await new Promise(resolve => setTimeout(resolve, 3000)); // 等待传送
}

// 在指定位置放置方块
async function placeBlockAt(x, y, z, schematic) {
  // 获取投影文件中对应位置的方块
  const block = schematic.getBlock(new Vec3(x, y, z));
  if (!block || !block.name.includes('carpet')) {
    // 如果投影文件中该位置没有地毯，则不放置
    return;
  }
  
  // 提取颜色信息
  const color = block.name.replace('_carpet', '');
  const carpetId = getCarpetItemId(color);
  
  // 查找背包中对应颜色的地毯
  const carpetItem = bot.inventory.items().find(item => item.name === carpetId);
  if (!carpetItem) {
    bot.chat(`/msg AEddyQWQ 背包中没有 ${color} 地毯`);
    console.error(`背包中没有 ${color} 地毯`);
    return;
  }
  
  // 获取目标位置的方块
  const targetBlock = bot.blockAt(new Vec3(x, y, z));
  if (targetBlock && targetBlock.name !== 'air') {
    // 如果目标位置已有方块，则不需要放置
    return;
  }
  
  // 放置方块
  try {
    // 创建参考方块（脚下）
    const referenceBlock = bot.blockAt(new Vec3(x, y - 1, z));
    if (!referenceBlock || referenceBlock.name === 'air') {
      // 如果脚下没有方块，先放置一个临时方块作为参考
      // 这里简化处理，实际应用中可能需要更复杂的逻辑
      bot.chat(`/msg AEddyQWQ 无法在 ${x}, ${y}, ${z} 放置方块，缺少参考方块`);
      console.error(`无法在 ${x}, ${y}, ${z} 放置方块，缺少参考方块`);
      return;
    }
    
    await bot.placeBlock(referenceBlock, { x: 0, y: 1, z: 0 }, carpetItem);
  } catch (err) {
    bot.chat(`/msg AEddyQWQ 放置方块失败: ${err.message}`);
    console.error(`放置方块失败: ${err.message}`);
  }
}

// 建造单个大区块
async function buildChunk(n, schematic) {
  bot.chat(`/msg AEddyQWQ 开始建造大区块 ${n} (${completedChunks}/${totalChunks})`);
  console.log(`开始建造大区块 ${n} (${completedChunks}/${totalChunks})`);
  
  const startPos = getChunkStartPos(n);
  const materialsNeeded = getMaterialsNeeded(n, schematic);
  
  // 获取材料
  await fetchMaterials(materialsNeeded);
  
  // 显示材料库存状态
  showInventoryStatus();
  
  // 移动到建造区域起始位置
  await moveToPosition(startPos, false);
  
  // 遍历大区块中的每个方块位置
  for (let dz = 0; dz < chunkSize; dz++) {
    for (let dx = 0; dx < chunkSize; dx++) {
      const x = startPos.x + dx;
      const y = startPos.y;
      const z = startPos.z + dz;
      
      // 移动到目标位置
      const targetPos = new Vec3(x, y, z);
      await moveToPosition(targetPos, false);
      
      // 放置方块
      await placeBlockAt(x, y, z, schematic);
    }
  }
  
  // 设置传送点
  await bot.chat(`/tp tmpbot paintingbot`);
  bot.chat(`/msg AEddyQWQ 大区块 ${n} 建造完成`);
  console.log(`大区块 ${n} 建造完成`);
  
  // 更新完成区块计数
  completedChunks++;
  
  // 返回材料区域获取下一区块材料
  await bot.chat(`/res tp hpdth`);
  await new Promise(resolve => setTimeout(resolve, 3000)); // 等待传送
}

// 主建造循环
async function buildAllChunks(schematic) {
  for (let i = 0; i < 16; i++) {
    await buildChunk(i, schematic);
    
    // 等待一段时间确保传送完成
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  // 建造完成，退出服务器
  bot.chat('/msg AEddyQWQ 所有大区块建造完成，即将退出服务器');
  console.log('所有大区块建造完成，即将退出服务器');
  setTimeout(() => {
    bot.quit();
  }, 5000);
}

// Bot 事件监听
bot.on('spawn', async () => {
  bot.chat('/msg AEddyQWQ Bot 已上线，开始建造');
  console.log('Bot 已上线，开始建造');
  
  // 重置完成区块计数
  completedChunks = 0;
  
  // 加载投影文件
  const schematicPath = './projection.schem';
  try {
    const schematic = await loadSchematic(schematicPath);
    bot.chat(`/msg AEddyQWQ 成功加载投影文件: ${schematicPath}`);
    console.log(`成功加载投影文件: ${schematicPath}`);
    
    // 启动建造过程
    await buildAllChunks(schematic);
  } catch (err) {
    bot.chat(`/msg AEddyQWQ 加载投影文件失败: ${err.message}`);
    console.error(`加载投影文件失败: ${err.message}`);
    bot.quit();
  }
});

// 重连机制
bot.on('end', () => {
  console.log('Bot 已断开连接');
  if (reconnectAttempts < maxReconnectAttempts) {
    reconnectAttempts++;
    console.log(`尝试重连 (${reconnectAttempts}/${maxReconnectAttempts})...`);
    setTimeout(() => {
      // 重新创建bot实例
      const newBot = mineflayer.createBot({
        host: 'localhost',
        port: 25565,
        username: 'paintingbot',
        version: '1.20.4',
        auth: 'offline'
      });
      
      // 重新加载插件
      newBot.loadPlugin(pathfinder);
      inventoryViewer(newBot);
      
      // 重新绑定事件监听器
      newBot.on('spawn', async () => {
        newBot.chat('/msg AEddyQWQ Bot 已重新连接，继续建造');
        console.log('Bot 已重新连接，继续建造');
        
        // 重置完成区块计数
        completedChunks = 0;
        
        // 加载投影文件
        const schematicPath = './projection.schem';
        try {
          const schematic = await loadSchematic(schematicPath);
          newBot.chat(`/msg AEddyQWQ 成功加载投影文件: ${schematicPath}`);
          console.log(`成功加载投影文件: ${schematicPath}`);
          
          // 启动建造过程
          await buildAllChunks(schematic);
        } catch (err) {
          newBot.chat(`/msg AEddyQWQ 加载投影文件失败: ${err.message}`);
          console.error(`加载投影文件失败: ${err.message}`);
          newBot.quit();
        }
      });
      
      newBot.on('error', (err) => {
        console.log('Bot 发生错误:', err);
      });
      
      newBot.on('kicked', (reason) => {
        console.log('Bot 被踢出服务器:', reason);
      });
      
      newBot.on('end', () => {
        console.log('Bot 已断开连接');
      });
      
      // 更新全局bot引用
      bot = newBot;
    }, reconnectDelay);
  } else {
    console.log('达到最大重连次数，停止重连');
  }
});

bot.on('error', (err) => {
  console.log('Bot 发生错误:', err);
});

bot.on('kicked', (reason) => {
  console.log('Bot 被踢出服务器:', reason);
});