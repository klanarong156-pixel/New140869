// SmartFarm V6.0 Production - hardened ESP8266 controller + DS3231 RTC
// Hardware: DHT11 + 4 relays + DS3231
// Fixes: boot/reset diagnostics, NTP init order, reduced JSON stack usage,
// non-blocking reconnect behavior, safer WiFiManager recovery, explicit MQTT
// setup/diagnostics.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <DHT.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WebServer.h>
#include <ESP8266WiFi.h>
#include <LittleFS.h>
#include <NTPClient.h>
#include <PubSubClient.h>
#include <RTClib.h>
#include <Updater.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <WiFiUdp.h>
#include <Wire.h>

#define SMARTFARM_VERSION "V7.0.0-PRODUCTION-HARDENED"
#define MQTT_SERVER "650188a0ee2b4367b7c131fb385590a9.s1.eu.hivemq.cloud"
#define MQTT_PORT 8883
#define MQTT_BASE "smartfarm"
#define TZ_OFFSET_SECONDS (7L * 3600L)

#define RTC_SDA D3
#define RTC_SCL D4
#define DHT_PIN D2
#define RELAY_PUMP D5
#define RELAY_ZONE1 D6
#define RELAY_LIGHT_HOME D7
#define RELAY_LIGHT_SALA D8
#define SOIL_PIN A0
#define RELAY_ON LOW
#define RELAY_OFF HIGH

const uint32_t PUMP_MAX_RUNTIME_MS = 30UL * 60UL * 1000UL;
const uint32_t PUMP_MQTT_LOSS_OFF_MS = 60UL * 1000UL;
const uint32_t MQTT_RECONNECT_MS = 5000UL;
const uint32_t SENSOR_INTERVAL_MS = 30000UL;
const uint32_t HEARTBEAT_INTERVAL_MS = 10000UL;
const uint32_t SCHEDULE_INTERVAL_MS = 1000UL;
const uint32_t RTC_NTP_SYNC_INTERVAL_MS = 6UL * 60UL * 60UL * 1000UL;
const uint8_t MQTT_AUTH_FAIL_LIMIT = 3;
const uint32_t MQTT_DIAGNOSTIC_INTERVAL_MS = 30000UL;

WiFiClientSecure tls;
WiFiClientSecure telegramTls;
PubSubClient mqtt(tls);
ESP8266WebServer otaServer(80);
WiFiUDP udp;
NTPClient ntp(udp, "pool.ntp.org", TZ_OFFSET_SECONDS, 60000UL);
RTC_DS3231 rtc;
DHT dht(DHT_PIN, DHT11);

bool fsReady = false, rtcAvailable = false, rtcTimeValid = false;
uint32_t lastRtcSync = 0, lastMqttAttempt = 0, lastSensor = 0,
         lastHeartbeat = 0, lastSchedule = 0, lastMqttDiagnostic = 0;
uint8_t mqttAuthFailures = 0;
bool mqttPortalOpened = false;
bool mqttConfigReported = false;
bool otaHttpRestartPending = false;
unsigned long otaHttpRestartAt = 0;
bool otaUploadFailed = false;
bool wifiStateKnown = false, lastWifiConnected = false;

char mqttUser[64] = "";
char mqttPass[96] = "";
char otaPass[64] = "";
char telegramBotToken[80] = "";
char telegramChatId[32] = "";
char deviceName[32] = "SmartFarm-ESP8266";
WiFiManagerParameter pUser("mqtt_user", "MQTT username", mqttUser,
                           sizeof(mqttUser));
WiFiManagerParameter pPass("mqtt_pass", "MQTT password", mqttPass,
                           sizeof(mqttPass));
WiFiManagerParameter pOta("ota_pass", "OTA password", otaPass, sizeof(otaPass));
WiFiManagerParameter pTelegramToken("telegram_bot_token", "Telegram bot token",
                                    telegramBotToken, sizeof(telegramBotToken));
WiFiManagerParameter pTelegramChat("telegram_chat_id", "Telegram chat ID",
                                   telegramChatId, sizeof(telegramChatId));
WiFiManagerParameter pName("device_name", "Device name", deviceName,
                           sizeof(deviceName));

enum Mode : uint8_t { MANUAL, AUTO };
Mode mode = MANUAL;

