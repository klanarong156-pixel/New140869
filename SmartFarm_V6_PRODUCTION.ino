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

struct ScheduleSlot;

#define SMARTFARM_VERSION "V7.1.0-FIELD-STABILITY"
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
#define WIFI_RESET_BUTTON D1

const uint32_t WIFI_RESET_HOLD_MS = 5000UL;
const uint32_t MQTT_RECONNECT_MS = 5000UL;
const uint32_t SENSOR_INTERVAL_MS = 30000UL;
const uint32_t HEARTBEAT_INTERVAL_MS = 10000UL;
const uint32_t SCHEDULE_INTERVAL_MS = 1000UL;
const uint32_t RTC_NTP_SYNC_INTERVAL_MS = 6UL * 60UL * 60UL * 1000UL;
const uint8_t MQTT_AUTH_FAIL_LIMIT = 3;
const uint32_t MQTT_DIAGNOSTIC_INTERVAL_MS = 30000UL;
const uint32_t WIFI_RECONNECT_INTERVAL_MS = 15000UL;

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
         lastHeartbeat = 0, lastSchedule = 0, lastMqttDiagnostic = 0,
         lastWifiReconnect = 0, lastSensorValidAt = 0;
uint32_t sensorReadCount = 0, sensorFaultCount = 0;
uint32_t wifiReconnectRequests = 0, mqttConnectAttempts = 0,
         mqttConnectFailures = 0;
uint8_t mqttAuthFailures = 0;
bool mqttPortalOpened = false;
bool mqttConfigReported = false;
bool otaHttpRestartPending = false;
unsigned long otaHttpRestartAt = 0;
bool otaUploadFailed = false;
bool otaUploadCompleted = false;
size_t otaUploadBytes = 0;
bool wifiStateKnown = false, lastWifiConnected = false;
bool wifiResetPressed = false;
bool otaUpdateInProgress = false;
uint32_t wifiResetStartedAt = 0;

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

