/* Wallet page: reads and updates the Wallet table (one row per user, latest transaction). */
(function () {
  const user = Layout.mount('wallet', { auth: true });
  if (!user) return;

  const amount = document.getElementById('amount');
  const form = document.getElementById('fund-form');

  function render() {
    const w = Api.getWallet(user.UserID);
    document.getElementById('balance').textContent = money(w.WalletBalance);
    document.getElementById('balance-note').textContent = w.held
      ? `${money(w.available)} is available to bid. ${money(w.held)} is held for lots where you have the highest bid.`
      : `${money(w.available)} is available to bid.`;

    document.getElementById('latest-tx').innerHTML = !w.hasTransaction
      ? '<div class="empty" style="padding:28px 16px"><h3>No transactions yet</h3><p>Add money to start bidding.</p></div>'
      : `<dl class="kv">
          <dt>Transaction number</dt><dd>${w.TransactionID}</dd>
          <dt>Type</dt><dd>${w.TransactionType === 'Credit' ? 'Money in (Credit)' : 'Money out (Debit)'}</dd>
          <dt>Date</dt><dd>${dateTime(w.TransactionDate)}</dd>
          <dt>Status</dt><dd><span class="badge ${w.Status === 'Success' ? 'badge--ok' : 'badge--bad'}">${w.Status}</span></dd>
          <dt>Balance after</dt><dd>${money(w.WalletBalance)}</dd>
        </dl>`;
    Layout.refreshWallet();
  }

  document.getElementById('quick-amounts').innerHTML = [1000, 5000, 10000, 50000]
    .map((v) => `<button type="button" class="chip" data-amount="${v}">${money(v)}</button>`).join('');
  document.querySelectorAll('#quick-amounts [data-amount]').forEach((b) => b.addEventListener('click', () => {
    amount.value = b.dataset.amount;
    document.querySelectorAll('#quick-amounts .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    amount.focus();
  }));
  amount.addEventListener('input', () => document.querySelectorAll('#quick-amounts .chip').forEach((c) => c.setAttribute('aria-pressed', 'false')));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = Number(amount.value);
    const ok = Forms.check(form, [[amount, !amount.value || !isFinite(v) || v <= 0 ? 'Enter an amount greater than 0.' : v > 500000 ? 'You can add at most ₹5,00,000 at a time.' : '']]);
    if (!ok) return;
    const res = Api.addFunds(user.UserID, v);
    if (res.ok) { toast(`${money(v)} added to your wallet.`, 'success'); amount.value = ''; }
    else toast(res.error, 'error');
    render();
  });

  render();
})();
