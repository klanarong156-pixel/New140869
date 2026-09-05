/*
 * Smart Farm - ESP8266 HTTP OTA example
 *
 * Requirements:
 *   - ESP8266 Arduino Core
 *   - ESP8266WebServer
 *   - Updater / Update.h
 *
 * First flash this firmware through USB/Serial.
 * Future firmware files can then be uploaded through POST /update.
 */

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <Updater.h>
#include <Update.h>

// Replace these values before flashing. Do not commit real credentials.
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* ota_pass = "CHANGE_THIS_TO_A_LONG_RANDOM_PASSWORD";

// Replace with your actual firmware version at every build.
const char* FIRMWARE_VERSION = "HTTP-OTA-EXAMPLE-1.0.0";

// Replace these pins with the actual relay pins used by your board.
constexpr uint8_t RELAY_PINS[] = { D5, D6, D7, D8 };
constexpr size_t RELAY_COUNT = sizeof(RELAY_PINS) / sizeof(RELAY_PINS[0]);

ESP8266WebServer server(80);
bool otaUpdateInProgress = false;
size_t otaUploadBytes = 0;

void addCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*", false);
  server.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS", false);
  server.sendHeader("Access-Control-Allow-Headers", "Authorization,Content-Type", false);
  // Needed by some browsers for requests from a local/private network.
  server.sendHeader("Access-Control-Allow-Private-Network", "true", false);
}

void sendJson(int statusCode, const String& body) {
  addCorsHeaders();
  server.send(statusCode, "application/json", body);
}

bool requireOtaAuth() {
  if (String(ota_pass).length() == 0) {
    sendJson(503, "{\"ok\":false,\"error\":\"OTA disabled: configure ota_pass first\"}");
    return false;
  }

  // The browser sends Basic Auth with username "admin".
  if (!server.authenticate("admin", ota_pass)) {
    addCorsHeaders();
    server.requestAuthentication(BASIC_AUTH, "SmartFarm OTA");
    return false;
  }
  return true;
}

void enterOtaSafeState() {
  otaUpdateInProgress = true;
  // Force every relay OFF before writing flash.
  // Use the same active-level logic as the production firmware.
  for (size_t i = 0; i < RELAY_COUNT; ++i) {
    digitalWrite(RELAY_PINS[i], HIGH); // Change to LOW if your relay is active-HIGH.
  }
  // Pause schedules, timers, MQTT publishing, and normal control here.
}

void leaveOtaSafeState() {
  // Keep relays OFF after OTA. Normal control can resume after reboot.
  for (size_t i = 0; i < RELAY_COUNT; ++i) {
    digitalWrite(RELAY_PINS[i], HIGH);
  }
  otaUpdateInProgress = false;
}

void handleOptions() {
  addCorsHeaders();
  server.send(204, "text/plain", "");
}

void handleStatus() {
  if (!requireOtaAuth()) return;
  String json = "{\"ok\":true";
  json += ",\"device\":\"ESP8266\"";
  json += ",\"firmware\":\"" + String(FIRMWARE_VERSION) + "\"";
  json += ",\"rssi\":" + String(WiFi.RSSI());
  json += ",\"ota\":\"ready\"}";
  sendJson(200, json);
}

void handleUpdateUpload() {
  HTTPUpload& upload = server.upload();

  if (upload.status == UPLOAD_FILE_START) {
    if (!requireOtaAuth()) return;
    enterOtaSafeState();
    otaUploadBytes = 0;

    // Always use the maximum safe OTA sketch space for ESP8266.
    const size_t maxSketchSpace = (ESP.getFreeSketchSpace() - 0x1000) & 0xFFFFF000;
    if (!Update.begin(maxSketchSpace, U_FLASH)) {
      Update.printError(Serial);
      leaveOtaSafeState();
      return;
    }
    Serial.printf("OTA HTTP: START %s\n", upload.filename.c_str());
  } else if (upload.status == UPLOAD_FILE_WRITE) {
    if (otaUpdateInProgress) {
      const size_t written = Update.write(upload.buf, upload.currentSize);
      otaUploadBytes += written;
      if (written != upload.currentSize) {
        Update.printError(Serial);
      }
    }
  } else if (upload.status == UPLOAD_FILE_END) {
    const bool completeSize = (otaUploadBytes == upload.totalSize);
    const bool updateOk = completeSize && Update.end(true);
    Serial.printf("OTA HTTP: END bytes=%u expected=%u ok=%s\n",
                  static_cast<unsigned>(otaUploadBytes),
                  static_cast<unsigned>(upload.totalSize),
                  updateOk ? "true" : "false");

    if (!updateOk) {
      Update.printError(Serial);
      leaveOtaSafeState();
    }
    // Do not reboot in the upload callback. Finish the HTTP response first.
  } else if (upload.status == UPLOAD_FILE_ABORTED) {
    Serial.println("OTA HTTP: ABORTED");
    Update.abort();
    leaveOtaSafeState();
  }
}

void handleUpdateResult() {
  // This handler runs after the multipart upload callback has finished.
  if (!otaUpdateInProgress) {
    sendJson(400, "{\"ok\":false,\"error\":\"OTA upload failed or was aborted\"}");
    return;
  }

  addCorsHeaders();
  server.send(200, "application/json", "{\"ok\":true,\"message\":\"Update complete. Device is restarting.\"}");
  delay(100);
  ESP.restart();
}

void setup() {
  Serial.begin(115200);

  for (size_t i = 0; i < RELAY_COUNT; ++i) {
    pinMode(RELAY_PINS[i], OUTPUT);
    digitalWrite(RELAY_PINS[i], HIGH); // Relays OFF for an active-LOW relay board.
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(250);
    Serial.print('.');
  }
  Serial.printf("\nOTA HTTP READY: http://%s\n", WiFi.localIP().toString().c_str());

  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/status", HTTP_OPTIONS, handleOptions);
  server.on("/update", HTTP_OPTIONS, handleOptions);
  server.on("/update", HTTP_POST, handleUpdateResult, handleUpdateUpload);
  server.begin();
}

void loop() {
  server.handleClient();
  if (otaUpdateInProgress) {
    // Do not run normal relay/schedule/MQTT control while OTA is active.
    return;
  }
  // Normal Smart Farm MQTT, schedule, sensor, and relay logic goes here.
}
