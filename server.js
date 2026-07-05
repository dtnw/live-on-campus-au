const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const cookieParser = require('cookie-parser');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GOOGLE_CONFIG_FILE = path.join(DATA_DIR, 'google-config.json');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');
const SEED_EVENTS_FILE = path.join(__dirname, 'seed-events.json');

// On a fresh deploy the persistent volume mounted at data/ starts empty, which
// shadows the committed events.json. Seed it once from seed-events.json (which
// lives in the image, outside the volume) so the feed isn't blank on first boot.
function bootstrapDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
  if (!fs.existsSync(EVENTS_FILE) && fs.existsSync(SEED_EVENTS_FILE)) {
    try {
      fs.copyFileSync(SEED_EVENTS_FILE, EVENTS_FILE);
      console.log('Seeded data/events.json from seed-events.json (first boot)');
    } catch (err) {
      console.error('Failed to seed events.json:', err.message);
    }
  }
}
bootstrapDataDir();

const APP_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version;
let APP_COMMIT = 'dev';
try {
  APP_COMMIT = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim();
} catch {
  APP_COMMIT = 'dev';
}
const SERVER_STARTED_AT = new Date().toISOString();

// google-config.json is gitignored (it's per-environment, not committed), so it
// won't exist on a fresh deploy. Prefer an env var there (Railway/Heroku/etc. style)
// and fall back to the local file for local dev.
let GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
if (!GOOGLE_CLIENT_ID) {
  try {
    GOOGLE_CLIENT_ID = JSON.parse(fs.readFileSync(GOOGLE_CONFIG_FILE, 'utf8')).clientId || '';
  } catch {
    GOOGLE_CLIENT_ID = '';
  }
}
const oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// sessionToken -> googleUserId. In-memory only; clears on server restart (fine for this demo app).
const sessions = new Map();

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// Atomic write: serialize to a temp file, then rename over the target. rename()
// is atomic on the same filesystem, so a crash mid-write can never leave a
// truncated/corrupt JSON file — readers see either the old file or the new one.
function writeJson(file, data) {
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function readEvents() { return readJson(EVENTS_FILE, []); }
function writeEvents(events) { writeJson(EVENTS_FILE, events); }
function readUsers() { return readJson(USERS_FILE, []); }
function writeUsers(users) { writeJson(USERS_FILE, users); }
function readFeedback() { return readJson(FEEDBACK_FILE, []); }
function writeFeedback(list) { writeJson(FEEDBACK_FILE, list); }

function getCurrentUser(req) {
  const token = req.cookies && req.cookies.session;
  if (!token || !sessions.has(token)) return null;
  const userId = sessions.get(token);
  return readUsers().find(u => u.id === userId) || null;
}

const VALID_TAGS = ['freefood', 'networking', 'social', 'club', 'sebe', 'artsed', 'health', 'buslaw'];
const VALID_CAMPUS = ['burwood', 'waurnponds', 'waterfront', 'warrnambool', 'online'];
const VALID_COLORS = ['orange', 'green', 'blue', 'yellow', 'purple'];
const VALID_COST = ['free', 'paid'];
const DEFAULT_ICON = '🎉';
const DEFAULT_FILTERS = { tags: [], campus: [], cost: [], today: false };

function sanitizeFilters(f) {
  if (!f || typeof f !== 'object') return { ...DEFAULT_FILTERS };
  return {
    tags: Array.isArray(f.tags) ? f.tags.filter(t => VALID_TAGS.includes(t)) : [],
    campus: Array.isArray(f.campus) ? f.campus.filter(c => VALID_CAMPUS.includes(c)) : [],
    cost: Array.isArray(f.cost) ? f.cost.filter(c => VALID_COST.includes(c)) : [],
    today: f.today === true
  };
}

function sanitizeDuration(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 120;
  return Math.min(Math.round(n), 1440);
}

function formatClock(d) {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

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
  if (ev.alwaysLive) {
    const now = new Date();
    const durationMs = (Number.isFinite(ev.durationMinutes) ? ev.durationMinutes : 120) * 60000;
    const start = new Date(now.getTime() - 10 * 60000);
    const end = new Date(start.getTime() + durationMs);
    return {
      ...ev,
      date: now.toISOString().slice(0, 10),
      time: formatClock(now),
      startsAtMs: start.getTime(),
      endsAtMs: end.getTime(),
      live: true
    };
  }
  const start = parseEventStart(ev);
  const duration = Number.isFinite(ev.durationMinutes) ? ev.durationMinutes : 120;
  const end = new Date(start.getTime() + duration * 60000);
  const now = new Date();
  return { ...ev, startsAtMs: start.getTime(), endsAtMs: end.getTime(), live: now >= start && now <= end };
}

// ---------- Config ----------
app.get('/api/config', (req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID, version: APP_VERSION, commit: APP_COMMIT, startedAt: SERVER_STARTED_AT });
});

