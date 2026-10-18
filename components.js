/* ==========================================================================
   components.js: pieces every page shares
   (navbar, footer, auction card, jewellery drawings, countdown, form helpers)
   ========================================================================== */

/* ---------------- formatting ---------------- */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const dateTime = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const dateOnly = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const params = () => new URLSearchParams(location.search);
/* value for <input type="datetime-local"> in local time */
const toLocalInput = (date) => { const d = new Date(date); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

/* ---------------- toast + flash messages ---------------- */
function toast(message, type) {
  let area = document.querySelector('.toast-area');
  if (!area) { area = document.createElement('div'); area.className = 'toast-area'; area.setAttribute('role', 'status'); area.setAttribute('aria-live', 'polite'); document.body.appendChild(area); }
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' toast--' + type : '');
  t.textContent = message;
  area.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}
/* A message that survives a page change (shown by Layout.mount on the next page). */
function flash(message, type) {
  try { sessionStorage.setItem('bf_flash', JSON.stringify({ message, type })); } catch (e) { /* ignore */ }
}

/* ---------------- confirm dialog ---------------- */
function confirmDialog({ title, message, confirmText, danger }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'dialog-backdrop';
    back.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
      <h3 id="dlg-title">${esc(title)}</h3><p class="muted">${esc(message)}</p>
      <div class="btn-row"><button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-yes>${esc(confirmText || 'Confirm')}</button>
      <button class="btn btn--secondary" data-no>Keep as is</button></div></div>`;
    const done = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    back.querySelector('[data-yes]').onclick = () => done(true);
    back.querySelector('[data-no]').onclick = () => done(false);
    back.addEventListener('click', (e) => { if (e.target === back) done(false); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    back.querySelector('[data-no]').focus();
  });
}

/* ---------------- jewellery drawings (no photos needed) ---------------- */
const METAL_GRAD = ['#f6e1a0', '#b08d3c'];
const GEM_GRAD = [['#e8566c', '#8e1228'], ['#3fc597', '#136b50'], ['#6c92ec', '#1e3f8f'], ['#f2faff', '#9cc4e4'], ['#b98ae8', '#5d3a94']];
let svgCounter = 0;

function jewelSVG(category, seed, name) {
  const n = ++svgCounter;
  const mg = METAL_GRAD;
  let gi = (seed || 0) % GEM_GRAD.length;
  const lower = (name || '').toLowerCase();
  if (lower.includes('diamond')) gi = 3; else if (lower.includes('ruby')) gi = 0; else if (lower.includes('emerald')) gi = 1; else if (lower.includes('sapphire')) gi = 2;
  const gg = GEM_GRAD[gi];
  const pearls = lower.includes('pearl');
  const M = `url(#m${n})`, G = `url(#g${n})`;
  const facet = 'stroke="rgba(255,255,255,.6)" stroke-width="1.2" fill="none"';
  let body = '';

  if (category === 'Rings') {
    body = `<ellipse cx="100" cy="130" rx="42" ry="44" fill="none" stroke="${M}" stroke-width="13"/>
      <path d="M82 88 L118 88 L111 100 L89 100Z" fill="${M}"/>
      <path d="M100 34 L128 58 L100 94 L72 58Z" fill="${G}"/>
      <path d="M72 58 H128 M100 34 L89 58 L100 94 M100 34 L111 58 L100 94" ${facet}/>`;
  } else if (category === 'Necklaces') {
    if (pearls) {
      for (let i = 0; i <= 14; i++) {
        const t = 0.03 + (i / 14) * 0.94, u = 1 - t;
        const x = u * u * 28 + 2 * u * t * 100 + t * t * 172, y = u * u * 44 + 2 * u * t * 196 + t * t * 44;
        body += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8.5" fill="url(#p${n})"/>`;
      }
    } else {
      body = `<path d="M28 44 Q100 196 172 44" fill="none" stroke="${M}" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 0"/>
        <path d="M28 44 Q100 196 172 44" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.2" stroke-dasharray="3 5"/>
        <circle cx="100" cy="121" r="6" fill="none" stroke="${M}" stroke-width="3"/>
        <path d="M100 128 L120 148 L100 176 L80 148Z" fill="${G}"/>
        <path d="M80 148 H120 M100 128 L91 148 L100 176 M100 128 L109 148 L100 176" ${facet}/>`;
    }
  } else if (category === 'Earrings') {
    [66, 134].forEach((cx) => {
      body += `<path d="M${cx} 26 v18" stroke="${M}" stroke-width="4" stroke-linecap="round" fill="none"/>
        <circle cx="${cx}" cy="50" r="8" fill="${M}"/>
        <path d="M${cx} 62 C${cx + 28} 92 ${cx + 24} 130 ${cx} 156 C${cx - 24} 130 ${cx - 28} 92 ${cx} 62Z" fill="${M}"/>
        <path d="M${cx} 94 C${cx + 14} 110 ${cx + 11} 128 ${cx} 140 C${cx - 11} 128 ${cx - 14} 110 ${cx} 94Z" fill="${G}"/>`;
    });
  } else if (category === 'Bracelets') {
    body = `<ellipse cx="100" cy="112" rx="72" ry="44" fill="none" stroke="${M}" stroke-width="13"/>
      <ellipse cx="100" cy="112" rx="72" ry="44" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.5"/>`;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      body += `<circle cx="${(100 + 72 * Math.cos(a)).toFixed(1)}" cy="${(112 + 44 * Math.sin(a)).toFixed(1)}" r="5.5" fill="${G}"/>`;
    }
  } else { /* Pendants */
    body = `<path d="M44 34 L100 106 L156 34" fill="none" stroke="${M}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="100" cy="112" r="7" fill="none" stroke="${M}" stroke-width="4"/>
      <path d="M100 124 C132 152 122 186 100 190 C78 186 68 152 100 124Z" fill="${G}" stroke="${M}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M100 134 C112 152 108 170 100 176" ${facet}/>`;
  }

  return `<svg viewBox="0 0 200 200" role="img" aria-label="${esc(category)} illustration" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="m${n}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mg[0]}"/><stop offset="1" stop-color="${mg[1]}"/></linearGradient>
      <linearGradient id="g${n}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${gg[0]}"/><stop offset="1" stop-color="${gg[1]}"/></linearGradient>
      <radialGradient id="p${n}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#d9d2c4"/></radialGradient>
    </defs>${body}</svg>`;
}
/* The picture for an item: a drawing chosen by its Category (the Items table has no photo column). */
function artFor(item) {
  return `<div class="art-fallback">${jewelSVG(item.Category, item.ItemID, item.ItemName)}</div>`;
}

/* ---------------- status + cards ---------------- */
function statusBadge(phase) {
  const label = { live: 'Live', upcoming: 'Upcoming', ended: 'Ended', cancelled: 'Cancelled' }[phase] || phase;
  return `<span class="badge badge--${phase}">${label}</span>`;
}

function priceLabel(v) {
  if (v.phase === 'upcoming') return 'Starting price';
  if (v.phase === 'cancelled') return 'Starting price';
  if (v.phase === 'ended') return v.bidCount ? 'Final bid' : 'Unsold';
  return v.bidCount ? 'Current bid' : 'Starting price';
}

function auctionCard(v) {
  const it = v.item;
  let time = '';
  if (v.phase === 'live' || v.phase === 'upcoming') time = `<span data-countdown="${v.EndTime}" data-start="${v.StartTime}"></span>`;
  else if (v.phase === 'ended') time = 'Ended';
  else time = 'Cancelled';
  return `<a class="lot" href="auction.html?id=${v.AuctionID}">
    <div class="lot__art">${artFor(it)}${statusBadge(v.phase)}</div>
    <div class="lot__body">
      <p class="lot__no">Lot ${v.AuctionID}</p>
      <h3 class="lot__name">${esc(it.ItemName)}</h3>
      <p class="lot__spec">${esc(it.Category)}, ${esc(it.Condition)}</p>
      <div class="lot__bid">
        <div><span class="lbl">${priceLabel(v)}</span><span class="price">${money(v.CurrentHighestBid)}</span></div>
        <div class="lot__time">${time}<span class="lbl">${v.bidCount} ${v.bidCount === 1 ? 'bid' : 'bids'}</span></div>
      </div>
    </div></a>`;
}

/* ---------------- countdown ---------------- */
const Countdown = (function () {
  let timer = null;
  function short(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const p = (x) => String(x).padStart(2, '0');
    return d >= 1 ? `${d}d ${h}h` : `${p(h)}:${p(m)}:${p(sec)}`;
  }
  function tick(root) {
    const now = Date.now();
    (root || document).querySelectorAll('[data-countdown]').forEach((el) => {
      const end = new Date(el.dataset.countdown).getTime();
      const start = el.dataset.start ? new Date(el.dataset.start).getTime() : 0;
      if (now < start) { el.textContent = 'Starts in ' + short(start - now); el.classList.remove('urgent'); }
      else if (now >= end) { el.textContent = 'Ended'; el.classList.remove('urgent'); }
      else { el.textContent = short(end - now); el.classList.toggle('urgent', end - now < 3600000); }
    });
  }
  function run() { tick(); if (!timer) timer = setInterval(tick, 1000); }
  return { short, tick, run };
})();

/* ---------------- form helpers ---------------- */
const Forms = {
  setError(input, message) {
    const field = input.closest('.field');
    field.classList.add('has-error');
    let e = field.querySelector('.field__error');
    if (!e) { e = document.createElement('p'); e.className = 'field__error'; e.setAttribute('role', 'alert'); field.appendChild(e); }
    e.textContent = message;
    input.setAttribute('aria-invalid', 'true');
  },
  clear(form) {
    form.querySelectorAll('.field.has-error').forEach((f) => f.classList.remove('has-error'));
    form.querySelectorAll('.field__error').forEach((e) => e.remove());
    form.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
  },
  /* Shows the first error and focuses the field. Returns true when everything is valid. */
  check(form, rules) {
    Forms.clear(form);
    let first = null;
    rules.forEach(([input, message]) => {
      if (message) { Forms.setError(input, message); first = first || input; }
    });
    if (first) first.focus();
    return !first;
  },
};

/* ---------------- layout: navbar + footer ---------------- */
const Layout = (function () {
  const GEM = `<svg class="brand__gem" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 L21 9 L12 22 L3 9Z" fill="#b08d3c"/><path d="M3 9 H21 M12 2 L8 9 L12 22 L16 9 L12 2" stroke="#0c2622" stroke-width="1" fill="none"/></svg>`;

  function navHTML(active, user) {
    const link = (page, href, label) => `<a href="${href}" ${active === page ? 'aria-current="page"' : ''}>${label}</a>`;
    let links = link('browse', 'browse.html', 'Browse lots');
    let right = '';
    if (user) {
      links += link('my-bids', 'my-bids.html', 'My bids') + link('sell', 'list-item.html', 'Sell') + link('my-listings', 'my-listings.html', 'My listings') + link('dashboard', 'dashboard.html', 'Dashboard') + link('records', 'records.html', 'Records');
      const w = Api.getWallet(user.UserID);
      right = `<a class="wallet-chip" href="wallet.html" aria-label="Wallet balance"><span>Wallet</span><strong id="wallet-chip-amount">${money(w.WalletBalance)}</strong></a>
        <a class="nav__user" href="profile.html">${esc(user.FullName.split(' ')[0])}</a>
        <button class="btn btn--ghost" id="logout-btn" type="button">Log out</button>`;
    } else {
      right = `<a class="btn btn--ghost" href="login.html">Log in</a><a class="btn btn--primary btn--small" href="register.html">Create account</a>`;
    }
    return `<div class="container nav__inner">
      <a class="brand" href="index.html">${GEM}BidForge</a>
      <button class="nav__toggle" type="button" aria-expanded="false" aria-controls="nav-menu">Menu</button>
      <div class="nav__menu" id="nav-menu"><nav class="nav__links" aria-label="Main">${links}</nav><div class="nav__right">${right}</div></div>
    </div>`;
  }

  function footerHTML() {
    return `<div class="container footer__inner">
      <span>BidForge jewellery auctions. Wallet credits are internal balances; external payments are not supported.</span>
      <span><a href="browse.html">Browse lots</a></span>
    </div>`;
  }

  /* active: which nav link to highlight. opts.auth: page needs a login. Returns the user (or null). */
  function mount(active, opts) {
    const o = opts || {};
    const user = o.auth ? Auth.require() : Auth.user();
    if (o.auth && !user) return null;
    document.getElementById('site-nav').innerHTML = navHTML(active, user);
    document.getElementById('site-footer').innerHTML = footerHTML();

    const toggle = document.querySelector('.nav__toggle');
    toggle.addEventListener('click', () => {
      const menu = document.getElementById('nav-menu');
      const open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    const logout = document.getElementById('logout-btn');
    if (logout) logout.addEventListener('click', () => { Auth.logout(); flash('You have been logged out.'); location.href = 'index.html'; });
    try {
      const f = JSON.parse(sessionStorage.getItem('bf_flash') || 'null');
      if (f) { sessionStorage.removeItem('bf_flash'); toast(f.message, f.type); }
    } catch (e) { /* ignore */ }

    Countdown.run();
    return user;
  }

  function refreshWallet() {
    const el = document.getElementById('wallet-chip-amount');
    const id = Auth.userId();
    if (el && id) el.textContent = money(Api.getWallet(id).WalletBalance);
  }

  return { mount, refreshWallet };
})();
