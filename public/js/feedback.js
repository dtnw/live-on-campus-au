function ensureFeedbackModal() {
  if (document.getElementById('feedbackModal')) return;

  const overlay = document.createElement('div');
  overlay.className = 'cal-overlay';
  overlay.id = 'feedbackOverlay';
  document.body.appendChild(overlay);

  const modal = document.createElement('div');
  modal.className = 'cal-modal';
  modal.id = 'feedbackModal';
  modal.innerHTML = `
    <h3>💬 Got feedback?</h3>
    <p class="cal-modal-sub">Bugs, ideas, missing features — this app is still very much in progress, and all of it helps.</p>
    <textarea id="feedbackText" class="feedback-textarea" rows="4" placeholder="What's on your mind?"></textarea>
    <button class="cal-option" id="feedbackSubmitBtn" type="button">Send Feedback</button>
    <button class="cal-cancel" id="feedbackCancelBtn" type="button">Cancel</button>
  `;
  document.body.appendChild(modal);

  overlay.addEventListener('click', closeFeedbackModal);
  document.getElementById('feedbackCancelBtn').addEventListener('click', closeFeedbackModal);
  document.getElementById('feedbackSubmitBtn').addEventListener('click', submitFeedback);
}

function openFeedbackModal() {
  ensureFeedbackModal();
  document.getElementById('feedbackOverlay').style.display = 'block';
  document.getElementById('feedbackModal').style.display = 'flex';
  const textEl = document.getElementById('feedbackText');
  textEl.value = '';
  textEl.focus();
}

function closeFeedbackModal() {
  const modal = document.getElementById('feedbackModal');
  const overlay = document.getElementById('feedbackOverlay');
  if (modal) modal.style.display = 'none';
  if (overlay) overlay.style.display = 'none';
}

async function submitFeedback() {
  const textEl = document.getElementById('feedbackText');
  const message = textEl.value.trim();
  if (!message) {
    if (typeof showToast === 'function') showToast('Write something first!');
    return;
  }
  const userEmail = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.email : null;
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, page: window.location.pathname, userEmail })
    });
    if (!res.ok) throw new Error('failed');
    closeFeedbackModal();
    if (typeof showToast === 'function') showToast("Thanks for the feedback! 🙏");
  } catch {
    if (typeof showToast === 'function') showToast('Could not send feedback, try again.');
  }
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('#feedbackBtn');
  if (!btn) return;
  e.preventDefault();
  openFeedbackModal();
});

async function renderFooterMeta() {
  const visitsEl = document.getElementById('visitCount');
  if (!visitsEl) return;
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    if (typeof cfg.visitCount === 'number') {
      visitsEl.textContent = `👋 ${cfg.visitCount.toLocaleString()} visit${cfg.visitCount === 1 ? '' : 's'}`;
    }
  } catch {}
}

document.addEventListener('DOMContentLoaded', renderFooterMeta);