// ---------- Auth ----------
app.post('/api/auth/google', async (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'Google sign-in is not configured on this server.' });
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Missing credential' });
  try {
    const ticket = await oauthClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const users = readUsers();
    let user = users.find(u => u.id === payload.sub);
    if (!user) {
      user = { id: payload.sub, name: payload.name || '', email: payload.email || '', picture: payload.picture || '', interestedEventIds: [], savedFilters: { ...DEFAULT_FILTERS } };
      users.push(user);
    } else {
      user.name = payload.name || user.name;
      user.email = payload.email || user.email;
      user.picture = payload.picture || user.picture;
      if (!user.savedFilters) user.savedFilters = { ...DEFAULT_FILTERS };
    }
    writeUsers(users);

    const token = crypto.randomUUID();
    sessions.set(token, user.id);
    res.cookie('session', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ id: user.id, name: user.name, email: user.email, picture: user.picture, interestedEventIds: user.interestedEventIds, savedFilters: user.savedFilters });
  } catch (err) {
    res.status(401).json({ error: 'Invalid Google credential' });
  }
});

app.get('/api/auth/me', (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ id: user.id, name: user.name, email: user.email, picture: user.picture, interestedEventIds: user.interestedEventIds, savedFilters: user.savedFilters || { ...DEFAULT_FILTERS } });
});

app.post('/api/users/me/filters', (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  const users = readUsers();
  const dbUser = users.find(u => u.id === user.id);
  dbUser.savedFilters = sanitizeFilters(req.body);
  writeUsers(users);
  res.json({ savedFilters: dbUser.savedFilters });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies && req.cookies.session;
  if (token) sessions.delete(token);
  res.clearCookie('session');
  res.json({ ok: true });
});

// ---------- Events ----------
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
  const { title, description, date, time, location, tags, imageColor, durationMinutes, icon, campus, isFree, signupUrl, hostedBy } = req.body;
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
    hostedBy: String(hostedBy || '').slice(0, 120),
    tags: cleanTags,
    campus: VALID_CAMPUS.includes(campus) ? campus : 'burwood',
    isFree: isFree !== false,
    signupUrl: (typeof signupUrl === 'string' && /^https?:\/\//.test(signupUrl.trim())) ? signupUrl.trim() : '',
    imageColor: VALID_COLORS.includes(imageColor) ? imageColor : 'orange',
    icon: (typeof icon === 'string' && icon.trim()) ? icon.trim().slice(0, 4) : DEFAULT_ICON,
    durationMinutes: sanitizeDuration(durationMinutes),
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

// ---------- Interested (per signed-in user) ----------
app.post('/api/events/:id/interested', (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in to save interested events' });
  const events = readEvents();
  const event = events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const users = readUsers();
  const dbUser = users.find(u => u.id === user.id);
  const idx = dbUser.interestedEventIds.indexOf(event.id);
  let interested;
  if (idx === -1) {
    dbUser.interestedEventIds.push(event.id);
    interested = true;
  } else {
    dbUser.interestedEventIds.splice(idx, 1);
    interested = false;
  }
  writeUsers(users);
  res.json({ interested, interestedEventIds: dbUser.interestedEventIds });
});

app.get('/api/users/me/interested-events', (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  const events = readEvents().map(withComputed).filter(e => user.interestedEventIds.includes(e.id));
  events.sort((a, b) => a.startsAtMs - b.startsAtMs);
  res.json(events);
});

// ---------- Feedback ----------
app.post('/api/feedback', (req, res) => {
  const { message, page, userEmail } = req.body;
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'Feedback message is required' });
  }
  const feedback = readFeedback();
  feedback.push({
    id: crypto.randomUUID(),
    message: String(message).trim().slice(0, 2000),
    page: typeof page === 'string' ? page.slice(0, 200) : '',
    userEmail: typeof userEmail === 'string' && userEmail ? userEmail.slice(0, 200) : null,
    createdAt: new Date().toISOString()
  });
  writeFeedback(feedback);
  res.status(201).json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Live On Campus running at http://localhost:${PORT}`);
  if (!GOOGLE_CLIENT_ID) {
    console.log('Google sign-in is not configured yet — add your OAuth Client ID to data/google-config.json');
  }
});
