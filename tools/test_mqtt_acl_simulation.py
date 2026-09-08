#!/usr/bin/env python3
"""Simulate Smart Farm MQTT ACLs without contacting HiveMQ.

The script models the topic directions used by the web dashboard and the
ESP8266 firmware, then verifies that each expected Publish/Subscribe action is
allowed and that common cross-direction mistakes are denied.

It deliberately does not read credentials, open a network connection, or send
commands to a real device.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIRMWARE = (ROOT / "SmartFarm_V6_PRODUCTION.ino").read_text()
CONFIG = (ROOT / "config.js").read_text()

RELAYS = ("pump", "zone1", "lighthome", "lightsala")

DEVICE_SUBSCRIBE = [
    "smartfarm/relay/+/set",
    "smartfarm/relay/+/timer/set",
    "smartfarm/schedule/+/set",
    "smartfarm/config/telegram/set",
    "smartfarm/config/telegram/test",
    "smartfarm/reminder/set",
    "smartfarm/emergency/set",
    "smartfarm/ai/alert/set",
]

DEVICE_PUBLISH = [
    "smartfarm/relay/{relay}/status",
    "smartfarm/relay/{relay}/timer/status",
    "smartfarm/schedule/{relay}/status",
    "smartfarm/status/online",
    "smartfarm/device/status",
    "smartfarm/sensor/dht11",
    "smartfarm/config/telegram/status",
    "smartfarm/reminder/status",
    "smartfarm/ai/alert/status",
    "smartfarm/emergency/status",
]

DASHBOARD_SUBSCRIBE = [
    "smartfarm/relay/+/status",
    "smartfarm/relay/+/timer/status",
    "smartfarm/sensor/dht11",
    "smartfarm/status/online",
    "smartfarm/device/status",
    "smartfarm/config/telegram/status",
    "smartfarm/schedule/+/status",
    "smartfarm/reminder/status",
    "smartfarm/ai/alert/status",
    "smartfarm/emergency/status",
]

DASHBOARD_PUBLISH = [
    "smartfarm/relay/{relay}/set",
    "smartfarm/relay/{relay}/timer/set",
    "smartfarm/schedule/{relay}/set",
    "smartfarm/config/telegram/set",
    "smartfarm/config/telegram/test",
    "smartfarm/reminder/set",
    "smartfarm/ai/alert/set",
    "smartfarm/emergency/set",
]


def expand(patterns: list[str]) -> list[str]:
    return [pattern.format(relay=relay) for pattern in patterns for relay in RELAYS]


def topic_matches(filter_: str, topic: str) -> bool:
    """MQTT topic-filter matching for + and # (sufficient for ACL tests)."""
    filter_levels = filter_.split("/")
    topic_levels = topic.split("/")
    for index, level in enumerate(filter_levels):
        if level == "#":
            return index == len(filter_levels) - 1
        if index >= len(topic_levels) or (level != "+" and level != topic_levels[index]):
            return False
    return len(filter_levels) == len(topic_levels)


@dataclass(frozen=True)
class Permission:
    action: str
    topic_filter: str


@dataclass(frozen=True)
class SimulatedCredential:
    name: str
    permissions: tuple[Permission, ...]

    def allows(self, action: str, topic: str) -> bool:
        return any(
            permission.action in (action, "publish-subscribe")
            and topic_matches(permission.topic_filter, topic)
            for permission in self.permissions
        )


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(f"FAIL: {message}")
    print(f"PASS: {message}")


def main() -> int:
    device = SimulatedCredential(
        "smartfarm-device",
        (
            Permission("subscribe", "smartfarm/relay/+/set"),
            Permission("subscribe", "smartfarm/relay/+/timer/set"),
            Permission("subscribe", "smartfarm/schedule/+/set"),
            Permission("subscribe", "smartfarm/config/telegram/set"),
            Permission("subscribe", "smartfarm/config/telegram/test"),
            Permission("subscribe", "smartfarm/reminder/set"),
            Permission("subscribe", "smartfarm/emergency/set"),
            Permission("subscribe", "smartfarm/ai/alert/set"),
            Permission("publish", "smartfarm/relay/+/status"),
            Permission("publish", "smartfarm/relay/+/timer/status"),
            Permission("publish", "smartfarm/schedule/+/status"),
            Permission("publish", "smartfarm/status/online"),
            Permission("publish", "smartfarm/device/status"),
            Permission("publish", "smartfarm/sensor/dht11"),
            Permission("publish", "smartfarm/config/telegram/status"),
            Permission("publish", "smartfarm/reminder/status"),
            Permission("publish", "smartfarm/ai/alert/status"),
            Permission("publish", "smartfarm/emergency/status"),
        ),
    )
    dashboard = SimulatedCredential(
        "smartfarm-dashboard",
        tuple([Permission("subscribe", topic) for topic in DASHBOARD_SUBSCRIBE]
              + [Permission("publish", topic.replace("{relay}", "+")) for topic in DASHBOARD_PUBLISH]),
    )

    device_subscribe_topics = expand(DEVICE_SUBSCRIBE)
    device_publish_topics = expand(DEVICE_PUBLISH)
    dashboard_subscribe_topics = DASHBOARD_SUBSCRIBE
    dashboard_publish_topics = expand(DASHBOARD_PUBLISH)

    for topic in device_subscribe_topics:
        check(device.allows("subscribe", topic), f"device SUBSCRIBE allowed: {topic}")
    for topic in device_publish_topics:
        check(device.allows("publish", topic), f"device PUBLISH allowed: {topic}")
    for topic in dashboard_subscribe_topics:
        check(dashboard.allows("subscribe", topic.replace("+", "pump")), f"dashboard SUBSCRIBE allowed: {topic}")
    for topic in dashboard_publish_topics:
        check(dashboard.allows("publish", topic), f"dashboard PUBLISH allowed: {topic}")

    forbidden = [
        (device, "publish", "smartfarm/relay/pump/set"),
        (device, "subscribe", "smartfarm/device/status"),
        (dashboard, "publish", "smartfarm/relay/pump/status"),
        (dashboard, "subscribe", "smartfarm/relay/pump/set"),
        (dashboard, "publish", "smartfarm/private/secret"),
    ]
    for credential, action, topic in forbidden:
        check(not credential.allows(action, topic), f"{credential.name} DENY {action.upper()}: {topic}")

    # Verify the ACL model is grounded in source topic contracts.
    required_firmware_fragments = [
        "/relay/+/set", "/relay/+/timer/set", "/schedule/+/set",
        "/config/telegram/set", "/config/telegram/test", "/reminder/set",
        "/emergency/set", "/ai/alert/set", "/status/online",
        "/device/status", "/sensor/dht11", "/emergency/status",
    ]
    for fragment in required_firmware_fragments:
        check(fragment in FIRMWARE, f"firmware contains topic contract: smartfarm{fragment}")

    check("allowedSubscribeTopics" in CONFIG, "web config declares subscribe ACL topics")
    check("smartfarm/relay/+/status" in CONFIG, "web config includes relay status subscription")
    check("smartfarm/emergency/status" in CONFIG, "web config includes emergency status subscription")

    print("\nACL SIMULATION RESULT: Smart Farm topic permissions passed")
    print("NOTE: This is a local policy simulation; it does not prove HiveMQ permissions are deployed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
