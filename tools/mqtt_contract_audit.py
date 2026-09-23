from pathlib import Path

root = Path(__file__).resolve().parents[1]
firmware = (root / 'SmartFarm_V7.1.2_TLS_TIME_COMPILE_FIX.ino').read_text()
config = (root / 'config.js').read_text()
app = (root / 'app.js').read_text()
handler = (root / 'mqtt-connection.js').read_text()
connection = (root / 'dashboard' / 'index.html').read_text()

checks = {
    'broker hostname': '25305924f68c41f2a1e089a1836d3287.s1.eu.hivemq.cloud' in firmware and '25305924f68c41f2a1e089a1836d3287.s1.eu.hivemq.cloud' in config,
    'TLS ports': '#define MQTT_PORT 8883' in firmware and 'port: 8884' in config and "path: '/mqtt'" in config,
    'base topic': '#define MQTT_BASE "smartfarm"' in firmware and 'smartfarm/' in config,
    'browser MQTT owner': 'mqtt.connect(this.config.url' in handler and 'reconnectPeriod: 3000' in handler and 'mqtt-handler.js' not in handler,
    'credentials input': 'data-mqtt-username' in connection and 'data-mqtt-password' in connection and 'data-credential-form' in connection,
    'relay identifiers': all(x in firmware and x in config for x in ('pump', 'zone1', 'lighthome', 'lightsala')),
    'sensor topic': 'sensor: sensor =>' in config and "sensor('dht11')" in handler and '"/sensor/dht11"' in firmware,
    'active status topics': all(x in config for x in ('smartfarm/status/online', 'smartfarm/status/device', 'smartfarm/emergency/status', 'smartfarm/mode/status')) and all(x in firmware for x in ('/status/online', '/status/device', '/emergency/status')),
    'mode contract': 'mode/set' in firmware and 'mode/status' in firmware and 'modeSet' in config and 'modeStatus' in handler,
    'no fake soil sensor': 'soil' not in connection.lower() or 'not installed' in connection.lower() or 'ไม่ได้ติดตั้ง' in connection,
    'no legacy mqtt files': not (root / 'mqtt-handler.js').exists() and not (root / 'mqtt-shared-worker.js').exists(),
    'firmware filename is current': (root / 'SmartFarm_V7.1.2_TLS_TIME_COMPILE_FIX.ino').exists(),
}

for name, ok in checks.items():
    print(f"{'PASS' if ok else 'FAIL'}: {name}")
if not all(checks.values()):
    raise SystemExit(1)
print('MQTT_CONTRACT_AUDIT_OK')
