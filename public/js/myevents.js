const TAG_SHORT = {
  freefood: 'FREE FOOD',
  networking: 'NETWORKING',
  social: 'SOCIAL',
  club: 'CLUB',
  sebe: 'SEBE',
  artsed: 'ARTS & ED',
  health: 'HEALTH',
  buslaw: 'BUS & LAW'
};

const CAMPUS_META = {
  burwood: { emoji: '🏫', label: 'BURWOOD' },
  waurnponds: { emoji: '🏫', label: 'WAURN PONDS' },
  waterfront: { emoji: '🏫', label: 'WATERFRONT' },
  warrnambool: { emoji: '🏫', label: 'WARRNAMBOOL' },
  online: { emoji: '💻', label: 'ONLINE' },
  alllocations: { emoji: '📍', label: 'ALL LOCATIONS' }
};

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

function tagPills(ev) {
  const pills = (ev.tags || []).map(t => `<span class="tag-pill ${t}">${TAG_SHORT[t] || t}</span>`).join('');
  const campus = CAMPUS_META[ev.campus];
  const campusPill = campus ? `<span class="tag-pill campus-pill">${campus.emoji} ${campus.label}</span>` : '';
  const costPill = ev.isFree ? '<span class="tag-pill cost-free">🆓 FREE</span>' : '<span class="tag-pill cost-paid">💵 PAID</span>';
  return pills + campusPill + costPill;
}

function timeRange(ev) {
  if (!ev.time) return '';
  return ev.endTime ? `${ev.time} – ${ev.endTime}` : ev.time;
}

function eventRow(ev) {
  return `
    <div class="event-row">
      <a href="event.html?id=${encodeURIComponent(ev.id)}" style="display:flex; align-items:center; gap:14px; flex:1; min-width:0;">
        <span class="avatar ${ev.imageColor}">${ev.icon || '🎉'}</span>
        <div class="row-main">
          <span class="row-title">${ev.live ? '<span class="row-live-badge">LIVE</span> ' : ''}${escapeHtml(ev.title)}</span>
          <span class="row-meta">${timeRange(ev) ? escapeHtml(timeRange(ev)) + ' · ' : ''}${escapeHtml(ev.location)}</span>
          <div class="row-tags">${tagPills(ev)}</div>
        </div>
      </a>
      <div class="row-right">
        <button class="cal-btn" data-cal-id="${ev.id}" title="Add to calendar">📅</button>
        <button class="cal-btn" data-remove-id="${ev.id}" title="Remove from interests">✕</button>
      </div>
    </div>
  `;
}

async function loadMyEvents() {
  const list = document.getElementById('myEventsList');

  if (!currentUser) {
    list.innerHTML = `
      <div class="empty-state">
        <p>Sign in with Google to see events you've marked as interested.</p>
        <div style="display:flex; justify-content:center; margin-top:14px;">
          <button class="btn-pill" id="signinPromptBtn" type="button">👤 Sign in</button>
        </div>
      </div>
    `;
    if (googleClientId) {
      document.getElementById('signinPromptBtn').addEventListener('click', triggerGoogleSignIn);
      ensureGsiInitialized(() => {});
    }
    return;
  }

  list.innerHTML = '<div class="empty-state">Loading&hellip;</div>';
  try {
    const res = await fetch('/api/users/me/interested-events');
    if (!res.ok) throw new Error('failed');
    const events = await res.json();
    if (!events.length) {
      list.innerHTML = '<div class="empty-state">No interested events yet. Tap "☆ Interested" on any event to save it here.</div>';
      return;
    }
    list.innerHTML = events.map(eventRow).join('');
  } catch {
    list.innerHTML = '<div class="empty-state">Could not load your interested events.</div>';
  }
}

document.getElementById('myEventsList').addEventListener('click', async (e) => {
  const removeBtn = e.target.closest('[data-remove-id]');
  if (removeBtn) {
    e.preventDefault();
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(removeBtn.dataset.removeId)}/interested`, { method: 'POST' });
      const data = await res.json();
      currentUser.interestedEventIds = data.interestedEventIds;
      showToast('Removed from your interested events.');
      loadMyEvents();
    } catch {
      showToast('Something went wrong, try again.');
    }
    return;
  }
  const calBtn = e.target.closest('.cal-btn[data-cal-id]');
  if (calBtn) {
    e.preventDefault();
    const res = await fetch(`/api/events/${encodeURIComponent(calBtn.dataset.calId)}`);
    if (res.ok) openCalendarModal(await res.json());
  }
});

window.addEventListener('authready', loadMyEvents);
window.addEventListener('authchanged', loadMyEvents);
