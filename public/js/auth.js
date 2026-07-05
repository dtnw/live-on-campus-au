let currentUser = null;
let googleClientId = '';

function escapeHtmlAuth(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function whenGoogleReady(cb, attempts = 50) {
  if (window.google && google.accounts && google.accounts.id) {
    cb();
    return;
  }
  if (attempts <= 0) return;
  setTimeout(() => whenGoogleReady(cb, attempts - 1), 100);
}

let gsiInitialized = false;

// Ensures google.accounts.id.initialize() has run exactly once before cb runs.
// renderButton() throws/warns if called before initialize(), so every render path
// (header, myevents sign-in prompt, etc.) must go through this instead of calling
// whenGoogleReady + renderButton directly.
function ensureGsiInitialized(cb) {
  if (!googleClientId) return;
  whenGoogleReady(() => {
    if (!gsiInitialized) {
      google.accounts.id.initialize({ client_id: googleClientId, callback: handleGoogleCredential });
      gsiInitialized = true;
    }
    cb();
  });
}

function isInterested(eventId) {
  return !!(currentUser && currentUser.interestedEventIds && currentUser.interestedEventIds.includes(eventId));
}

function renderAuthArea() {
  const area = document.getElementById('authArea');
  if (!area) return;

  if (!googleClientId) {
    area.innerHTML = '<span class="auth-not-configured">Sign-in not set up yet</span>';
    return;
  }

  if (currentUser) {
    area.innerHTML = `
      <div class="user-chip">
        ${currentUser.picture ? `<img src="${currentUser.picture}" alt="" class="user-avatar" referrerpolicy="no-referrer" />` : ''}
        <span class="user-name">${escapeHtmlAuth(currentUser.name || currentUser.email)}</span>
        <button class="btn-pill outline" id="signOutBtn" type="button">Sign out</button>
      </div>
    `;
    document.getElementById('signOutBtn').addEventListener('click', signOut);
  } else {
    area.innerHTML = '<div id="gsiButtonContainer"></div>';
    ensureGsiInitialized(() => {
      google.accounts.id.renderButton(document.getElementById('gsiButtonContainer'), { theme: 'outline', size: 'medium', shape: 'pill' });
    });
  }
}

function handleGoogleCredential(response) {
  fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: response.credential })
  })
    .then(r => r.json())
    .then(user => {
      if (user.error) {
        if (typeof showToast === 'function') showToast(user.error);
        return;
      }
      currentUser = user;
      renderAuthArea();
      window.dispatchEvent(new CustomEvent('authchanged', { detail: currentUser }));
    })
    .catch(() => {
      if (typeof showToast === 'function') showToast('Sign-in failed, try again.');
    });
}

function signOut() {
  fetch('/api/auth/logout', { method: 'POST' }).then(() => {
    currentUser = null;
    renderAuthArea();
    window.dispatchEvent(new CustomEvent('authchanged', { detail: null }));
  });
}

async function initAuth() {
  try {
    const cfgRes = await fetch('/api/config');
    const cfg = await cfgRes.json();
    googleClientId = cfg.googleClientId || '';
  } catch {
    googleClientId = '';
  }

  try {
    const meRes = await fetch('/api/auth/me');
    if (meRes.ok) currentUser = await meRes.json();
  } catch {
    currentUser = null;
  }

  renderAuthArea();
  window.dispatchEvent(new CustomEvent('authready', { detail: currentUser }));
}

document.addEventListener('DOMContentLoaded', initAuth);
