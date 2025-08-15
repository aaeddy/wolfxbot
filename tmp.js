const mineflayer = require('mineflayer')
const pathfinder = require('mineflayer-pathfinder')
const Vec3 = require('vec3')
const { async } = require('plugins/iterators')
const autoeat = require('mineflayer-auto-eat').plugin
const Let_it_move = require('./Let_it_move.js')
const _ = require('lodash')
const { broadcastArgs } = require('@tensorflow/tfjs')
const fs = require('fs')
const readline = require('readline')


const bot = mineflayer.createBot({
    host: 'wolfxmc.org',
    username: 'killaurabot',
    //password: '',
    // port: 25565,
    version: '1.20.1',
    auth: 'microsoft'
})

bot.on('spawn', async () => {
    bot.chat('/sethome')
})