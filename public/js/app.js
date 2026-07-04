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
  online: { emoji: '💻', label: 'ONLINE' }
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
  div.textContent = str;
  return div.innerHTML;
}

function formatDateHeading(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
}

function tagPills(ev) {
  const pills = ev.tags.map(t => `<span class="tag-pill ${t}">${TAG_SHORT[t] || t}</span>`).join('');
  const campus = CAMPUS_META[ev.campus];
  const campusPill = campus ? `<span class="tag-pill campus-pill">${campus.emoji} ${campus.label}</span>` : '';
  const costPill = ev.isFree ? '<span class="tag-pill cost-free">🆓 FREE</span>' : '<span class="tag-pill cost-paid">💵 PAID</span>';
  return pills + campusPill + costPill;
}

function eventRow(ev) {
  return `
    <a class="event-row" href="event.html?id=${encodeURIComponent(ev.id)}">
      <span class="avatar ${ev.imageColor}">${ev.icon || '🎉'}</span>
      <div class="row-main">
        <span class="row-title">${escapeHtml(ev.title)}</span>
        <span class="row-meta">${ev.time ? escapeHtml(ev.time) + ' · ' : ''}${escapeHtml(ev.location)}</span>
        <div class="row-tags">${tagPills(ev)}</div>
      </div>
      <div class="row-right">
        <button class="cal-btn" data-cal-id="${ev.id}" title="Add to calendar">📅</button>
      </div>
    </a>
  `;
}

function liveCard(ev) {
  return `
    <a class="live-card" href="event.html?id=${encodeURIComponent(ev.id)}">
      <span class="live-corner-dot"></span>
      <span class="avatar ${ev.imageColor}">${ev.icon || '🎉'}</span>
      <div class="row-main">
        <span class="row-title">${escapeHtml(ev.title)}</span>
        <span class="row-meta">${ev.time ? escapeHtml(ev.time) + ' · ' : ''}${escapeHtml(ev.location)}</span>
        <div class="row-tags">${tagPills(ev)}</div>
      </div>
      <div class="row-right">
        <button class="cal-btn" data-cal-id="${ev.id}" title="Add to calendar">📅</button>
      </div>
    </a>
  `;
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
}

function updateEventCount(filtered, total) {
  document.getElementById('eventCount').textContent = `${filtered} of ${total}`;
}

function updateFilterBadge() {
  const badge = document.getElementById('filterBadge');
  const n = selectedTags.size + selectedCampus.size + selectedCost.size;
  badge.textContent = n;
  badge.hidden = n === 0;
}

function refresh() {
  const filtered = applyFilters(allEvents);
  renderGrouped(filtered);
  updateEventCount(filtered.length, allEvents.length);
  updateFilterBadge();
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

document.getElementById('filtersToggleBtn').addEventListener('click', () => {
  const groups = document.getElementById('filterGroups');
  groups.hidden = !groups.hidden;
  document.getElementById('filtersToggleLabel').textContent = groups.hidden ? '▾ Filters' : '▴ Filters';
});

document.getElementById('filters').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip || chip.id === 'filtersToggleBtn') return;
  const group = chip.dataset.group;
  const tag = chip.dataset.tag;

  if (tag === 'all') {
    selectedTags.clear();
    selectedCampus.clear();
    selectedCost.clear();
    todayActive = false;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  } else {
    document.querySelector('.chip[data-tag="all"]').classList.remove('active');
    if (group === 'special') {
      todayActive = !todayActive;
      chip.classList.toggle('active', todayActive);
    } else {
      const set = group === 'campus' ? selectedCampus : group === 'cost' ? selectedCost : selectedTags;
      if (set.has(tag)) {
        set.delete(tag);
        chip.classList.remove('active');
      } else {
        set.add(tag);
        chip.classList.add('active');
      }
    }
    if (!todayActive && !selectedTags.size && !selectedCampus.size && !selectedCost.size) {
      document.querySelector('.chip[data-tag="all"]').classList.add('active');
    }
  }
  refresh();
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.cal-btn');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const ev = allEvents.find(x => x.id === btn.dataset.calId);
  if (ev) openCalendarModal(ev);
});

loadEvents();