String urlEncode(const String &value) {
  String out;
  out.reserve(value.length() + 16);
  const char hex[] = "0123456789ABCDEF";
  for (size_t i = 0; i < value.length(); i++) {
    uint8_t c = (uint8_t)value[i];
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
        (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~')
      out += (char)c;
    else if (c == ' ')
      out += "%20";
    else {
      out += '%';
      out += hex[c >> 4];
      out += hex[c & 15];
    }
  }
  return out;
}

void telegramNotify(const String &message) {
  if (WiFi.status() != WL_CONNECTED || !telegramBotToken[0] ||
      !telegramChatId[0])
    return;

  telegramTls.setInsecure();
  telegramTls.setBufferSizes(4096, 512);
  telegramTls.setTimeout(15000);
  String url = String("https://api.telegram.org/bot") + telegramBotToken +
               "/sendMessage";
  String body = String("chat_id=") + urlEncode(telegramChatId) + "&text=" +
                urlEncode(String("[SmartFarm ") + deviceName + "]\n" + message);

  for (uint8_t attempt = 1; attempt <= 2; ++attempt) {
    HTTPClient http;
    http.setTimeout(15000);
    http.setReuse(false);
    http.useHTTP10(true);
    if (!http.begin(telegramTls, url)) {
      Serial.printf("Telegram: HTTPS begin failed attempt %u, heap=%u\n",
                    attempt, ESP.getFreeHeap());
      delay(250);
      continue;
    }

    http.addHeader("Content-Type", "application/x-www-form-urlencoded");
    int code = http.POST(body);
    String response = http.getString();
    if (code >= 200 && code < 300) {
      Serial.printf("Telegram: sent OK HTTP %d\n", code);
      http.end();
      return;
    }

    Serial.printf("Telegram: send failed HTTP %d (%s), attempt %u, heap=%u\n",
                  code, HTTPClient::errorToString(code).c_str(), attempt,
                  ESP.getFreeHeap());
    if (response.length()) {
      response.replace("\\r", "");
      response.replace("\\n", " ");
      if (response.length() > 180)
        response.remove(180);
      Serial.printf("Telegram response: %s\n", response.c_str());
    }
    http.end();
    delay(250);
  }
}

void reportWifiState() {
  bool connected = WiFi.status() == WL_CONNECTED;
  if (!wifiStateKnown) {
    wifiStateKnown = true;
    lastWifiConnected = connected;
    return;
  }
  if (connected == lastWifiConnected)
    return;
  lastWifiConnected = connected;
  if (connected) {
    Serial.print(F("WiFi: reconnected, IP: "));
    Serial.println(WiFi.localIP());
    telegramNotify(String("WiFi กลับมาเชื่อมต่อสำเร็จ IP=") +
                   WiFi.localIP().toString());
  } else {
    Serial.println(F("WiFi: disconnected"));
  }
}

struct ScheduleSlot {
  bool enabled;
  uint8_t onH, onM, offH, offM;
};
static const uint8_t RELAY_COUNT = 4, SLOT_COUNT = 4;
ScheduleSlot schedules[RELAY_COUNT][SLOT_COUNT] = {};
const uint8_t relayPins[RELAY_COUNT] = {RELAY_PUMP, RELAY_ZONE1,
                                        RELAY_LIGHT_HOME, RELAY_LIGHT_SALA};
const char *relayNames[RELAY_COUNT] = {"pump", "zone1", "lighthome",
                                       "lightsala"};
uint32_t pumpStartedAt = 0, pumpMqttLostAt = 0;
uint32_t relayTimerUntil[RELAY_COUNT] = {};
uint32_t lastTimerStatus = 0;
bool pumpSafetyLatched = false;

void relaySet(uint8_t i, bool on);
void publishRelayStatus(uint8_t i);

void clearRelayTimer(uint8_t i) {
  if (i < RELAY_COUNT)
    relayTimerUntil[i] = 0;
}
void publishRelayTimerStatus(uint8_t i) {
  if (!mqtt.connected() || i >= RELAY_COUNT)
    return;
  StaticJsonDocument<160> d;
  uint32_t remaining = relayTimerUntil[i]
                           ? (int32_t)(relayTimerUntil[i] - millis()) > 0
                                 ? (relayTimerUntil[i] - millis()) / 1000UL
                                 : 0
                           : 0;
  d["active"] = remaining > 0;
  d["remaining"] = remaining;
  char out[160];
  serializeJson(d, out, sizeof(out));
  String t = String(MQTT_BASE) + "/relay/" + relayNames[i] + "/timer/status";
  mqtt.publish(t.c_str(), out, true);
}
void startRelayTimer(uint8_t i, uint32_t seconds) {
  if (i >= RELAY_COUNT)
    return;
  if (!seconds) {
    clearRelayTimer(i);
    publishRelayTimerStatus(i);
    return;
  }
  if (seconds > 86400UL)
    seconds = 86400UL;
  relayTimerUntil[i] = millis() + seconds * 1000UL;
  relaySet((uint8_t)i, true);
  publishRelayStatus(i);
  publishRelayTimerStatus(i);
}
void runRelayTimers() {
  if (mode != MANUAL)
    return;
  bool statusDue = (uint32_t)(millis() - lastTimerStatus) >= 1000UL;
  if (statusDue)
    lastTimerStatus = millis();
  for (uint8_t i = 0; i < RELAY_COUNT; i++) {
    if (!relayTimerUntil[i])
      continue;
    if (!relayOn(i) || (int32_t)(millis() - relayTimerUntil[i]) >= 0) {
      bool expired = relayOn(i) && (int32_t)(millis() - relayTimerUntil[i]) >= 0;
      clearRelayTimer(i);
      if (expired)
        relaySet(i, false);
      publishRelayStatus(i);
      publishRelayTimerStatus(i);
    } else if (statusDue)
      publishRelayTimerStatus(i);
  }
}

bool validHM(uint8_t h, uint8_t m) { return h < 24 && m < 60; }
bool parseHM(const char *s, uint8_t &h, uint8_t &m) {
  int a, b;
  if (!s || sscanf(s, "%d:%d", &a, &b) != 2 || a < 0 || a > 23 || b < 0 ||
      b > 59)
    return false;
  h = (uint8_t)a;
  m = (uint8_t)b;
  return true;
}
int relayIndex(const String &n) {
  for (int i = 0; i < RELAY_COUNT; i++)
    if (n == relayNames[i])
      return i;
  return -1;
}
bool slotIsOn(bool enabled, uint8_t onH, uint8_t onM, uint8_t offH,
              uint8_t offM, uint16_t now) {
  if (!enabled || !validHM(onH, onM) || !validHM(offH, offM))
    return false;
  uint16_t on = onH * 60U + onM, off = offH * 60U + offM;
  if (on == off)
    return false;
  return on < off ? (now >= on && now < off) : (now >= on || now < off);
}
bool relayScheduleDesired(uint8_t r, uint16_t now) {
  if (r >= RELAY_COUNT)
    return false;
  for (uint8_t s = 0; s < SLOT_COUNT; s++) {
    ScheduleSlot &slot = schedules[r][s];
    if (slotIsOn(slot.enabled, slot.onH, slot.onM, slot.offH, slot.offM, now))
      return true;
  }
  return false;
}
bool relayOn(uint8_t i) {
  return i < RELAY_COUNT && digitalRead(relayPins[i]) == RELAY_ON;
}

void relaySetRaw(uint8_t i, bool on) {
  if (i >= RELAY_COUNT)
    return;
  bool wasOn = relayOn(i);
  digitalWrite(relayPins[i], on ? RELAY_ON : RELAY_OFF);
  if (i == 0) {
    if (on && !pumpStartedAt)
      pumpStartedAt = millis();
    if (!on) {
      pumpStartedAt = 0;
      pumpMqttLostAt = 0;
    }
  }
  if (wasOn != on)
    telegramNotify(String("รีเลย์ ") + relayNames[i] + (on ? " เปิด" : " ปิด"));
}
void forcePumpOff(const char *reason) {
  relaySetRaw(0, false);
  pumpSafetyLatched = true;
  String r = reason ? reason : "unknown";
  Serial.printf("PUMP SAFETY OFF: %s\n", r.c_str());
  telegramNotify(String("แจ้งเตือนความปลอดภัยปั๊ม: ปิดปั๊มอัตโนมัติ (เหตุผล: ") + r + ")");
}
void relaySet(uint8_t i, bool on) {
  if (!on)
    clearRelayTimer(i);
  if (i != 0) {
    relaySetRaw(i, on);
    return;
  }
  if (on && mode == AUTO && pumpSafetyLatched)
    return;
  if (on) {
    if (!relayOn(0))
      pumpStartedAt = millis();
    pumpSafetyLatched = false;
    pumpMqttLostAt = 0;
    relaySetRaw(0, true);
  } else
    relaySetRaw(0, false);
}

void initFS() {
  fsReady = LittleFS.begin();
  if (!fsReady)
    Serial.println(F("LittleFS unavailable"));
}
bool loadSecrets() {
  if (!fsReady || !LittleFS.exists("/smartfarm_secrets.json"))
    return false;
  File f = LittleFS.open("/smartfarm_secrets.json", "r");
  if (!f)
    return false;
  StaticJsonDocument<640> d;
  DeserializationError e = deserializeJson(d, f);
  f.close();
  if (e)
    return false;
  strlcpy(mqttUser, d["mqttUser"] | "", sizeof(mqttUser));
  strlcpy(mqttPass, d["mqttPass"] | "", sizeof(mqttPass));
  strlcpy(otaPass, d["otaPass"] | "", sizeof(otaPass));
  strlcpy(telegramBotToken, d["telegramBotToken"] | "",
          sizeof(telegramBotToken));
  strlcpy(telegramChatId, d["telegramChatId"] | "", sizeof(telegramChatId));
  strlcpy(deviceName, d["deviceName"] | "SmartFarm-ESP8266",
          sizeof(deviceName));
  return true;
}
void saveSecrets() {
  if (!fsReady)
    return;
  StaticJsonDocument<640> d;
  d["mqttUser"] = mqttUser;
  d["mqttPass"] = mqttPass;
  d["otaPass"] = otaPass;
  d["telegramBotToken"] = telegramBotToken;
  d["telegramChatId"] = telegramChatId;
  d["deviceName"] = deviceName;
  File f = LittleFS.open("/smartfarm_secrets.json", "w");
  if (f) {
    serializeJson(d, f);
    f.close();
  }
}
void clearSchedules() {
  for (uint8_t r = 0; r < RELAY_COUNT; r++)
    for (uint8_t s = 0; s < SLOT_COUNT; s++)
      schedules[r][s] = {false, 0, 0, 0, 0};
}
void loadConfig() {
  clearSchedules();
  if (!fsReady || !LittleFS.exists("/smartfarm.json"))
    return;
  File f = LittleFS.open("/smartfarm.json", "r");
  if (!f)
    return;
  StaticJsonDocument<1536> d;
  DeserializationError e = deserializeJson(d, f);
  f.close();
  if (e) {
    Serial.println(F("Config JSON invalid - using defaults"));
    return;
  }
  const char *m = d["mode"] | "MANUAL";
  mode = !strcmp(m, "AUTO") ? AUTO : MANUAL;
  JsonArray all = d["s"].as<JsonArray>();
  if (all.isNull())
    return;
  for (uint8_t r = 0; r < RELAY_COUNT && r < all.size(); r++) {
    JsonArray rs = all[r].as<JsonArray>();
    if (rs.isNull())
      continue;
    for (uint8_t s = 0; s < SLOT_COUNT && s < rs.size(); s++) {
      JsonObject o = rs[s].as<JsonObject>();
      uint8_t oh = o["onH"] | 0, om = o["onM"] | 0, fh = o["offH"] | 0,
              fm = o["offM"] | 0;
      if (validHM(oh, om) && validHM(fh, fm) && !(oh == fh && om == fm))
        schedules[r][s] = {bool(o["enabled"] | false), oh, om, fh, fm};
    }
  }
}
void saveConfig() {
  if (!fsReady)
    return;
  StaticJsonDocument<1536> d;
  d["mode"] = mode == AUTO ? "AUTO" : "MANUAL";
  JsonArray all = d.createNestedArray("s");
  for (uint8_t r = 0; r < RELAY_COUNT; r++) {
    JsonArray rs = all.createNestedArray();
    for (uint8_t s = 0; s < SLOT_COUNT; s++) {
      JsonObject o = rs.createNestedObject();
      o["enabled"] = schedules[r][s].enabled;
      o["onH"] = schedules[r][s].onH;
      o["onM"] = schedules[r][s].onM;
      o["offH"] = schedules[r][s].offH;
      o["offM"] = schedules[r][s].offM;
    }
  }
  File f = LittleFS.open("/smartfarm.json", "w");
  if (f) {
    serializeJson(d, f);
    f.close();
  }
}
uint16_t currentMinutes() {
  if (rtcAvailable && rtcTimeValid) {
    DateTime n = rtc.now();
    return n.hour() * 60U + n.minute();
  }
  return ntp.getHours() * 60U + ntp.getMinutes();
}
String rtcIso() {
  if (rtcAvailable && rtcTimeValid) {
    DateTime n = rtc.now();
    char b[25];
    snprintf(b, sizeof(b), "%04u-%02u-%02uT%02u:%02u:%02u+07:00", n.year(),
             n.month(), n.day(), n.hour(), n.minute(), n.second());
    return String(b);
  }
  return String();
}
void initRTC() {
  Wire.begin(RTC_SDA, RTC_SCL);
  delay(5);
  rtcAvailable = rtc.begin();
  if (!rtcAvailable) {
    Serial.println(F("DS3231 not found - NTP fallback"));
    return;
  }
  if (rtc.lostPower()) {
    rtcTimeValid = false;
    Serial.println(F("DS3231 lost power - waiting for NTP sync"));
  } else {
    DateTime n = rtc.now();
    rtcTimeValid = n.year() >= 2024 && n.year() <= 2099;
  }
}
void syncRTCFromNTP(bool force = false) {
  if (!rtcAvailable || WiFi.status() != WL_CONNECTED)
    return;
  if (!force && lastRtcSync &&
      millis() - lastRtcSync < RTC_NTP_SYNC_INTERVAL_MS)
    return;
  if (ntp.forceUpdate()) {
    uint32_t localEpoch = ntp.getEpochTime();
    if (localEpoch >= 1704067200UL) {
      rtc.adjust(DateTime(localEpoch));
      rtcTimeValid = true;
      lastRtcSync = millis();
      Serial.println(F("RTC synced from NTP"));
    }
  }
}

void reportClockStatus() {
  uint32_t epoch = ntp.getEpochTime();
  Serial.print(F("NTP: epoch="));
  Serial.print(epoch);
  if (epoch >= 1704067200UL) {
    Serial.println(F(" VALID"));
    return;
  }
  Serial.println(F(" INVALID/UNSYNCED"));
}

void diagnoseMqttTransport() {
  if ((uint32_t)(millis() - lastMqttDiagnostic) <
      MQTT_DIAGNOSTIC_INTERVAL_MS)
    return;
  lastMqttDiagnostic = millis();

  Serial.print(F("MQTT DIAG: WiFi RSSI="));
  Serial.print(WiFi.RSSI());
  Serial.print(F(" IP="));
  Serial.println(WiFi.localIP());

  IPAddress resolved;
  if (!WiFi.hostByName(MQTT_SERVER, resolved)) {
    Serial.println(F("MQTT DIAG: DNS resolution FAILED"));
    return;
  }
  Serial.print(F("MQTT DIAG: DNS="));
  Serial.println(resolved);

  // Reuse the MQTT TLS client; creating a second BearSSL client here can
  // exceed the ESP8266 heap immediately after a failed handshake.
  tls.setInsecure();
  tls.setBufferSizes(4096, 512);
  tls.setTimeout(10);
  uint32_t started = millis();
  bool tcpTlsOk = tls.connect(MQTT_SERVER, MQTT_PORT);
  uint32_t elapsed = millis() - started;
  if (tcpTlsOk) {
    Serial.printf("MQTT DIAG: TLS TCP 8883 OK (%lu ms)\n",
                  (unsigned long)elapsed);
    tls.stop();
    return;
  }

  char error[128] = "";
  int errorCode = tls.getLastSSLError(error, sizeof(error));
  Serial.printf("MQTT DIAG: TLS TCP FAILED (%lu ms), ssl=%d (%s)\n",
                (unsigned long)elapsed, errorCode, error);
  tls.stop();
}

void publishRelayStatus(uint8_t i) {
  if (!mqtt.connected() || i >= RELAY_COUNT)
    return;
  String t = String(MQTT_BASE) + "/relay/" + relayNames[i] + "/status";
  mqtt.publish(t.c_str(), relayOn(i) ? "ON" : "OFF", true);
}
void publishScheduleStatus(uint8_t r) {
  if (!mqtt.connected() || r >= RELAY_COUNT)
    return;
  StaticJsonDocument<640> d;
  JsonArray slots = d.createNestedArray("slots");
  for (uint8_t s = 0; s < SLOT_COUNT; s++) {
    JsonObject o = slots.createNestedObject();
    o["enabled"] = schedules[r][s].enabled;
    char on[6], off[6];
    snprintf(on, sizeof(on), "%02u:%02u", schedules[r][s].onH,
             schedules[r][s].onM);
    snprintf(off, sizeof(off), "%02u:%02u", schedules[r][s].offH,
             schedules[r][s].offM);
    o["on"] = on;
    o["off"] = off;
  }
  char out[640];
  serializeJson(d, out, sizeof(out));
  String t = String(MQTT_BASE) + "/schedule/" + relayNames[r] + "/status";
  mqtt.publish(t.c_str(), out, true);
}
void publishStatus() {
  if (!mqtt.connected())
    return;
  for (uint8_t i = 0; i < RELAY_COUNT; i++) {
    publishRelayStatus(i);
    publishRelayTimerStatus(i);
    publishScheduleStatus(i);
  }
  mqtt.publish(MQTT_BASE "/mode/status", mode == AUTO ? "AUTO" : "MANUAL",
               true);
}
void applyAutoState(uint16_t now) {
  for (uint8_t i = 0; i < RELAY_COUNT; i++) {
    bool desired = relayScheduleDesired(i, now);
    if (i == 0) {
      if (!desired) {
        pumpSafetyLatched = false;
        relaySetRaw(0, false);
      } else if (!pumpSafetyLatched)
        relaySetRaw(0, true);
    } else
      relaySetRaw(i, desired);
  }
}

void openMqttSetupPortal() {
  if (mqttPortalOpened)
    return;
  mqttPortalOpened = true;
  Serial.println(F("MQTT CONFIG: opening SmartFarm_Setup portal"));
  WiFiManager wm;
  wm.setConfigPortalTimeout(180);
  pUser.setValue(mqttUser, sizeof(mqttUser));
  pPass.setValue(mqttPass, sizeof(mqttPass));
  pOta.setValue(otaPass, sizeof(otaPass));
  pTelegramToken.setValue(telegramBotToken, sizeof(telegramBotToken));
  pTelegramChat.setValue(telegramChatId, sizeof(telegramChatId));
  pName.setValue(deviceName, sizeof(deviceName));
  wm.addParameter(&pUser);
  wm.addParameter(&pPass);
  wm.addParameter(&pOta);
  wm.addParameter(&pTelegramToken);
  wm.addParameter(&pTelegramChat);
  wm.addParameter(&pName);
  if (wm.startConfigPortal("SmartFarm_Setup")) {
    strlcpy(mqttUser, pUser.getValue(), sizeof(mqttUser));
    strlcpy(mqttPass, pPass.getValue(), sizeof(mqttPass));
    strlcpy(otaPass, pOta.getValue(), sizeof(otaPass));
    strlcpy(telegramBotToken, pTelegramToken.getValue(),
            sizeof(telegramBotToken));
    strlcpy(telegramChatId, pTelegramChat.getValue(), sizeof(telegramChatId));
    strlcpy(deviceName, pName.getValue(), sizeof(deviceName));
    saveSecrets();
    Serial.println(F("MQTT CONFIG: credentials saved"));
    telegramNotify(F("บันทึกการตั้งค่าอุปกรณ์และ Telegram สำเร็จ"));
  } else
    Serial.println(F("MQTT CONFIG: portal timeout/failed"));
  mqttAuthFailures = 0;
  mqttConfigReported = false;
  mqttPortalOpened = false;
}

void publishTelegramStatus() {
  if (!mqtt.connected())
    return;
  StaticJsonDocument<128> d;
  d["configured"] = telegramBotToken[0] && telegramChatId[0];
  char out[128];
  serializeJson(d, out, sizeof(out));
  mqtt.publish(MQTT_BASE "/config/telegram/status", out, true);
}

bool handleTelegramConfig(const String &message) {
  StaticJsonDocument<256> d;
  if (deserializeJson(d, message))
    return false;
  const char *botToken = d["botToken"] | "";
  const char *chatId = d["chatId"] | "";
  if (!botToken[0] || !chatId[0] || strlen(botToken) >= sizeof(telegramBotToken) ||
      strlen(chatId) >= sizeof(telegramChatId))
    return false;
  strlcpy(telegramBotToken, botToken, sizeof(telegramBotToken));
  strlcpy(telegramChatId, chatId, sizeof(telegramChatId));
  saveSecrets();
  publishTelegramStatus();
  telegramNotify(F("บันทึกการตั้งค่า Telegram จากแดชบอร์ดสำเร็จ"));
  return true;
}

void mqttCallback(char *topic, byte *payload, unsigned int len) {
  String t(topic), msg;
  msg.reserve(len + 1);
  for (unsigned int i = 0; i < len; i++)
    msg += (char)payload[i];
  msg.trim();

  if (t == MQTT_BASE "/config/telegram/set") {
    if (!handleTelegramConfig(msg))
      Serial.println(F("Telegram CONFIG: invalid payload"));
    return;
  }
  if (t == MQTT_BASE "/config/telegram/test") {
    telegramNotify(F("ทดสอบ Telegram จากแดชบอร์ดสำเร็จ"));
    publishTelegramStatus();
    return;
  }

  String rp = String(MQTT_BASE) + "/relay/";
  String tp = String(MQTT_BASE) + "/relay/";
  if (t.startsWith(tp) && t.endsWith("/timer/set")) {
    String n = t.substring(tp.length(), t.length() - 10);
    int i = relayIndex(n);
    if (i < 0)
      return;
    uint32_t seconds = msg.equalsIgnoreCase("CANCEL") ? 0 : strtoul(msg.c_str(), nullptr, 10);
    if (mode == AUTO) {
      mode = MANUAL;
      pumpSafetyLatched = false;
      saveConfig();
      mqtt.publish(MQTT_BASE "/mode/status", "MANUAL", true);
    }
    startRelayTimer((uint8_t)i, seconds);
    return;
  }
  if (t.startsWith(rp) && t.endsWith("/set")) {
    String n = t.substring(rp.length(), t.length() - 4);
    int i = relayIndex(n);
    if (i < 0)
      return;
    if (mode == AUTO) {
      mode = MANUAL;
      pumpSafetyLatched = false;
      saveConfig();
      mqtt.publish(MQTT_BASE "/mode/status", "MANUAL", true);
      telegramNotify(F("เปลี่ยนโหมดจาก AUTO เป็น MANUAL จากคำสั่ง MQTT"));
    }
    if (msg.equalsIgnoreCase("ON"))
      relaySet((uint8_t)i, true);
    else if (msg.equalsIgnoreCase("OFF"))
      relaySet((uint8_t)i, false);
    else
      return;
    publishRelayStatus((uint8_t)i);
    return;
  }
  if (t == MQTT_BASE "/mode/set") {
    if (msg.equalsIgnoreCase("AUTO"))
      mode = AUTO;
    else if (msg.equalsIgnoreCase("MANUAL"))
      mode = MANUAL;
    else
      return;
    if (mode == MANUAL) {
      pumpSafetyLatched = false;
      for (uint8_t i = 0; i < RELAY_COUNT; i++)
        relaySetRaw(i, false);
    } else {
      for (uint8_t i = 0; i < RELAY_COUNT; i++)
        clearRelayTimer(i);
      applyAutoState(currentMinutes());
    }
    saveConfig();
    publishStatus();
    telegramNotify(String("เปลี่ยนโหมดเป็น ") +
                   (mode == AUTO ? "AUTO" : "MANUAL") + " จากคำสั่ง MQTT");
    return;
  }
  String sp = String(MQTT_BASE) + "/schedule/";
  if (t.startsWith(sp) && t.endsWith("/set")) {
    String n = t.substring(sp.length(), t.length() - 4);
    int r = relayIndex(n);
    if (r < 0)
      return;
    StaticJsonDocument<1024> d;
    if (msg.equalsIgnoreCase("DELETE")) {
      for (uint8_t s = 0; s < SLOT_COUNT; s++)
        schedules[r][s] = {false, 0, 0, 0, 0};
    } else {
      if (deserializeJson(d, msg))
        return;
      JsonArray slots = d["slots"].as<JsonArray>();
      if (slots.isNull())
        return;
      for (uint8_t s = 0; s < SLOT_COUNT; s++) {
        schedules[r][s] = {false, 0, 0, 0, 0};
        if (s >= slots.size())
          continue;
        JsonObject o = slots[s].as<JsonObject>();
        uint8_t oh, om, fh, fm;
        if (!parseHM(o["on"] | "", oh, om) || !parseHM(o["off"] | "", fh, fm) ||
            (oh == fh && om == fm))
          continue;
        schedules[r][s] = {bool(o["enabled"] | false), oh, om, fh, fm};
      }
    }
    saveConfig();
    if (mode == AUTO)
      applyAutoState(currentMinutes());
    publishScheduleStatus((uint8_t)r);
    publishRelayStatus((uint8_t)r);
    telegramNotify(String("อัปเดตตารางเวลาของรีเลย์ ") + relayNames[r] +
                   " จากคำสั่ง MQTT");
    return;
  }
}

const char *mqttStateName(int8_t state) {
  switch (state) {
  case MQTT_CONNECTED:
    return "CONNECTED";
  case MQTT_CONNECT_BAD_PROTOCOL:
    return "BAD_PROTOCOL";
  case MQTT_CONNECT_BAD_CLIENT_ID:
    return "BAD_CLIENT_ID";
  case MQTT_CONNECT_UNAVAILABLE:
    return "SERVER_UNAVAILABLE";
  case MQTT_CONNECT_BAD_CREDENTIALS:
    return "BAD_CREDENTIALS";
  case MQTT_CONNECT_UNAUTHORIZED:
    return "UNAUTHORIZED";
  case MQTT_CONNECT_FAILED:
    return "CONNECT_FAILED";
  case MQTT_CONNECTION_TIMEOUT:
    return "TIMEOUT";
  default:
    return "UNKNOWN";
  }
}

void connectMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }
  if (mqtt.connected())
    return;
  if (!mqttUser[0] || !mqttPass[0]) {
    if (!mqttConfigReported) {
      Serial.println(F("MQTT CONFIG: MISSING username/password"));
      Serial.println(F("MQTT CONFIG: open SmartFarm_Setup WiFi portal to enter "
                       "credentials"));
      mqttConfigReported = true;
    }
    return;
  }
  mqttConfigReported = false;
  if ((uint32_t)(millis() - lastMqttAttempt) < MQTT_RECONNECT_MS)
    return;
  lastMqttAttempt = millis();
  String cid = String(deviceName) + "-" + String(ESP.getChipId(), HEX);
  Serial.print(F("MQTT: Connecting to "));
  Serial.print(MQTT_SERVER);
  Serial.print(F(":"));
  Serial.println(MQTT_PORT);
  bool connected = mqtt.connect(cid.c_str(), mqttUser, mqttPass,
                                MQTT_BASE "/status/online", 0, true, "false");
  int8_t state = mqtt.state();
  if (connected) {
    mqttAuthFailures = 0;
    mqtt.publish(MQTT_BASE "/status/online", "true", true);
    bool s1 = mqtt.subscribe(MQTT_BASE "/relay/+/set");
    bool s2 = mqtt.subscribe(MQTT_BASE "/mode/set");
    bool s3 = mqtt.subscribe(MQTT_BASE "/schedule/+/set");
    bool s4 = mqtt.subscribe(MQTT_BASE "/config/telegram/set");
    bool s5 = mqtt.subscribe(MQTT_BASE "/config/telegram/test");
    publishStatus();
    publishTelegramStatus();
    pumpMqttLostAt = 0;
    Serial.println(F("MQTT: Connected"));
    telegramNotify(F("เชื่อมต่อ MQTT สำเร็จ"));
    Serial.printf("MQTT: Subscribe relay=%s mode=%s schedule=%s telegram=%s/%s\n",
                  s1 ? "OK" : "FAIL", s2 ? "OK" : "FAIL", s3 ? "OK" : "FAIL",
                  s4 ? "OK" : "FAIL", s5 ? "OK" : "FAIL");
    Serial.println(F("MQTT: READY"));
  } else {
    Serial.printf("MQTT: Connect FAILED state=%d (%s), heap=%u\n", state,
                  mqttStateName(state), ESP.getFreeHeap());
    // A failed BearSSL handshake can retain socket state. Release it before
    // running diagnostics or the next retry, otherwise two TLS contexts may
    // compete for the ESP8266 heap.
    mqtt.disconnect();
    tls.stop();
    if (state == MQTT_CONNECT_FAILED)
      diagnoseMqttTransport();
    switch (state) {
    case MQTT_CONNECTION_TIMEOUT:
      Serial.println(F("MQTT ERROR: connection timeout"));
      break;
    case MQTT_CONNECT_BAD_PROTOCOL:
      Serial.println(F("MQTT ERROR: bad protocol"));
      break;
    case MQTT_CONNECT_BAD_CLIENT_ID:
      Serial.println(F("MQTT ERROR: bad client ID"));
      break;
    case MQTT_CONNECT_BAD_CREDENTIALS:
      Serial.println(F("MQTT ERROR: bad credentials"));
      break;
    case MQTT_CONNECT_UNAUTHORIZED:
      Serial.println(F("MQTT ERROR: unauthorized"));
      break;
    default:
      Serial.println(F("MQTT ERROR: unknown return code"));
      break;
    }
    if (state == MQTT_CONNECT_BAD_CREDENTIALS ||
        state == MQTT_CONNECT_UNAUTHORIZED) {
      mqttAuthFailures++;
      telegramNotify(
          String("MQTT เชื่อมต่อไม่สำเร็จ: credentials/authorization ผิด (ครั้งที่ ") +
          mqttAuthFailures + ")");
      if (mqttAuthFailures >= MQTT_AUTH_FAIL_LIMIT) {
        mqttAuthFailures = 0;
        openMqttSetupPortal();
      }
    }
  }
}

