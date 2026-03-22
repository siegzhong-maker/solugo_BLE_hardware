/**
 * Web Bluetooth 客户端（ESP32-C3 协议）
 * 依赖：先加载 bleConfig.js（提供 window.ESP32_BLE_CONFIG）
 */
(function (global) {
  var C = global.ESP32_BLE_CONFIG;
  if (!C) {
    console.error('[BLE] 请先加载 bleConfig.js');
    return;
  }

  function createEsp32BleClient() {
    var device = null;
    var txChar = null;
    var rxChar = null;
    var connected = false;
    var onDataCb = null;
    var onDisconnectCb = null;
    var enc = new TextEncoder();
    var dec = new TextDecoder();

    function handleGattDisconnected() {
      connected = false;
      txChar = null;
      rxChar = null;
      if (typeof onDisconnectCb === 'function') onDisconnectCb();
    }

    function handleNotify(ev) {
      var text = dec.decode(ev.target.value);
      var payload = null;
      try {
        payload = JSON.parse(text);
      } catch (e) {
        console.warn('[BLE] notify 非 JSON', text);
        return;
      }
      if (typeof onDataCb === 'function') onDataCb(payload);
    }

    return {
      isSupported: function () {
        return !!navigator.bluetooth;
      },

      getState: function () {
        return {
          connected: connected,
          deviceName: device ? device.name : null
        };
      },

      setOnData: function (fn) {
        onDataCb = typeof fn === 'function' ? fn : null;
      },

      setOnDisconnect: function (fn) {
        onDisconnectCb = typeof fn === 'function' ? fn : null;
      },

      connect: async function () {
        if (!navigator.bluetooth) {
          throw new Error('当前浏览器不支持 Web Bluetooth');
        }
        var d = await navigator.bluetooth.requestDevice({
          filters: [{ name: C.DEVICE_NAME }],
          optionalServices: [C.SERVICE_UUID]
        });
        d.addEventListener('gattserverdisconnected', handleGattDisconnected);
        device = d;
        var srv = await d.gatt.connect();
        var service = await srv.getPrimaryService(C.SERVICE_UUID);
        txChar = await service.getCharacteristic(C.CHAR_TX_UUID);
        rxChar = await service.getCharacteristic(C.CHAR_RX_UUID);
        await txChar.startNotifications();
        txChar.addEventListener('characteristicvaluechanged', handleNotify);
        connected = true;
        return { connected: true, deviceName: d.name || null };
      },

      disconnect: async function () {
        if (device) {
          try {
            device.removeEventListener('gattserverdisconnected', handleGattDisconnected);
            if (device.gatt.connected) await device.gatt.disconnect();
          } catch (e) {
            console.warn('[BLE] disconnect', e);
          }
        }
        device = null;
        txChar = null;
        rxChar = null;
        connected = false;
      },

      sendCommand: async function (cmd) {
        if (!connected || !rxChar) return false;
        await rxChar.writeValue(enc.encode(String(cmd)));
        return true;
      }
    };
  }

  global.createEsp32BleClient = createEsp32BleClient;
})(typeof window !== 'undefined' ? window : globalThis);
