(() => {
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
    if (!botToken || !chatId) {
      setStatus('กรุณากรอก Bot Token และ Chat ID ให้ครบ', 'warning');
      return;
    }
    if (botToken.length > 79 || chatId.length > 31) {
      setStatus('ความยาว Bot Token หรือ Chat ID เกินขนาดที่เฟิร์มแวร์รองรับ', 'warning');
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
})();