bool telegramNotifyNow(const String &message) {
  if (WiFi.status() != WL_CONNECTED || !telegramBotToken[0] ||
      !telegramChatId[0])
    return false;

  telegramTls.setInsecure();
  telegramTls.setBufferSizes(4096, 512);
  // Keep Telegram notifications bounded so they cannot starve MQTT keep-alives.
  telegramTls.setTimeout(5000);
  String url = String("https://api.telegram.org/bot") + telegramBotToken +
               "/sendMessage";
  String body = String("chat_id=") + urlEncode(telegramChatId) + "&text=" +
                urlEncode(String("[SmartFarm ") + deviceName + "]\n" + message);

  for (uint8_t attempt = 1; attempt <= 1; ++attempt) {
    HTTPClient http;
    http.setTimeout(5000);
    http.setReuse(false);
    http.useHTTP10(true);
    if (!http.begin(telegramTls, url)) {
      Serial.printf("Telegram: HTTPS begin failed attempt %u, heap=%u\n",
                    attempt, ESP.getFreeHeap());
      continue;
    }

    http.addHeader("Content-Type", "application/x-www-form-urlencoded");
    int code = http.POST(body);
    String response = http.getString();
    if (code >= 200 && code < 300) {
      Serial.printf("Telegram: sent OK HTTP %d\n", code);
      http.end();
      return true;
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
  }
  return false;
}

// Relay, Wi-Fi and MQTT events are queued so a Telegram HTTPS request cannot
// run inside a relay command or MQTT callback. Reminder/test operations still
// use telegramNotifyNow() because their result is part of the existing reply.
struct TelegramQueueItem {
  String message;
  uint8_t attempts;
};
static const uint8_t TELEGRAM_QUEUE_SIZE = 4;
TelegramQueueItem telegramQueue[TELEGRAM_QUEUE_SIZE];
uint8_t telegramQueueHead = 0, telegramQueueTail = 0, telegramQueueCount = 0;
uint32_t lastTelegramAttempt = 0;

bool queueTelegram(const String &message) {
  if (!telegramBotToken[0] || !telegramChatId[0] || !message.length())
    return false;
  if (telegramQueueCount >= TELEGRAM_QUEUE_SIZE) {
    Serial.println(F("Telegram queue full; dropping non-critical event"));
    return false;
  }
  telegramQueue[telegramQueueTail].message = message;
  telegramQueue[telegramQueueTail].attempts = 0;
  telegramQueueTail = (telegramQueueTail + 1) % TELEGRAM_QUEUE_SIZE;
  telegramQueueCount++;
  return true;
}

void processTelegramQueue() {
  if (otaUpdateInProgress || !telegramQueueCount ||
      WiFi.status() != WL_CONNECTED || !telegramBotToken[0] ||
      !telegramChatId[0])
    return;
  if ((uint32_t)(millis() - lastTelegramAttempt) < 15000UL)
    return;
  lastTelegramAttempt = millis();
  TelegramQueueItem &item = telegramQueue[telegramQueueHead];
  if (telegramNotifyNow(item.message) || ++item.attempts >= 2) {
    item.message = "";
    item.attempts = 0;
    telegramQueueHead = (telegramQueueHead + 1) % TELEGRAM_QUEUE_SIZE;
    telegramQueueCount--;
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
    queueTelegram(String("WiFi กลับมาเชื่อมต่อสำเร็จ IP=") +
                  WiFi.localIP().toString());
  } else {
    Serial.println(F("WiFi: disconnected"));
    // Drop stale MQTT/TLS state immediately. The next Wi-Fi recovery can
    // establish a clean TLS session instead of reusing a broken socket.
    mqtt.disconnect();
    tls.stop();
    lastMqttAttempt = millis() - MQTT_RECONNECT_MS;
  }
}

void maintainWifi() {
  if (WiFi.status() == WL_CONNECTED)
    return;
  if ((uint32_t)(millis() - lastWifiReconnect) < WIFI_RECONNECT_INTERVAL_MS)
    return;
  lastWifiReconnect = millis();
  wifiReconnectRequests++;
  Serial.println(F("WiFi: reconnect requested"));
  WiFi.reconnect();
}

struct ScheduleSlot {
  bool enabled;
  uint8_t onH, onM, offH, offM;
};
static const uint8_t RELAY_COUNT = 4, SLOT_COUNT = 4;
ScheduleSlot schedules[RELAY_COUNT][SLOT_COUNT] = {};

static const uint8_t REMINDER_COUNT = 8;
struct CropReminder {
  bool enabled;
  bool done;
  uint8_t leadDays;
  uint8_t repeatEveryDays;
  char id[32];
  char title[72];
  char dueDate[11];
  char note[128];
  char plotId[32];
  char lastSentDate[11];
};
CropReminder reminders[REMINDER_COUNT] = {};
bool reminderEnabled = true;
bool reminderRepeatDaily = false;
uint8_t reminderQuietStartHour = 22;
uint8_t reminderQuietStartMinute = 0;
uint8_t reminderQuietEndHour = 7;
uint8_t reminderQuietEndMinute = 0;
uint8_t reminderDefaultLeadDays = 1;
uint8_t reminderHour = 18;
uint8_t reminderMinute = 0;
uint32_t lastReminderCheck = 0;

const uint8_t relayPins[RELAY_COUNT] = {RELAY_PUMP, RELAY_ZONE1,
                                        RELAY_LIGHT_HOME, RELAY_LIGHT_SALA};
const char *relayNames[RELAY_COUNT] = {"pump", "zone1", "lighthome",
                                       "lightsala"};
uint32_t pumpStartedAt = 0;
uint32_t relayTimerUntil[RELAY_COUNT] = {};
bool relayTimerUnlimited[RELAY_COUNT] = {};
uint32_t lastTimerStatus = 0;
bool pumpSafetyLatched = false;
bool emergencyLock = false;
uint32_t emergencyTimestamp = 0;
char emergencySource[24] = "";
static const uint32_t MAX_TIMER_SECONDS = 4294967UL;

void relaySet(uint8_t i, bool on);
void publishRelayStatus(uint8_t i);
void publishEmergencyStatus();

void clearRelayTimer(uint8_t i) {
  if (i < RELAY_COUNT) {
    relayTimerUntil[i] = 0;
    relayTimerUnlimited[i] = false;
  }
}
void publishRelayTimerStatus(uint8_t i) {
  if (!mqtt.connected() || i >= RELAY_COUNT)
    return;
  StaticJsonDocument<160> d;
  uint32_t remaining = relayTimerUnlimited[i]
                           ? 0
                           : (relayTimerUntil[i]
                                  ? (int32_t)(relayTimerUntil[i] - millis()) > 0
                                        ? (relayTimerUntil[i] - millis()) / 1000UL
                                        : 0
                                  : 0);
  d["active"] = relayTimerUnlimited[i] || remaining > 0;
  d["unlimited"] = relayTimerUnlimited[i];
  d["remaining"] = remaining;
  char out[160];
  serializeJson(d, out, sizeof(out));
  String t = String(MQTT_BASE) + "/relay/" + relayNames[i] + "/timer/status";
  mqtt.publish(t.c_str(), out, true);
}
bool startRelayTimer(uint8_t i, uint32_t seconds, bool unlimited = false) {
  if (i >= RELAY_COUNT || (!unlimited && seconds > MAX_TIMER_SECONDS))
    return false;
  if (!seconds && !unlimited) {
    clearRelayTimer(i);
    relaySet(i, false);
    publishRelayStatus(i);
    publishRelayTimerStatus(i);
    return true;
  }
  if (emergencyLock || otaUpdateInProgress)
    return false;
  relayTimerUnlimited[i] = unlimited;
  relayTimerUntil[i] = unlimited ? 0 : millis() + seconds * 1000UL;
  relaySet((uint8_t)i, true);
  publishRelayStatus(i);
  publishRelayTimerStatus(i);
  return true;
}
void runRelayTimers() {
  bool statusDue = (uint32_t)(millis() - lastTimerStatus) >= 1000UL;
  if (statusDue)
    lastTimerStatus = millis();
  for (uint8_t i = 0; i < RELAY_COUNT; i++) {
    if (relayTimerUnlimited[i]) {
      if (!relayOn(i)) {
        clearRelayTimer(i);
        publishRelayTimerStatus(i);
        continue;
      }
      if (statusDue) publishRelayTimerStatus(i);
      continue;
    }
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

bool parseTimerSeconds(const String &value, uint32_t &seconds) {
  if (!value.length()) return false;
  uint32_t parsed = 0;
  for (size_t index = 0; index < value.length(); index++) {
    char c = value[index];
    if (c < '0' || c > '9') return false;
    uint32_t digit = (uint32_t)(c - '0');
    if (parsed > (MAX_TIMER_SECONDS - digit) / 10UL) return false;
    parsed = parsed * 10UL + digit;
  }
  if (parsed == 0) return false;
  seconds = parsed;
  return true;
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
bool relayHasSchedule(uint8_t r) {
  if (r >= RELAY_COUNT) return false;
  for (uint8_t s = 0; s < SLOT_COUNT; s++)
    if (schedules[r][s].enabled) return true;
  return false;
}
bool schedulesOverlap(const ScheduleSlot &a, const ScheduleSlot &b) {
  if (!a.enabled || !b.enabled) return false;
  for (uint16_t minute = 0; minute < 1440; minute++) {
    if (slotIsOn(a.enabled, a.onH, a.onM, a.offH, a.offM, minute) &&
        slotIsOn(b.enabled, b.onH, b.onM, b.offH, b.offM, minute))
      return true;
  }
  return false;
}
bool scheduleSetValid(const ScheduleSlot *candidate) {
  for (uint8_t i = 0; i < SLOT_COUNT; i++) {
    if (candidate[i].enabled &&
        (!validHM(candidate[i].onH, candidate[i].onM) ||
         !validHM(candidate[i].offH, candidate[i].offM) ||
         (candidate[i].onH == candidate[i].offH && candidate[i].onM == candidate[i].offM)))
      return false;
    for (uint8_t j = i + 1; j < SLOT_COUNT; j++)
      if (schedulesOverlap(candidate[i], candidate[j])) return false;
  }
  return true;
}
bool validRtcDateTime(const DateTime &value) {
  return value.isValid() && value.year() >= 2024 && value.year() <= 2099;
}
bool readRtcNow(DateTime &value) {
  if (!rtcAvailable) {
    rtcTimeValid = false;
    return false;
  }
  DateTime candidate = rtc.now();
  if (!validRtcDateTime(candidate)) {
    rtcTimeValid = false;
    return false;
  }
  value = candidate;
  rtcTimeValid = true;
  return true;
}
bool clockIsValid() {
  if (rtcAvailable && rtcTimeValid) {
    DateTime checked(2000, 1, 1);
    if (readRtcNow(checked)) return true;
  }
  return ntp.getEpochTime() >= 1704067200UL;
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
  if (wasOn == on)
    return;
  digitalWrite(relayPins[i], on ? RELAY_ON : RELAY_OFF);
  if (i == 0) {
    if (on && !pumpStartedAt)
      pumpStartedAt = millis();
    if (!on) {
      pumpStartedAt = 0;
    }
  }
  if (wasOn != on)
    queueTelegram(String("รีเลย์ ") + relayNames[i] + (on ? " เปิด" : " ปิด"));
}

void enterOtaSafeState() {
  otaUpdateInProgress = true;
  for (uint8_t i = 0; i < RELAY_COUNT; i++) {
    clearRelayTimer(i);
    digitalWrite(relayPins[i], RELAY_OFF);
  }
  pumpStartedAt = 0;
  pumpSafetyLatched = false;
  Serial.println(F("OTA: all relays forced OFF for firmware update"));
}

void leaveOtaSafeState() {
  otaUpdateInProgress = false;
  pumpSafetyLatched = false;
  Serial.println(F("OTA: safe state released after failed/aborted update"));
}

void relaySet(uint8_t i, bool on) {
  if (i >= RELAY_COUNT)
    return;
  if (on && (emergencyLock || otaUpdateInProgress))
    return;
  if (!on)
    clearRelayTimer(i);
  if (i != 0) {
    relaySetRaw(i, on);
    return;
  }
  if (on && pumpSafetyLatched)
    return;
  if (on) {
    if (!relayOn(0))
      pumpStartedAt = millis();
    pumpSafetyLatched = false;
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
  JsonArray all = d["s"].as<JsonArray>();
  if (all.isNull())
    return;
  for (uint8_t r = 0; r < RELAY_COUNT && r < all.size(); r++) {
    JsonArray rs = all[r].as<JsonArray>();
    if (rs.isNull()) continue;
    ScheduleSlot candidate[SLOT_COUNT] = {};
    for (uint8_t s = 0; s < SLOT_COUNT && s < rs.size(); s++) {
      JsonObject o = rs[s].as<JsonObject>();
      uint8_t oh = o["onH"] | 0, om = o["onM"] | 0, fh = o["offH"] | 0,
              fm = o["offM"] | 0;
      if (validHM(oh, om) && validHM(fh, fm) && !(oh == fh && om == fm))
        candidate[s] = {bool(o["enabled"] | false), oh, om, fh, fm};
    }
    if (scheduleSetValid(candidate)) {
      for (uint8_t s = 0; s < SLOT_COUNT; s++) schedules[r][s] = candidate[s];
    } else {
      Serial.printf("Schedule: overlap rejected relay=%s\n", relayNames[r]);
    }
  }
}
void saveConfig() {
  if (!fsReady)
    return;
  StaticJsonDocument<1536> d;
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

int clampInt(int value, int minimum, int maximum, int fallback) {
  if (value < minimum || value > maximum)
    return fallback;
  return value;
}

bool validDateString(const char *value) {
  int y, m, day;
  if (!value || sscanf(value, "%d-%d-%d", &y, &m, &day) != 3)
    return false;
  DateTime date(y, m, day);
  return date.isValid();
}

String currentDateString() {
  DateTime now(2000, 1, 1);
  if (readRtcNow(now)) {
    char out[11];
    snprintf(out, sizeof(out), "%04u-%02u-%02u", now.year(), now.month(),
             now.day());
    return String(out);
  }
  uint32_t epoch = ntp.getEpochTime();
  if (epoch < 1704067200UL)
    return String();
  DateTime fallbackNow(epoch);
  char out[12];
  snprintf(out, sizeof(out), "%04u-%02u-%02u", fallbackNow.year(), fallbackNow.month(), fallbackNow.day());
  return String(out);
}

int dateDeltaDays(const char *target, const String &today) {
  if (!validDateString(target) || !validDateString(today.c_str()))
    return 9999;
  int ty, tm, td, yy, ym, yd;
  if (sscanf(target, "%d-%d-%d", &ty, &tm, &td) != 3 ||
      sscanf(today.c_str(), "%d-%d-%d", &yy, &ym, &yd) != 3)
    return 9999;
  DateTime targetDate(ty, tm, td), todayDate(yy, ym, yd);
  return (int)((targetDate.unixtime() - todayDate.unixtime()) / 86400L);
}

int findReminder(const char *id) {
  if (!id || !id[0])
    return -1;
  for (uint8_t i = 0; i < REMINDER_COUNT; i++)
    if (reminders[i].id[0] && strcmp(reminders[i].id, id) == 0)
      return i;
  return -1;
}

int findEmptyReminder() {
  for (uint8_t i = 0; i < REMINDER_COUNT; i++)
    if (!reminders[i].enabled && !reminders[i].id[0])
      return i;
  return -1;
}

void clearReminders() {
  for (uint8_t i = 0; i < REMINDER_COUNT; i++)
    reminders[i] = {};
}

void loadReminders() {
  clearReminders();
  reminderEnabled = true;
  reminderRepeatDaily = false;
  reminderQuietStartHour = 22;
  reminderQuietStartMinute = 0;
  reminderQuietEndHour = 7;
  reminderQuietEndMinute = 0;
  reminderDefaultLeadDays = 1;
  reminderHour = 18;
  reminderMinute = 0;
  if (!fsReady || !LittleFS.exists("/smartfarm_reminders.json"))
    return;
  File f = LittleFS.open("/smartfarm_reminders.json", "r");
  if (!f)
    return;
  DynamicJsonDocument d(4096);
  DeserializationError e = deserializeJson(d, f);
  f.close();
  if (e)
    return;
  reminderEnabled = d["enabled"] | true;
  reminderRepeatDaily = d["repeatDaily"] | false;
  reminderQuietStartHour = clampInt(d["quietStartHour"] | 22, 0, 23, 22);
  reminderQuietStartMinute = clampInt(d["quietStartMinute"] | 0, 0, 59, 0);
  reminderQuietEndHour = clampInt(d["quietEndHour"] | 7, 0, 23, 7);
  reminderQuietEndMinute = clampInt(d["quietEndMinute"] | 0, 0, 59, 0);
  reminderDefaultLeadDays = clampInt(d["leadDays"] | 1, 0, 7, 1);
  reminderHour = clampInt(d["hour"] | 18, 0, 23, 18);
  reminderMinute = clampInt(d["minute"] | 0, 0, 59, 0);
  JsonArray items = d["items"].as<JsonArray>();
  if (items.isNull())
    return;
  uint8_t index = 0;
  for (JsonObject item : items) {
    if (index >= REMINDER_COUNT)
      break;
    const char *id = item["id"] | "";
    const char *title = item["title"] | "";
    const char *due = item["due"] | "";
    if (!id[0] || !title[0] || !validDateString(due))
      continue;
    CropReminder &reminder = reminders[index++];
    reminder.enabled = item["enabled"] | true;
    reminder.done = item["done"] | false;
    reminder.repeatEveryDays = clampInt(item["repeatEveryDays"] | 0, 0, 30, 0);
    reminder.leadDays = clampInt(item["leadDays"] | reminderDefaultLeadDays, 0, 7, reminderDefaultLeadDays);
    strlcpy(reminder.id, id, sizeof(reminder.id));
    strlcpy(reminder.title, title, sizeof(reminder.title));
    strlcpy(reminder.dueDate, due, sizeof(reminder.dueDate));
    strlcpy(reminder.note, item["note"] | "", sizeof(reminder.note));
    strlcpy(reminder.plotId, item["plotId"] | "", sizeof(reminder.plotId));
    strlcpy(reminder.lastSentDate, item["lastSentDate"] | "",
            sizeof(reminder.lastSentDate));
  }
}

void saveReminders() {
  if (!fsReady)
    return;
  DynamicJsonDocument d(4096);
  d["enabled"] = reminderEnabled;
  d["repeatDaily"] = reminderRepeatDaily;
  d["quietStartHour"] = reminderQuietStartHour;
  d["quietStartMinute"] = reminderQuietStartMinute;
  d["quietEndHour"] = reminderQuietEndHour;
  d["quietEndMinute"] = reminderQuietEndMinute;
  d["leadDays"] = reminderDefaultLeadDays;
  d["hour"] = reminderHour;
  d["minute"] = reminderMinute;
  JsonArray items = d.createNestedArray("items");
  for (uint8_t i = 0; i < REMINDER_COUNT; i++) {
    if (!reminders[i].id[0])
      continue;
    JsonObject item = items.createNestedObject();
    item["enabled"] = reminders[i].enabled;
    item["done"] = reminders[i].done;
    item["repeatEveryDays"] = reminders[i].repeatEveryDays;
    item["leadDays"] = reminders[i].leadDays;
    item["id"] = reminders[i].id;
    item["title"] = reminders[i].title;
    item["due"] = reminders[i].dueDate;
    item["note"] = reminders[i].note;
    item["plotId"] = reminders[i].plotId;
    item["lastSentDate"] = reminders[i].lastSentDate;
  }
  File f = LittleFS.open("/smartfarm_reminders.json", "w");
  if (f) {
    serializeJson(d, f);
    f.close();
  }
}

void publishReminderStatus(const char *event, int index = -1,
                           const String &detail = String()) {
  if (!mqtt.connected())
    return;
  StaticJsonDocument<768> d;
  d["event"] = event ? event : "status";
  d["enabled"] = reminderEnabled;
  d["repeatDaily"] = reminderRepeatDaily;
  d["quietStartHour"] = reminderQuietStartHour;
  d["quietStartMinute"] = reminderQuietStartMinute;
  d["quietEndHour"] = reminderQuietEndHour;
  d["quietEndMinute"] = reminderQuietEndMinute;
  d["leadDays"] = reminderDefaultLeadDays;
  d["hour"] = reminderHour;
  d["minute"] = reminderMinute;
  if (index >= 0 && index < REMINDER_COUNT) {
    CropReminder &reminder = reminders[index];
    d["id"] = reminder.id;
    d["done"] = reminder.done;
    d["taskEnabled"] = reminder.enabled;
    d["due"] = reminder.dueDate;
    d["repeatEveryDays"] = reminder.repeatEveryDays;
    d["plotId"] = reminder.plotId;
    d["lastSentDate"] = reminder.lastSentDate;
  }
  if (detail.length())
    d["detail"] = detail;
  char out[768];
  serializeJson(d, out, sizeof(out));
  mqtt.publish(MQTT_BASE "/reminder/status", out, true);
}

bool handleReminderMessage(const String &message) {
  StaticJsonDocument<768> d;
  if (deserializeJson(d, message))
    return false;
  const char *op = d["op"] | "";
  if (strcmp(op, "settings") == 0) {
    reminderEnabled = d["enabled"] | true;
    reminderRepeatDaily = d["repeatDaily"] | false;
    reminderQuietStartHour = clampInt(d["quietStartHour"] | 22, 0, 23, 22);
    reminderQuietStartMinute = clampInt(d["quietStartMinute"] | 0, 0, 59, 0);
    reminderQuietEndHour = clampInt(d["quietEndHour"] | 7, 0, 23, 7);
    reminderQuietEndMinute = clampInt(d["quietEndMinute"] | 0, 0, 59, 0);
    reminderDefaultLeadDays = clampInt(d["leadDays"] | 1, 0, 7, 1);
    reminderHour = clampInt(d["hour"] | 18, 0, 23, 18);
    reminderMinute = clampInt(d["minute"] | 0, 0, 59, 0);
    saveReminders();
    publishReminderStatus("settings");
    return true;
  }
  if (strcmp(op, "sync") == 0) {
    publishReminderStatus("sync");
    return true;
  }
  if (strcmp(op, "test") == 0) {
    bool sent =     telegramNotifyNow(F("ทดสอบ Telegram reminder จาก ESP8266 สำเร็จ"));
    publishReminderStatus(sent ? "test_sent" : "test_failed");
    return sent;
  }

  const char *id = d["id"] | "";
  int index = findReminder(id);
  if (strcmp(op, "delete") == 0) {
    if (index < 0)
      return false;
    reminders[index] = {};
    saveReminders();
    publishReminderStatus("delete", -1, String(id));
    return true;
  }
  if (strcmp(op, "done") == 0) {
    if (index < 0)
      return false;
    reminders[index].done = d["done"] | true;
    saveReminders();
    publishReminderStatus("done", index);
    return true;
  }
  if (strcmp(op, "snooze") == 0) {
    const char *due = d["due"] | "";
    if (index < 0 || !validDateString(due))
      return false;
    strlcpy(reminders[index].dueDate, due, sizeof(reminders[index].dueDate));
    reminders[index].done = false;
    reminders[index].lastSentDate[0] = '\0';
    saveReminders();
    publishReminderStatus("snooze", index);
    return true;
  }
  if (strcmp(op, "upsert") != 0)
    return false;

  const char *title = d["title"] | "";
  const char *due = d["due"] | "";
  if (!id[0] || !title[0] || !validDateString(due))
    return false;
  if (index < 0)
    index = findEmptyReminder();
  if (index < 0)
    return false;
  CropReminder &reminder = reminders[index];
    uint8_t nextRepeatEveryDays = clampInt(d["repeatEveryDays"] | 0, 0, 30, 0);
  const char *nextPlotId = d["plotId"] | "";
  bool changed = strcmp(reminder.title, title) != 0 ||
                 strcmp(reminder.dueDate, due) != 0 ||
                 strcmp(reminder.plotId, nextPlotId) != 0 ||
                 reminder.repeatEveryDays != nextRepeatEveryDays ||
                 reminder.leadDays !=
                     clampInt(d["leadDays"] | reminderDefaultLeadDays, 0, 7, reminderDefaultLeadDays);
  reminder.enabled = d["enabled"] | true;
  reminder.done = d["done"] | false;
  reminder.repeatEveryDays = nextRepeatEveryDays;
  reminder.leadDays = clampInt(d["leadDays"] | reminderDefaultLeadDays, 0, 7, reminderDefaultLeadDays);

  strlcpy(reminder.id, id, sizeof(reminder.id));
  strlcpy(reminder.title, title, sizeof(reminder.title));
  strlcpy(reminder.dueDate, due, sizeof(reminder.dueDate));
  strlcpy(reminder.note, d["note"] | "", sizeof(reminder.note));
  strlcpy(reminder.plotId, nextPlotId, sizeof(reminder.plotId));
  if (changed)
    reminder.lastSentDate[0] = '\0';
  saveReminders();
  publishReminderStatus("upsert", index);
  return true;
}

String reminderDateAfterDays(const char *value, int days) {
  if (!validDateString(value))
    return String(value ? value : "");
  int year = 0, month = 0, day = 0;
  if (sscanf(value, "%d-%d-%d", &year, &month, &day) != 3)
    return String(value);
  DateTime next((uint32_t)(DateTime(year, month, day).unixtime() + (int32_t)days * 86400L));
  char out[11];
  snprintf(out, sizeof(out), "%04u-%02u-%02u", next.year(), next.month(), next.day());
  return String(out);
}

bool reminderInQuietHours() {
  uint16_t now = currentMinutes();
  uint16_t start = reminderQuietStartHour * 60U + reminderQuietStartMinute;
  uint16_t end = reminderQuietEndHour * 60U + reminderQuietEndMinute;
  if (start == end)
    return false;
  return start < end ? (now >= start && now < end) : (now >= start || now < end);
}

void runReminderTask(uint8_t index, const String &today, bool overdue) {
  CropReminder &reminder = reminders[index];
  String message = overdue ? "งานรอบปลูกเลยกำหนดแล้ว" : "แจ้งเตือนงานรอบปลูกล่วงหน้า";
  message += "\n\n";
  message += overdue ? "งาน: " : "กำหนด: ";
  message += reminder.title;
  if (reminder.plotId[0]) {
    message += "\nแปลง: ";
    message += reminder.plotId;
  }
  message += "\nครบกำหนด: ";
  message += reminder.dueDate;
  if (reminder.repeatEveryDays > 0) {
    message += "\nทำซ้ำทุก ";
    message += reminder.repeatEveryDays;
    message += " วัน";
  }
  if (reminder.note[0]) {
    message += "\nรายละเอียด: ";
    message += reminder.note;
  }
  if (telegramNotifyNow(message)) {
    if (reminder.repeatEveryDays > 0) {
      String nextDue = reminderDateAfterDays(reminder.dueDate, reminder.repeatEveryDays);
      strlcpy(reminder.dueDate, nextDue.c_str(), sizeof(reminder.dueDate));
      reminder.lastSentDate[0] = '\0';
    } else {
      strlcpy(reminder.lastSentDate, today.c_str(), sizeof(reminder.lastSentDate));
    }
    saveReminders();
    publishReminderStatus(reminder.repeatEveryDays > 0 ? "sent_recurring" : "sent", index);
  } else {
    publishReminderStatus("send_failed", index);
  }
}

void runReminders() {
  if ((uint32_t)(millis() - lastReminderCheck) < 30000UL)
    return;
  lastReminderCheck = millis();
  if (!reminderEnabled || !clockIsValid())
    return;
  if (reminderInQuietHours())
    return;
  String today = currentDateString();
  if (!validDateString(today.c_str()))
    return;
  uint16_t now = currentMinutes();
  uint16_t reminderAt = reminderHour * 60U + reminderMinute;
  for (uint8_t i = 0; i < REMINDER_COUNT; i++) {
    CropReminder &reminder = reminders[i];
    if (!reminder.enabled || reminder.done || !reminder.id[0] ||
        !validDateString(reminder.dueDate))
      continue;
    int delta = dateDeltaDays(reminder.dueDate, today);
    bool overdue = delta < 0 && reminderRepeatDaily;
    bool dueForReminder = delta == reminder.leadDays;
    if ((!dueForReminder && !overdue) || now < reminderAt ||
        strcmp(reminder.lastSentDate, today.c_str()) == 0)
      continue;
    runReminderTask(i, today, overdue);
  }
}

uint16_t currentMinutes() {
  DateTime now(2000, 1, 1);
  if (readRtcNow(now)) return now.hour() * 60U + now.minute();
  return ntp.getHours() * 60U + ntp.getMinutes();
}
String rtcIso() {
  DateTime now(2000, 1, 1);
  if (!readRtcNow(now)) return String();
  char b[25];
  snprintf(b, sizeof(b), "%04u-%02u-%02uT%02u:%02u:%02u+07:00", now.year(),
           now.month(), now.day(), now.hour(), now.minute(), now.second());
  return String(b);
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
    DateTime n(2000, 1, 1);
    rtcTimeValid = readRtcNow(n);
    if (!rtcTimeValid)
      Serial.println(F("DS3231 returned invalid time - NTP fallback"));
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
      DateTime verified(2000, 1, 1);
      bool readBackOk = readRtcNow(verified);
      uint32_t verifiedEpoch = readBackOk ? verified.unixtime() : 0;
      uint32_t delta = verifiedEpoch >= localEpoch
                           ? verifiedEpoch - localEpoch
                           : localEpoch - verifiedEpoch;
      if (readBackOk && delta <= 2UL) {
        rtcTimeValid = true;
        lastRtcSync = millis();
        Serial.println(F("RTC synced from NTP and read-back verified"));
      } else {
        rtcTimeValid = false;
        Serial.println(F("RTC sync read-back failed - NTP fallback"));
      }
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
void publishEmergencyStatus() {
  if (!mqtt.connected())
    return;
  StaticJsonDocument<192> d;
  d["active"] = emergencyLock;
  d["source"] = emergencySource;
  d["timestamp"] = emergencyTimestamp / 1000UL;
  String iso = rtcIso();
  if (iso.length()) d["time"] = iso;
  char out[192];
  serializeJson(d, out, sizeof(out));
  mqtt.publish(MQTT_BASE "/emergency/status", out, true);
}
void engageEmergencyStop(const char *source) {
  emergencyLock = true;
  emergencyTimestamp = millis();
  strlcpy(emergencySource, source && source[0] ? source : "unknown", sizeof(emergencySource));
  for (uint8_t i = 0; i < RELAY_COUNT; i++) {
    clearRelayTimer(i);
    relaySetRaw(i, false);
  }
  Serial.printf("EMERGENCY STOP: active source=%s\n", emergencySource);
  queueTelegram(String("หยุดฉุกเฉินทำงาน source=") + emergencySource);
  publishStatus();
}
void resetEmergencyStop(const char *source) {
  emergencyLock = false;
  emergencyTimestamp = millis();
  strlcpy(emergencySource, source && source[0] ? source : "reset", sizeof(emergencySource));
  Serial.printf("EMERGENCY STOP: reset source=%s\n", emergencySource);
  DateTime resetRtc(2000, 1, 1);
  if (readRtcNow(resetRtc)) applyAutoState(resetRtc.hour() * 60U + resetRtc.minute());
  publishStatus();
  queueTelegram(String("ปลดล็อกหยุดฉุกเฉิน source=") + emergencySource);
}
void publishStatus() {
  if (!mqtt.connected())
    return;
  for (uint8_t i = 0; i < RELAY_COUNT; i++) {
    publishRelayStatus(i);
    publishRelayTimerStatus(i);
    publishScheduleStatus(i);
  }
  publishEmergencyStatus();
}
void applyAutoState(uint16_t now) {
  if (emergencyLock || otaUpdateInProgress) {
    for (uint8_t i = 0; i < RELAY_COUNT; i++) relaySetRaw(i, false);
    return;
  }
  if (!clockIsValid()) return;
  for (uint8_t i = 0; i < RELAY_COUNT; i++) {
    if (!relayHasSchedule(i)) continue;
    // Timer/manual command owns the relay until it expires or is cleared.
    if (relayTimerUnlimited[i] ||
        (relayTimerUntil[i] && (int32_t)(relayTimerUntil[i] - millis()) > 0))
      continue;
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
    queueTelegram(F("บันทึกการตั้งค่าอุปกรณ์และ Telegram สำเร็จ"));
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
  queueTelegram(F("บันทึกการตั้งค่า Telegram จากแดชบอร์ดสำเร็จ"));
  return true;
}

void mqttCallback(char *topic, byte *payload, unsigned int len) {
  String t(topic), msg;
  msg.reserve(len + 1);
  for (unsigned int i = 0; i < len; i++)
    msg += (char)payload[i];
  msg.trim();

  // Diagnostic: show every inbound control packet without blocking MQTT.
  // Limit payload logging to keep Serial output bounded on ESP8266.
  if (t.startsWith(String(MQTT_BASE) + "/relay/") ||
      t.startsWith(String(MQTT_BASE) + "/schedule/") ||
      t.startsWith(String(MQTT_BASE) + "/config/telegram/") ||
      t.startsWith(String(MQTT_BASE) + "/reminder/")) {
    String logMsg = msg;
    if (logMsg.length() > 96)
      logMsg.remove(96);
    Serial.printf("MQTT RX: topic=%s payload=%s\\n", t.c_str(), logMsg.c_str());
  }

  if (t == MQTT_BASE "/emergency/set") {
    if (msg.equalsIgnoreCase("STOP") || msg.equalsIgnoreCase("EMERGENCY_STOP"))
      engageEmergencyStop("mqtt");
    else if (msg.equalsIgnoreCase("RESET") || msg.equalsIgnoreCase("EMERGENCY_RESET"))
      resetEmergencyStop("mqtt");
    else
      Serial.println(F("Emergency: invalid payload"));
    return;
  }
  if (t == MQTT_BASE "/config/telegram/set") {
    if (!handleTelegramConfig(msg))
      Serial.println(F("Telegram CONFIG: invalid payload"));
    return;
  }
  if (t == MQTT_BASE "/config/telegram/test") {
    telegramNotifyNow(F("ทดสอบ Telegram จากแดชบอร์ดสำเร็จ"));
    publishTelegramStatus();
    return;
  }
  if (t == MQTT_BASE "/reminder/set") {
    if (!handleReminderMessage(msg)) {
      Serial.println(F("Reminder: invalid payload"));
      publishReminderStatus("error", -1, "invalid payload");
    }
    return;
  }

  String rp = String(MQTT_BASE) + "/relay/";
  String tp = String(MQTT_BASE) + "/relay/";
  if (t.startsWith(tp) && t.endsWith("/timer/set")) {
    String n = t.substring(tp.length(), t.length() - 10);
    int i = relayIndex(n);
    if (i < 0)
      return;
    bool unlimited = msg.equalsIgnoreCase("UNLIMITED");
    uint32_t seconds = 0;
    bool valid = unlimited || msg.equalsIgnoreCase("CANCEL") || parseTimerSeconds(msg, seconds);
    if (!valid || !startRelayTimer((uint8_t)i, seconds, unlimited)) {
      Serial.printf("MQTT TIMER: rejected relay=%s payload=%s\\n", n.c_str(), msg.c_str());
      publishRelayTimerStatus((uint8_t)i);
      return;
    }
    Serial.printf("MQTT TIMER: relay=%s seconds=%lu unlimited=%s\\n", n.c_str(),
                  (unsigned long)seconds, unlimited ? "true" : "false");
    Serial.printf("MQTT TIMER: relay=%s state=%s\\n", n.c_str(),
                  relayOn((uint8_t)i) ? "ON" : "OFF");
    return;
  }
  if (t.startsWith(rp) && t.endsWith("/set")) {
    String n = t.substring(rp.length(), t.length() - 4);
    int i = relayIndex(n);
    if (i < 0)
      return;
    if (msg.equalsIgnoreCase("ON"))
      relaySet((uint8_t)i, true);
    else if (msg.equalsIgnoreCase("OFF"))
      relaySet((uint8_t)i, false);
    else {
      Serial.printf("MQTT RELAY: invalid payload relay=%s payload=%s\\n",
                    n.c_str(), msg.c_str());
      return;
    }
    publishRelayStatus((uint8_t)i);
    Serial.printf("MQTT RELAY: relay=%s state=%s\\n", n.c_str(),
                  relayOn((uint8_t)i) ? "ON" : "OFF");
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
      if (slots.isNull()) return;
      ScheduleSlot candidate[SLOT_COUNT] = {};
      for (uint8_t s = 0; s < SLOT_COUNT && s < slots.size(); s++) {
        JsonObject o = slots[s].as<JsonObject>();
        uint8_t oh, om, fh, fm;
        if (!parseHM(o["on"] | "", oh, om) || !parseHM(o["off"] | "", fh, fm))
          continue;
        candidate[s] = {bool(o["enabled"] | false), oh, om, fh, fm};
      }
      if (!scheduleSetValid(candidate)) {
        Serial.printf("Schedule: overlap rejected relay=%s\n", relayNames[r]);
        queueTelegram(String("ปฏิเสธตารางของรีเลย์ ") + relayNames[r] + " เนื่องจากเวลาชนกัน");
        return;
      }
      for (uint8_t s = 0; s < SLOT_COUNT; s++) schedules[r][s] = candidate[s];
    }
    saveConfig();
    DateTime scheduleRtc(2000, 1, 1);
    if (readRtcNow(scheduleRtc)) applyAutoState(scheduleRtc.hour() * 60U + scheduleRtc.minute());
    publishScheduleStatus((uint8_t)r);
    publishRelayStatus((uint8_t)r);
    queueTelegram(String("อัปเดตตารางเวลาของรีเลย์ ") + relayNames[r] +
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
  mqttConnectAttempts++;
  String cid = String(deviceName) + "-" + String(ESP.getChipId(), HEX);
  Serial.print(F("MQTT: Connecting to "));
  Serial.print(MQTT_SERVER);
  Serial.print(F(":"));
  Serial.println(MQTT_PORT);
  // Ensure a failed TLS handshake cannot leak a stale socket into the next try.
  tls.stop();
  bool connected = mqtt.connect(cid.c_str(), mqttUser, mqttPass,
                                MQTT_BASE "/status/online", 0, true, "false");
  int8_t state = mqtt.state();
  if (connected) {
    mqttAuthFailures = 0;
    mqtt.publish(MQTT_BASE "/status/online", "true", true);
    bool s1 = mqtt.subscribe(MQTT_BASE "/relay/+/set");
    bool sTimer = mqtt.subscribe(MQTT_BASE "/relay/+/timer/set");
    bool s3 = mqtt.subscribe(MQTT_BASE "/schedule/+/set");
    bool s4 = mqtt.subscribe(MQTT_BASE "/config/telegram/set");
    bool s5 = mqtt.subscribe(MQTT_BASE "/config/telegram/test");
    bool s6 = mqtt.subscribe(MQTT_BASE "/reminder/set");
    bool s7 = mqtt.subscribe(MQTT_BASE "/emergency/set");
    publishStatus();
    publishTelegramStatus();
    publishReminderStatus("online");
    Serial.println(F("MQTT: Connected"));
    queueTelegram(F("เชื่อมต่อ MQTT สำเร็จ"));
    Serial.printf("MQTT: Subscribe relay=%s timer=%s schedule=%s telegram=%s/%s reminder=%s\n",
                  s1 ? "OK" : "FAIL", sTimer ? "OK" : "FAIL",
                  s3 ? "OK" : "FAIL", s4 ? "OK" : "FAIL", s5 ? "OK" : "FAIL",
                  s6 ? "OK" : "FAIL");
    Serial.printf("MQTT: Subscribe emergency=%s\\n", s7 ? "OK" : "FAIL");
    Serial.println(F("MQTT: READY"));
  } else {
    mqttConnectFailures++;
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
      queueTelegram(
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
  otaServer.sendHeader("Access-Control-Allow-Private-Network", "true");
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
    otaUploadCompleted = false;
    otaUploadBytes = 0;
    otaHttpRestartPending = false;
    Serial.printf("OTA HTTP: START %s, heap=%u\n", upload.filename.c_str(),
                  ESP.getFreeHeap());
    // Stop MQTT/TLS before opening the flash writer. The OTA request is the
    // priority path, and retaining a live TLS session wastes scarce ESP8266
    // heap while the multipart stream is being received.
    mqtt.disconnect();
    tls.stop();
    // Do not make a second HTTPS request to Telegram while the firmware
    // stream is being received. That extra TLS allocation can starve the
    // ESP8266 heap and interrupt a large multipart upload.
    uint32_t maxSketchSpace =
        (ESP.getFreeSketchSpace() - 0x1000) & 0xFFFFF000;
    enterOtaSafeState();
    if (!Update.begin(maxSketchSpace, U_FLASH)) {
      otaUploadFailed = true;
      Update.printError(Serial);
      leaveOtaSafeState();
    }
  } else if (upload.status == UPLOAD_FILE_WRITE) {
    if (!otaUploadFailed) {
      size_t written = Update.write(upload.buf, upload.currentSize);
      if (written != upload.currentSize) {
        otaUploadFailed = true;
        Update.printError(Serial);
      } else {
        otaUploadBytes += written;
      }
    }
  } else if (upload.status == UPLOAD_FILE_END) {
    bool completeSize = upload.totalSize > 0 &&
                        upload.totalSize == otaUploadBytes;
    if (!otaUploadFailed && completeSize && Update.end(true)) {
      otaUploadCompleted = true;
      Serial.printf("OTA HTTP: END (%u bytes)\n", upload.totalSize);
    } else {
      otaUploadCompleted = false;
      if (!completeSize)
        Serial.printf("OTA HTTP: SIZE MISMATCH total=%u written=%u\n",
                      upload.totalSize, (unsigned)otaUploadBytes);
      Update.printError(Serial);
      Serial.println(F("OTA HTTP: FINALIZE FAILED"));
      leaveOtaSafeState();
    }
  } else if (upload.status == UPLOAD_FILE_ABORTED) {
    Update.end();
    otaUploadCompleted = false;
    otaUploadFailed = true;
    leaveOtaSafeState();
    Serial.println(F("OTA HTTP: ABORTED"));
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
    page += F("</p><p>ก่อนเขียนเฟิร์มแวร์ ระบบจะปิดรีเลย์ทั้งหมดชั่วคราว "
              "การอัปโหลดที่ล้มเหลวจะไม่รีบูตอุปกรณ์ และจะคืนการทำงานปกติ "
              "ควรมีอุปกรณ์ตัดไฟฉุกเฉินภายนอกสำหรับโหลดจริง</p><form method='POST' "
              "action='/update' enctype='multipart/form-data'><input type='file' "
              "name='firmware' accept='.bin' required><br><button "
              "type='submit'>Upload firmware</button></form></html>");
    otaServer.send(200, "text/html; charset=utf-8", page);
  });
  otaServer.on(
      "/update", HTTP_POST,
      []() {
        if (!otaHttpAuthorized())
          return;
        bool ok = otaUploadCompleted && !otaUploadFailed && !Update.hasError();
        if (!ok) leaveOtaSafeState();
        otaHttpCors();
        otaServer.sendHeader("Connection", "close");
        otaServer.send(ok ? 200 : 500, "text/plain; charset=utf-8",
                       ok ? "Update complete. Device is restarting."
                          : "Update failed: firmware write error.");
        if (ok) {
          // Give the HTTP response time to leave the socket before reboot.
          otaHttpRestartPending = true;
          otaHttpRestartAt = millis() + 1500UL;
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

void handleWifiResetButton() {
  const bool pressed = digitalRead(WIFI_RESET_BUTTON) == LOW;

  if (pressed && !wifiResetPressed) {
    wifiResetPressed = true;
    wifiResetStartedAt = millis();
    Serial.println(F("WiFi reset button pressed; hold for 5 seconds"));
  }

  if (!pressed) {
    if (wifiResetPressed)
      Serial.println(F("WiFi reset cancelled"));
    wifiResetPressed = false;
    wifiResetStartedAt = 0;
    return;
  }

  if ((uint32_t)(millis() - wifiResetStartedAt) < WIFI_RESET_HOLD_MS)
    return;

  Serial.println(F("WiFi reset confirmed; clearing saved WiFi settings"));
  mqtt.disconnect();
  WiFiManager wm;
  wm.resetSettings();
  WiFi.disconnect(true);
  delay(500);
  ESP.restart();
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
  Serial.print(F("\n=== SmartFarm "));
  Serial.print(SMARTFARM_VERSION);
  Serial.println(F(" HARDENED BOOT ==="));
  Serial.print(F("Reset reason: "));
  Serial.println(ESP.getResetReason());
  Serial.print(F("Reset info: "));
  Serial.println(ESP.getResetInfo());
  Serial.print(F("Free heap at boot: "));
  Serial.println(ESP.getFreeHeap());
  pinMode(WIFI_RESET_BUTTON, INPUT_PULLUP);
  for (uint8_t i = 0; i < RELAY_COUNT; i++) {
    pinMode(relayPins[i], OUTPUT);
    digitalWrite(relayPins[i], RELAY_OFF);
  }
  initFS();
  loadConfig();
  loadReminders();
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
  DateTime bootRtc(2000, 1, 1);
  if (readRtcNow(bootRtc)) applyAutoState(bootRtc.hour() * 60U + bootRtc.minute());
  ArduinoOTA.setHostname(deviceName);
  ArduinoOTA.onStart([]() {
    enterOtaSafeState();
    Serial.println(F("OTA: START"));
    queueTelegram(F("เริ่มอัปเดตเฟิร์มแวร์ผ่าน ArduinoOTA"));
  });
  ArduinoOTA.onEnd([]() {
    Serial.println(F("OTA: END"));
    queueTelegram(F("อัปเดตเฟิร์มแวร์ผ่าน ArduinoOTA สำเร็จ"));
  });
  ArduinoOTA.onError([](ota_error_t e) {
    Serial.printf("OTA: ERROR %u\n", e);
    leaveOtaSafeState();
    queueTelegram(String("ArduinoOTA ล้มเหลว รหัสข้อผิดพลาด ") + e);
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
  queueTelegram(String("อุปกรณ์บูตสำเร็จ IP=") + WiFi.localIP().toString() +
                " firmware=" + SMARTFARM_VERSION);
}

void runSafety() {
  if (!relayOn(0)) {
    pumpStartedAt = 0;
    return;
  }
  if (!pumpStartedAt)
    pumpStartedAt = millis();
  // ไม่มีเพดานเวลาทำงานแบบ 30 นาที รีเลย์จะทำตามตารางหรือคำสั่งล่าสุด
  // การหลุด MQTT ต้องไม่ตัดการรดน้ำอัตโนมัติที่เก็บไว้ใน ESP8266
}
void runSchedules() {
  if (otaUpdateInProgress) return;
  if ((uint32_t)(millis() - lastSchedule) < SCHEDULE_INTERVAL_MS)
    return;
  lastSchedule = millis();
  // Schedule ต้องใช้ RTC ที่อ่านได้จริง ห้ามใช้ NTP fallback ไปสั่งรีเลย์
  DateTime now(2000, 1, 1);
  if (!readRtcNow(now)) return;
  applyAutoState(now.hour() * 60U + now.minute());
}

void publishHeartbeat() {
  if (!mqtt.connected())
    return;
  StaticJsonDocument<512> d;
  d["online"] = true;
  d["firmware"] = SMARTFARM_VERSION;
  d["heap"] = ESP.getFreeHeap();
  d["heapMaxBlock"] = ESP.getMaxFreeBlockSize();
  d["heapFrag"] = ESP.getHeapFragmentation();
  d["rssi"] = WiFi.RSSI();
  d["uptimeSec"] = millis() / 1000UL;
  d["resetReason"] = ESP.getResetReason();
  d["wifiReconnects"] = wifiReconnectRequests;
  d["mqttConnects"] = mqttConnectAttempts;
  d["mqttFailures"] = mqttConnectFailures;
  d["pumpSafeLock"] = pumpSafetyLatched;
  d["emergencyLock"] = emergencyLock;
  d["emergencySource"] = emergencySource;
  d["pumpRuntimeSec"] = relayOn(0) && pumpStartedAt
                             ? (millis() - pumpStartedAt) / 1000UL
                             : 0;
  String iso = rtcIso();
  bool rtcNowValid = rtcAvailable && rtcTimeValid && iso.length();
  d["clockValid"] = rtcNowValid || ntp.getEpochTime() >= 1704067200UL;
  d["rtc"] = rtcNowValid;
  d["sensorReads"] = sensorReadCount;
  d["sensorFaults"] = sensorFaultCount;
  d["sensorAgeSec"] = lastSensorValidAt
                           ? (millis() - lastSensorValidAt) / 1000UL
                           : 0;
  d["sensorOk"] = lastSensorValidAt &&
                  (uint32_t)(millis() - lastSensorValidAt) <= 90000UL;
  if (iso.length())
    d["time"] = iso;
  char out[512];
  serializeJson(d, out, sizeof(out));
  // Retain the latest heartbeat so a freshly opened dashboard can restore RTC time immediately.
  mqtt.publish(MQTT_BASE "/device/status", out, true);
}

void loop() {
  ESP.wdtFeed();
  handleWifiResetButton();
  maintainWifi();
  reportWifiState();
  if (WiFi.status() == WL_CONNECTED) {
    connectMqtt();
    if (mqtt.connected())
      mqtt.loop();
    ntp.update();
    syncRTCFromNTP(false);
  } else {
  }
  otaServer.handleClient();
  ArduinoOTA.handle();
  if (otaHttpRestartPending && (int32_t)(millis() - otaHttpRestartAt) >= 0)
    ESP.restart();
  runSafety();
  runRelayTimers();
  runSchedules();
  runReminders();
  if ((uint32_t)(millis() - lastSensor) >= SENSOR_INTERVAL_MS) {
    lastSensor = millis();
    float h = dht.readHumidity(), c = dht.readTemperature();
    sensorReadCount++;
    if (!isnan(h) && !isnan(c)) {
      lastSensorValidAt = millis();
    } else {
      sensorFaultCount++;
      Serial.printf("DHT11: invalid reading #%lu\n", (unsigned long)sensorFaultCount);
    }
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
  processTelegramQueue();
  yield();
}
