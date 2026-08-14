(function () {
  'use strict';

  const WEATHER_CONFIG = Object.freeze({
    latitude: 7.798754,
    longitude: 99.990505,
    utm: '47N / X 609211 / Y 862178',
    timezone: 'Asia/Bangkok',
    timezoneOffset: '+07:00',
    refreshMs: 15 * 60 * 1000,
    rainProtection: { probabilityPercent: 60, precipitation6hMm: 1 }
  });
  const WEATHER_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
  const state = { ok: false, loading: false, lastSuccess: 0, data: null, autoWateringAllowed: false, reason: 'รอข้อมูลสภาพอากาศ' };
  const $ = id => document.getElementById(id);
  const set = (id, value) => { const element = $(id); if (element) element.textContent = value; };

  function buildUrl() {
    const url = new URL(WEATHER_ENDPOINT);
    url.searchParams.set('latitude', WEATHER_CONFIG.latitude);
    url.searchParams.set('longitude', WEATHER_CONFIG.longitude);
    url.searchParams.set('timezone', WEATHER_CONFIG.timezone);
    url.searchParams.set('forecast_days', '7');
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m,weather_code');
    url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,rain,wind_speed_10m,weather_code');
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,precipitation_probability_max,wind_speed_10m_max');
    return url.toString();
  }

  function weatherEpoch(value) {
    const source = String(value || '');
    if (!source) return NaN;
    if (/Z$|[+-]\d{2}:\d{2}$/.test(source)) return Date.parse(source);
    const withSeconds = source.length === 16 ? `${source}:00` : source;
    return Date.parse(`${withSeconds}${WEATHER_CONFIG.timezoneOffset}`);
  }

  function sixHourWindow() {
    const now = Date.now();
    const start = now - (now % 3600000);
    return { start, end: start + 6 * 3600000 };
  }

  function sixHourRain(hourly) {
    const times = hourly?.time || [];
    const values = hourly?.precipitation || [];
    const { start, end } = sixHourWindow();
    let sum = 0;
    let seen = false;
    times.forEach((time, index) => {
      const epoch = weatherEpoch(time);
      if (Number.isFinite(epoch) && epoch >= start && epoch < end) {
        sum += Number(values[index]) || 0;
        seen = true;
      }
    });
    return seen ? sum : NaN;
  }

  function rainProbabilityNext6h(hourly) {
    const times = hourly?.time || [];
    const values = hourly?.precipitation_probability || [];
    const { start, end } = sixHourWindow();
    let max = 0;
    let seen = false;
    times.forEach((time, index) => {
      const epoch = weatherEpoch(time);
      if (Number.isFinite(epoch) && epoch >= start && epoch < end) {
        max = Math.max(max, Number(values[index]) || 0);
        seen = true;
      }
    });
    return seen ? max : NaN;
  }

  function calculateProtection(data) {
    const probability = rainProbabilityNext6h(data.hourly);
    const precipitation = sixHourRain(data.hourly);
    const blocked = (Number.isFinite(probability) && probability >= WEATHER_CONFIG.rainProtection.probabilityPercent)
      || (Number.isFinite(precipitation) && precipitation >= WEATHER_CONFIG.rainProtection.precipitation6hMm);
    state.autoWateringAllowed = !blocked;
    state.reason = blocked
      ? `Rain Protection: โอกาสฝน ${Number.isFinite(probability) ? probability.toFixed(0) : '--'}% หรือฝน 6 ชม. ${Number.isFinite(precipitation) ? precipitation.toFixed(1) : '--'} mm`
      : 'สภาพอากาศอนุญาตให้เปิดโหมด AUTO';
    return { probability, precipitation, blocked };
  }

  function weatherText(code) {
    const labels = { 0: 'ท้องฟ้าแจ่มใส', 1: 'มีเมฆเล็กน้อย', 2: 'มีเมฆบางส่วน', 3: 'เมฆมาก', 45: 'หมอก', 48: 'หมอกเกาะตัว', 51: 'ฝนปรอย', 53: 'ฝนปรอย', 55: 'ฝนปรอย', 61: 'ฝนเล็กน้อย', 63: 'ฝนปานกลาง', 65: 'ฝนหนัก', 71: 'หิมะตกเล็กน้อย', 73: 'หิมะตก', 75: 'หิมะตกหนัก', 80: 'ฝนซู่', 81: 'ฝนซู่ปานกลาง', 82: 'ฝนซู่หนัก', 95: 'พายุฝนฟ้าคะนอง', 96: 'พายุฝนลูกเห็บ', 99: 'พายุฝนลูกเห็บ' };
    return labels[code] || `Weather code ${code}`;
  }

  function render(data, protection) {
    const current = data.current || {};
    set('weatherTemp', Number(current.temperature_2m).toFixed(1) + ' °C');
    set('weatherHumidity', Number(current.relative_humidity_2m).toFixed(0) + ' %');
    set('weatherRainProb', Number.isFinite(protection.probability) ? protection.probability.toFixed(0) + ' %' : '--');
    set('weatherWind', Number(current.wind_speed_10m).toFixed(1) + ' km/h');
    set('weatherCondition', weatherText(current.weather_code));
    set('weatherUpdated', `อัปเดต ${new Date().toLocaleString('th-TH', { timeZone: WEATHER_CONFIG.timezone })}`);
    set('rainProtectionStatus', state.autoWateringAllowed ? 'AUTO พร้อมใช้งาน' : 'AUTO ถูกงดชั่วคราว');
    set('rainProtectionReason', state.reason);
    const box = $('weatherBox');
    if (box) box.classList.toggle('weather-blocked', !state.autoWateringAllowed);
    const protectionBox = $('rainProtectionBox');
    if (protectionBox) protectionBox.classList.toggle('ok', state.autoWateringAllowed);
    const location = $('weatherLocation');
    if (location) location.textContent = `${WEATHER_CONFIG.latitude}, ${WEATHER_CONFIG.longitude} • UTM ${WEATHER_CONFIG.utm}`;
    const forecast = $('forecast7');
    if (forecast) {
      forecast.innerHTML = '';
      const daily = data.daily || {};
      (daily.time || []).forEach((day, index) => {
        const item = document.createElement('article');
        item.className = 'forecast-day';
        const date = new Date(`${day}T12:00:00${WEATHER_CONFIG.timezoneOffset}`);
        item.innerHTML = `<b>${date.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: WEATHER_CONFIG.timezone })}</b><span>${weatherText(daily.weather_code?.[index])}</span><span>🌡️ ${Number(daily.temperature_2m_min?.[index]).toFixed(0)}–${Number(daily.temperature_2m_max?.[index]).toFixed(0)}°C</span><span>☔ ${Number(daily.precipitation_probability_max?.[index]).toFixed(0)}%</span><span>💧 ${Number(daily.precipitation_sum?.[index]).toFixed(1)} mm</span>`;
        forecast.appendChild(item);
      });
    }
  }

  function publishState(protection) {
    window.SmartFarmWeather.state = state;
    window.SmartFarmWeather.data = state.data;
    window.SmartFarmWeather.rainProtection = protection;
    window.dispatchEvent(new CustomEvent('weather:protection', { detail: { ...state, protection } }));
  }

  async function refresh() {
    if (state.loading) return;
    state.loading = true;
    try {
      const response = await fetch(buildUrl(), { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const protection = calculateProtection(data);
      state.ok = true;
      state.lastSuccess = Date.now();
      state.data = data;
      render(data, protection);
      publishState(protection);
    } catch (error) {
      state.ok = false;
      state.autoWateringAllowed = false;
      state.reason = 'Open-Meteo API ขัดข้อง — ระบบป้องกันจึงงดโหมด AUTO';
      set('rainProtectionStatus', 'AUTO ถูกงดชั่วคราว');
      set('rainProtectionReason', state.reason);
      $('rainProtectionBox')?.classList.remove('ok');
      publishState({ probability: NaN, precipitation: NaN, blocked: true });
      console.error('Open-Meteo', error);
    } finally {
      state.loading = false;
    }
  }

  window.SmartFarmWeather = { config: WEATHER_CONFIG, state, data: null, rainProtection: null, refresh, buildUrl };
  if (document.getElementById('weatherBox')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { refresh(); setInterval(refresh, WEATHER_CONFIG.refreshMs); });
    else { refresh(); setInterval(refresh, WEATHER_CONFIG.refreshMs); }
  }
})();
