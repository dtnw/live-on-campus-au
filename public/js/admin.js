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
  const location = document.getElementById('location').value.trim();
  const durationMinutes = document.getElementById('duration').value;
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
      body: JSON.stringify({ title, description, date, time, location, tags, imageColor: selectedColor, durationMinutes, icon: selectedIcon, campus, signupUrl, isFree })
    });
    if (!res.ok) throw new Error('failed');
    showToast('Event posted! Students will see it on the feed.');
    e.target.reset();
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    document.querySelector('.color-swatch.orange').classList.add('selected');
    selectedColor = 'orange';
    document.querySelectorAll('.icon-swatch').forEach(s => s.classList.remove('selected'));
    document.querySelector('.icon-swatch[data-icon="🎉"]').classList.add('selected');
    selectedIcon = '🎉';
    loadAdminList();
  } catch {
    showToast('Could not post event. Try again.');
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
  await fetch(`/api/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
  showToast('Event removed.');
  loadAdminList();
});

loadAdminList();
