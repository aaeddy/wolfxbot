const notifier = require('node-notifier');

notifier.notify({
  appID: 'PaintingBot',
  icon: './success.png',
  title: '建造完成',
  message: '嘻嘻嘻嘻嘻嘻',
  sound: true,
});