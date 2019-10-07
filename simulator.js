const installAddon = require('./index');

const manager = {
  addAdapter() {},
  emit(event, data) {
    console.log('>', event, data ? data.value : data);
  },
  handleDeviceAdded(device) {
    console.log('+', device.id, device.name);
  },
};

const manifest = {
  moziot: {
    config: {
      url: 'http://192.168.1.1/ci',
      username: 'username',
      password: 'password',
    },
  },
};

installAddon(manager, manifest);
