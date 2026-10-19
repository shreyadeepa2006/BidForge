/* Dashboard: one-page summary of selling (Items, Auctions) and bidding (Bids, Wallet). */
(function () {
  const user = Layout.mount('dashboard', { auth: true });
  if (!user) return;
  const d = Api.getDashboard(user.UserID);
  const w = Api.getWallet(user.UserID);
  const stat = (label, value, cls) => `<div class="stat ${cls || ''}"><span class="lbl">${label}</span><span class="price">${value}</span></div>`;

  document.getElementById('dash-root').innerHTML = `
    <div class="page-head"><h1>Hello, ${esc(user.FullName.split(' ')[0])}</h1><p>Your selling and bidding at a glance.</p></div>

    <section aria-labelledby="sell-h"><div class="section__head"><h2 id="sell-h">Selling</h2><a href="list-item.html">List a new item</a></div>
      <div class="stats">
        ${stat('Items listed', d.itemsListed)}${stat('Open auctions', d.liveAuctions)}${stat('Items sold', d.soldCount)}
        ${stat('Earnings', money(d.earnings), 'stat--accent')}${stat('Bids received', d.bidsReceived)}
      </div></section>

    <section class="section" aria-labelledby="bid-h"><div class="section__head"><h2 id="bid-h">Bidding</h2><a href="my-bids.html">See all my bids</a></div>
      <div class="stats">
        ${stat('Wallet balance', money(w.WalletBalance), 'stat--accent')}${stat('Available to bid', money(w.available))}
        ${stat('Lots you are winning', d.activeBids)}${stat('Lots you won', d.wonCount)}
      </div></section>

    <div class="two-col section">
      <section><h2>Your recent auctions</h2>
        ${d.recentAuctions.length ? `<div class="panel panel--flush"><div class="table-wrap"><table>
          <thead><tr><th>Item</th><th>Status</th><th class="num">Bid</th></tr></thead>
          <tbody>${d.recentAuctions.map((a) => `<tr><td><a href="${a.phase === 'ended' || a.phase === 'cancelled' ? 'result' : 'auction'}.html?id=${a.AuctionID}">${esc(a.item.ItemName)}</a></td><td>${statusBadge(a.phase)}</td><td class="num">${money(a.CurrentHighestBid)}</td></tr>`).join('')}</tbody></table></div></div>`
          : '<div class="empty"><h3>No auctions yet</h3><p>List an item and schedule its auction.</p><a class="btn btn--primary" href="list-item.html">List an item</a></div>'}
      </section>
      <section><h2>Latest bids on your lots</h2>
        ${d.bidsOnMine.length ? `<div class="panel panel--flush"><div class="table-wrap"><table>
          <thead><tr><th>Bidder</th><th>Item</th><th class="num">Amount</th></tr></thead>
          <tbody>${d.bidsOnMine.map((b) => `<tr><td>${esc(b.bidderName)}<div class="small muted">${dateTime(b.BidTime)}</div></td><td>${esc(b.itemName)}</td><td class="num">${money(b.BidAmount)}</td></tr>`).join('')}</tbody></table></div></div>`
          : '<div class="empty"><h3>No bids on your lots yet</h3><p>Bids on your items appear here as they come in.</p></div>'}
      </section>
    </div>`;
})();
