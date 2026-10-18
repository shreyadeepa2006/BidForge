/* ==========================================================================
   auth.js: who is logged in?

   The logged-in UserID is kept in sessionStorage, so each browser TAB has its
   own login. The browser stores the current user identifier for this session. Production deployments should use server-managed sessions or signed tokens and enforce authorization on every API endpoint.
   ========================================================================== */

const Auth = (function () {
  const KEY = 'bidforge_session_v2';
  let memory = null; // fallback if sessionStorage is blocked

  function read() {
    try { return sessionStorage.getItem(KEY); } catch (e) { return memory; }
  }
  function write(value) {
    memory = value;
    try {
      if (value === null) sessionStorage.removeItem(KEY); else sessionStorage.setItem(KEY, value);
    } catch (e) { /* blocked */ }
  }

  function userId() {
    const v = read();
    return v ? Number(v) : null;
  }
  function user() {
    const id = userId();
    return id ? Api.getUser(id) : null;
  }
  function login(email, password) {
    const res = Api.login(email, password);
    if (res.ok) write(String(res.user.UserID));
    return res;
  }
  function startSession(userIdValue) { write(String(userIdValue)); }
  function logout() { write(null); }

  /* Call at the top of a page that needs a login. Returns the user, or sends
     the visitor to the login page and returns null. */
  function require() {
    const u = user();
    if (u) return u;
    const here = location.pathname.split('/').pop() + location.search;
    location.replace('login.html?next=' + encodeURIComponent(here));
    return null;
  }

  return { userId, user, login, startSession, logout, require };
})();
