#!/usr/bin/env python3
"""Safe HiveMQ MQTT connectivity and round-trip test.

Reads credentials only from environment variables. It subscribes and publishes
only to a non-control test topic; it refuses relay/config/schedule topics.

Required:
  HIVEMQ_USERNAME
  HIVEMQ_PASSWORD

Optional:
  HIVEMQ_HOST       default: 25305924f68c41f2a1e089a1836d3287.s1.eu.hivemq.cloud
  HIVEMQ_PORT       default: 8884 (HiveMQ WSS)
  HIVEMQ_PATH       default: /mqtt
  HIVEMQ_TOPIC      default: smartfarm/test/connectivity
  HIVEMQ_MESSAGE    default: generated timestamp message
  HIVEMQ_TIMEOUT    default: 15 seconds
"""

from __future__ import annotations

import os
import sys
import time
import uuid
from datetime import datetime, timezone

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("ERROR: missing dependency paho-mqtt; install with: python3 -m pip install --user paho-mqtt", file=sys.stderr)
    raise SystemExit(2)

DEFAULT_HOST = "25305924f68c41f2a1e089a1836d3287.s1.eu.hivemq.cloud"
DEFAULT_PORT = 8884
DEFAULT_PATH = "/mqtt"
DEFAULT_TOPIC = "smartfarm/test/connectivity"
FORBIDDEN_PREFIXES = (
    "smartfarm/relay/",
    "smartfarm/schedule/",
    "smartfarm/config/",
    "smartfarm/reminder/",
    "smartfarm/ai/",
    "smartfarm/emergency/",
)


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    username = os.getenv("HIVEMQ_USERNAME", "").strip()
    password = os.getenv("HIVEMQ_PASSWORD", "")
    if not username or not password:
        fail("set HIVEMQ_USERNAME and HIVEMQ_PASSWORD in the environment; credentials are never read from Git files")

    host = os.getenv("HIVEMQ_HOST", DEFAULT_HOST).strip()
    port = int(os.getenv("HIVEMQ_PORT", str(DEFAULT_PORT)))
    path = os.getenv("HIVEMQ_PATH", DEFAULT_PATH).strip() or DEFAULT_PATH
    topic = os.getenv("HIVEMQ_TOPIC", DEFAULT_TOPIC).strip()
    timeout = float(os.getenv("HIVEMQ_TIMEOUT", "15"))
    message = os.getenv(
        "HIVEMQ_MESSAGE",
        f"smartfarm-connectivity-test {datetime.now(timezone.utc).isoformat()}",
    )

    if not topic or any(topic.startswith(prefix) for prefix in FORBIDDEN_PREFIXES):
        fail(f"refusing unsafe test topic: {topic!r}; use a dedicated smartfarm/test/... topic")
    if not topic.startswith("smartfarm/test/"):
        fail("test topic must start with smartfarm/test/")
    if port != 8884:
        fail("this script is intentionally limited to HiveMQ WSS port 8884")

    client_id = f"SmartFarmPyTest-{uuid.uuid4().hex[:12]}"
    received: list[str] = []
    connected = False
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=client_id,
        protocol=mqtt.MQTTv5,
        transport="websockets",
    )
    client.username_pw_set(username, password)
    client.tls_set()
    client.ws_set_options(path=path)

    def on_connect(_client, _userdata, _flags, reason_code, _properties=None):
        nonlocal connected
        connected = reason_code == 0
        print(f"CONNECT reason={reason_code} client_id={client_id}")
        if connected:
            _client.subscribe(topic, qos=0)

    def on_subscribe(_client, _userdata, _mid, reason_codes, _properties=None):
        print(f"SUBSCRIBE topic={topic} result={reason_codes}")
        info = _client.publish(topic, message, qos=0, retain=False)
        info.wait_for_publish(timeout=timeout)
        print(f"PUBLISH topic={topic} mid={info.mid} published={info.is_published()}")

    def on_message(_client, _userdata, msg):
        payload = msg.payload.decode("utf-8", errors="replace")
        received.append(payload)
        print(f"MESSAGE topic={msg.topic} payload={payload}")

    def on_disconnect(_client, _userdata, _disconnect_flags, reason_code, _properties=None):
        print(f"DISCONNECT reason={reason_code}")

    client.on_connect = on_connect
    client.on_subscribe = on_subscribe
    client.on_message = on_message
    client.on_disconnect = on_disconnect

    print(f"BROKER wss://{host}:{port}{path}")
    print(f"TEST_TOPIC {topic}")
    try:
        client.connect(host, port, keepalive=30)
        client.loop_start()
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline and message not in received:
            time.sleep(0.1)
    except Exception as exc:
        fail(f"connection or round-trip failed: {exc}")
    finally:
        client.loop_stop()
        client.disconnect()

    if not connected:
        fail("broker connection was not established")
    if message not in received:
        fail("publish completed but no matching subscribed message was received before timeout")
    print("PASS: MQTT connect + subscribe + publish + receive round-trip succeeded")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
