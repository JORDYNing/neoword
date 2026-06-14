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

    card.querySelector('.nw-save-btn').addEventListener('click', () => {
      saveWord(word, pos, definition);
      card.querySelector('.nw-saved-msg').textContent = 'Saved to local notebook';
    });

    return card;
  }

  // Position the card above selRect (falls back to below if no room).
  // The arrow tip is aligned to the horizontal center of the selection.
  function placeCard(card, selRect) {
    const ARROW_H = 9;  // matches border-top/bottom height in CSS
    const GAP = 4;      // gap between arrow tip and selection edge
    const EDGE = 8;     // minimum distance from viewport edges

    // Measure card dimensions while hidden
    card.style.visibility = 'hidden';
    card.style.position = 'fixed';
    card.style.top = '-9999px';
    document.body.appendChild(card);

    const cw = card.offsetWidth;
    const ch = card.offsetHeight;

    // Center card horizontally over selection, clamped to viewport
    let left = selRect.left + selRect.width / 2 - cw / 2;
    left = Math.max(EDGE, Math.min(left, window.innerWidth - cw - EDGE));

    // Arrow tip position relative to card left edge
    const arrowIdeal = selRect.left + selRect.width / 2 - left;
    const arrowLeft = Math.max(20, Math.min(arrowIdeal, cw - 20));
    card.querySelector('.nw-arrow').style.left = arrowLeft + 'px';

    // Try to place card above the selection
    let top = selRect.top - ch - ARROW_H - GAP;

    if (top < EDGE) {
      // Not enough room above — place below instead
      top = selRect.bottom + ARROW_H + GAP;
      card.classList.add('nw-below');
    }

    card.style.left = left + 'px';
    card.style.top = top + 'px';
    card.style.visibility = '';
  }

  function saveWord(word, pos, definition) {
    chrome.storage.local.get({ notebook: [] }, ({ notebook }) => {
      if (!notebook.find(e => e.word === word)) {
        notebook.push({ word, pos, definition, savedAt: Date.now() });
        chrome.storage.local.set({ notebook });
      }
    });
  }

  async function lookupAndShow(word, selRect) {
    try {
      const res = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) return;

      const entry = data[0];
      const meaning = entry.meanings?.[0];
      const def = meaning?.definitions?.[0]?.definition;
      if (!def) return;

      removeCard();
      const card = buildCard(entry.word || word, meaning.partOfSpeech || '', def);
      placeCard(card, selRect);
      activeCard = card;
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

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect.width) return;

      lookupAndShow(text, rect);
    }, 0);
  });

  document.addEventListener('mousedown', (e) => {
    if (activeCard && !activeCard.contains(e.target)) removeCard();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') removeCard();
  });
})();
