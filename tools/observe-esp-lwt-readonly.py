#!/usr/bin/env python3
"""Read-only observer for ESP online/LWT and heartbeat topics."""
from __future__ import annotations
import json
import os
import time
import uuid
import paho.mqtt.client as mqtt

HOST = os.getenv('HIVEMQ_HOST', '25305924f68c41f2a1e089a1836d3287.s1.eu.hivemq.cloud')
PORT = int(os.getenv('HIVEMQ_PORT', '8884'))
PATH = os.getenv('HIVEMQ_PATH', '/mqtt')
USER = os.getenv('HIVEMQ_USERNAME', '').strip()
PASSWORD = os.getenv('HIVEMQ_PASSWORD', '')
DURATION = float(os.getenv('OBSERVE_SECONDS', '30'))
TOPICS = [('smartfarm/status/online', 0), ('smartfarm/status/device', 0)]
if not USER or not PASSWORD:
    raise SystemExit('Missing MQTT credentials')
client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2, client_id=f'SmartFarmObserve-{uuid.uuid4().hex[:10]}', protocol=mqtt.MQTTv5, transport='websockets')
client.username_pw_set(USER, PASSWORD)
client.tls_set()
client.ws_set_options(path=PATH)
connected = False
seen = []
def on_connect(c, _u, _f, reason, _p=None):
    global connected
    connected = reason == 0
    print(f'CONNECTED reason={reason}')
    if connected:
        c.subscribe(TOPICS)
def on_message(_c, _u, msg):
    payload = msg.payload.decode('utf-8', errors='replace')
    marker = 'online'
    if msg.topic.endswith('/device'):
        try:
            data = json.loads(payload)
            payload = json.dumps({k: data.get(k) for k in ('device_id','online','wifi','mqtt','firmware','rssi','uptimeSec')}, ensure_ascii=False, separators=(',', ':'))
        except Exception:
            pass
        marker = 'heartbeat'
    seen.append((msg.topic, payload, bool(msg.retain)))
    print(f'RECEIVED {marker} topic={msg.topic} retain={bool(msg.retain)} payload={payload}')
client.on_connect = on_connect
client.on_message = on_message
client.connect(HOST, PORT, keepalive=30)
client.loop_start()
try:
    deadline = time.monotonic() + DURATION
    while time.monotonic() < deadline:
        time.sleep(0.1)
finally:
    client.loop_stop()
    client.disconnect()
print(f'OBSERVED_MESSAGES {len(seen)}')
print('PASS: read-only MQTT observation completed; no publish performed')
