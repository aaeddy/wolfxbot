const mineflayer = require('mineflayer');
const fs = require('fs').promises;
const { Schematic } = require('prismarine-schematic');
const { Vec3 } = require('vec3');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');

// Bot 配置
const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'testbot',
  version: '1.20.4',
  auth: 'offline'
});

// 加载pathfinder插件
bot.loadPlugin(pathfinder);

// 建造平面起始坐标
const buildStartPos = new Vec3(8, 33, 25);

// 各颜色木桶的坐标信息
const materialChests = [
  { color: 'smooth_stone', pos: new Vec3(93, -60, 21) },
  { color: 'white_carpet', pos: new Vec3(109, -60, 18) },
  { color: 'purple_carpet', pos: new Vec3(108, -60, 18) },
  { color: 'orange_carpet', pos: new Vec3(107, -60, 18) },
  { color: 'magenta_carpet', pos: new Vec3(106, -60, 18) },
  { color: 'light_gray_carpet', pos: new Vec3(105, -60, 18) },
  { color: 'cyan_carpet', pos: new Vec3(104, -60, 18) },
  { color: 'light_blue_carpet', pos: new Vec3(103, -60, 18) },
  { color: 'lime_carpet', pos: new Vec3(102, -60, 18) },
  { color: 'green_carpet', pos: new Vec3(101, -60, 18) },
  { color: 'red_carpet', pos: new Vec3(100, -60, 18) },
  { color: 'yellow_carpet', pos: new Vec3(99, -60, 18) },
  { color: 'brown_carpet', pos: new Vec3(98, -60, 18) },
  { color: 'blue_carpet', pos: new Vec3(97, -60, 18) },
  { color: 'pink_carpet', pos: new Vec3(96, -60, 18) },
  { color: 'black_carpet', pos: new Vec3(95, -60, 18) },
  { color: 'gray_carpet', pos: new Vec3(94, -60, 18) }
];

