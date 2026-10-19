/* ==========================================================================
   api.js: the ONLY file that reads or writes data.

   Every page calls functions on `Api` and never touches storage itself.
   The data now lives in Oracle. Each function below sends one request to the
   Flask server (backend/app.py), which calls the Oracle procedure or view.
   The business rules (what makes a bid valid, when an auction ends, how the
   wallet moves) are in the database: database/02_procedures.sql and
   database/02_procedures.sql. The browser only checks the input early so the
   user gets a quick message.

   Every function returns the same shapes as before:
   { ok: true, ... } or { ok: false, error: '...' } for actions,
   plain data (or null / empty list) for reads.

   NOTE: requests are made synchronously (XMLHttpRequest, async = false) so
   that every page script keeps working unchanged. That is fine for a sample on
   one laptop or one Wi-Fi. A production site would use fetch() with
   async/await instead.
   ========================================================================== */

const Api = (function () {
  /* The site is served by Flask, so '' (same address) works. If someone opens
     the HTML files straight from disk, talk to Flask on this laptop instead. */
  const BASE = window.BIDFORGE_API || (location.protocol === 'file:' ? 'http://localhost:5000' : '');

  /* ---------------- constants (the UI lists; the database CHECKs match) ---------------- */
  const CATEGORIES = ['Rings', 'Necklaces', 'Earrings', 'Bracelets', 'Pendants'];   // Items.Category is free text; these are the choices offered
  const CONDITIONS = ['New', 'Like New', 'Good', 'Fair'];                            // matches CHECK on Items.Condition

  /* ---------------- talking to the server ---------------- */
  let warned = false;
  function showOffline() {
    if (warned || !document.body) return;
    warned = true;
    const bar = document.createElement('div');
    bar.setAttribute('role', 'alert');
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#7a1f2b;color:#fff;padding:10px 16px;text-align:center;font:14px sans-serif';
    bar.textContent = 'Cannot reach the BidForge server. Check that app.py is running and Oracle is up, then reload.';
    document.body.appendChild(bar);
  }

  function call(method, path, body) {
    const xhr = new XMLHttpRequest();
    try {
      xhr.open(method, BASE + path, false);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(body === undefined ? null : JSON.stringify(body));
      const res = JSON.parse(xhr.responseText);
      if (xhr.status >= 500) console.error('Server error:', res.error || xhr.responseText);
      return res;
    } catch (e) {
      showOffline();
      return { ok: false, error: 'Cannot reach the server. Check that app.py is running.' };
    }
  }
  const get = (path, fallback) => { const r = call('GET', path); return r.ok ? r.data : fallback; };
  const qs = (obj) => Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');

  /* ======================================================================
     USERS
     ====================================================================== */
  function register(f) { return call('POST', '/api/register', f); }
  function login(email, password) { return call('POST', '/api/login', { email, password }); }
  function getUser(userId) { return get('/api/users/' + userId, null); }
  function updateProfile(userId, f) { return call('PUT', '/api/users/' + userId, f); }

  /* ======================================================================
     WALLET
     ====================================================================== */
  function getWallet(userId) {
    return get('/api/users/' + userId + '/wallet', { WalletBalance: 0, held: 0, available: 0, hasTransaction: false });
  }
  /* Wallet credits are internal ledger entries; this does not process external payments. */
  function addFunds(userId, amount, outcome) {
    return call('POST', '/api/wallet/add', { user_id: userId, amount, outcome });
  }

  /* ======================================================================
     BROWSING AUCTIONS
     filters: { tab: 'open'|'closed', q, category, condition, min, max, sort }
     ====================================================================== */
  function listAuctions(filters) { return get('/api/auctions?' + qs(filters || {}), []); }
  function getAuction(auctionId, viewerId) {
    return get('/api/auctions/' + Number(auctionId) + '?' + qs({ viewer: viewerId }), null);
  }
  function getHomeData() { return get('/api/home', { featured: null, endingSoon: [], liveCount: 0 }); }

  /* ======================================================================
     BIDDING (Oracle stores the bid as Accepted or Rejected)
     ====================================================================== */
  function placeBid(userId, auctionId, amount) {
    return call('POST', '/api/bids', { user_id: userId, auction_id: Number(auctionId), amount: Number(amount) });
  }
  function getMyBids(userId) { return get('/api/users/' + userId + '/bids', []); }

  /* ======================================================================
     SELLING
     ====================================================================== */
  function createItem(userId, f) { return call('POST', '/api/items', Object.assign({ user_id: userId }, f)); }
  function getListableItems(userId) { return get('/api/users/' + userId + '/listable-items', []); }
  function createAuction(userId, f) {
    const toIso = (v) => { const d = new Date(v); return isNaN(d) ? '' : d.toISOString(); };
    return call('POST', '/api/auctions', {
      user_id: userId, ItemID: Number(f.ItemID), StartingPrice: Number(f.StartingPrice),
      StartTime: toIso(f.StartTime), EndTime: toIso(f.EndTime),
    });
  }
  function cancelAuction(userId, auctionId) {
    return call('POST', '/api/auctions/' + Number(auctionId) + '/cancel', { user_id: userId });
  }
  function getMyItems(userId) { return get('/api/users/' + userId + '/items', []); }

  function getDashboard(userId) {
    return get('/api/users/' + userId + '/dashboard', {
      itemsListed: 0, liveAuctions: 0, soldCount: 0, earnings: 0, bidsReceived: 0,
      activeBids: 0, wonCount: 0, recentAuctions: [], bidsOnMine: [],
    });
  }

  /* ======================================================================
     RECORDS MANAGER: create / retrieve / search / update / delete on the five tables.
     table is one of: users, items, auctions, bids, wallet
     ====================================================================== */
  const Records = {
    list: (table, q) => get('/api/records/' + table + '?' + qs({ q }), []),
    create: (table, f) => call('POST', '/api/records/' + table, f),
    update: (table, id, f) => call('PUT', '/api/records/' + table + '/' + id, f),
    remove: (table, id) => call('DELETE', '/api/records/' + table + '/' + id),
    cancelAuction: (id) => call('POST', '/api/records/auctions/' + id + '/cancel', {}),
  };

  return {
    CATEGORIES, CONDITIONS, Records,
    register, login, getUser, updateProfile,
    getWallet, addFunds,
    listAuctions, getAuction, placeBid, getMyBids,
    createItem, getListableItems, createAuction, cancelAuction, getMyItems,
    getDashboard, getHomeData,
  };
})();
