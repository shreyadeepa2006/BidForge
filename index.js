/* Landing page: hero with one featured live lot, lots ending soon, categories. */
(function () {
  Layout.mount('home');
  const { featured, endingSoon } = Api.getHomeData();

  const featuredEl = document.getElementById('featured');
  if (featured) {
    const it = featured.item;
    featuredEl.innerHTML = `<a class="hero__photo" href="auction.html?id=${featured.AuctionID}" aria-label="Open the live auction for ${esc(it.ItemName)}">
      <div class="hero__img">${artFor(it)}</div>
      <div class="hero__float">
        <span>${statusBadge('live')}</span>
        <h3>${esc(it.ItemName)}</h3>
        <span class="small muted">${esc(it.Condition)}</span>
        <div class="row">
          <div><span class="lbl">${featured.bidCount ? 'Current bid' : 'Starting price'}</span><span class="price">${money(featured.CurrentHighestBid)}</span></div>
          <div class="lot__time"><span data-countdown="${featured.EndTime}" data-start="${featured.StartTime}"></span><span class="lbl">${featured.bidCount} bids</span></div>
        </div>
      </div></a>`;
  } else {
    featuredEl.innerHTML = '<div class="hero__empty"><h3>No lots are live right now</h3><p>List a piece to open the next auction.</p></div>';
  }

  document.getElementById('ending-soon').innerHTML = endingSoon.length
    ? endingSoon.map(auctionCard).join('')
    : '<div class="empty" style="grid-column:1/-1"><h3>No lots are live right now</h3><p>When a seller opens an auction, it shows up here.</p><a class="btn btn--primary" href="list-item.html">List an item</a></div>';

  document.getElementById('cats').innerHTML = Api.CATEGORIES.map((c, i) =>
    `<a class="cat" href="browse.html?category=${encodeURIComponent(c)}"><div class="cat__art">${jewelSVG(c, 'Gold', i + 1, '')}</div><strong>${esc(c)}</strong></a>`
  ).join('');

  Countdown.tick();
})();
