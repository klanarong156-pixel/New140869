from pathlib import Path

root = Path(__file__).resolve().parents[1]
firmware = (root / 'SmartFarm_V6_PRODUCTION.ino').read_text()
config = (root / 'config.js').read_text()
app = (root / 'app.js').read_text()
handler = (root / 'mqtt-handler.js').read_text()
contract = (root / 'MQTT_CONTRACT_V6.md').read_text()

checks = {
    'broker hostname': '650188a0ee2b4367b7c131fb385590a9.s1.eu.hivemq.cloud' in firmware and '650188a0ee2b4367b7c131fb385590a9.s1.eu.hivemq.cloud' in config,
    'TLS ports': '#define MQTT_PORT 8883' in firmware and ':8884/mqtt' in config,
    'base topic': '#define MQTT_BASE "smartfarm"' in firmware and "smartfarm/" in config,
    'relay identifiers': all(x in firmware and x in config for x in ('pump', 'zone1', 'lighthome', 'lightsala')),
    'telegram topics': all(x in config and x in contract for x in ('smartfarm/config/telegram/set', 'smartfarm/config/telegram/test', 'smartfarm/config/telegram/status')) and all(x in firmware for x in ('/config/telegram/set', '/config/telegram/test', '/config/telegram/status')) and all(x in handler for x in ('telegramStatus', 'telegram:status')),
    'sensor topic': 'sensor: sensor =>' in config and "sensor('dht11')" in handler and '"/sensor/dht11"' in firmware,
    'active status topics': all(x in config for x in ('smartfarm/status/online', 'smartfarm/device/status', 'smartfarm/emergency/status')) and all(x in handler for x in ('this.config.topics.online', 'this.config.topics.deviceStatus', 'this.config.topics.emergencyStatus')) and all(x in firmware for x in ('/status/online', '/device/status', '/emergency/status')),
    'emergency latch': all(x in firmware for x in ('/emergency/set', 'EMERGENCY_STOP', 'EMERGENCY_RESET', 'emergencyLock')) and all(x in config for x in ('emergencySet', 'emergencyStatus')) and all(x in handler for x in ('emergencyStatus', 'emergency:status')) and 'emergencyStop' in (root / 'farm-tools.js').read_text(),
    'timer bounds and unlimited': 'MAX_TIMER_SECONDS = 4294967UL' in firmware and 'parseTimerSeconds' in firmware and 'UNLIMITED' in firmware and 'MAX_TIMER_MINUTES = 71582' in app,
    'no legacy mode command': 'mode/set' not in firmware and 'mode/status' not in firmware and 'topics.modeSet' not in app,
    'no pump cutoff': '30-minute' not in firmware and '60 seconds' not in firmware and 'pumpSafetyLatched' in firmware,
    'firmware diagnostics': all(x in firmware for x in ('MQTT DIAG: DNS=', 'MQTT DIAG: TLS TCP', 'NTP: epoch=', 'heapMaxBlock', 'sensorFaults')),
}

for name, ok in checks.items():
    print(f"{'PASS' if ok else 'FAIL'}: {name}")

if not all(checks.values()):
    raise SystemExit(1)
print('MQTT_CONTRACT_AUDIT_OK')
