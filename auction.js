/* ==========================================================================
   Live auction room: the main page of the project.

   What it does
   - shows the item and the auction's current state (price, highest bidder)
   - counts down to EndTime (or StartTime if the auction has not opened)
   - validates and places a bid through Api.placeBid (the rules live in api.js)
   - shows the bid history and refreshes every 2 seconds, so a bid made in
     another tab or by another user appears here without reloading
   ========================================================================== */
(function () {
  const user = Layout.mount('browse', { auth: true });
  if (!user) return;

  const id = Number(params().get('id'));
  const root = document.getElementById('room-root');
  let data = Api.getAuction(id, user.UserID);
  if (!data) {
    root.innerHTML = '<div class="empty"><h3>This lot does not exist</h3><p>The link may be old. Browse the current lots instead.</p><a class="btn btn--primary" href="browse.html">Browse lots</a></div>';
    return;
  }
  document.title = `${data.auction.item.ItemName} | BidForge`;

  /* ---------- static part: drawn once ---------- */
  const it = data.auction.item;
  root.innerHTML = `
    <p class="small"><a href="browse.html">Back to all lots</a></p>
    <div class="page-head" style="margin-bottom:20px"><h1 style="margin-bottom:4px">${esc(it.ItemName)}</h1>
      <p>Lot ${data.auction.AuctionID}, sold by ${esc(data.auction.sellerName)}</p></div>
    <div class="room">
      <div>
        <div class="room__art">${artFor(it)}</div>
        <dl class="specs">
          <div><dt>Category</dt><dd>${esc(it.Category)}</dd></div>
          <div><dt>Condition</dt><dd>${esc(it.Condition)}</dd></div>
          <div><dt>Starting price</dt><dd>${money(data.auction.StartingPrice)}</dd></div>
          <div><dt>Bidding opens</dt><dd>${dateTime(data.auction.StartTime)}</dd></div>
          <div><dt>Bidding closes</dt><dd>${dateTime(data.auction.EndTime)}</dd></div>
        </dl>
        <p>${esc(it.Description || 'The seller did not add a description.')}</p>
      </div>
      <div>
        <div id="banner"></div>
        <section class="ledger" aria-label="Bidding">
          <div class="ledger__head">
            <div class="ledger__top"><span id="status"></span><span class="small" id="bid-count"></span></div>
            <span class="lbl" id="price-label"></span>
            <div class="ledger__price" id="price"></div>
            <div class="ledger__who" id="who"></div>
          </div>
          <div class="clock" id="clock" aria-live="off"></div>
          <div class="ledger__form" id="bid-area"></div>
        </section>
      </div>
    </div>
    <section class="history"><h2>Bid history</h2><div id="history"></div></section>`;

  const $ = (sel) => document.getElementById(sel);
  let formBuilt = false;
  let endHandled = false;
  let previous = data;

  /* ---------- dynamic part: redrawn on every refresh ---------- */
  function render() {
    const a = data.auction;
    const youLead = a.WinningUserID === user.UserID && a.bidCount > 0;
    const youBid = data.bids.some((b) => b.UserID === user.UserID && b.Status === 'Accepted');
    const isSeller = a.SellerID === user.UserID;

    $('status').innerHTML = statusBadge(a.phase);
    $('bid-count').textContent = `${a.bidCount} ${a.bidCount === 1 ? 'bid' : 'bids'}`;
    $('price-label').textContent = priceLabel(a);
    $('price').textContent = money(a.CurrentHighestBid);

    const leader = data.bids.find((b) => b.Status === 'Accepted');
    if (a.phase === 'ended') $('who').textContent = a.bidCount ? `Won by ${youLead ? 'you' : a.winnerName}` : 'No bids were placed';
    else if (a.phase === 'cancelled') $('who').textContent = 'The seller cancelled this auction';
    else $('who').textContent = leader ? `Highest bidder: ${youLead ? 'you' : leader.bidderName}` : 'No bids yet. The first bid starts at the starting price.';

    /* banner */
    let banner = '';
    if (a.phase === 'upcoming') banner = `<div class="banner banner--info">Bidding opens ${dateTime(a.StartTime)}.</div>`;
    else if (a.phase === 'live' && youLead) banner = `<div class="banner banner--good">You are the highest bidder at ${money(a.CurrentHighestBid)}.</div>`;
    else if (a.phase === 'live' && youBid) banner = `<div class="banner banner--bad">You were outbid. The highest bid is now ${money(a.CurrentHighestBid)}.</div>`;
    else if (a.phase === 'ended' && youLead) banner = `<div class="banner banner--good">You won this lot for ${money(a.CurrentHighestBid)}. <a href="result.html?id=${a.AuctionID}">See the result</a></div>`;
    else if (a.phase === 'ended' && isSeller) banner = `<div class="banner banner--info">This auction has ended. <a href="result.html?id=${a.AuctionID}">See the result</a></div>`;
    else if (a.phase === 'ended') banner = `<div class="banner banner--info">This auction has ended${youBid ? ' and you did not win it' : ''}. <a href="result.html?id=${a.AuctionID}">See the result</a></div>`;
    else if (a.phase === 'cancelled') banner = '<div class="banner banner--bad">The seller cancelled this auction. No bids can be placed.</div>';
    $('banner').innerHTML = banner;

    renderClock();
    renderBidArea(a, youLead, isSeller);
    renderHistory(a);
  }

  function renderClock() {
    const a = data.auction, now = Date.now();
    const end = new Date(a.EndTime).getTime(), start = new Date(a.StartTime).getTime();
    const el = $('clock');
    if (a.phase === 'ended' || a.phase === 'cancelled') {
      el.className = 'clock';
      el.innerHTML = `<span class="clock__label" style="grid-column:1/-1;margin:0">${a.phase === 'ended' ? 'Closed' : 'Cancelled'} ${dateTime(a.EndTime)}</span>`;
      return;
    }
    const target = now < start ? start : end;
    const s = Math.max(0, Math.floor((target - now) / 1000));
    const p = (n) => String(n).padStart(2, '0');
    el.className = 'clock' + (target - now < 3600000 && now >= start ? ' clock--urgent' : '');
    el.innerHTML = `<span class="clock__label">${now < start ? 'Opens in' : 'Closes in'}</span>
      <div><b>${Math.floor(s / 86400)}</b><small>days</small></div><div><b>${p(Math.floor((s % 86400) / 3600))}</b><small>hours</small></div>
      <div><b>${p(Math.floor((s % 3600) / 60))}</b><small>minutes</small></div><div><b>${p(s % 60)}</b><small>seconds</small></div>`;
  }

  function renderBidArea(a, youLead, isSeller) {
    const area = $('bid-area');
    if (a.phase !== 'live') {
      formBuilt = false;
      area.innerHTML = a.phase === 'upcoming' ? '<p class="muted" style="margin:0">Bidding is not open yet.</p>' : '<p class="muted" style="margin:0">Bidding is closed on this lot.</p>';
      return;
    }
    if (isSeller) {
      formBuilt = false;
      area.innerHTML = '<p style="margin:0">This is your item, so you cannot bid on it. <a href="my-listings.html">Go to My listings</a></p>';
      return;
    }
    if (!formBuilt) {
      area.innerHTML = `
        <div class="ledger__money"><span>Minimum bid <strong id="min-bid"></strong></span><span>Available to bid <strong id="available"></strong></span></div>
        <form class="form" id="bid-form" novalidate>
          <div class="field"><label for="bid-amount">Your bid</label>
            <div class="input-prefix"><span>₹</span><input id="bid-amount" type="number" step="1" inputmode="numeric"></div></div>
          <div class="quick" id="quick" aria-label="Quick bid amounts"></div>
          <button class="btn btn--primary btn--block" type="submit" id="bid-btn">Place bid</button>
        </form>
        <p class="small muted" id="bid-help" style="margin:0"></p>`;
      formBuilt = true;
      $('bid-amount').addEventListener('input', () => { $('bid-amount').dataset.touched = '1'; });
      $('bid-form').addEventListener('submit', onSubmit);
    }
    const w = data.wallet;
    $('min-bid').textContent = money(a.minNextBid);
    $('available').textContent = money(w.available);
    const input = $('bid-amount');
    if (!input.dataset.touched) input.value = a.minNextBid;
    $('quick').innerHTML = [0, 1, 3].map((k) => {
      const v = a.minNextBid + k * a.increment;
      return `<button type="button" class="chip" data-amount="${v}">${money(v)}</button>`;
    }).join('');
    $('quick').querySelectorAll('[data-amount]').forEach((b) => b.addEventListener('click', () => { input.value = b.dataset.amount; input.dataset.touched = '1'; input.focus(); }));
    $('bid-btn').disabled = youLead;
    $('bid-btn').textContent = youLead ? 'You have the highest bid' : 'Place bid';
    $('bid-help').innerHTML = `Each new bid must beat the current bid by at least ${money(a.increment)}. Your available balance is your wallet minus bids you are already winning on other lots.${w.available < a.minNextBid ? ' <a href="wallet.html">Add money to your wallet</a>.' : ''}`;
  }

  function renderHistory(a) {
    const box = $('history');
    if (!data.bids.length) { box.innerHTML = '<div class="empty"><h3>No bids yet</h3><p>Be the first to bid. The opening bid is the starting price.</p></div>'; return; }
    const topId = (data.bids.find((b) => b.Status === 'Accepted') || {}).BidID;
    box.innerHTML = `<div class="panel panel--flush"><div class="table-wrap"><table>
      <thead><tr><th>Time</th><th>Bidder</th><th class="num">Amount</th><th>Result</th></tr></thead>
      <tbody>${data.bids.map((b) => `<tr class="${b.UserID === user.UserID ? 'is-you' : ''}">
        <td class="nowrap">${dateTime(b.BidTime)}</td><td>${esc(b.bidderName)}${b.BidID === topId && a.phase !== 'ended' ? ' <span class="badge badge--ok">Highest</span>' : ''}${b.BidID === topId && a.phase === 'ended' ? ' <span class="badge badge--ok">Winner</span>' : ''}</td>
        <td class="num">${money(b.BidAmount)}</td>
        <td><span class="badge ${b.Status === 'Accepted' ? 'badge--ok' : 'badge--bad'}">${b.Status}</span></td></tr>`).join('')}</tbody></table></div></div>`;
  }

  /* ---------- placing a bid ---------- */
  function onSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget, input = $('bid-amount');
    const amount = Number(input.value);
    Forms.clear(form);
    if (!input.value || !isFinite(amount) || amount <= 0) { Forms.setError(input, 'Enter the amount you want to bid.'); input.focus(); return; }
    const res = Api.placeBid(user.UserID, id, amount);
    if (res.ok) {
      toast(`Bid placed. You are the highest bidder at ${money(amount)}.`, 'success');
      input.dataset.touched = '';
      Layout.refreshWallet();
      refresh();
    } else {
      refresh();
      const freshInput = $('bid-amount');
      if (freshInput) { freshInput.dataset.touched = '1'; freshInput.value = amount; Forms.setError(freshInput, res.error); freshInput.focus(); }
      else toast(res.error, 'error');
    }
  }

  /* ---------- keeping the page live ---------- */
  function refresh() {
    previous = data;
    data = Api.getAuction(id, user.UserID);
    const wasLeading = previous.auction.WinningUserID === user.UserID && previous.auction.bidCount > 0;
    const nowLeading = data.auction.WinningUserID === user.UserID && data.auction.bidCount > 0;
    if (wasLeading && !nowLeading && data.auction.phase === 'live') toast(`You were outbid. The highest bid is now ${money(data.auction.CurrentHighestBid)}.`, 'error');
    if (previous.auction.phase === 'live' && data.auction.phase === 'ended') { toast('This auction has just ended.'); Layout.refreshWallet(); }
    // keep any error message the user is reading: only redraw the form area when something changed
    render();
  }

  render();
  setInterval(() => {
    renderClock();
    const a = data.auction;
    if ((a.phase === 'live' && Date.now() >= new Date(a.EndTime).getTime()) || (a.phase === 'upcoming' && Date.now() >= new Date(a.StartTime).getTime())) {
      if (!endHandled) { endHandled = true; refresh(); setTimeout(() => { endHandled = false; }, 1500); }
    }
  }, 1000);
  setInterval(() => {
    const fresh = Api.getAuction(id, user.UserID);
    const sig = (d) => `${d.auction.Status}|${d.auction.CurrentHighestBid}|${d.auction.WinningUserID}|${d.bids.length}|${d.wallet.available}`;
    if (sig(fresh) !== sig(data)) refresh();
  }, 2000);
  window.addEventListener('storage', () => refresh());
})();
