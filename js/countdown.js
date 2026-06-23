(function () {
  // 17 July 2026, 19:00 BST = 18:00 UTC
  var TARGET = Date.UTC(2026, 6, 17, 18, 0, 0);

  var wrap  = document.getElementById('bomb-countdown');
  var daysEl  = document.getElementById('cd-days');
  var hoursEl = document.getElementById('cd-hours');
  var minsEl  = document.getElementById('cd-mins');
  var secsEl  = document.getElementById('cd-secs');

  function pad(n) { return String(n).padStart(2, '0'); }

  function flash(el) {
    el.classList.remove('cd-tick');
    void el.offsetWidth;
    el.classList.add('cd-tick');
  }

  var lastSec = -1;

  function tick() {
    var diff = TARGET - Date.now();

    if (diff <= 0) {
      wrap.remove();
      return;
    }

    var days  = Math.floor(diff / 86400000);
    var hours = Math.floor((diff % 86400000) / 3600000);
    var mins  = Math.floor((diff % 3600000)  / 60000);
    var secs  = Math.floor((diff % 60000)    / 1000);

    daysEl.textContent  = pad(days);
    hoursEl.textContent = pad(hours);
    minsEl.textContent  = pad(mins);
    secsEl.textContent  = pad(secs);

    if (secs !== lastSec) {
      flash(secsEl);
      if (secs === 59) flash(minsEl);
      if (secs === 59 && mins === 59) flash(hoursEl);
      lastSec = secs;
    }
  }

  tick();
  setInterval(tick, 500);
})();
