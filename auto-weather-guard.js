(() => {
  'use strict';

  function allowed() {
    const weather = window.SmartFarmWeather?.state;
    return Boolean(weather?.ok && weather.autoWateringAllowed === true);
  }

  function render() {
    const weather = window.SmartFarmWeather?.state;
    const advice = document.querySelector('[data-weather-advice]');
    if (advice && weather) {
      advice.textContent = weather.reason || (allowed() ? 'สภาพอากาศเหมาะกับการรดน้ำตามตาราง' : 'รอข้อมูลสภาพอากาศ');
    }
    document.dispatchEvent(new CustomEvent('weather:advice', { detail: { allowed: allowed(), state: weather || null } }));
  }

  function boot() {
    render();
    window.addEventListener('weather:protection', render);
  }

  window.SmartFarmWeatherAdvice = { allowed, refresh: render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
