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

const selectedTags = new Set();
const selectedCampus = new Set();
const selectedCost = new Set();
let todayActive = false;
let allEvents = [];

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

function formatDateHeading(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
}

function tagPills(ev) {
  const pills = (ev.tags || []).map(t => `<span class="tag-pill ${t}">${TAG_SHORT[t] || t}</span>`);
  const campus = CAMPUS_META[ev.campus];
  if (campus) pills.push(`<span class="tag-pill campus-pill">${campus.emoji} ${campus.label}</span>`);
  pills.push(ev.isFree ? '<span class="tag-pill cost-free">🆓 FREE</span>' : '<span class="tag-pill cost-paid">💵 PAID</span>');
  return pills.slice(0, 5).join('');
}

function interestBtn(ev) {
  const on = typeof isInterested === 'function' && isInterested(ev.id);
  return `<button class="interest-btn ${on ? 'interested-active' : ''}" data-interest-id="${ev.id}" title="Mark interested">${on ? '★' : '☆'}</button>`;
}

function timeRange(ev) {
  if (!ev.time) return '';
  return ev.endTime ? `${ev.time} – ${ev.endTime}` : ev.time;
}

function eventRow(ev) {
  return `
    <a class="event-row" href="event.html?id=${encodeURIComponent(ev.id)}">
      <span class="avatar ${ev.imageColor}">${ev.icon || '🎉'}</span>
      <div class="row-main">
        <span class="row-title">${escapeHtml(ev.title)}</span>
        <span class="row-meta">${timeRange(ev) ? escapeHtml(timeRange(ev)) + ' · ' : ''}${escapeHtml(ev.location)}</span>
        <div class="row-tags">${tagPills(ev)}</div>
      </div>
      <div class="row-right">
        ${interestBtn(ev)}
        <button class="cal-btn" data-cal-id="${ev.id}" title="Add to calendar">📅</button>
      </div>
    </a>
  `;
}

function liveCard(ev) {
  return `
    <a class="live-card" href="event.html?id=${encodeURIComponent(ev.id)}">
      <span class="avatar ${ev.imageColor}">${ev.icon || '🎉'}</span>
      <div class="row-main">
        <span class="row-title">${escapeHtml(ev.title)}</span>
        <span class="row-meta">${timeRange(ev) ? escapeHtml(timeRange(ev)) + ' · ' : ''}${escapeHtml(ev.location)}</span>
        <div class="row-tags">${tagPills(ev)}</div>
      </div>
      <div class="row-right">
        ${interestBtn(ev)}
        <button class="cal-btn" data-cal-id="${ev.id}" title="Add to calendar">📅</button>
      </div>
    </a>
  `;
}

function clipRowTags() {
  document.querySelectorAll('.row-tags').forEach(container => {
    const pills = Array.from(container.querySelectorAll('.tag-pill'));
    pills.forEach(p => { p.style.display = ''; });
    const containerRect = container.getBoundingClientRect();
    pills.forEach(p => {
      if (p.getBoundingClientRect().right > containerRect.right + 1) {
        p.style.display = 'none';
      }
    });
  });
}

let clipResizeTimer = null;
function scheduleClipRowTags() {
  clearTimeout(clipResizeTimer);
  clipResizeTimer = setTimeout(clipRowTags, 100);
}
window.addEventListener('resize', scheduleClipRowTags);
if (window.ResizeObserver) {
  new ResizeObserver(scheduleClipRowTags).observe(document.body);
}

