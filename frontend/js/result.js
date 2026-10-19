/* Auction result page: the outcome of an ended or cancelled auction. */
(function () {
  const user = Layout.mount('browse');
  const root = document.getElementById('result-root');
  const id = Number(params().get('id'));
  const data = Api.getAuction(id, user ? user.UserID : null);

  if (!data) {
    root.innerHTML = '<div class="empty"><h3>This lot does not exist</h3><p>Check the link, or browse the current lots.</p><a class="btn btn--primary" href="browse.html">Browse lots</a></div>';
    return;
  }
  const a = data.auction, it = a.item;
  document.title = `Result for ${it.ItemName} | BidForge`;

  if (a.phase === 'live' || a.phase === 'upcoming') {
    root.innerHTML = `<div class="empty"><h3>This auction is still open</h3><p>The result appears here once bidding closes ${dateTime(a.EndTime)}.</p>
      <a class="btn btn--primary" href="auction.html?id=${a.AuctionID}">Go to the live room</a></div>`;
    return;
  }

  const youWon = user && a.WinningUserID === user.UserID && a.bidCount > 0;
  const youSold = user && a.SellerID === user.UserID;
  let headline, detail, tone;
  if (a.phase === 'cancelled') { headline = 'Cancelled by the seller'; detail = 'This auction was cancelled before any bids were placed.'; tone = 'bad'; }
  else if (!a.bidCount) { headline = 'Unsold'; detail = 'Nobody bid on this lot before it closed. The item goes back to the seller.'; tone = 'info'; }
  else if (youWon) { headline = `You won this lot for ${money(a.CurrentHighestBid)}`; detail = 'The price was taken from your wallet and paid to the seller. Contact the seller to arrange delivery to your address.'; tone = 'good'; }
  else if (youSold) { headline = `Your item sold for ${money(a.CurrentHighestBid)}`; detail = `The price was paid into your wallet. Ship the piece to ${a.winnerName}.`; tone = 'good'; }
  else { headline = `Sold for ${money(a.CurrentHighestBid)}`; detail = `Won by ${a.winnerName}.`; tone = 'info'; }

  const accepted = data.bids.filter((b) => b.Status === 'Accepted');
  root.innerHTML = `
    <p class="small"><a href="browse.html">Back to all lots</a></p>
    <div class="page-head"><h1>${esc(it.ItemName)}</h1><p>Lot ${a.AuctionID}, ${statusBadge(a.phase)}</p></div>
    <div class="banner banner--${tone}" style="padding:20px 22px"><strong style="font-size:1.2rem">${esc(headline)}</strong><br>${esc(detail)}</div>
    <div class="two-col" style="margin-top:24px">
      <section class="panel"><h2>Summary</h2>
        <dl class="kv">
          <dt>Item</dt><dd><a href="auction.html?id=${a.AuctionID}">${esc(it.ItemName)}</a></dd>
          <dt>Seller</dt><dd>${esc(a.sellerName)}</dd>
          <dt>Starting price</dt><dd>${money(a.StartingPrice)}</dd>
          <dt>${a.bidCount ? 'Final bid' : 'Highest bid'}</dt><dd>${a.bidCount ? money(a.CurrentHighestBid) : 'None'}</dd>
          <dt>Winner</dt><dd>${a.bidCount && a.phase === 'ended' ? esc(youWon ? 'You' : a.winnerName) : 'None'}</dd>
          <dt>Accepted bids</dt><dd>${a.bidCount}</dd>
          <dt>Opened</dt><dd>${dateTime(a.StartTime)}</dd>
          <dt>Closed</dt><dd>${dateTime(a.EndTime)}</dd>
        </dl>
      </section>
      <section class="panel"><h2>Bid history</h2>
        ${accepted.length ? `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Bidder</th><th class="num">Amount</th></tr></thead><tbody>
          ${accepted.map((b, i) => `<tr class="${b.UserID === (user && user.UserID) ? 'is-you' : ''}"><td class="nowrap">${dateTime(b.BidTime)}</td><td>${esc(b.bidderName)}${i === 0 && a.phase === 'ended' ? ' <span class="badge badge--ok">Winner</span>' : ''}</td><td class="num">${money(b.BidAmount)}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="muted">There were no bids.</p>'}
      </section>
    </div>
    <div class="btn-row" style="margin-top:24px"><a class="btn btn--primary" href="browse.html">Browse more lots</a>${user ? '<a class="btn btn--secondary" href="my-bids.html">My bids</a>' : ''}</div>`;
})();
