const mqtt = require('mqtt');

const RELAYS = ['pump', 'zone1', 'lighthome', 'lightsala'];
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MQTT_URL = 'mqtts://25305924f68c41f2a1e089a1836d3287.s1.eu.hivemq.cloud:8883';
const MQTT_USERNAME = 'smartfarm';

function parseTime(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function isActiveOnDay(slot, day, previousDay, minute) {
  if (!slot.enabled || !Array.isArray(slot.days)) return false;
  const on = parseTime(slot.onTime);
  const off = parseTime(slot.offTime);
  if (on === null || off === null || on === off) return false;
  const startsToday = slot.days.includes(day);
  const continuesFromYesterday = slot.days.includes(previousDay) && on > off;
  if (on < off) return startsToday && minute >= on && minute < off;
  return (startsToday && minute >= on) || (continuesFromYesterday && minute < off);
}

function desiredState(records, now = new Date()) {
  const minute = now.getHours() * 60 + now.getMinutes();
  const day = DAY_KEYS[now.getDay()];
  const previousDay = DAY_KEYS[(now.getDay() + 6) % 7];
  return records.some(record => isActiveOnDay(record, day, previousDay, minute));
}

function normalizeSchedules(value) {
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).filter(item => item && RELAYS.includes(item.relay) && item.enabled === true && Array.isArray(item.days));
}

function connectMqtt(password) {
  return new Promise((resolve, reject) => {
    if (!password) return reject(new Error('MQTT_PASSWORD secret is not configured'));
    const client = mqtt.connect(MQTT_URL, {
      username: MQTT_USERNAME,
      password,
      protocolVersion: 4,
      connectTimeout: 10000,
      reconnectPeriod: 0,
      clientId: `smartfarm-scheduler-${Math.random().toString(16).slice(2, 10)}`
    });
    const timer = setTimeout(() => { client.end(true); reject(new Error('MQTT connection timeout')); }, 12000);
    client.once('connect', () => { clearTimeout(timer); resolve(client); });
    client.once('error', error => { clearTimeout(timer); client.end(true); reject(error); });
  });
}

function publish(client, relay, state) {
  return new Promise((resolve, reject) => {
    const topic = `smartfarm/relay/${relay}/set`;
    client.publish(topic, state ? 'ON' : 'OFF', { qos: 1, retain: false }, error => error ? reject(error) : resolve());
  });
}

async function runScheduleTick({ db, mqttPassword, now = new Date(), logger = console }) {
  const snapshot = await db.ref('users').once('value');
  const users = snapshot.val() || {};
  const desiredByRelay = Object.fromEntries(RELAYS.map(relay => [relay, false]));
  const recordsByRelay = Object.fromEntries(RELAYS.map(relay => [relay, 0]));
  for (const [, user] of Object.entries(users)) {
    const schedules = normalizeSchedules(user?.controlRoomSchedules);
    for (const relay of RELAYS) {
      const records = schedules.filter(item => item.relay === relay);
      if (!records.length) continue;
      recordsByRelay[relay] += records.length;
      desiredByRelay[relay] = desiredByRelay[relay] || desiredState(records, now);
    }
  }
  const commands = RELAYS.filter(relay => recordsByRelay[relay] > 0)
    .map(relay => ({ relay, state: desiredByRelay[relay], recordCount: recordsByRelay[relay] }));
  if (!commands.length) return { commands: [], published: 0 };
  const client = await connectMqtt(mqttPassword);
  try {
    for (const command of commands) {
      await publish(client, command.relay, command.state);
      logger.info(`Schedule MQTT: relay=${command.relay} state=${command.state ? 'ON' : 'OFF'} records=${command.recordCount}`);
    }
  } finally {
    client.end(true);
  }
  return { commands, published: commands.length };
}

module.exports = { runScheduleTick, desiredState, normalizeSchedules };
