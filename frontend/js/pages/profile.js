/* Profile page: view and edit Users columns (email is the login, so it is read-only). */
(function () {
  const user = Layout.mount('profile', { auth: true });
  if (!user) return;

  const form = document.getElementById('profile-form');
  const f = { name: document.getElementById('FullName'), email: document.getElementById('Email'), phone: document.getElementById('PhoneNo'), address: document.getElementById('Address') };

  function showFacts(u) {
    document.getElementById('account-facts').innerHTML = `
      <dt>Member since</dt><dd>${dateOnly(u.DateJoined)}</dd>
      <dt>Account number</dt><dd>${u.UserID}</dd>
      <dt>Wallet balance</dt><dd>${money(u.WalletBalance)}</dd>`;
  }
  function fill(u) {
    f.name.value = u.FullName; f.email.value = u.Email; f.phone.value = u.PhoneNo || ''; f.address.value = u.Address || '';
    showFacts(u);
  }
  fill(user);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const phone = f.phone.value.replace(/[\s-]/g, '');
    const ok = Forms.check(form, [
      [f.name, f.name.value.trim().length < 2 ? 'Enter your full name.' : ''],
      [f.phone, phone && !/^\+?\d{10,14}$/.test(phone) ? 'Enter a phone number with 10 to 14 digits.' : ''],
    ]);
    if (!ok) return;
    const res = Api.updateProfile(user.UserID, { FullName: f.name.value, PhoneNo: f.phone.value, Address: f.address.value });
    if (!res.ok) {
      const target = /phone/i.test(res.error) ? f.phone : f.name;
      Forms.setError(target, res.error); target.focus();
      return;
    }
    fill(res.user);
    toast('Profile saved.', 'success');
  });
})();
