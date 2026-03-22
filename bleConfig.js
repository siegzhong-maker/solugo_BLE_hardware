/**
 * BLE GATT 常量（与 esp_gps_blue/esp_gps_blue/server.js 保持一致）
 */
(function (global) {
  global.ESP32_BLE_CONFIG = {
    DEVICE_NAME: 'ESP32-C3-Tracker',
    SERVICE_UUID: '12345678-1234-1234-1234-123456789abc',
    CHAR_TX_UUID: '12345678-1234-1234-1234-123456789abd',
    CHAR_RX_UUID: '12345678-1234-1234-1234-123456789abe',
    /** 打卡掉落等级 -> handleCommand VIB mode */
    TIER_TO_VIB: { C: 1, B: 2, A: 3, S: 4 }
  };
})(typeof window !== 'undefined' ? window : globalThis);
