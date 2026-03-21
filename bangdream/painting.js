const mineflayer = require('mineflayer');
const fs = require('fs').promises;
const { Schematic } = require('prismarine-schematic');
const { Vec3 } = require('vec3');
const notifier = require('node-notifier');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');
const inventoryViewer = require('mineflayer-web-inventory');

// 全局变量用于进度条
let totalBlocks = 0;
let completedBlocks = 0;
let startTime = null;
let currentRegion = '[0,0]';
let currentBlockInfo = 'X: 0, Y: 0, Z: 0, 方块: none';
let progressBarDisplayed = false;
let lastProgress = -1;

let bot;

// 辅助函数：安全移动bot位置（每次最多移动1格）
async function moveBotPositionSafely(targetX, targetY, targetZ) {
  const currentX = bot.entity.position.x;
  const currentY = bot.entity.position.y;
  const currentZ = bot.entity.position.z;

  const deltaX = targetX - currentX;
  const deltaY = targetY - currentY;
  const deltaZ = targetZ - currentZ;

  const steps = Math.max(
    Math.ceil(Math.abs(deltaX)),
    Math.ceil(Math.abs(deltaY)),
    Math.ceil(Math.abs(deltaZ))
  );

  if (steps <= 1) {
    bot.entity.position.x = targetX;
    bot.entity.position.y = targetY;
    bot.entity.position.z = targetZ;
    return;
  }

  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    bot.entity.position.x = currentX + deltaX * progress;
    bot.entity.position.y = currentY + deltaY * progress;
    bot.entity.position.z = currentZ + deltaZ * progress;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

// 渲染进度条函数 - 固定显示在终端底部，与日志分离
function renderProgressBar() {
  if (!startTime || totalBlocks === 0) return;
  
  const progress = (completedBlocks / totalBlocks) * 100;
  
  // 获取终端尺寸
  const columns = process.stdout.columns || 120;
  const rows = process.stdout.rows || 30;
  
  // 计算已消耗时间
  const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
  const elapsedMinutes = Math.floor(elapsedTime / 60);
  const elapsedSeconds = Math.floor(elapsedTime % 60);
  const elapsedTimeStr = `${elapsedMinutes}m ${elapsedSeconds}s`;
  
  // 计算预估剩余时间
  let remainingTimeStr = '估算中...';
  if (completedBlocks > 0 && progress < 100) {
    const estimatedTotalTime = elapsedTime / (completedBlocks / totalBlocks);
    const remainingTime = estimatedTotalTime - elapsedTime;
    const remainingMinutes = Math.floor(remainingTime / 60);
    const remainingSeconds = Math.floor(remainingTime % 60);
    remainingTimeStr = `${remainingMinutes}m ${remainingSeconds}s`;
  }
  
  // 创建进度条
  const barLength = columns - 40; // 留出足够空间显示百分比
  const completedLength = Math.round((progress / 100) * barLength);
  const progressBar = '█'.repeat(completedLength) + '░'.repeat(barLength - completedLength);
  
  // 使用更可靠的终端控制方式
  // 1. 保存当前光标位置
  process.stdout.write('\x1b[s');
  
  // 2. 隐藏光标
  process.stdout.write('\x1b[?25l');
  
  // 3. 移动到屏幕底部的进度条区域
  process.stdout.write(`\x1b[${rows - 5};1H`);
  
  // 4. 清除进度条区域的5行
  for (let i = 0; i < 5; i++) {
    process.stdout.write(`\x1b[${rows - 5 + i};1H\x1b[2K`);
  }
  
  // 5. 重新定位到进度条起始位置
  process.stdout.write(`\x1b[${rows - 5};1H`);
  
  // 6. 输出进度信息
  process.stdout.write('='.repeat(columns) + '\n');
  process.stdout.write(`[${progressBar}] ${progress.toFixed(1)}%\n`);
  process.stdout.write(`方块进度: ${completedBlocks}/${totalBlocks} | 已用时间: ${elapsedTimeStr} | 剩余时间: ${remainingTimeStr}\n`);
  process.stdout.write(`当前区域: ${currentRegion} | 当前方块: ${currentBlockInfo}\n`);
  process.stdout.write('='.repeat(columns) + '\n');
  
  // 7. 恢复光标位置
  process.stdout.write('\x1b[u');
  
  // 8. 显示光标
  process.stdout.write('\x1b[?25h');
}

function createBot () {
  // Bot 配置
  bot = mineflayer.createBot({
    host: 'bangdream.lazyalienserver.top',
    port: 25565,
    username: 'Mutsumi',
    version: '1.21.7',
    auth: 'offline'
  });

  // 加载pathfinder插件
  bot.loadPlugin(pathfinder);

  // 初始化 Web Inventory
  inventoryViewer(bot);

  // 错误处理
  bot.on('error', (err) => {
    console.log('机器人发生错误:', err);
  });

  bot.on('kicked', (reason) => {
    console.log('机器人被踢出服务器:', reason);
  });

  // 断线重连
  bot.on('end', () => {
    console.log('机器人断线，5秒后尝试重连...');
    setTimeout(createBot, 5000);
  });

  // 机器人连接事件
  bot.on('spawn', async () => {
    console.log('机器人已连接到服务器');
    // 开启悬空状态
    bot.creative.startFlying()
    // 丢弃所有物品
    console.log('正在丢弃所有物品...');
    const items = bot.inventory.items();
    for (const item of items) {
      try {
        await bot.toss(item.type, null, item.count);
        console.log(`已丢弃 ${item.count}x ${item.name}`);
      } catch (err) {
        console.log(`丢弃 ${item.name} 失败: ${err.message}`);
      }
    }
    console.log('所有物品已丢弃');

    // 启动实时监控饥饿值
    monitorHunger();
    
    main();
  });

  // 添加更多调试信息
  bot.on('chat', (username, message) => {
    console.log(`${username}: ${message}`);
  });
}

// 建造平面起始坐标
const buildStartPos = new Vec3(4927, 28, 4927);

// 各颜色容器(木桶/箱子)的坐标信息
const materialChests = [
  { color: 'smooth_stone', pos: new Vec3(5027, 17, 4921), type: 'chest' },
  { color: 'white_carpet', pos: new Vec3(5044, 17, 4920), type: 'barrel' },
  { color: 'purple_carpet', pos: new Vec3(5043, 17, 4920), type: 'barrel' },
  { color: 'orange_carpet', pos: new Vec3(5042, 17, 4920), type: 'barrel' },
  { color: 'magenta_carpet', pos: new Vec3(5041, 17, 4920), type: 'barrel' },
  { color: 'light_gray_carpet', pos: new Vec3(5040, 17, 4920), type: 'barrel' },
  { color: 'cyan_carpet', pos: new Vec3(5039, 17, 4920), type: 'barrel' },
  { color: 'light_blue_carpet', pos: new Vec3(5038, 17, 4920), type: 'barrel' },
  { color: 'lime_carpet', pos: new Vec3(5037, 17, 4920), type: 'barrel' },
  { color: 'green_carpet', pos: new Vec3(5036, 17, 4920), type: 'barrel' },
  { color: 'red_carpet', pos: new Vec3(5035, 17, 4920), type: 'barrel' },
  { color: 'yellow_carpet', pos: new Vec3(5034, 17, 4920), type: 'barrel' },
  { color: 'brown_carpet', pos: new Vec3(5033, 17, 4920), type: 'barrel' },
  { color: 'blue_carpet', pos: new Vec3(5032, 17, 4920), type: 'barrel' },
  { color: 'pink_carpet', pos: new Vec3(5031, 17, 4920), type: 'barrel' },
  { color: 'black_carpet', pos: new Vec3(5030, 17, 4920), type: 'barrel' },
  { color: 'gray_carpet', pos: new Vec3(5029, 17, 4920), type: 'barrel' },
  { color: 'food', pos: new Vec3(5027, 18, 4921), type: 'chest', food: true }
];

// 加载投影文件
async function loadSchematic(filePath) {
  try {
    console.log(`尝试加载投影文件: ${filePath}`);
    const data = await fs.readFile(filePath);
    console.log(`文件大小: ${data.length} 字节`);

    // 读取.schem文件
    const schematic = await Schematic.read(data);

    // 检查schematic对象的属性
    console.log('Schematic object:', schematic);

    // 获取尺寸信息
    const width = schematic.width || schematic.size?.x || 0;
    const height = schematic.height || schematic.size?.y || 0;
    const length = schematic.length || schematic.size?.z || 0;

    console.log(`投影文件加载成功:`);
    console.log(`  宽度: ${width}`);
    console.log(`  高度: ${height}`);
    console.log(`  长度: ${length}`);

    return {
      schematic,
      width,
      height,
      length
    };
  } catch (err) {
    console.error('加载投影文件失败:', err);
    throw err;
  }
}

// 输出投影文件中的方块信息到txt文件（按区域划分）
async function outputBlockInfoByRegion(schematicData, outputPath) {
  console.log('开始分析投影文件中的方块信息并按区域划分...');
  let blockInfo = '';

  const { schematic, width, height, length } = schematicData;

  // 定义区域大小
  const regionSize = 32;
  const regionsX = Math.ceil(width / regionSize);
  const regionsZ = Math.ceil(length / regionSize);

  // 先处理光边
  let initialBlockCount = 0;
  blockInfo += '=== 光边 ===\n';

  outerLoop: for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        if (initialBlockCount >= 128) {
          break outerLoop;
        }

        const pos = new Vec3(x, y, z);
        const block = schematic.getBlock(pos);

        if (block && block.name !== 'air') {
          blockInfo += `坐标: (${x}, ${y}, ${z}), 方块类型: ${block.name}\n`;
          initialBlockCount++;
        }
      }
    }
  }

  blockInfo += `\n光边处理完成，实际处理了 ${initialBlockCount} 个非空气方块\n\n`;

  // 处理剩余的128x128区域，分为16个32x32的子区域
  blockInfo += '=== 16个32x32子区域信息 ===\n';

  // 遍历每个32x32区域
  for (let rz = 0; rz < regionsZ; rz++) {
    for (let rx = 0; rx < regionsX; rx++) {
      const startX = rx * regionSize;
      const startZ = rz * regionSize + 1;  // Z轴从1开始
      const endX = Math.min(startX + regionSize, width);
      const endZ = Math.min(startZ + regionSize, length + 1);  // 调整结束位置

      // 确保区域在有效范围内
      if (startZ < length) {
        // 计算该区域所需的材料数量
        const materialCount = {};

        // 遍历区域内的每个方块
        for (let y = 0; y < height; y++) {
          for (let z = startZ; z < endZ && z <= length - 1; z++) {  // 确保z不超过length-1
            for (let x = startX; x < endX; x++) {
              // 确保不超出投影文件的实际范围
              if (z <= length - 1) {  // 确保z不超过length-1
                const pos = new Vec3(x, y, z);
                const block = schematic.getBlock(pos);

                if (block && block.name !== 'air') {
                  // 统计材料数量
                  if (materialCount[block.name]) {
                    materialCount[block.name]++;
                  } else {
                    materialCount[block.name] = 1;
                  }
                }
              }
            }
          }
        }

        blockInfo += `\n区域 [${rx},${rz}]: X(${startX}-${endX - 1}), Z(${startZ}-${Math.min(endZ - 1, length - 1)})\n`;
        blockInfo += '所需材料:\n';

        // 输出材料数量
        for (const [blockName, count] of Object.entries(materialCount)) {
          blockInfo += `  ${blockName}: ${count} 个\n`;
        }

        // 遍历区域内的每个方块
        for (let y = 0; y < height; y++) {
          for (let z = startZ; z < endZ && z <= length - 1; z++) {  // 确保z不超过length-1
            for (let x = startX; x < endX; x++) {
              // 确保不超出投影文件的实际范围
              if (z <= length - 1) {  // 确保z不超过length-1
                const pos = new Vec3(x, y, z);
                const block = schematic.getBlock(pos);

                if (block && block.name !== 'air') {
                  blockInfo += `坐标: (${x}, ${y}, ${z}), 方块类型: ${block.name}\n`;
                }
              }
            }
          }
        }
      }
    }
  }

  // 写入文件
  await fs.writeFile(outputPath, blockInfo);
  console.log(`区域方块信息已输出到 ${outputPath}`);
}

