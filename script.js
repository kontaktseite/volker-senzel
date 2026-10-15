/* Kontakt-Seite: Eingaben prüfen, Anfrage an die Google-Web-App senden, Danke zeigen.
   Kein Tracking, keine Cookies, nichts wird im Browser gespeichert. */
(function () {
  'use strict';
  document.documentElement.classList.remove('no-js');
  var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbzx_kRcqY1_DGJwblhI_2YF2bXnEIr5Gfj6nDIY3JmhVgL-CBiiW4u8mHE9-lbJE3xA/exec';
  var KUENSTLER_ID = 'test';   // Zeile im Blatt "Kuenstler"

  var form = document.getElementById('contactForm');
  var formView = document.getElementById('formView');
  var successView = document.getElementById('successView');
  var btn = document.getElementById('submitBtn');
  var formError = document.getElementById('err-form');
  var waitNote = document.getElementById('waitNote');
  var fields = {
    vorname: document.getElementById('vorname'),
    nachname: document.getElementById('nachname'),
    email: document.getElementById('email'),
    telefon: document.getElementById('telefon'),
    einwilligung: document.getElementById('einwilligung')
  };
  var LOADED_AT = Date.now();
  var sending = false, pending = null;

  var EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;
  var TYPOS = { 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.con': 'gmail.com',
    'gmx.dee': 'gmx.de', 'gmx.d': 'gmx.de', 'web.dee': 'web.de', 'wbe.de': 'web.de', 't-onlien.de': 't-online.de',
    't-onine.de': 't-online.de', 'tonline.de': 't-online.de', 'yahooo.com': 'yahoo.com', 'yahoo.dee': 'yahoo.de',
    'hotmial.com': 'hotmail.com', 'outlok.com': 'outlook.com', 'iclod.com': 'icloud.com', 'icloud.co': 'icloud.com' };

  function setError(name, msg) {
    var box = document.getElementById('err-' + name);
    if (box) box.textContent = msg || '';
    var input = fields[name];
    if (input && input.type !== 'checkbox') {
      input.classList.toggle('invalid', !!msg);
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }
    return !msg;
  }
  function checkName(n, label) {
    return setError(n, fields[n].value.trim().length < 1 ? 'Bitte geben Sie Ihren ' + label + ' an.' : '');
  }
  function checkEmail() {
    var v = fields.email.value.trim();
    if (!v) return setError('email', 'Bitte geben Sie Ihre E-Mail-Adresse an.');
    if (!EMAIL_RE.test(v)) return setError('email', 'Diese E-Mail-Adresse sieht nicht ganz richtig aus.');
    var dom = v.split('@')[1].toLowerCase();
    if (TYPOS[dom]) return setError('email', 'Meinten Sie ' + v.split('@')[0] + '@' + TYPOS[dom] + '?');
    return setError('email', '');
  }
  function checkTel() {
    var v = fields.telefon.value.trim();
    if (!v) return setError('telefon', '');
    var digits = v.replace(/\D/g, '');
    if (!/^[+\d][\d\s\/()-]*$/.test(v) || digits.length < 6 || digits.length > 16)
      return setError('telefon', 'Bitte eine gültige Telefonnummer eingeben oder das Feld leer lassen.');
    return setError('telefon', '');
  }
  function checkConsent() {
    return setError('einwilligung', fields.einwilligung.checked ? '' :
      'Bitte bestätigen Sie die Einwilligung, damit ich Sie kontaktieren darf.');
  }

  fields.vorname.addEventListener('blur', function () { checkName('vorname', 'Vornamen'); });
  fields.nachname.addEventListener('blur', function () { checkName('nachname', 'Nachnamen'); });
  fields.email.addEventListener('blur', checkEmail);
  fields.telefon.addEventListener('blur', checkTel);
  ['vorname', 'nachname', 'email', 'telefon'].forEach(function (n) {
    fields[n].addEventListener('input', function () {
      if (!fields[n].classList.contains('invalid')) return;
      if (n === 'email') checkEmail(); else if (n === 'telefon') checkTel();
      else checkName(n, n === 'vorname' ? 'Vornamen' : 'Nachnamen');
    });
  });
  fields.einwilligung.addEventListener('change', function () { if (fields.einwilligung.checked) setError('einwilligung', ''); });

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var a = new Uint8Array(16); crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }

  // Ein Versuch. 'ok' | 'invalid' | 'retry'
  function attempt(bodyStr) {
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 25000);  // erster Google-Aufruf braucht manchmal 15 s
    return fetch(WEBAPP_URL, { method: 'POST', body: new URLSearchParams(bodyStr), credentials: 'omit',
                               cache: 'no-store', redirect: 'follow', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        clearTimeout(timer);
        var res = null; try { res = JSON.parse(t); } catch (e) {}
        if (res && res.ok === true) return 'ok';
        if (res && (res.error === 'invalid' || res.error === 'unknown_artist')) return 'invalid';
        return 'retry';
      }, function () { clearTimeout(timer); return 'retry'; });
  }
  function sendWithRetries(bodyStr, n) {
    var delays = [1500, 4000];
    return attempt(bodyStr).then(function (r) {
      if (r !== 'retry' || n >= delays.length) return r;
      return new Promise(function (res) { setTimeout(res, delays[n]); })
        .then(function () { return sendWithRetries(bodyStr, n + 1); });
    });
  }

  function setLoading(on) {
    sending = on; btn.disabled = on; btn.classList.toggle('loading', on);
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (sending) return;
    primeAudio();
    formError.textContent = '';
    var ok = [checkName('vorname', 'Vornamen'), checkName('nachname', 'Nachnamen'), checkEmail(), checkTel(), checkConsent()];
    if (ok.indexOf(false) !== -1) {
      var order = ['vorname', 'nachname', 'email', 'telefon', 'einwilligung'];
      fields[order[ok.indexOf(false)]].focus();
      return;
    }
    if (form.querySelector('[name="website"]').value) { showSuccess(); return; }   // Spam-Bot

    var tel = fields.telefon.value.trim();
    var msg = (document.getElementById('nachricht').value || '').trim();
    var body = new URLSearchParams();
    body.append('kuenstler_id', KUENSTLER_ID);
    body.append('name', (fields.vorname.value.trim() + ' ' + fields.nachname.value.trim()).trim());
    body.append('email', fields.email.value.trim());
    body.append('nachricht', (msg || 'Anfrage über die Kontakt-Seite (ohne Nachricht)') + (tel ? '\n\nTelefon: ' + tel : ''));
    body.append('website', '');
    var core = body.toString();
    if (!pending || pending.core !== core) pending = { core: core, id: newId() };  // gleiche Anfrage = gleiche ID, keine Doppelten
    body.append('anfrage_id', pending.id);
    var bodyStr = body.toString();

    setLoading(true);
    var waitTimer = setTimeout(function () { waitNote.hidden = false; }, 8000);
    var delay = Math.max(0, 3000 - (Date.now() - LOADED_AT));  // sehr schnelles Ausfüllen kurz abwarten
    setTimeout(function () {
      sendWithRetries(bodyStr, 0).then(function (r) {
        clearTimeout(waitTimer); waitNote.hidden = true;
        if (r === 'ok') { pending = null; showSuccess(); return; }
        setLoading(false);
        if (r === 'invalid') {
          formError.textContent = 'Bitte prüfen Sie Ihre Angaben und versuchen Sie es erneut.';
        } else {
          try { if (navigator.sendBeacon) navigator.sendBeacon(WEBAPP_URL, new URLSearchParams(bodyStr)); } catch (e) {}
          formError.textContent = 'Das geht leider gerade nicht. Bitte versuchen Sie es erneut. ' +
            'Doppelte Anfragen werden automatisch erkannt.';
        }
      });
    }, delay);
  });

  // Bestätigungston: heller Doppel-Ding, selbst erzeugt (nichts wird geladen)
  // Ton beim Klick auf "Senden" vorbereiten (Handys erlauben Ton nur nach einem Tipp)
  var audioCtx = null;
  function primeAudio() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!audioCtx && AC) audioCtx = new AC();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* ohne Ton weiter */ }
  }
  function playChime() {
    try {
      if (!audioCtx) primeAudio();
      if (!audioCtx) return;
      var ctx = audioCtx, master = ctx.createGain();
      master.gain.value = 0.22; master.connect(ctx.destination);
      var ding = function (freq, start, len) {
        [[1, 1], [2.01, 0.28], [3.02, 0.08]].forEach(function (h) {
          var o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + start;
          o.type = 'sine'; o.frequency.value = freq * h[0];
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(h[1], t0 + 0.006);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + len / h[0]);
          o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + len + 0.05);
        });
      };
      ding(1174.66, 0, 0.55); ding(1567.98, 0.1, 0.9);
    } catch (e) { /* ohne Ton weiter */ }
  }

  // Konfetti in den Farben der Seite (reines CSS/JS, nichts wird geladen)
  function confetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var cs = getComputedStyle(document.documentElement);
    var colors = [cs.getPropertyValue('--akzent').trim(), cs.getPropertyValue('--dunkel').trim(),
                  '#f6c945', '#e76f51', '#2f855a', '#9b5de5', '#4cc9f0'];
    var box = document.createElement('div');
    box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 140; i++) {
      var p = document.createElement('i');
      p.style.setProperty('--x', (Math.random() * 100).toFixed(2) + 'vw');
      p.style.setProperty('--drift', ((Math.random() - 0.5) * 30).toFixed(1) + 'vw');
      p.style.setProperty('--rot', Math.round(360 + Math.random() * 720) + 'deg');
      p.style.setProperty('--dur', (2.4 + Math.random() * 1.8).toFixed(2) + 's');
      p.style.setProperty('--delay', (Math.random() * 0.6).toFixed(2) + 's');
      p.style.setProperty('--c', colors[i % colors.length]);
      p.style.setProperty('--w', (6 + Math.random() * 6).toFixed(0) + 'px');
      if (i % 3 === 0) p.className = 'round';
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 5200);
  }

  function showSuccess() {
    setLoading(false);
    confetti();
    playChime();
    formView.hidden = true;
    successView.hidden = false;
    document.getElementById('card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    successView.focus({ preventScroll: true });
  }

  // Knöpfe (Instagram/Website) auch in der Danke-Ansicht zeigen
  var src = document.getElementById('socialSource'), dst = document.getElementById('successSocial');
  if (src && dst) dst.innerHTML = src.innerHTML;

  // "Alle Werke anzeigen" auf- und zuklappen
  var more = document.getElementById('worksMore'), liste = document.getElementById('werkeListe');
  if (more && liste) {
    more.addEventListener('click', function () {
      var offen = liste.classList.toggle('offen');
      more.setAttribute('aria-expanded', offen ? 'true' : 'false');
      more.textContent = more.getAttribute(offen ? 'data-weniger' : 'data-mehr');
      if (!offen) document.getElementById('werke').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Werke groß ansehen: Klick auf ein Werk, blättern mit Pfeilen oder Tastatur
  var lb = document.getElementById('lightbox');
  var knoepfe = Array.prototype.slice.call(document.querySelectorAll('.work-open'));
  if (lb && typeof lb.showModal === 'function' && knoepfe.length) {
    var lbImg = document.getElementById('lightboxImg'), lbTitle = document.getElementById('lightboxTitle'),
        lbInfo = document.getElementById('lightboxInfo'), aktuell = 0;
    var zeige = function (i) {
      aktuell = (i + knoepfe.length) % knoepfe.length;
      var b = knoepfe[aktuell];
      lbImg.src = b.getAttribute('data-src');
      lbImg.alt = b.querySelector('img').alt;
      lbTitle.textContent = b.getAttribute('data-title') || '';
      lbInfo.textContent = b.getAttribute('data-info') || '';
    };
    knoepfe.forEach(function (b, i) {
      b.addEventListener('click', function () { zeige(i); lb.showModal(); });
    });
    document.getElementById('lightboxClose').addEventListener('click', function () { lb.close(); });
    document.getElementById('lightboxPrev').addEventListener('click', function () { zeige(aktuell - 1); });
    document.getElementById('lightboxNext').addEventListener('click', function () { zeige(aktuell + 1); });
    lb.addEventListener('click', function (ev) { if (ev.target === lb) lb.close(); });
    lb.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowLeft') zeige(aktuell - 1);
      if (ev.key === 'ArrowRight') zeige(aktuell + 1);
    });
    if (knoepfe.length < 2) {
      document.getElementById('lightboxPrev').hidden = true;
      document.getElementById('lightboxNext').hidden = true;
    }
  }

  // Sanftes Einblenden beim Scrollen
  var items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('visible'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('visible'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  }
})();
