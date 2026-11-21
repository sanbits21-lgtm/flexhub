// Landing page behaviour. No framework, no tracking: it fills in the parts that depend on your settings (config.js) and on the live
// plans, and hides anything that has nothing to show.
(function () {
  'use strict';
  var cfg = window.FITZY_LANDING || {};
  var ICON = '/landing/icons.svg#';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var el = function (tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var icon = function (name, cls) { return '<svg class="i ' + (cls || '') + '" aria-hidden="true"><use href="' + ICON + name + '"></use></svg>'; };
  var safeUrl = function (u) { return /^https:\/\/[^\s"'<>]+$/i.test(u || '') ? u : ''; };

  // Mobile menu.
  var burger = $('#burger'), links = $('#links');
  burger.addEventListener('click', function () {
    var open = links.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  $$('a', links).forEach(function (a) { a.addEventListener('click', function () { links.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }); });

  // Real numbers (hidden when there are none).
  if (Array.isArray(cfg.stats) && cfg.stats.length) {
    $('#proof-list').innerHTML = cfg.stats.map(function (s) { return '<div><b>' + esc(s.value) + '</b><span>' + esc(s.label) + '</span></div>'; }).join('');
    $('#proof').hidden = false;
  }

  // Videos: a thumbnail that loads the player (from the privacy-friendly youtube-nocookie address) only when clicked.
  var vid = function (id, title) {
    var b = el('button', 'vid');
    b.type = 'button';
    b.setAttribute('aria-label', 'Play video: ' + title);
    b.style.backgroundImage = 'url(https://i.ytimg.com/vi/' + encodeURIComponent(id) + '/hqdefault.jpg)';
    b.innerHTML = '<span class="play"><span>' + icon('play') + '</span></span>';
    b.addEventListener('click', function () {
      var f = el('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0';
      f.referrerPolicy = 'strict-origin-when-cross-origin'; f.title = title; f.allow = 'autoplay; encrypted-media; picture-in-picture'; f.allowFullscreen = true; f.loading = 'lazy';
      f.style.cssText = 'width:100%;aspect-ratio:16/9;border:0;border-radius:16px';
      b.replaceWith(f);
    });
    return b;
  };
  var v = cfg.videos || {};
  var hasVideo = !!(v.main || (v.more && v.more.length));
  if (hasVideo) {
    if (v.main) $('#video-main').appendChild(vid(v.main, 'FitzyClub product tour'));
    (v.more || []).forEach(function (m) {
      var d = el('div');
      d.appendChild(vid(m.id, m.title));
      d.appendChild(el('p', 'vcap', esc(m.title) + (m.length ? '<small>' + esc(m.length) + '</small>' : '')));
      $('#video-more').appendChild(d);
    });
    $('#demo').hidden = false;
  }
  $$('[data-needs="video"]').forEach(function (a) { a.hidden = !hasVideo; });

  // Testimonials (hidden until you add real ones).
  var t = cfg.testimonials || [];
  if (t.length) {
    $('#stories-list').innerHTML = t.map(function (q) {
      var who = [q.role, q.gym].filter(Boolean).join(', ');
      return '<div class="card quote">' + icon('quote', 'i-lg') + '<p>' + esc(q.quote) + '</p><div class="who"><span class="av">' + esc((q.name || '?').charAt(0)) + '</span><span><b>' + esc(q.name) + '</b><small>' + esc([who, q.city].filter(Boolean).join(' · ')) + '</small></span></div></div>';
    }).join('');
    $('#stories').hidden = false;
  }
  $$('[data-needs="stories"]').forEach(function (a) { a.hidden = !t.length; });

  // Contact and social links (each shown only when set).
  var wa = String(cfg.whatsapp || '').replace(/\D/g, '');
  if (wa.length >= 10) {
    var waUrl = 'https://wa.me/' + wa + '?text=' + encodeURIComponent('Hi, I would like to know more about FitzyClub.');
    var f = $('#wa-float'); f.href = waUrl; f.target = '_blank'; f.rel = 'noopener'; f.hidden = false;
    var fw = $('#foot-wa'); fw.href = waUrl; fw.target = '_blank'; fw.rel = 'noopener'; fw.hidden = false;
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.email || '')) {
    var m = $('#foot-mail'); m.href = 'mailto:' + cfg.email; m.hidden = false;
    var bc = $('#book-call'); bc.href = 'mailto:' + cfg.email + '?subject=' + encodeURIComponent('Question about FitzyClub'); bc.hidden = false;
  }
  var NET = { youtube: 'YouTube', instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', x: 'X' };
  var ICONNAME = { youtube: 'youtube', instagram: 'instagram', facebook: 'facebook', linkedin: 'linkedin', x: 'twitter' };
  Object.keys(NET).forEach(function (k) {
    var u = safeUrl((cfg.social || {})[k]);
    if (!u) return;
    var a = el('a', '', icon(ICONNAME[k]));
    a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.setAttribute('aria-label', 'FitzyClub on ' + NET[k]);
    $('#social').appendChild(a);
  });
  var co = cfg.company || {};
  $('#foot-company').textContent = [co.name || 'FitzyClub', co.address].filter(Boolean).join(' · ');
  $('#foot-year').textContent = '© ' + new Date().getFullYear();

  // Sticky sign-up bar on phones once the hero has scrolled away.
  var bar = $('#sticky-cta'), hero = $('.hero');
  if ('IntersectionObserver' in window && hero) {
    new IntersectionObserver(function (e) { bar.classList.toggle('show', !e[0].isIntersecting); }).observe(hero);
  }

  // Pricing, read live from the plans you set up in Platform admin.
  var money = function (n) { return n === 0 ? 'Free' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n); };
  var per = function (months) { return months === 1 ? '/month' : months === 12 ? '/year' : '/' + months + ' months'; };
  var plansBox = $('#plans');
  var fallback = function () {
    plansBox.innerHTML = '<div class="plan"><h3>Start free</h3><p class="muted">Register your gym and see the plans when you sign up.</p><a class="btn" href="/signup" data-cta="plans">Start free trial</a></div>';
  };
  fetch('/api/public/signup-config', { headers: { Accept: 'application/json' } })
    .then(function (r) { if (!r.ok) throw new Error('config'); return r.json(); })
    .then(function (c) {
      if (c && c.trialDays) $$('[data-trial]').forEach(function (s) { s.textContent = c.trialDays; });
      var list = (c && c.packages) || [];
      if (!c || !c.enabled || !list.length) return fallback();
      plansBox.innerHTML = '';
      list.forEach(function (p) {
        var lines = [];
        lines.push(p.maxBranches === 1 ? '1 branch' : p.maxBranches + ' branches');
        lines.push(p.maxMembers ? 'Up to ' + new Intl.NumberFormat('en-IN').format(p.maxMembers) + ' members' : 'Unlimited members');
        if (p.trialDays) lines.push(p.trialDays + '-day free trial');
        (p.highlights || []).forEach(function (h) { lines.push(h); });
        var d = el('div', 'plan' + (p.isFeatured ? ' pop' : ''));
        d.innerHTML = (p.isFeatured ? '<span class="badge">Most popular</span>' : '') +
          '<h3>' + esc(p.name) + '</h3>' + (p.description ? '<p class="muted small">' + esc(p.description) + '</p>' : '') +
          '<div class="price">' + money(p.price) + (p.price ? ' <small>' + per(p.billingMonths || 1) + '</small>' : '') + '</div>' +
          '<ul>' + lines.map(function (l) { return '<li>' + icon('check') + '<span>' + esc(l) + '</span></li>'; }).join('') + '</ul>' +
          '<a class="btn' + (p.isFeatured ? '' : ' btn-ghost') + '" href="/signup' + (p._id ? '?package=' + encodeURIComponent(p._id) : '') + '" data-cta="plan">Start free trial</a>';
        plansBox.appendChild(d);
      });
    })
    .catch(fallback);
})();
