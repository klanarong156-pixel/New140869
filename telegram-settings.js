(() => {
  'use strict';
  let initialized = false;

  function init(access) {
    if (initialized || access?.role !== 'admin') return;
    initialized = true;
    const form = document.querySelector('#telegramSettingsForm');
    if (!form) return;

  const tokenInput = document.querySelector('#telegramBotToken');
  const chatInput = document.querySelector('#telegramChatId');
  const status = document.querySelector('#telegramSettingsStatus');
  const saveButton = document.querySelector('#telegramSaveButton');
  const testButton = document.querySelector('#telegramTestButton');

  function setStatus(message, type = 'info') {
    if (!status) return;
    status.className = `notice ${type}`;
    status.querySelector('span:last-child').textContent = message;
  }

  function publish(topic, payload) {
    const handler = window.mqttHandler;
    if (!handler?.publish || !window.MQTT_CONFIG?.topics?.[topic]) {
      setStatus('ยังไม่พร้อมส่งคำสั่ง กรุณาเชื่อมต่อ MQTT ก่อน', 'warning');
      handler?.showSetup?.();
      return false;
    }
    const sent = handler.publish(window.MQTT_CONFIG.topics[topic], payload, { qos: 0, retain: false });
    if (!sent) setStatus('ส่งคำสั่งไม่สำเร็จ กรุณาตรวจสอบบัญชี MQTT', 'error');
    return sent;
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const botToken = String(tokenInput?.value || '').trim();
    const chatId = String(chatInput?.value || '').trim();
    if (!/^[0-9]{6,12}:[A-Za-z0-9_-]{20,}$/.test(botToken)) {
      setStatus('รูปแบบ Telegram Bot Token ไม่ถูกต้อง', 'warning');
      return;
    }
    if (!/^-?[0-9]{5,20}$/.test(chatId)) {
      setStatus('รูปแบบ Telegram Chat ID ไม่ถูกต้อง', 'warning');
      return;
    }
    const payload = JSON.stringify({ botToken, chatId });
    if (publish('telegramSet', payload)) {
      setStatus('ส่งการตั้งค่า Telegram ไปยัง ESP8266 แล้ว รอการยืนยันจากอุปกรณ์', 'success');
      tokenInput.value = '';
    }
  });

  testButton?.addEventListener('click', () => {
    if (publish('telegramTest', 'TEST')) setStatus('ส่งคำสั่งทดสอบไปยัง ESP8266 แล้ว', 'success');
  });

  window.addEventListener('mqtt:connected', () => setStatus('เชื่อมต่อ MQTT แล้ว พร้อมตั้งค่า Telegram', 'success'));
  window.addEventListener('telegram:status', event => {
    const configured = Boolean(event.detail?.configured);
    setStatus(configured ? 'ESP8266 ตั้งค่า Telegram แล้ว' : 'ยังไม่ได้ตั้งค่า Telegram บนอุปกรณ์', configured ? 'success' : 'warning');
  });
    [saveButton, testButton].forEach(button => button?.removeAttribute('disabled'));
  }

  window.addEventListener('access:ready', event => init(event.detail || {}), { once: true });
  if (window.SMARTFARM_ACCESS?.ready) init(window.SMARTFARM_ACCESS);
})();
