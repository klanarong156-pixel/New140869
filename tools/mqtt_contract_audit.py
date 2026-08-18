from pathlib import Path
import re

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

    'status topics': all(x in config for x in ('smartfarm/status/online', 'smartfarm/device/status', 'smartfarm/mode/status')) and all(x in handler for x in ('this.config.topics.online', 'this.config.topics.deviceStatus', 'this.config.topics.modeStatus')) and all(x in firmware for x in ('/status/online', '/device/status', '/mode/status')),

    'mode command non-retained': 'MQTT_CONFIG.topics.modeSet, normalized, { retain: false }' in app,
    'firmware diagnostics': all(x in firmware for x in ('MQTT DIAG: DNS=', 'MQTT DIAG: TLS TCP', 'NTP: epoch=')),
}

for name, ok in checks.items():
    print(f"{'PASS' if ok else 'FAIL'}: {name}")

if not all(checks.values()):
    raise SystemExit(1)
print('MQTT_CONTRACT_AUDIT_OK')
