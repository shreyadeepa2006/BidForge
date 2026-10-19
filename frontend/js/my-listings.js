/* My listings: the seller's items and their auctions, with Create and Cancel actions. */
(function () {
  const user = Layout.mount('my-listings', { auth: true });
  if (!user) return;
  const root = document.getElementById('listings-root');

  function statusCell(a) {
    return a ? statusBadge(a.phase) : '<span class="badge">No auction</span>';
  }

  function render() {
    const rows = Api.getMyItems(user.UserID);
    if (!rows.length) {
      root.innerHTML = '<div class="empty"><h3>You have not listed anything yet</h3><p>List a piece, then schedule its auction.</p><a class="btn btn--primary" href="list-item.html">List an item</a></div>';
      return;
    }
    root.innerHTML = `<div class="panel panel--flush"><div class="table-wrap"><table>
      <thead><tr><th>Item</th><th>Auction</th><th class="num">Starting price</th><th class="num">Current bid</th><th class="num">Bids</th><th>Closes</th><th>Actions</th></tr></thead>
      <tbody>${rows.map(({ item, auction }) => {
        const open = auction && (auction.phase === 'live' || auction.phase === 'upcoming');
        const canCancel = open && auction.bidCount === 0;
        let actions = '';
        if (auction) actions += `<a class="btn btn--secondary btn--small" href="${auction.phase === 'ended' || auction.phase === 'cancelled' ? 'result' : 'auction'}.html?id=${auction.AuctionID}">View</a> `;
        if (!open) actions += `<a class="btn btn--primary btn--small" href="create-auction.html?item=${item.ItemID}">Create auction</a>`;
        if (open) actions += `<button class="btn btn--danger btn--small" data-cancel="${auction.AuctionID}" ${canCancel ? '' : 'disabled title="An auction with bids cannot be cancelled."'}>Cancel auction</button>`;
        return `<tr><td><strong>${esc(item.ItemName)}</strong><div class="small muted">${esc(item.Category)}</div></td>
          <td>${statusCell(auction)}</td><td class="num">${money(item.StartingPrice)}</td>
          <td class="num">${auction && auction.bidCount ? money(auction.CurrentHighestBid) : 'No bids'}</td>
          <td class="num">${auction ? auction.bidCount : 0}</td>
          <td class="nowrap">${auction ? dateTime(auction.EndTime) : 'Not scheduled'}</td>
          <td><div class="btn-row" style="gap:8px">${actions}</div></td></tr>`;
      }).join('')}</tbody></table></div></div>
      <p class="small muted" style="margin-top:12px">You can cancel an auction only while it has no bids.</p>`;

    root.querySelectorAll('[data-cancel]').forEach((btn) => btn.addEventListener('click', async () => {
      const yes = await confirmDialog({ title: 'Cancel this auction?', message: 'Bidders will see it as cancelled. You can create a new auction for the item afterwards.', confirmText: 'Cancel auction', danger: true });
      if (!yes) return;
      const res = Api.cancelAuction(user.UserID, btn.dataset.cancel);
      toast(res.ok ? 'Auction cancelled.' : res.error, res.ok ? 'success' : 'error');
      render();
    }));
  }
  render();
})();
