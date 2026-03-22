/**
 * ESP32-C3 GPS Tracker v3.3 BLE 模拟器（修复GPS诊断格式）
 */

const bleno = require('@abandonware/bleno');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

// ============ 硬件 UUID ============
const DEVICE_NAME = 'ESP32-C3-Tracker';
const SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
const CHAR_TX_UUID = '12345678-1234-1234-1234-123456789abd';
const CHAR_RX_UUID = '12345678-1234-1234-1234-123456789abe';

// ============ 模拟硬件状态 ============
let hardwareState = {
  accel: { x: 0.12, y: -0.05, z: 0.98 },
  battery: { voltage: 3.85, percent: 85, charging: false },
  gps: {
    valid: true,
    lat: 31.245120, lon: 121.482350, alt: 15,
    speed: 0.5, satellites: 8, hdop: 1.2,
    time: '14:32:08', date: '13/03/26'
  },
  gpsDiag: {
    antenna: 'OK',
    fixType: 3,      // 1=无, 2=2D, 3=3D
    fixQuality: 2,   // 0=无效, 1=标准, 2=差分
    satUse: 8,       // 参与定位的卫星数
    satGP: 12,       // GPS可见
    satBD: 6,        // 北斗可见
    // satTot 由 satGP + satBD 计算得出
    hdop: 1.2,
    snr: [
      {p: 3, s: 45, t: 'G'}, {p: 12, s: 38, t: 'G'},
      {p: 14, s: 42, t: 'G'}, {p: 201, s: 42, t: 'B'},
      {p: 204, s: 35, t: 'B'}, {p: 6, s: 28, t: 'G'}
    ]
  },
  nfc: { cardPresent: false, uid: 'A1B2C3D4', sak: 0x08, type: 'MIFARE_1K' },
  ble: { connected: false },
  led: 'green'
};

let notifyCallback = null;
let intervals = {};

// ============ BLE 特征 ============
class TxCharacteristic extends bleno.Characteristic {
  constructor() {
    super({
      uuid: CHAR_TX_UUID,
      properties: ['notify'],
      descriptors: [new bleno.Descriptor({ uuid: '2901', value: 'Sensor Data' })]
    });
  }
  
  onSubscribe(maxValueSize, callback) {
    console.log('[BLE] 客户端已订阅 Notify');
    notifyCallback = callback;
    hardwareState.ble.connected = true;
    hardwareState.led = 'blue';
    broadcastToPanel({ type: 'ble_status', status: 'connected' });
    startAutoSend();
  }
  
  onUnsubscribe() {
    console.log('[BLE] 客户端取消订阅');
    notifyCallback = null;
    hardwareState.ble.connected = false;
    hardwareState.led = 'green';
    stopAutoSend();
  }
}

class RxCharacteristic extends bleno.Characteristic {
  constructor() {
    super({
      uuid: CHAR_RX_UUID,
      properties: ['write'],
      descriptors: [new bleno.Descriptor({ uuid: '2901', value: 'Commands' })]
    });
  }
  
  onWriteRequest(data, offset, withoutResponse, callback) {
    const cmd = data.toString('utf8');
    console.log(`[BLE] 收到指令: ${cmd}`);
    handleCommand(cmd);
    callback(this.RESULT_SUCCESS);
  }
}

// ============ 数据发送函数 ============
function sendSensorData() {
  if (!notifyCallback) return;
  
  const payload = {
    a: [
      parseFloat(hardwareState.accel.x.toFixed(2)),
      parseFloat(hardwareState.accel.y.toFixed(2)),
      parseFloat(hardwareState.accel.z.toFixed(2))
    ],
    b: [
      parseFloat(hardwareState.battery.voltage.toFixed(2)),
      parseInt(hardwareState.battery.percent),
      hardwareState.battery.charging ? 1 : 0
    ],
    g: [
      hardwareState.gps.valid ? 1 : 0,
      parseFloat(hardwareState.gps.lat.toFixed(5)),
      parseFloat(hardwareState.gps.lon.toFixed(5)),
      parseFloat(hardwareState.gps.alt.toFixed(0)),
      parseInt(hardwareState.gps.satellites),
      parseFloat(hardwareState.gps.speed.toFixed(1)),
      parseFloat(hardwareState.gps.hdop.toFixed(1))
    ],
    t: hardwareState.gps.time,
    d: hardwareState.gps.date
  };
  
  const json = JSON.stringify(payload);
  notifyCallback(Buffer.from(json));
  broadcastToPanel({ type: 'data_sent', payload: '传感器数据', len: json.length });
}

// 修复：GPS诊断数据格式与真实设备完全一致
function sendGpsDiagnostics(force = false) {
  if (!hardwareState.ble.connected && !force) return;
  if (!notifyCallback) return;
  
  // 计算总卫星数
  const satTot = (hardwareState.gpsDiag.satGP || 0) + (hardwareState.gpsDiag.satBD || 0);
  
  // 构建与真实设备完全一致的 JSON 结构
  const payload = {
    gps_diag: {
      ant: String(hardwareState.gpsDiag.antenna || 'UNKNOWN'),
      fix: parseInt(hardwareState.gpsDiag.fixType) || 1,
      qual: parseInt(hardwareState.gpsDiag.fixQuality) || 0,
      sat_use: parseInt(hardwareState.gpsDiag.satUse) || 0,
      sat_gp: parseInt(hardwareState.gpsDiag.satGP) || 0,
      sat_bd: parseInt(hardwareState.gpsDiag.satBD) || 0,
      sat_tot: satTot,
      hdop: parseFloat(hardwareState.gpsDiag.hdop || 99.9),
      snr: (hardwareState.gpsDiag.snr || []).slice(0, 8).map(sat => ({
        p: parseInt(sat.p),
        s: parseInt(sat.s),
        t: String(sat.t)
      }))
    }
  };
  
  const json = JSON.stringify(payload);
  console.log('[发送] GPS诊断:', json.substring(0, 100) + '...');
  
  notifyCallback(Buffer.from(json));
  broadcastToPanel({ type: 'gps_diag_sent', payload: payload.gps_diag });
}

