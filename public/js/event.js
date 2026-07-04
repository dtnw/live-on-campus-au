const TAG_LABELS = {
  freefood: '🍕 Free Food',
  networking: '🤝 Networking',
  social: '🎉 Social',
  club: '🎭 Club',
  sebe: '🔬 SEBE',
  artsed: '🎨 Arts & Ed',
  health: '🩺 Health',
  buslaw: '⚖️ Bus & Law'
};

const CAMPUS_LABELS = {
  burwood: '🏫 Burwood',
  waurnponds: '🏫 Waurn Ponds',
  waterfront: '🏫 Waterfront',
  warrnambool: '🏫 Warrnambool',
  online: '💻 Online'
};

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

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function getEventId() {
  return new URLSearchParams(window.location.search).get('id');
}

async function loadEvent() {
  const id = getEventId();
  const container = document.getElementById('detailContent');
  if (!id) {
    container.innerHTML = '<div class="empty-state">No event specified.</div>';
    return;
  }
  try {
    const res = await fetch(`/api/events/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('not found');
    const ev = await res.json();
    render(ev);
  } catch {
    container.innerHTML = '<div class="empty-state">Event not found. It may have been removed.</div>';
  }
}

function render(ev) {
  const container = document.getElementById('detailContent');
  const campusLabel = CAMPUS_LABELS[ev.campus] || '';
  container.innerHTML = `
    <div class="detail-card ${ev.live ? 'live' : ''}">
      <div class="detail-banner ${ev.imageColor}">${ev.icon || '🎉'}</div>
      <div class="detail-body">
        ${ev.live ? '<span class="live-badge" style="margin-bottom:14px;"><span class="live-dot"></span>Live Now</span>' : ''}
        <h1>${escapeHtml(ev.title)}</h1>
        <div class="detail-meta">
          <span>📅 <strong>${formatDate(ev.date)}</strong>${ev.time ? ' · ' + escapeHtml(ev.time) : ''}</span>
          <span>📍 <strong>${escapeHtml(ev.location)}</strong></span>
        </div>
        <div class="tag-pills">
          ${ev.tags.map(t => `<span class="tag-pill ${t}">${TAG_LABELS[t] ? TAG_LABELS[t].replace(/^\S+\s/, '') : t}</span>`).join('')}
          ${campusLabel ? `<span class="tag-pill campus-pill">${campusLabel.toUpperCase()}</span>` : ''}
          ${ev.isFree ? '<span class="tag-pill cost-free">🆓 FREE</span>' : '<span class="tag-pill cost-paid">💵 PAID</span>'}
        </div>
        <p class="detail-desc">${escapeHtml(ev.description || 'No description provided.')}</p>
        <div class="rsvp-row">
          ${ev.signupUrl
            ? `<a class="btn-pill" href="${escapeHtml(ev.signupUrl)}" target="_blank" rel="noopener">Learn More</a>`
            : `<span class="btn-pill" style="opacity:.5; cursor:not-allowed;">No signup link yet</span>`}
          <button class="btn-pill outline" id="calBtn">📅 Add to Calendar</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('calBtn').addEventListener('click', () => openCalendarModal(ev));
}

loadEvent();