void otaHttpCors() {
  otaServer.sendHeader("Access-Control-Allow-Origin", "*");
  otaServer.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  otaServer.sendHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");
}

bool otaHttpAuthorized() {
  otaHttpCors();
  if (!otaPass[0]) {
    Serial.println(F("OTA HTTP: DISABLED - OTA password is not configured"));
    otaServer.send(503, "text/plain; charset=utf-8",
                   "OTA disabled: configure ota_pass first.");
    return false;
  }
  if (!otaServer.authenticate("admin", otaPass)) {
    otaServer.requestAuthentication(BASIC_AUTH, "SmartFarm OTA");
    return false;
  }
  return true;
}

void otaHttpUpload() {
  if (!otaHttpAuthorized())
    return;
  HTTPUpload &upload = otaServer.upload();
  if (upload.status == UPLOAD_FILE_START) {
    otaUploadFailed = false;
    Serial.printf("OTA HTTP: START %s\n", upload.filename.c_str());
    telegramNotify(String("เริ่มอัปเดตเฟิร์มแวร์ผ่าน HTTP OTA โดยไฟล์ ") +
                   upload.filename);
    if (!Update.begin(upload.contentLength)) {
      otaUploadFailed = true;
      Update.printError(Serial);
    }
  } else if (upload.status == UPLOAD_FILE_WRITE) {
    if (!otaUploadFailed &&
        Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
      otaUploadFailed = true;
      Update.printError(Serial);
    }
  } else if (upload.status == UPLOAD_FILE_END) {
    if (!otaUploadFailed && Update.end(true)) {
      Serial.printf("OTA HTTP: END (%u bytes)\n", upload.totalSize);
      telegramNotify(String("อัปเดตเฟิร์มแวร์ผ่าน HTTP OTA สำเร็จ ขนาด ") +
                     upload.totalSize + " bytes; อุปกรณ์กำลังรีสตาร์ต");
    } else {
      Update.printError(Serial);
      telegramNotify(F("อัปเดตเฟิร์มแวร์ผ่าน HTTP OTA ล้มเหลว"));
    }
  } else if (upload.status == UPLOAD_FILE_ABORTED) {
    Update.end();
    Serial.println(F("OTA HTTP: ABORTED"));
    telegramNotify(F("การอัปเดตเฟิร์มแวร์ผ่าน HTTP OTA ถูกยกเลิก"));
  }
  yield();
}

