/**
 * keenetic-adapter.js - Adapter for active wifi devices.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const { keyBy } = require('lodash');
const parser = require('fast-xml-parser');
const { Adapter, Device, Property, Event } = require('gateway-addon');

const DigestFetch = require('./digest-fetch');

class NetworkProperty extends Property {
  constructor(device, name, description) {
    super(device, name, description);
    this.setCachedValue(description.value);
    this.device.notifyPropertyChanged(this);
    this.options = description;
  }
}

class WifiDevice extends Device {
  constructor(adapter, station, lease) {
    super(adapter, station.mac);
    this.name = lease.name || lease.hostname;
    this.properties.set(
      'ip',
      new NetworkProperty(this, 'ip', {
        type: 'string',
        readOnly: true,
        value: lease.ip,
      }),
    );
    this.properties.set(
      'rssi',
      new NetworkProperty(this, 'rssi', {
        type: 'integer',
        unit: 'db',
        readOnly: true,
        value: station.rssi,
      }),
    );
    this.properties.set(
      'online',
      new NetworkProperty(this, 'online', {
        type: 'boolean',
        readOnly: true,
        value: true,
      }),
    );
    this.addEvent('connected', {});
    this.addEvent('disconnected', {});
  }
}

class KeeneticAdapter extends Adapter {
  constructor(addonManager, manifest) {
    super(addonManager, 'KeeneticAdapter', manifest.name);
    this.config = manifest.moziot.config;
    addonManager.addAdapter(this);

    this.client = new DigestFetch(this.config.username, this.config.password);
    this.refreshTask = setInterval(() => this.discoverDevices(), 10000);
    this.discoverDevices();
  }

  async discoverDevices() {
    const response = await this.client.fetch('http://192.168.1.1/ci', {
      method: 'POST',
      headers: {
        Accept: 'application/xml',
        'Content-Type': 'application/xml',
      },
      body: `
        <packet ref="/">
          <request id="associations">
            <command name="show associations"></command>
          </request>
          <request id="bindings">
            <command name="show ip dhcp bindings">
              <pool>_WEBADMIN</pool>
            </command>
          </request>
        </packet>`,
    });

    if (!response.ok) {
      throw new Error('nok');
    }

    const data = await response.text();
    const { packet } = parser.parse(data);
    const [{ station: stations }, { lease: leases }] = packet.response;
    const leaseByMac = keyBy(leases, 'mac');
    const devicesOnline = new Set();

    for (const station of stations) {
      const lease = leaseByMac[station.mac];
      if (!lease) {
        console.warn('! station without lease', station);
        continue;
      }
      devicesOnline.add(station.mac);
      if (!this.devices[station.mac]) {
        this.addDevice(station, lease);
        continue;
      }
      const device = this.devices[station.mac];
      const rssi = device.properties.get('rssi');
      rssi.setCachedValue(station.rssi);
      device.notifyPropertyChanged(rssi);
      const ip = device.properties.get('ip');
      ip.setCachedValue(lease.ip);
      device.notifyPropertyChanged(ip);
    }

    for (const [mac, device] of Object.entries(this.devices)) {
      const online = device.properties.get('online');
      online.setCachedValue(devicesOnline.has(mac));
      device.notifyPropertyChanged(online);
    }
  }

  addDevice(station, lease) {
    const device = new WifiDevice(this, station, lease);
    this.handleDeviceAdded(device);
  }

  startPairing() {}
  cancelPairing() {}
}

function loadAdapter(addonManager, manifest, _errorCallback) {
  new KeeneticAdapter(addonManager, manifest);
}

module.exports = loadAdapter;