// 加载投影文件
async function loadSchematic(filePath) {
  try {
    console.log(`尝试加载投影文件: ${filePath}`);
    const data = await fs.readFile(filePath);
    console.log(`文件大小: ${data.length} 字节`);
    
    // 使用正确的API读取schematic文件
    const schematic = await Schematic.read(data);
    
    // 检查schematic对象的属性
    console.log('Schematic object:', schematic);
    
    // 尝试获取尺寸信息的不同方法
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
  
  // 先处理前128个方块
  let initialBlockCount = 0;
  blockInfo += '=== 前128个方块 ===\n';
  
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
  
  blockInfo += `\n前128个方块处理完成，实际处理了 ${initialBlockCount} 个非空气方块\n\n`;
  
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
          for (let z = startZ; z < endZ && z <= length-1; z++) {  // 确保z不超过length-1
            for (let x = startX; x < endX; x++) {
              // 确保不超出投影文件的实际范围
              if (z <= length-1) {  // 确保z不超过length-1
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
        
        blockInfo += `\n区域 [${rx},${rz}]: X(${startX}-${endX-1}), Z(${startZ}-${Math.min(endZ-1, length-1)})\n`;
        blockInfo += '所需材料:\n';
        
        // 输出材料数量
        for (const [blockName, count] of Object.entries(materialCount)) {
          blockInfo += `  ${blockName}: ${count} 个\n`;
        }
      
        // 遍历区域内的每个方块
        for (let y = 0; y < height; y++) {
          for (let z = startZ; z < endZ && z <= length-1; z++) {  // 确保z不超过length-1
            for (let x = startX; x < endX; x++) {
              // 确保不超出投影文件的实际范围
              if (z <= length-1) {  // 确保z不超过length-1
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

// 从木桶中获取材料
async function getMaterialsFromChests(materialCount) {
  console.log('正在从木桶中获取建造所需材料...');
  
  // 传送到tmpbot2位置
  console.log('传送到tmpbot2位置...');
  let tpCommand1 = `/tp @s tmpbot2`;
  console.log(`执行命令: ${tpCommand1}`);
  bot.chat(tpCommand1);
  
  // 等待传送完成
  console.log('等待3秒以确保传送完成...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // 遍历所有需要的材料
  for (const [blockName, count] of Object.entries(materialCount)) {
    // 查找对应的木桶
    let chestInfo = materialChests.find(chest => chest.color === blockName);
    
    // 如果没有找到精确匹配的木桶，尝试查找去掉"_carpet"后缀的匹配
    if (!chestInfo && blockName.endsWith('_carpet')) {
      const baseColor = blockName.slice(0, -7); // 去掉"_carpet"后缀
      chestInfo = materialChests.find(chest => chest.color === baseColor);
    }
    
    if (chestInfo) {
      // 移动到木桶附近
      const distance = bot.entity.position.distanceTo(chestInfo.pos);
      if (distance > 3) {  // 如果距离大于3格则移动到木桶附近
        console.log(`玩家距离木桶过远 (${distance.toFixed(2)} 格)，移动到木桶附近: ${chestInfo.color} 木桶 at (${chestInfo.pos.x}, ${chestInfo.pos.y}, ${chestInfo.pos.z})`);
        
        // 使用pathfinder移动到木桶附近
        const goal = new GoalNear(chestInfo.pos.x, chestInfo.pos.y, chestInfo.pos.z, 2); // 移动到距离木桶2格范围内
        
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
            console.log('已成功移动到木桶附近');
            resolve();
          });
          
          // 监听移动失败事件
          bot.once('path_update', (results) => {
            if (results.status === 'noPath') {
              clearTimeout(timeout);
              console.log('无法找到路径到木桶');
              reject(new Error('无法找到路径到木桶'));
            }
          });
          
          // 开始移动
          bot.pathfinder.setGoal(goal);
        }).catch(err => {
          console.log(`移动失败: ${err.message}`);
          return; // 移动失败则跳过这个木桶
        });
      }
      
      // 打开木桶并获取材料
      console.log(`从 ${chestInfo.color} 木桶中获取 ${count} 个 ${blockName}`);
      
      // 查找木桶方块
      const chestBlock = bot.blockAt(chestInfo.pos);
      if (!chestBlock) {
        console.log(`找不到木桶方块 at (${chestInfo.pos.x}, ${chestInfo.pos.y}, ${chestInfo.pos.z})`);
        continue;
      }
      
      // 打开木桶
      try {
        const chest = await bot.openContainer(chestBlock);
        
        // 查找需要的物品
        const items = chest.containerItems().filter(item => item.name === blockName);
        if (items.length === 0) {
          console.log(`木桶中没有找到 ${blockName}`);
          chest.close();
          continue;
        }
        
        // 计算木桶中该物品的总数量
        const totalCount = items.reduce((sum, item) => sum + item.count, 0);
        
        // 检查数量是否足够
        if (totalCount < count) {
          console.log(`木桶中 ${blockName} 数量不足，需要 ${count} 个，但只有 ${totalCount} 个`);
          chest.close();
          continue;
        }
        
        // 从木桶中拿取物品，处理超过64个的情况
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
          
          // 从木桶中拿取物品
          await chest.withdraw(item.type, null, takeCount);
          console.log(`成功从木桶中拿取 ${takeCount} 个 ${blockName}`);
          
          // 更新剩余需要拿取的数量
          remainingCount -= takeCount;
        }
        
        // 关闭木桶
        chest.close();
      } catch (err) {
        console.log(`打开木桶或拿取物品失败: ${err.message}`);
      }
      
      // 添加延迟以避免操作过快
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      console.log(`未找到 ${blockName} 对应的木桶`);
    }
  }
  
  // 获取材料完成后传送回搭建平台
  console.log('获取材料完成，传送到搭建平台...');
  // 传送到搭建平台（坐标为示例，实际需要改动）
  console.log('传送到搭建平台...');
  let tpCommand2 = `/tp @s tmpbot`;
  console.log(`执行命令: ${tpCommand2}`);
  bot.chat(tpCommand2);
  
  // 等待传送完成
  console.log('等待3秒以确保传送完成...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // 等待一段时间确保材料获取完成
  console.log('等待5秒以确保材料获取完成...');
  await new Promise(resolve => setTimeout(resolve, 5000));
}

// 使用/setblock命令建造投影（按区域划分建造）
async function buildWithSetblockByRegion(schematicData, startPos) {
  console.log('开始按区域建造投影...');
  
  const { schematic, width, height, length } = schematicData;
  
  // 传送到搭建平台（坐标为示例，实际需要改动）
  console.log('传送到搭建平台...');
  let tpCommand = `/tp @s tmpbot`;
  console.log(`执行命令: ${tpCommand}`);
  bot.chat(tpCommand);
  
  // 等待传送完成
  console.log('等待3秒以确保传送完成...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // 先建造前128个方块
  console.log('开始建造前128个方块...');
  let initialBlockCount = 0;
  
  // 计算前128个方块所需的材料数量
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
  
  // 从木桶中获取前128个方块所需的全部材料
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
          
          // 检查bot是否在方块附近，如果距离大于5格则移动到方块附近
          const distance = bot.entity.position.distanceTo(worldPos);
          if (distance > 5) {  // 假设5个方块为有效距离
          console.log(`玩家距离方块过远 (${distance.toFixed(2)} 格)，移动到方块附近: ${block.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
          // 使用pathfinder移动到方块附近
          const goal = new GoalNear(worldPos.x, worldPos.y, worldPos.z, 4); // 移动到距离方块4格范围内
          bot.pathfinder.setGoal(goal);
          
          // 等待移动完成，设置超时时间
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              bot.pathfinder.stop(); // 停止路径寻找
              reject(new Error('移动超时'));
            }, 10000); // 10秒超时
            
            bot.on('goal_reached', () => {
              clearTimeout(timeout);
              resolve();
            });
            
            bot.on('path_update', (results) => {
              if (results.status === 'noPath') {
                clearTimeout(timeout);
                reject(new Error('无法找到路径'));
              }
            });
          }).catch(err => {
            console.log(`移动失败: ${err.message}`);
            return; // 移动失败则跳过放置
          });
          }
          
          // 使用正常的放置方块方式
          console.log(`放置方块: ${block.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
          // 获取要放置方块位置下方的方块作为参考方块
          const referenceBlock = bot.blockAt(worldPos.offset(0, -1, 0));
          
          // 检查bot是否站在要放置方块的位置上
          const botPos = bot.entity.position;
          if (Math.floor(botPos.x) === worldPos.x && Math.floor(botPos.y) === worldPos.y - 1 && Math.floor(botPos.z) === worldPos.z) {
            console.log('Bot站在要放置方块的位置上，需要移动到z+1位置');
            // 创建移动到z+1位置的目标
            const moveGoal = new GoalNear(worldPos.x, worldPos.y - 1, worldPos.z + 1, 0.5); // 移动到距离目标z+1位置0.5格范围内
            
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
                console.log('已成功移动到z+1位置');
                resolve();
              });
              
              // 监听移动失败事件
              bot.once('path_update', (results) => {
                if (results.status === 'noPath') {
                  clearTimeout(timeout);
                  console.log('无法找到路径到z+1位置');
                  reject(new Error('无法找到路径到z+1位置'));
                }
              });
              
              // 开始移动
              bot.pathfinder.setGoal(moveGoal);
            });
          }
          
          if (referenceBlock) {
            try {
              // 确保手中有正确的方块
              const blockItem = bot.inventory.items().find(item => item.name === block.name);
              if (blockItem) {
                await bot.equip(blockItem, 'hand');
                // 放置方块，使用(0, 1, 0)作为方向向量表示在参考方块上方放置
                await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
              } else {
                console.log(`背包中没有找到方块: ${block.name}`);
              }
            } catch (err) {
              console.log(`放置方块失败: ${err.message}`);
            }
          } else {
            console.log(`无法找到参考方块 at (${worldPos.x}, ${worldPos.y - 1}, ${worldPos.z})`);
          }
          // 注意：实际的放置逻辑需要根据mineflayer的API来实现
          // 这里只是一个示例，表示我们不再使用/setblock命令
          
          initialBlockCount++;
          
          // 添加延迟以避免操作过快
          await new Promise(resolve => setTimeout(resolve, 0.001));
        }
      }
    }
  }
  
  console.log(`前128个方块建造完成，实际建造了 ${initialBlockCount} 个方块`);
  
  // 使用/clear指令清空背包
  console.log('清空背包...');
  const clearCommand = `/clear @s`;
  console.log(`执行命令: ${clearCommand}`);
  bot.chat(clearCommand);
  
  // 等待一段时间确保前128个方块建造完成
  console.log('等待5秒以确保前128个方块建造完成...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // 定义区域大小
  const regionSize = 32;
  const regionsX = Math.ceil(width / regionSize);
  const regionsZ = Math.ceil(length / regionSize);
  
  // 按区域依次建造剩余部分
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
          for (let z = startZ; z < endZ && z <= length-1; z++) {  // 确保z不超过length-1
            for (let x = startX; x < endX; x++) {
              // 确保不超出投影文件的实际范围
              if (z <= length-1) {  // 确保z不超过length-1
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
        
        console.log(`开始建造区域 [${rx},${rz}]: X(${startX}-${endX-1}), Z(${startZ}-${Math.min(endZ-1, length-1)})`);
        
        // 从木桶中获取区域所需的全部材料
        await getMaterialsFromChests(materialCount);
        
        // 遍历区域内的每个方块
        for (let y = 0; y < height; y++) {
          for (let z = startZ; z < endZ && z <= length-1; z++) {  // 确保z不超过length-1
            for (let x = startX; x < endX; x++) {
              // 确保不超出投影文件的实际范围
              if (z <= length-1) {  // 确保z不超过length-1
                const pos = new Vec3(x, y, z);
                const block = schematic.getBlock(pos);
              
                if (block && block.name !== 'air') {
                  // 计算实际世界坐标
                  const worldPos = new Vec3(
                    startPos.x + x,
                    startPos.y + y,
                    startPos.z + z
                  );
                
                  // 检查bot是否在方块附近，如果不在则使用pathfinder移动到方块附近
                  const distance = bot.entity.position.distanceTo(worldPos);
                  if (distance > 5) {  // 假设5个方块为有效距离
                    console.log(`玩家距离方块过远 (${distance.toFixed(2)} 格)，使用pathfinder移动到方块附近: ${block.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
                    
                    // 创建移动到方块附近的目标
                    const goal = new GoalNear(worldPos.x, worldPos.y, worldPos.z, 4); // 移动到距离方块4格范围内
                    
                    // 使用Promise来处理pathfinder的移动
                    await new Promise((resolve, reject) => {
                      // 设置10秒超时
                      const timeout = setTimeout(() => {
                        bot.pathfinder.stop();
                        console.log('pathfinder移动超时');
                        reject(new Error('pathfinder移动超时'));
                      }, 60000);
                      
                      // 监听移动完成事件
                      bot.once('goal_reached', () => {
                        clearTimeout(timeout);
                        console.log('已成功移动到方块附近');
                        resolve();
                      });
                      
                      // 监听移动失败事件
                      bot.once('path_update', (results) => {
                        if (results.status === 'noPath') {
                          clearTimeout(timeout);
                          console.log('无法找到路径到方块');
                          reject(new Error('无法找到路径到方块'));
                        }
                      });
                      
                      // 开始移动
                      bot.pathfinder.setGoal(goal);
                    });
                  }
                  
                  // 使用正常的放置方块方式
                  console.log(`放置方块: ${block.name} at (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
                  // 获取要放置方块位置下方的方块作为参考方块
                  const referenceBlock = bot.blockAt(worldPos.offset(0, -1, 0));
                  
                  // 检查bot是否站在要放置方块的位置上
                  const botPos = bot.entity.position;
                  if (Math.floor(botPos.x) === worldPos.x && Math.floor(botPos.y) === worldPos.y - 1 && Math.floor(botPos.z) === worldPos.z) {
                    console.log('Bot站在要放置方块的位置上，需要移动到z+1位置');
                    // 创建移动到z+1位置的目标
                    const moveGoal = new GoalNear(worldPos.x, worldPos.y - 1, worldPos.z + 1, 0.5); // 移动到距离目标z+1位置0.5格范围内
                    
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
                        console.log('已成功移动到z+1位置');
                        resolve();
                      });
                      
                      // 监听移动失败事件
                      bot.once('path_update', (results) => {
                        if (results.status === 'noPath') {
                          clearTimeout(timeout);
                          console.log('无法找到路径到z+1位置');
                          reject(new Error('无法找到路径到z+1位置'));
                        }
                      });
                      
                      // 开始移动
                      bot.pathfinder.setGoal(moveGoal);
                    });
                  }
                  
                  if (referenceBlock) {
                    try {
                      // 确保手中有正确的方块
                      const blockItem = bot.inventory.items().find(item => item.name === block.name);
                      if (blockItem) {
                        await bot.equip(blockItem, 'hand');
                        // 放置方块，使用(0, 1, 0)作为方向向量表示在参考方块上方放置
                        await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
                      } else {
                        console.log(`背包中没有找到方块: ${block.name}`);
                      }
                    } catch (err) {
                      console.log(`放置方块失败: ${err.message}`);
                    }
                  } else {
                    console.log(`无法找到参考方块 at (${worldPos.x}, ${worldPos.y - 1}, ${worldPos.z})`);
                  }
                  // 注意：实际的放置逻辑需要根据mineflayer的API来实现
                  // 这里只是一个示例，表示我们不再使用/setblock命令
                  
                  // 添加延迟以避免操作过快
                  await new Promise(resolve => setTimeout(resolve, 0.001));
                }
              }
            }
          }
        }
        
        console.log(`区域 [${rx},${rz}] 建造完成`);
        
        // 使用/clear指令清空背包
        console.log('清空背包...');
        const clearCommand = `/clear @s`;
        console.log(`执行命令: ${clearCommand}`);
        bot.chat(clearCommand);
        
        // 等待一段时间确保该区域建造完成
        console.log(`等待3秒以确保区域 [${rx},${rz}] 建造完成...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }
  
  console.log('所有区域建造完成');
}

// 主函数
async function main() {
  try {
    console.log('开始执行主函数...');
    // 加载投影文件
    const schematicData = await loadSchematic('./projection.schem');
    
    // 输出方块信息到txt文件（按区域划分）
    await outputBlockInfoByRegion(schematicData, './block_info_output.txt');
    
    // 等待机器人连接到服务器
    console.log('等待5秒以确保机器人完全连接到服务器...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 按区域建造投影
    await buildWithSetblockByRegion(schematicData, buildStartPos);
    
    // 退出机器人
    console.log('任务完成，退出机器人');
    bot.quit();
  } catch (err) {
    console.error('执行过程中发生错误:', err);
    bot.quit();
  }
}

// 机器人连接事件
bot.on('spawn', () => {
  console.log('机器人已连接到服务器');
  main();
});

// 错误处理
bot.on('error', (err) => {
  console.error('机器人发生错误:', err);
});

bot.on('kicked', (reason) => {
  console.error('机器人被踢出服务器:', reason);
});

// 添加更多调试信息
bot.on('chat', (username, message) => {
  console.log(`${username}: ${message}`);
});