void setupOtaHttpServer() {
  otaServer.on("/", HTTP_GET, []() {
    if (!otaHttpAuthorized())
      return;
    String page = F(
        "<!doctype html><html lang='en'><meta charset='utf-8'><meta "
        "name='viewport' "
        "content='width=device-width,initial-scale=1'><title>SmartFarm "
        "OTA</title><style>body{font:16px "
        "sans-serif;max-width:640px;margin:40px auto;padding:0 "
        "16px;background:#f5f7f5;color:#17251d}input,button{font:16px;padding:"
        "10px;margin:8px 0}button{cursor:pointer}</style><h1>SmartFarm "
        "OTA</h1><p>Firmware: ");
    page += SMARTFARM_VERSION;
    page += F("</p><p>Device: ");
    page += deviceName;
    page += F("</p><form method='POST' action='/update' "
              "enctype='multipart/form-data'><input type='file' "
              "name='firmware' accept='.bin' required><br><button "
              "type='submit'>Upload firmware</button></form></html>");
    otaServer.send(200, "text/html; charset=utf-8", page);
  });
  otaServer.on(
      "/update", HTTP_POST,
      []() {
        if (!otaHttpAuthorized())
          return;
        bool ok = !Update.hasError();
        otaHttpCors();
        otaServer.send(ok ? 200 : 500, "text/plain; charset=utf-8",
                       ok ? "Update complete. Device is restarting."
                          : "Update failed: firmware write error.");
        if (ok) {
          otaHttpRestartPending = true;
          otaHttpRestartAt = millis() + 1000UL;
        }
      },
      otaHttpUpload);
  otaServer.on("/api/status", HTTP_GET, []() {
    if (!otaHttpAuthorized())
      return;
    StaticJsonDocument<256> d;
    d["device"] = deviceName;
    d["firmware"] = SMARTFARM_VERSION;
    d["ip"] = WiFi.localIP().toString();
    d["rssi"] = WiFi.RSSI();
    String out;
    serializeJson(d, out);
    otaServer.send(200, "application/json", out);
  });
  otaServer.on("/", HTTP_OPTIONS, []() {
    otaHttpCors();
    otaServer.send(204);
  });
  otaServer.on("/update", HTTP_OPTIONS, []() {
    otaHttpCors();
    otaServer.send(204);
  });
  otaServer.on("/api/status", HTTP_OPTIONS, []() {
    otaHttpCors();
    otaServer.send(204);
  });
  otaServer.onNotFound([]() {
    otaHttpCors();
    otaServer.send(404, "text/plain", "Not found");
  });
  otaServer.begin();
  Serial.print(F("OTA HTTP READY: http://"));
  Serial.print(WiFi.localIP());
  Serial.println(F("/"));
}

void setupWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
  WiFiManager wm;
  wm.setConfigPortalTimeout(180);
  loadSecrets();
  pUser.setValue(mqttUser, sizeof(mqttUser));
  pPass.setValue(mqttPass, sizeof(mqttPass));
  pOta.setValue(otaPass, sizeof(otaPass));
  pTelegramToken.setValue(telegramBotToken, sizeof(telegramBotToken));
  pTelegramChat.setValue(telegramChatId, sizeof(telegramChatId));
  pName.setValue(deviceName, sizeof(deviceName));
  wm.addParameter(&pUser);
  wm.addParameter(&pPass);
  wm.addParameter(&pOta);
  wm.addParameter(&pTelegramToken);
  wm.addParameter(&pTelegramChat);
  wm.addParameter(&pName);
  Serial.println(F("WiFiManager: connecting to saved AP..."));
  if (!wm.autoConnect("SmartFarm_Setup")) {
    Serial.println(F("WiFiManager timeout - restarting"));
    delay(100);
    ESP.restart();
  }
  strlcpy(mqttUser, pUser.getValue(), sizeof(mqttUser));
  strlcpy(mqttPass, pPass.getValue(), sizeof(mqttPass));
  strlcpy(otaPass, pOta.getValue(), sizeof(otaPass));
  strlcpy(telegramBotToken, pTelegramToken.getValue(),
          sizeof(telegramBotToken));
  strlcpy(telegramChatId, pTelegramChat.getValue(), sizeof(telegramChatId));
  strlcpy(deviceName, pName.getValue(), sizeof(deviceName));
  saveSecrets();
  Serial.print(F("WiFi connected, IP: "));
  Serial.println(WiFi.localIP());
  if (!mqttUser[0] || !mqttPass[0]) {
    Serial.println(
        F("MQTT CONFIG: credentials not saved - opening setup portal"));
    openMqttSetupPortal();
  }
}

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println();
  Serial.println(F("\n=== SmartFarm V6.0.1 HARDENED BOOT ==="));
  Serial.print(F("Reset reason: "));
  Serial.println(ESP.getResetReason());
  Serial.print(F("Reset info: "));
  Serial.println(ESP.getResetInfo());
  Serial.print(F("Free heap at boot: "));
  Serial.println(ESP.getFreeHeap());
  for (uint8_t i = 0; i < RELAY_COUNT; i++) {
    pinMode(relayPins[i], OUTPUT);
    digitalWrite(relayPins[i], RELAY_OFF);
  }
  initFS();
  loadConfig();
  initRTC();
  dht.begin();
  ntp.begin();
  Serial.print(F("Heap before WiFi: "));
  Serial.println(ESP.getFreeHeap());
  setupWifi();
  Serial.print(F("Heap after WiFi: "));
  Serial.println(ESP.getFreeHeap());
  tls.setInsecure();
  tls.setBufferSizes(4096, 512);
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setSocketTimeout(20);
  mqtt.setKeepAlive(30);
  // Keep both MQTT and TLS buffers small; current payloads fit comfortably.
  mqtt.setBufferSize(768);
  syncRTCFromNTP(true);
  reportClockStatus();
  if (mode == AUTO)
    applyAutoState(currentMinutes());
  ArduinoOTA.setHostname(deviceName);
  ArduinoOTA.onStart([]() {
    Serial.println(F("OTA: START"));
    telegramNotify(F("เริ่มอัปเดตเฟิร์มแวร์ผ่าน ArduinoOTA"));
  });
  ArduinoOTA.onEnd([]() {
    Serial.println(F("OTA: END"));
    telegramNotify(F("อัปเดตเฟิร์มแวร์ผ่าน ArduinoOTA สำเร็จ"));
  });
  ArduinoOTA.onError([](ota_error_t e) {
    Serial.printf("OTA: ERROR %u\n", e);
    telegramNotify(String("ArduinoOTA ล้มเหลว รหัสข้อผิดพลาด ") + e);
  });
  if (otaPass[0]) {
    ArduinoOTA.setPassword(otaPass);
    ArduinoOTA.begin();
    Serial.println(F("OTA: READY (password protected)"));
  } else {
    Serial.println(F("OTA: DISABLED - configure ota_pass in SmartFarm_Setup"));
  }
  setupOtaHttpServer();
  Serial.print(F("MQTT server: "));
  Serial.print(MQTT_SERVER);
  Serial.print(F(":"));
  Serial.println(MQTT_PORT);
  Serial.print(F("MQTT credentials: "));
  Serial.println((mqttUser[0] && mqttPass[0]) ? F("PRESENT") : F("MISSING"));
  Serial.print(F("Boot complete, heap: "));
  Serial.println(ESP.getFreeHeap());
  telegramNotify(String("อุปกรณ์บูตสำเร็จ IP=") + WiFi.localIP().toString() +
                 " firmware=" + SMARTFARM_VERSION);
}

