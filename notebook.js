'use strict';

let allWords = [];
let activeFilter = 'all';
let selectedWord = null;

function fmt(ts) {
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function filtered(words, query) {
  let list = words;
  if (activeFilter !== 'all') list = list.filter(w => w.status === activeFilter);
  if (query) {
    const q = query.toLowerCase();
    list = list.filter(w =>
      w.word.toLowerCase().includes(q) || w.definition.toLowerCase().includes(q)
    );
  }
  return list;
}

function updateStats(words) {
  const total = words.length;
  const learning = words.filter(w => w.status === 'learning').length;
  const mastered = words.filter(w => w.status === 'mastered').length;
  document.getElementById('stats').textContent =
    `${total} total / ${learning} learning / ${mastered} mastered`;
}

function selectWord(entry) {
  selectedWord = entry;
  document.getElementById('reviewWord').textContent = entry.word;
  document.getElementById('reviewDef').textContent = entry.definition;
  document.getElementById('reviewSeen').textContent = entry.seenCount || 1;
  document.getElementById('reviewSource').textContent = entry.source || 'dictionaryapi.dev';

  document.querySelectorAll('.nb-status-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === entry.status);
  });

  document.querySelectorAll('.nb-entry').forEach(el => {
    el.classList.toggle('selected', el.dataset.word === entry.word);
  });
}

function renderList(words) {
  const list = document.getElementById('wordList');
  if (!words.length) {
    list.innerHTML = '<p class="nb-empty">No words yet — select a word on any page to get started.</p>';
    return;
  }

  list.innerHTML = words.map(w => `
    <div class="nb-entry" data-word="${esc(w.word)}">
      <div class="nb-entry-top">
        <span class="nb-entry-word">${esc(w.word)}</span>
        <span class="nb-entry-pos">${esc(w.pos)}</span>
      </div>
      <p class="nb-entry-def">${esc(w.definition)}</p>
      ${w.example ? `<p class="nb-entry-example">${esc(w.example)}</p>` : ''}
      <div class="nb-entry-footer">
        <span class="nb-entry-date">${fmt(w.savedAt)}</span>
        <span class="nb-entry-status ${w.status === 'mastered' ? 'mastered' : ''}">${w.status}</span>
        <button class="nb-entry-delete" data-word="${esc(w.word)}">Delete</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.nb-entry').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('nb-entry-delete')) return;
      const w = allWords.find(x => x.word === el.dataset.word);
      if (w) selectWord(w);
    });
  });

  list.querySelectorAll('.nb-entry-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteWord(btn.dataset.word));
  });

  // Auto-select first entry if nothing selected or selection was deleted
  if (!selectedWord || !words.find(w => w.word === selectedWord.word)) {
    selectWord(words[0]);
  }
}

function render() {
  const query = document.getElementById('searchInput').value.trim();
  const words = filtered(allWords, query);
  updateStats(allWords);
  renderList(words);
}

function load() {
  chrome.storage.local.get({ notebook: [] }, ({ notebook }) => {
    allWords = notebook;
    render();
  });
}

function save() {
  chrome.storage.local.set({ notebook: allWords }, render);
}

function deleteWord(word) {
  allWords = allWords.filter(w => w.word !== word);
  if (selectedWord?.word === word) selectedWord = null;
  save();
}

// ── Event wiring ──

document.getElementById('searchInput').addEventListener('input', render);

document.querySelectorAll('.nb-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nb-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    render();
  });
});

document.querySelectorAll('.nb-status-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!selectedWord) return;
    const w = allWords.find(x => x.word === selectedWord.word);
    if (w) {
      w.status = btn.dataset.status;
      selectedWord = w;
      save();
    }
  });
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(allWords, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'neoword-notebook.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!Array.isArray(imported)) return;
      // Merge: imported words take precedence
      const map = new Map(allWords.map(w => [w.word, w]));
      imported.forEach(w => { if (w.word) map.set(w.word, w); });
      allWords = [...map.values()];
      save();
    } catch { /* invalid JSON */ }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('clearBtn').addEventListener('click', () => {
  if (confirm('Clear all saved words? This cannot be undone.')) {
    allWords = [];
    selectedWord = null;
    save();
  }
});

// ── Init ──
load();
