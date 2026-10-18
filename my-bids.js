/* My bids: every row of the Bids table for this user, plus where each one stands. */
(function () {
  const user = Layout.mount('my-bids', { auth: true });
  if (!user) return;

  const STANDINGS = ['All', 'Winning', 'Outbid', 'Won', 'Lost', 'Rejected', 'Cancelled'];
  const BADGE = { Winning: 'ok', Won: 'ok', Outbid: 'warn', Lost: 'ended', Rejected: 'bad', Cancelled: 'ended' };
  const tabs = document.getElementById('bid-tabs');
  const root = document.getElementById('bids-root');
  let active = 'All';

  function render() {
    const all = Api.getMyBids(user.UserID);
    const count = (s) => (s === 'All' ? all.length : all.filter((b) => b.standing === s).length);
    tabs.innerHTML = STANDINGS.filter((s) => s === 'All' || count(s) > 0 || s === active)
      .map((s) => `<button class="tab" role="tab" data-tab="${s}" aria-selected="${s === active}">${s} (${count(s)})</button>`).join('');
    tabs.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { active = b.dataset.tab; render(); }));

    const rows = active === 'All' ? all : all.filter((b) => b.standing === active);
    if (!all.length) {
      root.innerHTML = '<div class="empty"><h3>You have not placed a bid yet</h3><p>Pick a live lot and place your first bid.</p><a class="btn btn--primary" href="browse.html">Browse lots</a></div>';
      return;
    }
    if (!rows.length) { root.innerHTML = `<div class="empty"><h3>No ${active.toLowerCase()} bids</h3><p>Bids with this standing will appear here.</p></div>`; return; }
    root.innerHTML = `<div class="panel panel--flush"><div class="table-wrap"><table>
      <thead><tr><th>Lot</th><th class="num">Your bid</th><th class="num">Current or final bid</th><th>Placed</th><th>Bid result</th><th>Standing</th></tr></thead>
      <tbody>${rows.map((b) => `<tr>
        <td><a href="auction.html?id=${b.AuctionID}">${esc(b.auction.item.ItemName)}</a><div class="small muted">Lot ${b.AuctionID}</div></td>
        <td class="num">${money(b.BidAmount)}</td><td class="num">${money(b.auction.CurrentHighestBid)}</td>
        <td class="nowrap">${dateTime(b.BidTime)}</td>
        <td><span class="badge ${b.Status === 'Accepted' ? 'badge--ok' : 'badge--bad'}">${b.Status}</span></td>
        <td><span class="badge badge--${BADGE[b.standing]}">${b.standing}</span>${b.standing === 'Won' || b.standing === 'Lost' ? ` <a class="small" href="result.html?id=${b.AuctionID}">Result</a>` : ''}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  }
  render();
  window.addEventListener('storage', render);
  setInterval(render, 5000);
})();
