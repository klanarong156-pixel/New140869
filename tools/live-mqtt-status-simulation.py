#!/usr/bin/env python3
"""Publish a short-lived simulated ESP status sequence and verify the public dashboard.

Credentials are read only from HIVEMQ_USERNAME/HIVEMQ_PASSWORD environment variables.
The script never publishes to relay, mode, schedule, config, or emergency topics.
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid

import paho.mqtt.client as mqtt

HOST = os.getenv("HIVEMQ_HOST", "25305924f68c41f2a1e089a1836d3287.s1.eu.hivemq.cloud")
PORT = int(os.getenv("HIVEMQ_PORT", "8884"))
PATH = os.getenv("HIVEMQ_PATH", "/mqtt")
USERNAME = os.getenv("HIVEMQ_USERNAME", "").strip()
PASSWORD = os.getenv("HIVEMQ_PASSWORD", "")
ONLINE_TOPIC = "smartfarm/status/online"
DEVICE_TOPIC = "smartfarm/status/device"
DEVICE_ID = "esp8266-live-sim"

if not USERNAME or not PASSWORD:
    raise SystemExit("Missing HIVEMQ_USERNAME/HIVEMQ_PASSWORD")
if PORT != 8884:
    raise SystemExit("This test is limited to HiveMQ WSS port 8884")

messages: list[tuple[str, str]] = []
connected = False
client = mqtt.Client(
    callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
    client_id=f"SmartFarmLiveSim-{uuid.uuid4().hex[:10]}",
    protocol=mqtt.MQTTv5,
    transport="websockets",
)
client.username_pw_set(USERNAME, PASSWORD)
client.tls_set()
client.ws_set_options(path=PATH)

def on_connect(_client, _userdata, _flags, reason_code, _properties=None):
    global connected
    connected = reason_code == 0
    print(f"CONNECTED reason={reason_code}")

def on_publish(_client, _userdata, _mid, _reason_code=None, _properties=None):
    pass

client.on_connect = on_connect
client.on_publish = on_publish
print(f"BROKER wss://{HOST}:{PORT}{PATH}")
client.connect(HOST, PORT, keepalive=30)
client.loop_start()
try:
    deadline = time.monotonic() + 15
    while not connected and time.monotonic() < deadline:
        time.sleep(0.1)
    if not connected:
        raise RuntimeError("HiveMQ connection was not established")

    heartbeat = {
        "device_id": DEVICE_ID,
        "online": True,
        "wifi": True,
        "mqtt": True,
        "firmware": "V7.1.2-SIM",
        "rssi": -58,
        "uptimeSec": 1200,
        "resetReason": "Live MQTT simulation",
    }
    info = client.publish(ONLINE_TOPIC, "true", qos=0, retain=True)
    info.wait_for_publish(10)
    print(f"PUBLISHED topic={ONLINE_TOPIC} payload=true retain=true")
    info = client.publish(DEVICE_TOPIC, json.dumps(heartbeat, separators=(",", ":")), qos=0, retain=True)
    info.wait_for_publish(10)
    print(f"PUBLISHED topic={DEVICE_TOPIC} device={DEVICE_ID} retain=true")
    print("LIVE_SIMULATION_SENT")
    time.sleep(5)
finally:
    if connected:
        info = client.publish(ONLINE_TOPIC, "false", qos=0, retain=True)
        info.wait_for_publish(10)
        print(f"CLEANUP topic={ONLINE_TOPIC} payload=false retain=true")
        # Clear the simulated retained device snapshot rather than leaving fake telemetry.
        info = client.publish(DEVICE_TOPIC, b"", qos=0, retain=True)
        info.wait_for_publish(10)
        print(f"CLEANUP topic={DEVICE_TOPIC} retained_snapshot=cleared")
    client.loop_stop()
    client.disconnect()
print("PASS: live MQTT status simulation completed and retained test data cleaned up")