// 检查并获取食物
async function checkAndFetchFood() {
  console.log('检查并获取食物...');

  // 查找食物容器
  const foodChestInfo = materialChests.find(chest => chest.food);
  if (!foodChestInfo) {
    console.log('未找到食物容器');
    return;
  }

  // 移动到食物容器附近
  const distance = bot.entity.position.distanceTo(foodChestInfo.pos);
  if (distance > 3) {  // 如果距离大于3格则移动到容器附近
    console.log(`玩家距离食物${foodChestInfo.type}过远 (${distance.toFixed(2)} 格)，移动到食物${foodChestInfo.type}附近: ${foodChestInfo.type} at (${foodChestInfo.pos.x}, ${foodChestInfo.pos.y}, ${foodChestInfo.pos.z})`);

    // 使用pathfinder移动到容器附近
    const goal = new GoalNear(foodChestInfo.pos.x, foodChestInfo.pos.y, foodChestInfo.pos.z, 2); // 移动到距离容器2格范围内

    // 使用Promise来处理pathfinder的移动
    await new Promise((resolve, reject) => {
      // 设置10秒超时
      const timeout = setTimeout(() => {
        bot.pathfinder.stop();
        console.log('移动超时');
        reject(new Error('移动超时'));
      }, 10000);

      // 监听移动完成事件
      bot.once('goal_reached', () => {
        clearTimeout(timeout);
        console.log('已成功移动到食物容器附近');
        resolve();
      });

      // 监听移动失败事件
      bot.once('path_update', (results) => {
        if (results.status === 'noPath') {
          clearTimeout(timeout);
          console.log('无法找到路径到食物容器');
          reject(new Error('无法找到路径到食物容器'));
        }
      });

      // 开始移动
      bot.pathfinder.setGoal(goal);
    }).catch(err => {
      console.log(`移动失败: ${err.message}`);
      return; // 移动失败则跳过
    });
  }

  // 打开食物容器并获取食物
  console.log(`从食物 ${foodChestInfo.type}中获取 golden_carrot`);

  // 查找容器方块
  const chestBlock = bot.blockAt(foodChestInfo.pos);
  if (!chestBlock) {
    console.log(`找不到食物${foodChestInfo.type}方块 at (${foodChestInfo.pos.x}, ${foodChestInfo.pos.y}, ${foodChestInfo.pos.z})`);
    return;
  }

  // 打开容器
  try {
    const chest = await bot.openContainer(chestBlock);

    // 查找食物
    const items = chest.containerItems().filter(item => item.name === 'golden_carrot');
    if (items.length === 0) {
      console.log(`${foodChestInfo.type}中没有找到 golden_carrot`);
      chest.close();
      return;
    }

    // 计算容器中该食物的总数量
    const totalCount = items.reduce((sum, item) => sum + item.count, 0);

    // 计算背包中已有的食物数量
    const inventoryItems = bot.inventory.items().filter(item => item.name === 'golden_carrot');
    const inventoryCount = inventoryItems.reduce((sum, item) => sum + item.count, 0);

    // 计算需要拿取或丢弃的食物数量，保持总数为64
    const targetTotalCount = 64;
    if (inventoryCount < targetTotalCount) {
      // 需要拿取食物
      const neededCount = targetTotalCount - inventoryCount;
      const availableCount = Math.min(totalCount, neededCount);
      
      // 从容器中拿取食物，处理超过64个的情况
      let remainingCount = availableCount;
      while (remainingCount > 0) {
        // 查找还有食物的槽位
        const item = chest.containerItems().find(item => item.name === 'golden_carrot' && item.count > 0);
        if (!item) {
          console.log(`无法找到足够的 golden_carrot，剩余需要 ${remainingCount} 个`);
          break;
        }

        // 计算本次拿取的数量（最多64个）
        const takeCount = Math.min(remainingCount, item.count, 64);

        // 从容器中拿取食物
        await chest.withdraw(item.type, null, takeCount);
        console.log(`成功从食物${foodChestInfo.type}中拿取 ${takeCount} 个 golden_carrot`);

        // 更新剩余需要拿取的数量
        remainingCount -= takeCount;
      }
    } else if (inventoryCount > targetTotalCount) {
      // 需要丢弃多余的食物
      const excessCount = inventoryCount - targetTotalCount;
      console.log(`背包中食物过多，需要丢弃 ${excessCount} 个 golden_carrot`);
      
      let remainingCount = excessCount;
      for (const item of inventoryItems) {
        if (remainingCount <= 0) break;
        
        const discardCount = Math.min(remainingCount, item.count);
        await bot.toss(item.type, null, discardCount);
        console.log(`已丢弃 ${discardCount} 个 golden_carrot`);
        remainingCount -= discardCount;
      }
    }

    // 关闭容器
    chest.close();

    // 等待一段时间确保食物获取完成
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (err) {
    console.log(`打开食物容器或拿取食物失败: ${err.message}`);
  }
}

// 自动进食直到饥饿值满
async function autoEat() {
  console.log('开始自动进食...');

  while (bot.food < 20) {
    // 查找背包中的食物
    const foodItem = bot.inventory.items().find(item => item.name === 'golden_carrot');
    if (!foodItem) {
      console.log('背包中没有食物');
      break;
    }

    try {
      // 装备食物
      await bot.equip(foodItem, 'hand');

      // 激活物品（进食）
      await bot.activateItem();

      console.log(`进食中... 当前饥饿值: ${bot.food}`);

      // 等待一段时间让进食生效
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.log(`进食失败: ${err.message}`);
      break;
    }
  }

  console.log(`自动进食完成，当前饥饿值: ${bot.food}`);
}

// 实时监控饥饿值并在需要时自动进食
async function monitorHunger() {
  console.log('开始实时监控饥饿值...');
  while (true) {
    // 检查当前饥饿值，如果低于15则自动进食
    if (bot.food < 15) {
      console.log(`当前饥饿值为 ${bot.food}，需要进食`);
      await autoEat();
    }
    
    // 每5秒检查一次
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// 从容器(木桶/箱子)中获取材料
async function getMaterialsFromChests(materialCount) {
  console.log('正在从容器(木桶/箱子)中获取建造所需材料...');

  // 传送到地毯机位置
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log('传送到地毯机位置...');
  let tpCommand1 = `/tp dth_fake`;
  console.log(`执行命令: ${tpCommand1}`);
  bot.chat(tpCommand1);

  // 等待传送完成
  console.log('等待5秒以确保传送完成...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 检查并获取食物
  await checkAndFetchFood();

  // 遍历所有需要的材料
  for (const [blockName, count] of Object.entries(materialCount)) {
    // 查找对应的容器
    let chestInfo = materialChests.find(chest => chest.color === blockName);

    // 如果没有找到精确匹配的容器，尝试查找去掉"_carpet"后缀的匹配
    if (!chestInfo && blockName.endsWith('_carpet')) {
      const baseColor = blockName.slice(0, -7); // 去掉"_carpet"后缀
      chestInfo = materialChests.find(chest => chest.color === baseColor);
    }

    if (chestInfo) {
      // 移动到容器附近
      const distance = bot.entity.position.distanceTo(chestInfo.pos);
      if (distance > 3) {  // 如果距离大于3格则移动到容器附近
        console.log(`玩家距离${chestInfo.type}过远 (${distance.toFixed(2)} 格)，移动到${chestInfo.type}附近: ${chestInfo.color} ${chestInfo.type} at (${chestInfo.pos.x}, ${chestInfo.pos.y}, ${chestInfo.pos.z})`);

        // 使用pathfinder移动到容器附近
        const goal = new GoalNear(chestInfo.pos.x, chestInfo.pos.y, chestInfo.pos.z, 2); // 移动到距离容器2格范围内

        // 使用Promise来处理pathfinder的移动
        await new Promise((resolve, reject) => {
          // 设置10秒超时
          const timeout = setTimeout(() => {
            bot.pathfinder.stop();
            console.log('移动超时');
            reject(new Error('移动超时'));
          }, 10000);

          // 监听移动完成事件
          bot.once('goal_reached', () => {
            clearTimeout(timeout);
            console.log('已成功移动到容器附近');
            resolve();
          });

          // 监听移动失败事件
          bot.once('path_update', (results) => {
            if (results.status === 'noPath') {
              clearTimeout(timeout);
              console.log('无法找到路径到容器');
              reject(new Error('无法找到路径到容器'));
            }
          });

          // 开始移动
          bot.pathfinder.setGoal(goal);
        }).catch(err => {
          console.log(`移动失败: ${err.message}`);
          return; // 移动失败则跳过这个容器
        });
      }

      // 打开容器并获取材料
      console.log(`从 ${chestInfo.color} ${chestInfo.type}中获取 ${count} 个 ${blockName}`);

      // 查找容器方块
      const chestBlock = bot.blockAt(chestInfo.pos);
      if (!chestBlock) {
        console.log(`找不到${chestInfo.type}方块 at (${chestInfo.pos.x}, ${chestInfo.pos.y}, ${chestInfo.pos.z})`);
        continue;
      }

      // 打开容器
      try {
        const chest = await bot.openContainer(chestBlock);

        // 查找需要的物品
        const items = chest.containerItems().filter(item => item.name === blockName);
        if (items.length === 0) {
          console.log(`${chestInfo.type}中没有找到 ${blockName}`);
          chest.close();
          
          // 对于地毯材料，即使初始容器没找到，也尝试从y+1和y+2容器获取
          if (blockName.includes('carpet') && !['smooth_stone', 'food'].includes(blockName)) {
            console.log(`尝试从y+1坐标的容器获取${blockName}...`);
            const yPlus1Pos = new Vec3(chestInfo.pos.x, chestInfo.pos.y + 1, chestInfo.pos.z);
            const yPlus1ChestBlock = bot.blockAt(yPlus1Pos);
            
            let remainingCount = count; // 初始需要的数量
            
            if (yPlus1ChestBlock && ['chest', 'barrel'].includes(yPlus1ChestBlock.name)) {
              try {
                const yPlus1Chest = await bot.openContainer(yPlus1ChestBlock);
                const yPlus1Items = yPlus1Chest.containerItems().filter(item => item.name === blockName);
                const yPlus1Total = yPlus1Items.reduce((sum, item) => sum + item.count, 0);
                
                if (yPlus1Total > 0) {
                  while (remainingCount > 0) {
                    const item = yPlus1Chest.containerItems().find(i => i.name === blockName && i.count > 0);
                    if (!item) break;
                    
                    const takeCount = Math.min(remainingCount, item.count, 64);
                    await yPlus1Chest.withdraw(item.type, null, takeCount);
                    console.log(`从y+1容器成功拿取 ${takeCount} 个 ${blockName}`);
                    remainingCount -= takeCount;
                  }
                  yPlus1Chest.close();
                  if (remainingCount <= 0) continue; // 成功获取足够材料
                } else {
                  console.log(`y+1容器中没有找到 ${blockName}`);
                  yPlus1Chest.close();
                  
                  // 尝试从y+2坐标的容器获取
                  console.log(`尝试从y+2坐标的容器获取${blockName}...`);
                  const yPlus2Pos = new Vec3(chestInfo.pos.x, chestInfo.pos.y + 2, chestInfo.pos.z);
                  const yPlus2ChestBlock = bot.blockAt(yPlus2Pos);
                  
                  if (yPlus2ChestBlock && ['chest', 'barrel'].includes(yPlus2ChestBlock.name)) {
                    try {
                      const yPlus2Chest = await bot.openContainer(yPlus2ChestBlock);
                      const yPlus2Items = yPlus2Chest.containerItems().filter(item => item.name === blockName);
                      const yPlus2Total = yPlus2Items.reduce((sum, item) => sum + item.count, 0);
                      
                      if (yPlus2Total > 0) {
                        while (remainingCount > 0) {
                          const item = yPlus2Chest.containerItems().find(i => i.name === blockName && i.count > 0);
                          if (!item) break;
                          
                          const takeCount = Math.min(remainingCount, item.count, 64);
                          await yPlus2Chest.withdraw(item.type, null, takeCount);
                          console.log(`从y+2容器成功拿取 ${takeCount} 个 ${blockName}`);
                          remainingCount -= takeCount;
                        }
                        yPlus2Chest.close();
                        if (remainingCount <= 0) continue;
                      } else {
                        console.log(`y+2容器中没有找到 ${blockName}`);
                        yPlus2Chest.close();
                      }
                    } catch (err) {
                      console.log(`打开y+2容器失败: ${err.message}`);
                    }
                  } else {
                    console.log(`y+2坐标(${yPlus2Pos.x},${yPlus2Pos.y},${yPlus2Pos.z})不存在有效容器`);
                  }
                }
              } catch (err) {
                console.log(`打开y+1容器失败: ${err.message}`);
              }
            } else {
              console.log(`y+1坐标(${yPlus1Pos.x},${yPlus1Pos.y},${yPlus1Pos.z})不存在有效容器`);
              
              // 尝试从y+2坐标的容器获取
              console.log(`尝试从y+2坐标的容器获取${blockName}...`);
              const yPlus2Pos = new Vec3(chestInfo.pos.x, chestInfo.pos.y + 2, chestInfo.pos.z);
              const yPlus2ChestBlock = bot.blockAt(yPlus2Pos);
              
              if (yPlus2ChestBlock && ['chest', 'barrel'].includes(yPlus2ChestBlock.name)) {
                try {
                  const yPlus2Chest = await bot.openContainer(yPlus2ChestBlock);
                  const yPlus2Items = yPlus2Chest.containerItems().filter(item => item.name === blockName);
                  const yPlus2Total = yPlus2Items.reduce((sum, item) => sum + item.count, 0);
                  
                  if (yPlus2Total > 0) {
                    while (remainingCount > 0) {
                      const item = yPlus2Chest.containerItems().find(i => i.name === blockName && i.count > 0);
                      if (!item) break;
                      
                      const takeCount = Math.min(remainingCount, item.count, 64);
                      await yPlus2Chest.withdraw(item.type, null, takeCount);
                      console.log(`从y+2容器成功拿取 ${takeCount} 个 ${blockName}`);
                      remainingCount -= takeCount;
                    }
                    yPlus2Chest.close();
                    if (remainingCount <= 0) continue;
                  } else {
                    console.log(`y+2容器中没有找到 ${blockName}`);
                    yPlus2Chest.close();
                  }
                } catch (err) {
                  console.log(`打开y+2容器失败: ${err.message}`);
                }
              } else {
                console.log(`y+2坐标(${yPlus2Pos.x},${yPlus2Pos.y},${yPlus2Pos.z})不存在有效容器`);
              }
            }
          }
          
          // 对于非地毯材料或上层容器也没有找到，跳过
          continue;
        }

        // 计算容器中该物品的总数量
        const totalCount = items.reduce((sum, item) => sum + item.count, 0);

        // 检查数量是否足够
        if (totalCount < count) {
          console.log(`${chestInfo.type}中 ${blockName} 数量不足，需要 ${count} 个，但只有 ${totalCount} 个`);
          chest.close();
          
          // 如果是地毯材料，尝试从y+1坐标的容器获取
          if (blockName.includes('carpet') && !['smooth_stone', 'food'].includes(blockName)) {
            console.log(`尝试从y+1坐标的容器获取${blockName}...`);
            const yPlus1Pos = new Vec3(chestInfo.pos.x, chestInfo.pos.y + 1, chestInfo.pos.z);
            const yPlus1ChestBlock = bot.blockAt(yPlus1Pos);
            
            if (yPlus1ChestBlock && ['chest', 'barrel'].includes(yPlus1ChestBlock.name)) {
              try {
                const yPlus1Chest = await bot.openContainer(yPlus1ChestBlock);
                const yPlus1Items = yPlus1Chest.containerItems().filter(item => item.name === blockName);
                const yPlus1Total = yPlus1Items.reduce((sum, item) => sum + item.count, 0);
                
                if (yPlus1Total > 0) {
                  let remainingCount = count - totalCount;
                  while (remainingCount > 0) {
                    const item = yPlus1Chest.containerItems().find(i => i.name === blockName && i.count > 0);
                    if (!item) break;
                    
                    const takeCount = Math.min(remainingCount, item.count, 64);
                    await yPlus1Chest.withdraw(item.type, null, takeCount);
                    console.log(`从y+1容器成功拿取 ${takeCount} 个 ${blockName}`);
                    remainingCount -= takeCount;
                  }
                  yPlus1Chest.close();
                  if (remainingCount <= 0) continue; // 成功获取足够材料
                } else {
                  console.log(`y+1容器中没有找到 ${blockName}`);
                  yPlus1Chest.close();
                  
                  // 尝试从y+2坐标的容器获取
                  console.log(`尝试从y+2坐标的容器获取${blockName}...`);
                  const yPlus2Pos = new Vec3(chestInfo.pos.x, chestInfo.pos.y + 2, chestInfo.pos.z);
                  const yPlus2ChestBlock = bot.blockAt(yPlus2Pos);
                  
                  if (yPlus2ChestBlock && ['chest', 'barrel'].includes(yPlus2ChestBlock.name)) {
                    try {
                      const yPlus2Chest = await bot.openContainer(yPlus2ChestBlock);
                      const yPlus2Items = yPlus2Chest.containerItems().filter(item => item.name === blockName);
                      const yPlus2Total = yPlus2Items.reduce((sum, item) => sum + item.count, 0);
                      
                      if (yPlus2Total > 0) {
                        while (remainingCount > 0) {
                          const item = yPlus2Chest.containerItems().find(i => i.name === blockName && i.count > 0);
                          if (!item) break;
                          
                          const takeCount = Math.min(remainingCount, item.count, 64);
                          await yPlus2Chest.withdraw(item.type, null, takeCount);
                          console.log(`从y+2容器成功拿取 ${takeCount} 个 ${blockName}`);
                          remainingCount -= takeCount;
                        }
                        yPlus2Chest.close();
                        if (remainingCount <= 0) continue;
                      } else {
                        console.log(`y+2容器中没有找到 ${blockName}`);
                        yPlus2Chest.close();
                      }
                    } catch (err) {
                      console.log(`打开y+2容器失败: ${err.message}`);
                    }
                  } else {
                    console.log(`y+2坐标(${yPlus2Pos.x},${yPlus2Pos.y},${yPlus2Pos.z})不存在有效容器`);
                  }
                }
              } catch (err) {
                console.log(`打开y+1容器失败: ${err.message}`);
              }
            } else {
              console.log(`y+1坐标(${yPlus1Pos.x},${yPlus1Pos.y},${yPlus1Pos.z})不存在有效容器`);
              
              // 尝试从y+2坐标的容器获取
              console.log(`尝试从y+2坐标的容器获取${blockName}...`);
              const yPlus2Pos = new Vec3(chestInfo.pos.x, chestInfo.pos.y + 2, chestInfo.pos.z);
              const yPlus2ChestBlock = bot.blockAt(yPlus2Pos);
              
              if (yPlus2ChestBlock && ['chest', 'barrel'].includes(yPlus2ChestBlock.name)) {
                try {
                  const yPlus2Chest = await bot.openContainer(yPlus2ChestBlock);
                  const yPlus2Items = yPlus2Chest.containerItems().filter(item => item.name === blockName);
                  const yPlus2Total = yPlus2Items.reduce((sum, item) => sum + item.count, 0);
                  
                  if (yPlus2Total > 0) {
                    while (remainingCount > 0) {
                      const item = yPlus2Chest.containerItems().find(i => i.name === blockName && i.count > 0);
                      if (!item) break;
                      
                      const takeCount = Math.min(remainingCount, item.count, 64);
                      await yPlus2Chest.withdraw(item.type, null, takeCount);
                      console.log(`从y+2容器成功拿取 ${takeCount} 个 ${blockName}`);
                      remainingCount -= takeCount;
                    }
                    yPlus2Chest.close();
                    if (remainingCount <= 0) continue;
                  } else {
                    console.log(`y+2容器中没有找到 ${blockName}`);
                    yPlus2Chest.close();
                  }
                } catch (err) {
                  console.log(`打开y+2容器失败: ${err.message}`);
                }
              } else {
                console.log(`y+2坐标(${yPlus2Pos.x},${yPlus2Pos.y},${yPlus2Pos.z})不存在有效容器`);
              }
            }
          }
          
          // 如果不是地毯材料或y+2容器也没有足够材料，跳过
          continue;
        }

        // 从容器中拿取物品，处理超过64个的情况
        let remainingCount = count;
        while (remainingCount > 0) {
          // 查找还有物品的槽位
          const item = chest.containerItems().find(item => item.name === blockName && item.count > 0);
          if (!item) {
            console.log(`无法找到足够的 ${blockName}，剩余需要 ${remainingCount} 个`);
            break;
          }

          // 计算本次拿取的数量（最多64个）
          const takeCount = Math.min(remainingCount, item.count, 64);

          // 从容器中拿取物品
          await chest.withdraw(item.type, null, takeCount);
          console.log(`成功从${chestInfo.type}中拿取 ${takeCount} 个 ${blockName}`);

          // 更新剩余需要拿取的数量
          remainingCount -= takeCount;
        }

        // 关闭容器
        chest.close();
      } catch (err) {
        console.log(`打开容器或拿取物品失败: ${err.message}`);
      }

      // 添加延迟以避免操作过快
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      console.log(`未找到 ${blockName} 对应的容器`);
    }
  }

  // 获取材料完成后传送回搭建平台
  console.log('获取材料完成，传送到搭建平台...');
  // 传送到搭建平台
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log('传送到搭建平台...');
  let tpCommand2 = `/tp ${buildStartPos.x + 1} ${buildStartPos.y + 0.0625} ${buildStartPos.z + 1}`;
  console.log(`执行命令: ${tpCommand2}`);
  bot.chat(tpCommand2);

  // 等待传送完成
  console.log('等待5秒以确保传送完成...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 等待一段时间确保材料获取完成
  console.log('等待5秒以确保材料获取完成...');
  await new Promise(resolve => setTimeout(resolve, 5000));
}

// 建造投影（按区域划分建造）
async function buildWithSetblockByRegion(schematicData, startPos) {
  console.log('开始按区域建造投影...');

  const { schematic, width, height, length } = schematicData;

  // 传送到地毯机位置
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log('传送到地毯机位置...');
  let tpCommand = `/tp dth_fake`;
  console.log(`执行命令: ${tpCommand}`);
  bot.chat(tpCommand);

  // 等待传送完成
  console.log('等待5秒以确保传送完成...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 检查并获取食物
  await checkAndFetchFood();

  // 先建造光边
  console.log('开始建造光边...');
  let initialBlockCount = 0;

  // 计算光边所需的材料数量
  const initialMaterialCount = {};

  outerLoopMaterial: for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        if (initialBlockCount >= 128) {
          break outerLoopMaterial;
        }

        const pos = new Vec3(x, y, z);
        const block = schematic.getBlock(pos);

        if (block && block.name !== 'air') {
          // 统计材料数量
          if (initialMaterialCount[block.name]) {
            initialMaterialCount[block.name]++;
          } else {
            initialMaterialCount[block.name] = 1;
          }
          initialBlockCount++;
        }
      }
    }
  }

  // 从容器(木桶/箱子)中获取光边所需的全部材料
  await getMaterialsFromChests(initialMaterialCount);

  // 重置计数器
  initialBlockCount = 0;

  outerLoop: for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        if (initialBlockCount >= 128) {
          break outerLoop;
        }

        const pos = new Vec3(x, y, z);
        const block = schematic.getBlock(pos);

        if (block && block.name !== 'air') {
          // 计算实际世界坐标
          const worldPos = new Vec3(
            startPos.x + x,
            startPos.y + y,
            startPos.z + z
          );
          // 更新区域和方块信息
          currentRegion = `[光边]`;
          currentBlockInfo = `X: ${worldPos.x}, Y: ${worldPos.y}, Z: ${worldPos.z}, 方块: ${block.name}`;

          // 移动到方块位置
          // bot.chat(`/tp ${(worldPos.x - 1) + 0.5} ${worldPos.y + 1} ${worldPos.z + 0.5}`);
          await moveBotPositionSafely((worldPos.x - 1) + 0.5, worldPos.y + 1, worldPos.z + 0.5);
      
        // 检查目标位置是否已存在方块
        const existingBlock = bot.blockAt(worldPos);
        if (existingBlock && existingBlock.name !== 'air') {
          console.log(`目标位置已存在方块: ${existingBlock.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})，跳过放置`);
          initialBlockCount++;
          completedBlocks++;
          renderProgressBar();
          continue;
        }
      
        // 使用正常的放置方块方式
        console.log(`放置方块: ${block.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
          // 获取要放置方块位置下方的方块作为参考方块
          const referenceBlock = bot.blockAt(worldPos.offset(0, -1, 0));

          // 检查bot是否站在要放置方块的位置上
          const botPos = bot.entity.position;
          if (Math.floor(botPos.x) === worldPos.x && Math.floor(botPos.y) === worldPos.y && Math.floor(botPos.z) === worldPos.z) {
            console.log('Bot站在要放置方块的位置上，需要执行 vclip 动作');
            // .vclip 1
            // bot.chat(`/tp ~ ${bot.entity.position.y + 1} ~`);
            bot.entity.position.y += 1;
            // 在悬空状态下放置其脚下方块
            console.log('在悬空状态下放置方块');
          }

          if (referenceBlock) {
            try {
              // 确保手中有正确的方块
              const blockItem = bot.inventory.items().find(item => item.name === block.name);
              if (blockItem) {
                await bot.equip(blockItem, 'hand');
                // 放置方块，使用(0, 1, 0)作为方向向量表示在参考方块上方放置
                await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
                initialBlockCount++;
                completedBlocks++;
                renderProgressBar();
                // 添加10ms延迟
                await new Promise(resolve => setTimeout(resolve, 10));
              } else {
                console.log(`背包中没有找到方块: ${block.name}`);
              }
            } catch (err) {
              let attempts = 0;
              const maxAttempts = 3; // 最多尝试3次
              while (attempts < maxAttempts) {
                attempts++;
                console.log(`放置方块失败: ${err.message}，尝试重新放置 (${attempts}/${maxAttempts}): ${block.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
                await new Promise(resolve => setTimeout(resolve, 500)); // 等待500ms后重试
                try {
                    // 重试前检查并确保手中有正确的方块
                    const blockItem = bot.inventory.items().find(item => item.name === block.name);
                    if (!blockItem) {
                      console.log(`背包中没有找到方块: ${block.name}，无法继续重试`);
                      break;
                    }
                    await bot.equip(blockItem, 'hand');
                    await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
                  let retryPlacedBlock = bot.blockAt(worldPos);
                  if (retryPlacedBlock && retryPlacedBlock.name !== 'air') {
                    console.log(`方块放置成功: ${retryPlacedBlock.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
                    initialBlockCount++;
                    completedBlocks++;
                    renderProgressBar();
                    break;
                  }
                } catch (retryErr) {
                  if (attempts >= maxAttempts) {
                    console.log(`方块放置失败，已达到最大尝试次数: ${block.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
                  }
                }
              }
            }
          } else {
            console.log(`无法找到参考方块 at (${worldPos.x}, ${worldPos.y - 1}, ${worldPos.z})`);
          }
          initialBlockCount++;
        }
      }
    }
  }

  console.log(`光边建造完成，实际建造了 ${initialBlockCount} 个方块`);

  // 等待一段时间确保光边建造完成
  console.log('等待5秒以确保光边建造完成...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 定义区域大小
  const regionSize = 32;
  const regionsX = Math.ceil(width / regionSize);
  const regionsZ = Math.ceil(length / regionSize);

  // 按区域依次建造剩余部分
  for (let rz = 0; rz < regionsZ; rz++) {
    for (let rx = 0; rx < regionsX; rx++) {
      const startX = rx * regionSize + 1;  // X轴从1开始
      const startZ = rz * regionSize + 1;  // Z轴从1开始
      const endX = Math.min(startX + regionSize, width + 1); // 调整结束位置
      const endZ = Math.min(startZ + regionSize, length + 1);  // 调整结束位置

      // 确保区域在有效范围内
      if (startZ < length) {
        // 计算该区域所需的材料数量
        const materialCount = {};

        // 遍历区域内的每个方块
        for (let y = 0; y < height; y++) {
          for (let z = startZ; z < endZ && z <= length - 1; z++) {  // 确保z不超过length-1
            for (let x = startX; x < endX; x++) {
              // 确保不超出投影文件的实际范围
              if (z <= length - 1) {  // 确保z不超过length-1
                const pos = new Vec3(x, y, z);
                const block = schematic.getBlock(pos);

                if (block && block.name !== 'air') {
                  // 统计材料数量
                  if (materialCount[block.name]) {
                    materialCount[block.name]++;
                  } else {
                    materialCount[block.name] = 1;
                  }
                }
              }
            }
          }
        }

        console.log(`开始建造区域 [${rx},${rz}]: X(${startX}-${endX - 1}), Z(${startZ}-${Math.min(endZ - 1, length - 1)})`);

        // 从容器(木桶/箱子)中获取区域所需的全部材料
        await getMaterialsFromChests(materialCount);

        // 记录上一个z坐标
        let lastZ = -1;
        // 遍历区域内的每个方块
        for (let y = 0; y < height; y++) {
          for (let z = startZ; z < endZ && z <= length - 1; z++) {  // 确保z不超过length-1
            for (let x = startX; x < endX; x++) {
              // 确保不超出投影文件的实际范围
              if (z <= length - 1) {  // 确保z不超过length-1
                const botPos = bot.entity.position;
                const pos = new Vec3(x, y, z);
                const block = schematic.getBlock(pos);
                let wait = false;

                if (block && block.name !== 'air') {
                  // 计算实际世界坐标
                  const worldPos = new Vec3(
                    startPos.x + x,
                    startPos.y + y,
                    startPos.z + z
                  );
                  // 更新区域和方块信息
                  currentRegion = `[${rx},${rz}]`;
                  currentBlockInfo = `X: ${worldPos.x}, Y: ${worldPos.y}, Z: ${worldPos.z}, 方块: ${block.name}`;
                  // 检测是否跨区域移动
                  if ((worldPos.x - botPos.x > 30) || (worldPos.z - botPos.z > 30)) {
                    wait = true;
                  }
                  // 移动到方块位置
                  // bot.chat(`/tp ${worldPos.x + 0.5} ~ ~`);
                  await moveBotPositionSafely(worldPos.x + 0.5, bot.entity.position.y, worldPos.z + 0.5);
                  // 跨区域移动时需要等待
                  if (wait == true){
                    await new Promise(resolve => setTimeout(resolve, 200));
                    console.log('跨区域移动，x轴已移动，等待100ms移动');
                  }
                  // bot.chat(`/tp ~ ~ ${worldPos.z + 0.5}`);
                  bot.entity.position.z = worldPos.z + 0.5;
                  // 检查 z 是否变化
                  if (z !== lastZ) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                    lastZ = z; // 更新 lastZ
                  }

                  // 检查目标位置是否已存在方块
                  const existingBlock = bot.blockAt(worldPos);
                  if (existingBlock && existingBlock.name !== 'air') {
                    console.log(`目标位置已存在方块: ${existingBlock.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})，跳过放置`);
                    initialBlockCount++;
                    completedBlocks++;
                    renderProgressBar();
                    continue;
                  }

                  // 使用正常的放置方块方式
                  console.log(`放置方块: ${block.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
                  // 获取要放置方块位置下方的方块作为参考方块
                  const referenceBlock = bot.blockAt(worldPos.offset(0, -1, 0));

                  // 检查bot是否站在要放置方块的位置上
                  if (Math.floor(botPos.x) === worldPos.x && Math.floor(botPos.y) === worldPos.y - 1 && Math.floor(botPos.z) === worldPos.z) {
                    console.log('Bot站在要放置方块的位置上，需要执行 vclip 操作');
                    // .vclip 1
                    // bot.chat(`/tp ~ ${bot.entity.position.y + 1} ~`);
                    bot.entity.position.y += 1;
                    // 在悬空状态下放置其脚下方块
                    console.log('在悬空状态下放置方块');
                  }

                  if (referenceBlock) {
                    try {
                      // 确保手中有正确的方块
                      const blockItem = bot.inventory.items().find(item => item.name === block.name);
                      if (blockItem) {
                        await bot.equip(blockItem, 'hand');
                        // 放置方块，使用(0, 1, 0)作为方向向量表示在参考方块上方放置
                        await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
                        // 检查方块是否放置成功，如果没有则尝试重新放置
                        let placedBlock = bot.blockAt(worldPos);
                        if (placedBlock && placedBlock.name !== 'air') {
                          console.log(`方块放置成功: ${placedBlock.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
                          completedBlocks++;
                          renderProgressBar();
                        }
                      } else {
                        console.log(`背包中没有找到方块: ${block.name}`);
                      }
                    } catch (err) {
                      let attempts = 0;
                      const maxAttempts = 3; // 最多尝试3次
                      while (attempts < maxAttempts) {
                        attempts++;
                        console.log(`放置方块失败: ${err.message}，尝试重新放置 (${attempts}/${maxAttempts}): ${block.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
                        await new Promise(resolve => setTimeout(resolve, 500)); // 等待500ms后重试
                        try {
                            // 重试前检查并确保手中有正确的方块
                            const blockItem = bot.inventory.items().find(item => item.name === block.name);
                            if (!blockItem) {
                              console.log(`背包中没有找到方块: ${block.name}，无法继续重试`);
                              break;
                            }
                            await bot.equip(blockItem, 'hand');
                            await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
                          let retryPlacedBlock = bot.blockAt(worldPos);
                          if (retryPlacedBlock && retryPlacedBlock.name !== 'air') {
                            console.log(`方块放置成功: ${retryPlacedBlock.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
                            completedBlocks++;
                            renderProgressBar();
                            break;
                          }
                        } catch (retryErr) {
                          if (attempts >= maxAttempts) {
                            console.log(`方块放置失败，已达到最大尝试次数: ${block.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
                          }
                        }
                      }
                    }
                  } else {
                    console.log(`无法找到参考方块 at (${worldPos.x}, ${worldPos.y - 1}, ${worldPos.z})`);
                  }
                }
              }
            }
          }
        }
      }
      
      console.log(`区域 [${rx},${rz}] 建造完成，开始检查是否有遗漏方块...`);
      
      // 检查区域内是否有遗漏的方块
      const missingBlocks = await checkRegionForMissingBlocks(schematic, startPos, startX, endX, startZ, endZ, height);
      
      if (missingBlocks && Object.keys(missingBlocks).length > 0) {
        console.log('发现遗漏方块，开始计算所需材料...');
        
        // 计算所需材料数量
        const neededMaterials = {};
        for (const [posStr, blockName] of Object.entries(missingBlocks)) {
          neededMaterials[blockName] = (neededMaterials[blockName] || 0) + 1;
        }
        
        console.log('所需材料:', neededMaterials);
        
        // 传送到材料区域获取所需材料
        console.log('传送到材料区域获取所需材料...');
        let tpCommandMaterials = `/tp ${buildStartPos.x + 1} ${buildStartPos.y + 0.0625} ${buildStartPos.z + 1}`;
        console.log(`执行命令: ${tpCommandMaterials}`);
        bot.chat(tpCommandMaterials);
        
        // 等待传送完成
        console.log('等待5秒以确保传送完成...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 获取所需材料
        await getMaterialsFromChests(neededMaterials);
        
        // 等待传送完成
        console.log('等待5秒以确保传送完成...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 补全遗漏的方块
        console.log('开始补全遗漏的方块...');
        await fillMissingBlocks(missingBlocks, schematic, startPos);
        console.log('遗漏方块补全完成');
      } else {
        console.log('区域检查完成，没有发现遗漏方块');
      }
      
      console.log('传送到搭建平台...');
      let tpCommand3 = `/tp ${buildStartPos.x + 1} ${buildStartPos.y + 0.0625} ${buildStartPos.z + 1}`;
      console.log(`执行命令: ${tpCommand3}`);
      bot.chat(tpCommand3);

      // 等待传送完成
      console.log('等待5秒以确保传送完成...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // 丢弃所有非食物物品
      console.log('丢弃所有非食物物品...');
      const items = bot.inventory.items();
      for (const item of items) {
        // 保留食物物品（golden_carrot）
        if (item.name !== 'golden_carrot') {
          try {
            await bot.toss(item.type, null, item.count);
            console.log(`已丢弃 ${item.count}x ${item.name}`);
          } catch (err) {
            console.log(`丢弃 ${item.name} 失败: ${err.message}`);
          }
        }
      }
      console.log('非食物物品已丢弃');
    }
  }
}

// 检查区域内是否有遗漏的方块
async function checkRegionForMissingBlocks(schematic, startPos, startX, endX, startZ, endZ, height) {
  console.log(`开始检查区域: X(${startX}-${endX - 1}), Z(${startZ}-${endZ - 1})`);
  const missingBlocks = {};

  // 遍历区域内的每个方块
  for (let y = 0; y < height; y++) {
    for (let z = startZ; z < endZ; z++) {  // 确保z不超过length-1
      for (let x = startX; x < endX; x++) {
        const pos = new Vec3(x, y, z);
        const schematicBlock = schematic.getBlock(pos);
        
        if (schematicBlock && schematicBlock.name !== 'air') {
          // 计算实际世界坐标
          const worldPos = new Vec3(
            startPos.x + x,
            startPos.y + y,
            startPos.z + z
          );
          
          // 检查实际世界中该位置是否有方块
          const worldBlock = bot.blockAt(worldPos);
          
          if (!worldBlock || worldBlock.name === 'air') {
            // 记录遗漏的方块
            missingBlocks[`${worldPos.x},${worldPos.y},${worldPos.z}`] = schematicBlock.name;
            console.log(`发现遗漏方块: ${schematicBlock.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
          }
        }
      }
    }
  }
  
  console.log(`区域检查完成，共发现 ${Object.keys(missingBlocks).length} 个遗漏方块`);
  return missingBlocks;
}

// 补全遗漏的方块
async function fillMissingBlocks(missingBlocks, schematic, startPos) {
  for (const [posStr, blockName] of Object.entries(missingBlocks)) {
    const [x, y, z] = posStr.split(',').map(Number);
    const worldPos = new Vec3(x, y, z);
    
    console.log(`尝试补全方块: ${blockName} at (${x}, ${y}, ${z})`);
    
    // 移动到方块位置
    // bot.chat(`/tp ${x + 0.5} ~ ~`);
    bot.entity.position.x = x + 0.5;
    // bot.chat(`/tp ~ ~ ${z + 0.5}`);
    await moveBotPositionSafely(x + 0.5, bot.entity.position.y, z + 0.5);
    
    // 获取要放置方块位置下方的方块作为参考方块
    const referenceBlock = bot.blockAt(worldPos.offset(0, -1, 0));
    
    if (referenceBlock) {
      try {
        // 确保手中有正确的方块
        const blockItem = bot.inventory.items().find(item => item.name === blockName);
        if (blockItem) {
          await bot.equip(blockItem, 'hand');
          
          // 尝试放置方块
          let attempts = 0;
          const maxAttempts = 3;
          let placedSuccessfully = false;
          
          while (attempts < maxAttempts && !placedSuccessfully) {
            attempts++;
            try {
              await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
              
              // 检查是否放置成功
              const placedBlock = bot.blockAt(worldPos);
              if (placedBlock && placedBlock.name !== 'air') {
                console.log(`方块补全成功: ${placedBlock.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
                placedSuccessfully = true;
                completedBlocks++;
                renderProgressBar();
              }
              await new Promise(resolve => setTimeout(resolve, 100));
            } catch (err) {
              console.log(`尝试补全方块失败: ${err.message} (${attempts}/${maxAttempts})`);
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
          
          if (!placedSuccessfully) {
            console.log(`方块补全失败，已达到最大尝试次数: ${blockName} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
          }
        } else {
          console.log(`背包中没有找到方块: ${blockName}，无法补全`);
        }
      } catch (err) {
        console.log(`补全方块时发生错误: ${err.message}`);
      }
    } else {
      console.log(`无法找到参考方块 at (${worldPos.x}, ${worldPos.y - 1}, ${worldPos.z})`);
    }
  }
}

// 主函数
async function main() {
  try {
    console.log('开始执行主函数...');
    // 加载投影文件
    const schematicData = await loadSchematic('../litematic/wrintar.schem');
    const { schematic, width, height, length } = schematicData;
    
    // 计算总方块数并初始化进度条
    let blockCount = 0;
    for (let y = 0; y < height; y++) {
      for (let z = 0; z < length; z++) {
        for (let x = 0; x < width; x++) {
          const block = schematic.getBlock(new Vec3(x, y, z));
          if (block && block.name !== 'air') {
            blockCount++;
          }
        }
      }
    }
    totalBlocks = blockCount;
    completedBlocks = 0;
    startTime = Date.now();
    progressBarDisplayed = false;
    lastProgress = -1;

    // 输出方块信息到txt文件（按区域划分）
    await outputBlockInfoByRegion(schematicData, './block_info_output.txt');

    // 等待机器人连接到服务器
    console.log('等待5秒以确保机器人完全连接到服务器...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 按区域建造投影
    await buildWithSetblockByRegion(schematicData, buildStartPos);

    // 建造完成
    console.log('\n建造完成');
    notifier.notify({
      appID: 'PaintingBot',
      icon: './success.png',
      title: '建造完成',
      message: ' ',
      sound: true,
    });
  } catch (err) {
    console.error('执行过程中发生错误:', err);
    bot.quit();
  }
}

// 启动机器人
createBot();