function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

let selectedColor = 'orange';
let selectedIcon = '🎉';

function parseTimeToMinutes(str) {
  const m = String(str || '').trim().match(/(\d{1,2}):(\d{2})\s*([AaPp][Mm])?/);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const ampm = m[3] ? m[3].toLowerCase() : null;
  if (ampm === 'pm' && hours < 12) hours += 12;
  if (ampm === 'am' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function computeDurationMinutes(startStr, endStr) {
  const start = parseTimeToMinutes(startStr);
  const end = parseTimeToMinutes(endStr);
  if (start === null || end === null) return 120;
  let diff = end - start;
  if (diff <= 0) diff += 24 * 60; // event runs past midnight
  return diff;
}

document.getElementById('colorGrid').addEventListener('click', (e) => {
  const swatch = e.target.closest('.color-swatch');
  if (!swatch) return;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  swatch.classList.add('selected');
  selectedColor = swatch.dataset.color;
});

document.getElementById('iconGrid').addEventListener('click', (e) => {
  const swatch = e.target.closest('.icon-swatch');
  if (!swatch) return;
  document.querySelectorAll('.icon-swatch').forEach(s => s.classList.remove('selected'));
  swatch.classList.add('selected');
  selectedIcon = swatch.dataset.icon;
});

document.getElementById('eventForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('title').value.trim();
  const description = document.getElementById('description').value.trim();
  const date = document.getElementById('date').value;
  const time = document.getElementById('time').value.trim();
  const endTime = document.getElementById('endTime').value.trim();
  const location = document.getElementById('location').value.trim();
  const hostedBy = document.getElementById('hostedBy').value.trim();
  const durationMinutes = computeDurationMinutes(time, endTime);
  const campus = document.getElementById('campus').value;
  const signupUrl = document.getElementById('signupUrl').value.trim();
  const isFree = document.getElementById('isFree').checked;
  const tags = Array.from(document.querySelectorAll('#tagGrid input:checked')).map(cb => cb.value);

  if (!title || !date || !location) {
    showToast('Please fill in title, date, and location.');
    return;
  }

  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, date, time, location, hostedBy, tags, imageColor: selectedColor, durationMinutes, icon: selectedIcon, campus, signupUrl, isFree })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'failed');
    }
    showToast('Event posted! Students will see it on the feed.');
    e.target.reset();
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    document.querySelector('.color-swatch.orange').classList.add('selected');
    selectedColor = 'orange';
    document.querySelectorAll('.icon-swatch').forEach(s => s.classList.remove('selected'));
    document.querySelector('.icon-swatch[data-icon="🎉"]').classList.add('selected');
    selectedIcon = '🎉';
    loadAdminList();
  } catch (err) {
    showToast(err.message === 'failed' ? 'Could not post event. Try again.' : err.message);
  }
});

async function loadAdminList() {
  const list = document.getElementById('adminEventList');
  list.innerHTML = 'Loading&hellip;';
  const res = await fetch('/api/events');
  const events = await res.json();
  if (!events.length) {
    list.innerHTML = '<div class="empty-state">No events posted yet.</div>';
    return;
  }
  list.innerHTML = events.map(ev => `
    <div class="admin-event-row" data-id="${ev.id}">
      <span class="name">${escapeHtml(ev.title)} <span style="color:#5B6072;font-weight:400;">&middot; ${ev.date}</span></span>
      <button class="del-btn">Remove</button>
    </div>
  `).join('');
}

document.getElementById('adminEventList').addEventListener('click', async (e) => {
  const btn = e.target.closest('.del-btn');
  if (!btn) return;
  const row = btn.closest('.admin-event-row');
  const id = row.dataset.id;
  if (!confirm('Remove this event?')) return;
  const res = await fetch(`/api/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) { showToast('Could not remove event.'); return; }
  showToast('Event removed.');
  loadAdminList();
});

// Gate the admin UI: only the organiser account may add/remove events.
function refreshAdminGate() {
  const content = document.getElementById('adminContent');
  const gate = document.getElementById('adminGate');
  const gateMsg = document.getElementById('adminGateMsg');
  const signinContainer = document.getElementById('adminSigninContainer');
  const isAdmin = !!(typeof currentUser !== 'undefined' && currentUser && currentUser.isAdmin);

  if (isAdmin) {
    content.hidden = false;
    gate.hidden = true;
    loadAdminList();
    return;
  }

  content.hidden = true;
  gate.hidden = false;
  signinContainer.innerHTML = '';
  if (typeof currentUser !== 'undefined' && currentUser) {
    gateMsg.textContent = `Signed in as ${currentUser.email}, but only the organiser account can manage events.`;
  } else {
    gateMsg.textContent = 'This page is for the Live On Campus organiser. Sign in with the organiser Google account to manage events.';
    if (typeof googleClientId !== 'undefined' && googleClientId && typeof ensureGsiInitialized === 'function') {
      const btn = document.createElement('button');
      btn.className = 'btn-pill';
      btn.type = 'button';
      btn.textContent = '👤 Sign in';
      btn.addEventListener('click', triggerGoogleSignIn);
      signinContainer.appendChild(btn);
    }
  }
}

window.addEventListener('authready', refreshAdminGate);
window.addEventListener('authchanged', refreshAdminGate);
