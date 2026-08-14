(function () {
  'use strict';

  function allowed() {
    const weather = window.SmartFarmWeather?.state;
    return Boolean(weather?.ok && weather.autoWateringAllowed === true);
  }

  function render() {
    document.querySelectorAll('[data-mode="AUTO"]').forEach(button => {
      const ready = allowed();
      button.disabled = !ready;
      button.title = ready ? 'สภาพอากาศพร้อมสำหรับโหมด AUTO' : (window.SmartFarmWeather?.state?.reason || 'รอข้อมูลสภาพอากาศ');
      button.setAttribute('aria-disabled', String(!ready));
    });
  }

  function boot() {
    render();
    window.addEventListener('weather:protection', render);
  }

  window.SmartFarmAutoWeatherGuard = { allowed, refresh: render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
