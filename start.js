const { exec } = require('child_process')
const path = require('path')

const smartBotPath = path.join(__dirname, 'smartbot.js')
const killAuraBotPath = path.join(__dirname, 'killaurabot.js')
const aeddyKillAuraBotPath = path.join(__dirname, 'aeddykillaurabot.js')
const afkBotPath = path.join(__dirname, 'afkbot.js')

function startSmartBot() {
    console.log('\x1b[32m', 'Starting SmartBot') // 绿色
    const smartBotProcess = exec(`node ${smartBotPath}`)
    smartBotProcess.stdout.on('data', data => {
        console.log('\x1b[32m', `SmartBot: ${data}`)
    })
    smartBotProcess.stderr.on('data', data => {
        console.error('\x1b[32m', `SmartBot error: ${data}`)
        startSmartBot()
    })
}

function startKillAuraBot() {
    console.log('\x1b[31m', 'Starting KillAuraBot') // 红色
    const killAuraBotProcess = exec(`node ${killAuraBotPath}`)
    killAuraBotProcess.stdout.on('data', data => {
        console.log('\x1b[31m', `KillAuraBot: ${data}`)
    })
    killAuraBotProcess.stderr.on('data', data => {
        console.error('\x1b[31m', `KillAuraBot error: ${data}`)
        startKillAuraBot()
    })
}

function startAEddyKillAuraBot() {
    console.log('\x1b[34m', 'Starting AEddyKillAuraBot')  // 蓝色
    const killAuraBotProcess = exec(`node ${aeddyKillAuraBotPath}`)
    killAuraBotProcess.stdout.on('data', data => {
        console.log('\x1b[34m', `AEddyKillAuraBot: ${data}`)
    })
    killAuraBotProcess.stderr.on('data', data => {
        console.error('\x1b[34m', `AEddyKillAuraBot error: ${data}`)
        startAEddyKillAuraBot()
    })
}

function startAfkBot() {
    console.log('\x1b[33m', 'Starting AfkBot') // 黄色
    const afkBotProcess = exec(`node ${afkBotPath}`)
    afkBotProcess.stdout.on('data', data => {
        console.log('\x1b[33m', `AfkBot: ${data}`)
    })
    afkBotProcess.stderr.on('data', data => {
        console.error('\x1b[33m', `AfkBot error: ${data}`)
        startAfkBot()
    })
}

startAfkBot()
startSmartBot()
// startAEddyKillAuraBot()

console.log('程序已开始运行')