void runSafety() {
  if (!relayOn(0)) {
    pumpStartedAt = 0;
    pumpMqttLostAt = 0;
    return;
  }
  if (!pumpStartedAt)
    pumpStartedAt = millis();
  if ((uint32_t)(millis() - pumpStartedAt) >= PUMP_MAX_RUNTIME_MS) {
    forcePumpOff("max runtime");
    return;
  }
  if (mode == MANUAL && !mqtt.connected()) {
    if (!pumpMqttLostAt)
      pumpMqttLostAt = millis();
    if ((uint32_t)(millis() - pumpMqttLostAt) >= PUMP_MQTT_LOSS_OFF_MS)
      forcePumpOff("MQTT lost");
  } else
    pumpMqttLostAt = 0;
}
void runSchedules() {
  if (mode != AUTO ||
      (uint32_t)(millis() - lastSchedule) < SCHEDULE_INTERVAL_MS)
    return;
  lastSchedule = millis();
  applyAutoState(currentMinutes());
}

void publishHeartbeat() {
  if (!mqtt.connected())
    return;
  StaticJsonDocument<384> d;
  d["online"] = true;
  d["firmware"] = SMARTFARM_VERSION;
  d["heap"] = ESP.getFreeHeap();
  d["rssi"] = WiFi.RSSI();
  d["mode"] = mode == AUTO ? "AUTO" : "MANUAL";
  d["pumpSafeLock"] = pumpSafetyLatched;
  d["rtc"] = rtcAvailable && rtcTimeValid;
  String iso = rtcIso();
  if (iso.length())
    d["time"] = iso;
  char out[384];
  serializeJson(d, out, sizeof(out));
  mqtt.publish(MQTT_BASE "/device/status", out, false);
}

