(function () {
  'use strict';

  let activeCard = null;

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function removeCard() {
    if (activeCard) {
      activeCard.remove();
      activeCard = null;
    }
  }

  function buildCard(word, pos, definition) {
    const card = document.createElement('div');
    card.className = 'nw-card';
    card.innerHTML = `
      <div class="nw-header">
        <span class="nw-brand">NeoWord</span>
        <button class="nw-close" aria-label="Close">&#215;</button>
      </div>
      <div class="nw-body">
        <div class="nw-word-row">
          <span class="nw-word">${esc(word)}</span>
          <span class="nw-pos">${esc(pos)}</span>
        </div>
        <p class="nw-def">${esc(definition)}</p>
      </div>
      <div class="nw-footer">
        <button class="nw-save-btn">Notebook</button>
        <span class="nw-saved-msg"></span>
      </div>
      <span class="nw-arrow" aria-hidden="true"></span>
    `;

    card.querySelector('.nw-close').addEventListener('click', removeCard);

    return card;
  }

  // Position the card above the range (falls back to below if no room).
  // Re-reads the range rect here so async scroll during API call doesn't drift the position.
  function placeCard(card, range) {
    const ARROW_H = 9;  // matches border-top/bottom height in CSS
    const GAP = 4;      // gap between arrow tip and selection edge
    const EDGE = 8;     // minimum distance from viewport edges

    // Append off-screen and hidden so it can't flash in the wrong spot.
    card.style.visibility = 'hidden';
    card.style.position = 'fixed';
    card.style.left = '-9999px';
    card.style.top = '-9999px';
    document.body.appendChild(card);

    // Measure and position on the next frame. A freshly-appended element is not
    // guaranteed to be laid out yet, so reading offsetWidth/offsetHeight here can
    // return 0 — which would pin the card's top-left corner to the word instead of
    // centering it above. Waiting one frame guarantees real dimensions.
    requestAnimationFrame(() => {
      // Card may have been removed (e.g. user clicked away) before this fires.
      if (!card.isConnected) return;

      const cw = card.offsetWidth;
      const ch = card.offsetHeight;

      // Re-read here (not at mouseup) so scroll during API call is accounted for
      const selRect = range.getBoundingClientRect();

      // Center card horizontally over selection, clamped to viewport
      let left = selRect.left + selRect.width / 2 - cw / 2;
      left = Math.max(EDGE, Math.min(left, window.innerWidth - cw - EDGE));

      // Arrow tip position relative to card left edge
      const arrowIdeal = selRect.left + selRect.width / 2 - left;
      const arrowLeft = Math.max(20, Math.min(arrowIdeal, cw - 20));
      card.querySelector('.nw-arrow').style.left = arrowLeft + 'px';

      // Place the card directly above the selection
      let top = selRect.top - ch - ARROW_H - GAP;

      if (top < EDGE) {
        // Not enough room above — place below instead
        top = selRect.bottom + ARROW_H + GAP;
        card.classList.add('nw-below');
      }

      card.style.left = left + 'px';
      card.style.top = top + 'px';
      card.style.visibility = '';
    });
  }

  function saveWord(word, pos, definition, example) {
    chrome.storage.local.get({ notebook: [] }, ({ notebook }) => {
      const existing = notebook.find(e => e.word === word);
      if (existing) {
        existing.seenCount = (existing.seenCount || 1) + 1;
      } else {
        notebook.push({
          word, pos, definition, example: example || '',
          savedAt: Date.now(),
          status: 'learning',
          seenCount: 1,
          source: 'dictionaryapi.dev'
        });
      }
      chrome.storage.local.set({ notebook });
    });
  }

  async function lookupAndShow(word, range) {
    try {
      const res = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) return;

      const entry = data[0];
      const meaning = entry.meanings?.[0];
      const defObj = meaning?.definitions?.[0];
      const def = defObj?.definition;
      if (!def) return;

      const example = defObj?.example || '';

      removeCard();
      const card = buildCard(entry.word || word, meaning.partOfSpeech || '', def);
      placeCard(card, range);
      activeCard = card;

      // Wire up save with full data
      card.querySelector('.nw-save-btn').addEventListener('click', () => {
        saveWord(entry.word || word, meaning.partOfSpeech || '', def, example);
        card.querySelector('.nw-saved-msg').textContent = 'Saved to local notebook';
      }, { once: true });
    } catch {
      // Silently ignore network/parse errors
    }
  }

  document.addEventListener('mouseup', (e) => {
    if (activeCard?.contains(e.target)) return;

    // Defer so selection is finalised before we read it
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;

      const text = sel.toString().trim();
      // Single English word only (letters, hyphens, apostrophes)
      if (!text || /[\s]/.test(text) || text.length < 2 || text.length > 45) return;
      if (!/^[a-zA-Z'-]+$/.test(text)) return;

      const range = sel.getRangeAt(0).cloneRange();

      lookupAndShow(text, range);
    }, 0);
  });

  document.addEventListener('mousedown', (e) => {
    if (activeCard && !activeCard.contains(e.target)) removeCard();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') removeCard();
  });
})();
