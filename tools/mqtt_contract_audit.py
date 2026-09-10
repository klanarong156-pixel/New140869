from pathlib import Path

root = Path(__file__).resolve().parents[1]
firmware = (root / 'SmartFarm_V6_PRODUCTION1.ino').read_text()
config = (root / 'config.js').read_text()
app = (root / 'app.js').read_text()
handler = (root / 'mqtt-handler.js').read_text()
contract = (root / 'MQTT_CONTRACT_V6.md').read_text()

checks = {
    'broker hostname': '25305924f68c41f2a1e089a1836d3287.s1.eu.hivemq.cloud' in firmware and '25305924f68c41f2a1e089a1836d3287.s1.eu.hivemq.cloud' in config,
    'TLS ports': '#define MQTT_PORT 8883' in firmware and "port: 8884" in config and "path: '/mqtt'" in config,
    'base topic': '#define MQTT_BASE "smartfarm"' in firmware and "smartfarm/" in config,
    'simple wildcard subscription': "allowedSubscribeTopics: Object.freeze(['smartfarm/#'])" in config and 'mqtt.subscribe(MQTT_BASE "/#")' in firmware,
    'relay identifiers': all(x in firmware and x in config for x in ('pump', 'zone1', 'lighthome', 'lightsala')),
    'telegram topics': all(x in config and x in contract for x in ('smartfarm/config/telegram/set', 'smartfarm/config/telegram/test', 'smartfarm/config/telegram/status')) and all(x in firmware for x in ('/config/telegram/set', '/config/telegram/test', '/config/telegram/status')) and all(x in handler for x in ('telegramStatus', 'telegram:status')),
    'sensor topic': 'sensor: sensor =>' in config and "sensor('dht11')" in handler and '"/sensor/dht11"' in firmware,
    'active status topics': all(x in config for x in ('smartfarm/status/online', 'smartfarm/status/device', 'smartfarm/emergency/status', 'smartfarm/mode/status', 'smartfarm/time', 'smartfarm/system/error')) and all(x in handler for x in ('this.config.topics.online', 'this.config.topics.deviceStatus', 'this.config.topics.emergencyStatus')) and all(x in firmware for x in ('/status/online', '/status/device', '/emergency/status')),
    'AI alert topic': all(x in config for x in ('smartfarm/ai/alert/set', 'smartfarm/ai/alert/status')) and all(x in firmware for x in ('/ai/alert/set', '/ai/alert/status', 'handleAiAlert')) and all(x in handler for x in ('this.config.topics.aiAlertStatus', 'ai:alert-status')) and 'aiAlertSet' in (root / 'ai-farm-advisor.js').read_text(),
    'emergency latch': all(x in firmware for x in ('/emergency/set', 'EMERGENCY_STOP', 'EMERGENCY_RESET', 'emergencyLock')) and all(x in config for x in ('emergencySet', 'emergencyStatus')) and all(x in handler for x in ('emergencyStatus', 'emergency:status')) and 'emergencyStop' in (root / 'farm-tools.js').read_text(),
    'timer bounds and unlimited': 'MAX_TIMER_SECONDS = 4294967UL' in firmware and 'parseTimerSeconds' in firmware and 'UNLIMITED' in firmware and 'MAX_TIMER_MINUTES = 71582' in app,
    'V1 mode command': 'mode/set' in firmware and 'mode/status' in firmware and 'modeSet' in config and 'modeStatus' in handler,
    'no pump cutoff': '30-minute' not in firmware and '60 seconds' not in firmware and 'pumpSafetyLatched' in firmware,
    'firmware diagnostics': all(x in firmware for x in ('MQTT VERIFY: DNS', 'MQTT VERIFY: TLS TCP', 'NTP: epoch=', 'heapMaxBlock', 'sensorFaults')),
}

for name, ok in checks.items():
    print(f"{'PASS' if ok else 'FAIL'}: {name}")

if not all(checks.values()):
    raise SystemExit(1)
print('MQTT_CONTRACT_AUDIT_OK')
