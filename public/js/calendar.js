function formatIcsDate(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeIcs(str) {
  return String(str || '').replace(/[\n,;]/g, ' ');
}

function buildGoogleCalendarUrl(ev) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${formatIcsDate(ev.startsAtMs)}/${formatIcsDate(ev.endsAtMs)}`,
    details: ev.description || '',
    location: ev.location || ''
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildIcsBlob(ev) {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Live On Campus//EN',
    'BEGIN:VEVENT',
    `UID:${ev.id}@liveoncampus`,
    `DTSTAMP:${formatIcsDate(Date.now())}`,
    `DTSTART:${formatIcsDate(ev.startsAtMs)}`,
    `DTEND:${formatIcsDate(ev.endsAtMs)}`,
    `SUMMARY:${escapeIcs(ev.title)}`,
    `DESCRIPTION:${escapeIcs(ev.description)}`,
    `LOCATION:${escapeIcs(ev.location)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  return new Blob([ics], { type: 'text/calendar' });
}

function downloadIcs(ev) {
  const blob = buildIcsBlob(ev);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ev.title.replace(/[^a-z0-9]+/gi, '-')}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function closeCalendarModal() {
  const modal = document.getElementById('calModal');
  if (modal) modal.style.display = 'none';
  const overlay = document.getElementById('calOverlay');
  if (overlay) overlay.style.display = 'none';
}

function openCalendarModal(ev) {
  let modal = document.getElementById('calModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'calModal';
    modal.className = 'cal-modal';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <h3>📅 Add to your calendar</h3>
    <p class="cal-modal-sub">${escapeHtml(ev.title)}</p>
    <a class="cal-option" href="${buildGoogleCalendarUrl(ev)}" target="_blank" rel="noopener">🗓️ Google Calendar</a>
    <button class="cal-option" id="calIcsBtn" type="button">🍏 Apple / Outlook (.ics file)</button>
    <button class="cal-cancel" id="calCancelBtn" type="button">Cancel</button>
  `;
  modal.style.display = 'flex';
  const overlay = document.getElementById('calOverlay');
  if (overlay) overlay.style.display = 'block';
  document.getElementById('calIcsBtn').addEventListener('click', () => {
    downloadIcs(ev);
    closeCalendarModal();
  });
  document.getElementById('calCancelBtn').addEventListener('click', closeCalendarModal);
}

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('calOverlay');
  if (overlay) overlay.addEventListener('click', closeCalendarModal);
});