function triggerNFC() {
  if (!notifyCallback) return;
  
  const payload = {
    nfc: {
      uid: String(hardwareState.nfc.uid),
      sak: parseInt(hardwareState.nfc.sak),
      type: String(hardwareState.nfc.type)
    }
  };
  
  notifyCallback(Buffer.from(JSON.stringify(payload)));
  broadcastToPanel({ type: 'nfc_sent', uid: payload.nfc.uid });
  
  // 模拟3秒后可再次触发
  hardwareState.nfc.cardPresent = false;
  setTimeout(() => { hardwareState.nfc.cardPresent = true; }, 3000);
}

// ============ 指令处理 ============
function handleCommand(cmd) {
  broadcastToPanel({ type: 'cmd_received', cmd });
  
  if (cmd.startsWith('VIB:')) {
    const parts = cmd.split(':');
    const mode = parseInt(parts[1]);
    const names = ['停止', '短震', '长震', '双击', '三击', 'SOS', '心跳', '自定义'];
    
    hardwareState.led = 'red';
    broadcastToPanel({ type: 'vibration', mode, name: names[mode] || '未知' });
    
    let duration = [0, 100, 500, 300, 400, 2500, 1000, 1000][mode] || 100;
    if (mode === 7 && parts.length >= 4) {
      duration = parseInt(parts[2]) * parseInt(parts[4]);
    }
    
    setTimeout(() => {
      hardwareState.led = hardwareState.ble.connected ? 'blue' : 'green';
      broadcastToPanel({ type: 'vibration_end' });
    }, duration);
  }
  else if (cmd === 'NFC:SCAN') {
    if (hardwareState.nfc.cardPresent) triggerNFC();
  }
  else if (cmd === 'GPS:DIAG') {
    sendGpsDiagnostics(true);
  }
}

// ============ 自动发送时序 ============
function startAutoSend() {
  console.log('[系统] 启动自动发送');
  
  // 每500ms传感器数据
  intervals.sensor = setInterval(sendSensorData, 500);
  
  // 每3000ms GPS诊断（与真实设备一致）
  intervals.gpsDiag = setInterval(() => sendGpsDiagnostics(), 3000);
  
  // 立即发送一次诊断数据
  setTimeout(() => sendGpsDiagnostics(true), 500);
}

function stopAutoSend() {
  Object.values(intervals).forEach(clearInterval);
  intervals = {};
}

// ============ WebSocket 控制面板 ============
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let panelClient = null;

function broadcastToPanel(msg) {
  if (panelClient && panelClient.readyState === WebSocket.OPEN) {
    panelClient.send(JSON.stringify(msg));
  }
}

wss.on('connection', (ws) => {
  console.log('[WS] 控制面板已连接');
  panelClient = ws;
  
  ws.send(JSON.stringify({ type: 'init', state: hardwareState }));
  
  ws.on('message', (message) => {
    try {
      const cmd = JSON.parse(message);
      
      switch(cmd.type) {
        case 'update':
          // 更新指定段落
          if (cmd.section && hardwareState[cmd.section]) {
            Object.assign(hardwareState[cmd.section], cmd.data);
            
            // 如果是GPS诊断，确保计算satTot
            if (cmd.section === 'gpsDiag') {
              hardwareState.gpsDiag.satTot = 
                (hardwareState.gpsDiag.satGP || 0) + 
                (hardwareState.gpsDiag.satBD || 0);
            }
          }
          break;
          
        case 'trigger_nfc':
          hardwareState.nfc.cardPresent = true;
          if (cmd.uid) hardwareState.nfc.uid = cmd.uid;
          if (cmd.sak) hardwareState.nfc.sak = cmd.sak;
          if (cmd.type) hardwareState.nfc.type = cmd.type;
          triggerNFC();
          break;
          
        case 'force_gps_diag':
          sendGpsDiagnostics(true);
          break;
      }
      
      // 广播更新后的状态
      ws.send(JSON.stringify({ type: 'state_updated', state: hardwareState }));
    } catch (e) {
      console.error('[WS] 消息错误:', e);
    }
  });
});

// ============ BLE 启动 ============
bleno.on('stateChange', (state) => {
  if (state === 'poweredOn') {
    bleno.startAdvertising(DEVICE_NAME, [SERVICE_UUID]);
  }
});

bleno.on('advertisingStart', (err) => {
  if (err) {
    console.error('[BLE] 广播失败:', err);
    return;
  }
  
  console.log(`[BLE] 广播: ${DEVICE_NAME}`);
  bleno.setServices([
    new bleno.PrimaryService({
      uuid: SERVICE_UUID,
      characteristics: [new TxCharacteristic(), new RxCharacteristic()]
    })
  ]);
});

// ============ 启动 ============
server.listen(4444, () => {
  console.log('========================================');
  console.log('  ESP32-C3 模拟器已启动');
  console.log('========================================');
  console.log('[控制面板] http://localhost:4444');
  console.log('[BLE设备]  ' + DEVICE_NAME);
  console.log('');
  console.log('请用手机访问您的云端页面，搜索并连接 "' + DEVICE_NAME + '"');
});