function renderLive(events) {
  const liveEvents = events.filter(e => e.live);
  const section = document.getElementById('liveSection');
  const grid = document.getElementById('liveGrid');
  const count = document.getElementById('liveCount');
  if (!liveEvents.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  count.textContent = `${liveEvents.length} live`;
  grid.innerHTML = liveEvents.map(liveCard).join('');
  clipRowTags();
}

function applyFilters(events) {
  return events.filter(ev => {
    if (todayActive && new Date(ev.date + 'T00:00:00').toDateString() !== new Date().toDateString()) return false;
    if (selectedTags.size && !Array.from(selectedTags).some(t => ev.tags.includes(t))) return false;
    if (selectedCampus.size && !selectedCampus.has(ev.campus)) return false;
    if (selectedCost.size) {
      const ok = (selectedCost.has('free') && ev.isFree) || (selectedCost.has('paid') && !ev.isFree);
      if (!ok) return false;
    }
    return true;
  });
}

function renderGrouped(events) {
  const list = document.getElementById('eventsList');
  // Live events get their own section above; don't repeat them here.
  const nonLive = events.filter(ev => !ev.live);
  if (!nonLive.length) {
    list.innerHTML = '<div class="empty-state">No upcoming events match this filter yet. Check back soon!</div>';
    return;
  }
  const groups = new Map();
  nonLive.forEach(ev => {
    if (!groups.has(ev.date)) groups.set(ev.date, []);
    groups.get(ev.date).push(ev);
  });
  const dates = Array.from(groups.keys()).sort();
  list.innerHTML = dates.map(date => {
    const evs = groups.get(date);
    return `
      <div class="date-group">
        <div class="date-heading">${formatDateHeading(date)} <span class="count">&middot; ${evs.length} event${evs.length === 1 ? '' : 's'}</span></div>
        ${evs.map(eventRow).join('')}
      </div>
    `;
  }).join('');
  clipRowTags();
}

function updateEventCount(filtered, total) {
  document.getElementById('eventCount').textContent = `${filtered} of ${total}`;
}

const CATEGORY_TAGS = ['freefood', 'networking', 'social', 'club'];
const FACULTY_TAGS = ['sebe', 'artsed', 'health', 'buslaw'];

function setBadge(id, n) {
  const badge = document.getElementById(id);
  badge.textContent = n;
  badge.hidden = n === 0;
}

function updateFilterBadges() {
  setBadge('badgeCategory', CATEGORY_TAGS.filter(t => selectedTags.has(t)).length);
  setBadge('badgeFaculty', FACULTY_TAGS.filter(t => selectedTags.has(t)).length);
  setBadge('badgeCampus', selectedCampus.size);
  setBadge('badgeCost', selectedCost.size);
}

function refresh() {
  const filtered = applyFilters(allEvents);
  renderGrouped(filtered);
  updateEventCount(filtered.length, allEvents.length);
  updateFilterBadges();
}

async function loadEvents() {
  const list = document.getElementById('eventsList');
  list.innerHTML = '<div class="empty-state">Loading events&hellip;</div>';
  try {
    const res = await fetch('/api/events');
    allEvents = await res.json();
    renderLive(allEvents);
    refresh();
  } catch (err) {
    list.innerHTML = '<div class="empty-state">Could not load events. Is the server running?</div>';
  }
}

function closeAllDropdowns(except) {
  document.querySelectorAll('.dropdown-panel').forEach(p => {
    if (p !== except) p.hidden = true;
  });
}

function updateAllEventsActive() {
  const allChip = document.querySelector('.chip[data-tag="all"]');
  const nothingSelected = !todayActive && !selectedTags.size && !selectedCampus.size && !selectedCost.size;
  allChip.classList.toggle('active', nothingSelected);
}

let saveFiltersTimer = null;
function scheduleSaveFilters() {
  if (!currentUser) return;
  clearTimeout(saveFiltersTimer);
  saveFiltersTimer = setTimeout(() => {
    fetch('/api/users/me/filters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tags: Array.from(selectedTags),
        campus: Array.from(selectedCampus),
        cost: Array.from(selectedCost),
        today: todayActive
      })
    }).catch(() => {});
  }, 400);
}

function applySavedFilters(filters) {
  selectedTags.clear();
  (filters.tags || []).forEach(t => selectedTags.add(t));
  selectedCampus.clear();
  (filters.campus || []).forEach(c => selectedCampus.add(c));
  selectedCost.clear();
  (filters.cost || []).forEach(c => selectedCost.add(c));
  todayActive = !!filters.today;

  document.querySelectorAll('.dropdown-panel input[type="checkbox"]').forEach(cb => {
    const group = cb.dataset.group;
    const set = group === 'campus' ? selectedCampus : group === 'cost' ? selectedCost : selectedTags;
    cb.checked = set.has(cb.value);
  });
  document.querySelector('.chip[data-tag="today"]').classList.toggle('active', todayActive);
  updateAllEventsActive();
}

document.getElementById('filterChips').addEventListener('click', (e) => {
  const dropdownBtn = e.target.closest('.dropdown-btn');
  if (dropdownBtn) {
    e.stopPropagation();
    const panel = document.getElementById('panel' + dropdownBtn.dataset.dropdown);
    const wasOpen = !panel.hidden;
    closeAllDropdowns();
    panel.hidden = wasOpen;
    return;
  }

  const chip = e.target.closest('.chip');
  if (!chip) return;
  const group = chip.dataset.group;
  const tag = chip.dataset.tag;

  if (tag === 'all') {
    selectedTags.clear();
    selectedCampus.clear();
    selectedCost.clear();
    todayActive = false;
    document.querySelectorAll('.dropdown-panel input[type="checkbox"]').forEach(cb => { cb.checked = false; });
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  } else if (group === 'special') {
    todayActive = !todayActive;
    chip.classList.toggle('active', todayActive);
    updateAllEventsActive();
  }
  refresh();
  scheduleSaveFilters();
});

document.getElementById('filterChips').addEventListener('change', (e) => {
  const input = e.target.closest('.dropdown-panel input[type="checkbox"]');
  if (!input) return;
  const group = input.dataset.group;
  const set = group === 'campus' ? selectedCampus : group === 'cost' ? selectedCost : selectedTags;
  if (input.checked) set.add(input.value);
  else set.delete(input.value);
  updateAllEventsActive();
  refresh();
  scheduleSaveFilters();
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.filter-dropdown')) closeAllDropdowns();
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.cal-btn');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const ev = allEvents.find(x => x.id === btn.dataset.calId);
  if (ev) openCalendarModal(ev);
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.interest-btn');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  if (!currentUser) {
    showToast('Sign in with Google to save interested events to your profile.');
    return;
  }
  try {
    const res = await fetch(`/api/events/${encodeURIComponent(btn.dataset.interestId)}/interested`, { method: 'POST' });
    const data = await res.json();
    currentUser.interestedEventIds = data.interestedEventIds;
    btn.textContent = data.interested ? '★' : '☆';
    btn.classList.toggle('interested-active', data.interested);
  } catch {
    showToast('Something went wrong, try again.');
  }
});

function onAuthUpdate() {
  if (currentUser && currentUser.savedFilters) {
    applySavedFilters(currentUser.savedFilters);
  } else if (!currentUser) {
    applySavedFilters({ tags: [], campus: [], cost: [], today: false });
  }
  renderLive(allEvents);
  refresh();
}
window.addEventListener('authready', onAuthUpdate);
window.addEventListener('authchanged', onAuthUpdate);

loadEvents();
