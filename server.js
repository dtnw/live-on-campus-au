const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const EVENTS_FILE = path.join(__dirname, 'data', 'events.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readEvents() {
  try {
    return JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeEvents(events) {
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
}

const VALID_TAGS = ['freefood', 'networking', 'social', 'club', 'sebe', 'artsed', 'health', 'buslaw'];
const VALID_CAMPUS = ['burwood', 'waurnponds', 'waterfront', 'warrnambool', 'online'];
const VALID_COLORS = ['orange', 'green', 'blue', 'yellow', 'purple'];
const VALID_DURATIONS = [30, 60, 90, 120, 180, 240, 480];
const DEFAULT_ICON = '🎉';

function parseEventStart(ev) {
  const timeStr = (ev.time || '').trim();
  let hours = 0, minutes = 0;
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*([AaPp][Mm])?/);
  if (m) {
    hours = parseInt(m[1], 10);
    minutes = parseInt(m[2], 10);
    const ampm = m[3] ? m[3].toLowerCase() : null;
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
  }
  const d = new Date(ev.date + 'T00:00:00');
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function withComputed(ev) {
  const start = parseEventStart(ev);
  const duration = Number.isFinite(ev.durationMinutes) ? ev.durationMinutes : 120;
  const end = new Date(start.getTime() + duration * 60000);
  const now = new Date();
  return { ...ev, startsAtMs: start.getTime(), endsAtMs: end.getTime(), live: now >= start && now <= end };
}

// GET all events (optionally filtered by ?tag=)
app.get('/api/events', (req, res) => {
  let events = readEvents().map(withComputed);
  const { tag } = req.query;
  if (tag && tag !== 'all') {
    if (tag === 'today') {
      const today = new Date().toDateString();
      events = events.filter(e => new Date(e.date + 'T00:00:00').toDateString() === today);
    } else if (tag === 'live') {
      events = events.filter(e => e.live);
    } else if (VALID_CAMPUS.includes(tag)) {
      events = events.filter(e => e.campus === tag);
    } else {
      events = events.filter(e => e.tags.includes(tag));
    }
  }
  events.sort((a, b) => a.startsAtMs - b.startsAtMs);
  res.json(events);
});

app.get('/api/events/:id', (req, res) => {
  const events = readEvents();
  const event = events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(withComputed(event));
});

// Admin: create event
app.post('/api/events', (req, res) => {
  const { title, description, date, time, location, tags, imageColor, durationMinutes, icon, campus, isFree, signupUrl } = req.body;
  if (!title || !date || !location) {
    return res.status(400).json({ error: 'title, date, and location are required' });
  }
  const cleanTags = Array.isArray(tags) ? tags.filter(t => VALID_TAGS.includes(t)) : [];
  const events = readEvents();
  const newEvent = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: String(title).slice(0, 120),
    description: String(description || '').slice(0, 1000),
    date,
    time: time || '',
    location: String(location).slice(0, 200),
    tags: cleanTags,
    campus: VALID_CAMPUS.includes(campus) ? campus : 'burwood',
    isFree: isFree !== false,
    signupUrl: (typeof signupUrl === 'string' && /^https?:\/\//.test(signupUrl.trim())) ? signupUrl.trim() : '',
    imageColor: VALID_COLORS.includes(imageColor) ? imageColor : 'orange',
    icon: (typeof icon === 'string' && icon.trim()) ? icon.trim().slice(0, 4) : DEFAULT_ICON,
    durationMinutes: VALID_DURATIONS.includes(Number(durationMinutes)) ? Number(durationMinutes) : 120,
    createdAt: new Date().toISOString()
  };
  events.push(newEvent);
  writeEvents(events);
  res.status(201).json(withComputed(newEvent));
});

app.delete('/api/events/:id', (req, res) => {
  let events = readEvents();
  const before = events.length;
  events = events.filter(e => e.id !== req.params.id);
  if (events.length === before) return res.status(404).json({ error: 'Event not found' });
  writeEvents(events);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Live On Campus running at http://localhost:${PORT}`);
});