void loop() {
  ESP.wdtFeed();
  reportWifiState();
  if (WiFi.status() == WL_CONNECTED) {
    connectMqtt();
    if (mqtt.connected())
      mqtt.loop();
    ntp.update();
    syncRTCFromNTP(false);
  } else {
    if (relayOn(0) && mode == MANUAL && !pumpMqttLostAt)
      pumpMqttLostAt = millis();
  }
  otaServer.handleClient();
  ArduinoOTA.handle();
  if (otaHttpRestartPending && (int32_t)(millis() - otaHttpRestartAt) >= 0)
    ESP.restart();
  runSafety();
  runRelayTimers();
  runSchedules();
  if ((uint32_t)(millis() - lastSensor) >= SENSOR_INTERVAL_MS) {
    lastSensor = millis();
    float h = dht.readHumidity(), c = dht.readTemperature();
    if (mqtt.connected() && !isnan(h) && !isnan(c)) {
      StaticJsonDocument<160> d;
      d["temperature"] = c;
      d["humidity"] = h;
      char out[160];
      serializeJson(d, out, sizeof(out));
      mqtt.publish(MQTT_BASE "/sensor/dht11", out, false);
    }
  }
  if ((uint32_t)(millis() - lastHeartbeat) >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeat = millis();
    publishHeartbeat();
  }
  yield();
}
