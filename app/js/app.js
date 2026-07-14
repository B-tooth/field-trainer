'use strict';

const state = {
  deck: null,
  deckPath: null,
  current: null,
  shown: 0,
  answerVisible: false,
  mode: null,
  readIndex: 0,
  sessionSeen: new Set()
};
const $ = (id) => document.getElementById(id);
const DECK_INDEX = '../decks/index.json';
const viewIds = ['homeView', 'readView', 'studyView'];

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load ${path}.`);
  return response.json();
}

function showView(viewId) {
  for (const id of viewIds) $(id).classList.toggle('hidden', id !== viewId);
  const onHome = viewId === 'homeView';
  $('homeButton').classList.toggle('hidden', onHome);
  $('backButton').classList.toggle('hidden', onHome);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

async function loadDeckIndex() {
  const data = await fetchJson(DECK_INDEX);
  const list = $('deckList');
  list.replaceChildren();

  for (const entry of data.decks) {
    const deck = await fetchJson(`../${entry.path}`);
    const deckFolder = `../${entry.path.replace(/deck\.json$/, '')}`;
    const progress = getProgressFor(deck.id);
    const totalAnswers = progress.right + progress.wrong;
    const accuracy = totalAnswers ? `${Math.round((progress.right / totalAnswers) * 100)}% accuracy` : 'Not started';

    const article = document.createElement('article');
    article.className = 'deck-card card';
    article.innerHTML = `
      <div class="deck-card-top">
        <div>
          <h3>${escapeHtml(deck.name)}</h3>
          <p class="deck-meta">${deck.cards.length} cards · ${accuracy}</p>
        </div>
        <span class="deck-icon" aria-hidden="true">◉</span>
      </div>
      <div class="deck-actions">
        <button class="secondary read-deck-button">Read</button>
        <button class="primary test-deck-button">Test</button>
      </div>`;
    article.querySelector('.read-deck-button').addEventListener('click', () => startReadMode(deck, deckFolder));
    article.querySelector('.test-deck-button').addEventListener('click', () => startTestMode(deck, deckFolder));
    list.appendChild(article);
  }
}

function progressKey(deckId) { return `species-flashcards:${deckId}`; }
function getProgressFor(deckId) {
  const empty = { right: 0, wrong: 0, cards: {} };
  try { return { ...empty, ...JSON.parse(localStorage.getItem(progressKey(deckId)) || '{}') }; }
  catch { return empty; }
}
function getProgress() { return getProgressFor(state.deck.id); }
function saveProgress(progress) { localStorage.setItem(progressKey(state.deck.id), JSON.stringify(progress)); }

function setDeck(deck, path) {
  state.deck = deck;
  state.deckPath = path;
  state.current = null;
  state.shown = 0;
  state.answerVisible = false;
  state.readIndex = 0;
  state.sessionSeen = new Set();
}

function ensureDeck(deck, path) {
  if (deck && path) setDeck(deck, path);
}

function startReadMode(deck, path) {
  ensureDeck(deck, path);
  state.mode = 'read';
  state.readIndex = 0;
  $('readDeckName').textContent = state.deck.name;
  renderReadCard();
  showView('readView');
}

function renderReadCard() {
  const card = state.deck.cards[state.readIndex];
  const currentNumber = state.readIndex + 1;
  $('readCardImage').src = `${state.deckPath}${card.image}`;
  $('readCardImage').alt = `${card.answer} slide`;
  $('readAnswerText').textContent = card.answer;
  $('readProgress').textContent = `${currentNumber} of ${state.deck.cards.length}`;
  $('readProgressBar').style.width = `${(currentNumber / state.deck.cards.length) * 100}%`;
  $('previousReadButton').disabled = state.readIndex === 0;
  $('nextReadButton').textContent = state.readIndex === state.deck.cards.length - 1 ? 'Back to start ↺' : 'Next →';
}

function moveReadCard(direction) {
  if (direction < 0 && state.readIndex > 0) state.readIndex -= 1;
  if (direction > 0) state.readIndex = state.readIndex === state.deck.cards.length - 1 ? 0 : state.readIndex + 1;
  renderReadCard();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startTestMode(deck, path) {
  ensureDeck(deck, path);
  state.mode = 'test';
  state.current = null;
  state.shown = 0;
  state.sessionSeen = new Set();
  $('deckName').textContent = state.deck.name;
  updateStats();
  chooseCard();
  showView('studyView');
}

function cardWeight(card, progress) {
  const result = progress.cards[card.id] || { right: 0, wrong: 0 };
  return Math.max(1, 1 + result.wrong * 2 - result.right * 0.35);
}

function chooseCard() {
  const progress = getProgress();
  let pool = state.deck.cards.filter((card) => !state.current || card.id !== state.current.id);
  if (pool.length === 0) pool = state.deck.cards;

  const weights = pool.map((card) => cardWeight(card, progress));
  let pick = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
  let chosen = pool[0];
  for (let i = 0; i < pool.length; i += 1) {
    pick -= weights[i];
    if (pick <= 0) { chosen = pool[i]; break; }
  }

  state.current = chosen;
  state.shown += 1;
  state.sessionSeen.add(chosen.id);
  state.answerVisible = false;
  $('cardImage').src = `${state.deckPath}${chosen.image}`;
  $('answerText').textContent = chosen.answer;
  $('answerPanel').classList.add('hidden');
  $('ratingControls').classList.add('hidden');
  $('revealControls').classList.remove('hidden');
  updateSessionProgress();
}

function updateSessionProgress() {
  const seen = state.sessionSeen.size;
  const total = state.deck.cards.length;
  $('progressText').textContent = `${seen} of ${total} cards seen · ${state.shown} shown`;
  $('testProgressBar').style.width = `${Math.min(100, (seen / total) * 100)}%`;
}

function reveal() {
  if (state.mode !== 'test') return;
  state.answerVisible = true;
  $('answerPanel').classList.remove('hidden');
  $('revealControls').classList.add('hidden');
  $('ratingControls').classList.remove('hidden');
}

function rate(isRight) {
  if (state.mode !== 'test' || !state.answerVisible) return;
  const progress = getProgress();
  progress.cards[state.current.id] ||= { right: 0, wrong: 0 };
  if (isRight) {
    progress.right += 1;
    progress.cards[state.current.id].right += 1;
  } else {
    progress.wrong += 1;
    progress.cards[state.current.id].wrong += 1;
  }
  saveProgress(progress);
  updateStats();
  chooseCard();
}

function updateStats() {
  const progress = getProgress();
  const total = progress.right + progress.wrong;
  $('rightCount').textContent = progress.right;
  $('wrongCount').textContent = progress.wrong;
  $('accuracy').textContent = total ? `${Math.round((progress.right / total) * 100)}%` : '—';
}

function resetProgress() {
  if (confirm(`Reset all saved results for ${state.deck.name}?`)) {
    localStorage.removeItem(progressKey(state.deck.id));
    updateStats();
    state.sessionSeen = new Set();
    state.shown = 0;
    chooseCard();
  }
}

function goHome() {
  state.deck = null;
  state.deckPath = null;
  state.mode = null;
  showView('homeView');
  loadDeckIndex().catch(showLoadError);
}

function goBack() {
  if (state.mode === 'read' || state.mode === 'test') goHome();
}

function showLoadError(error) {
  $('deckList').innerHTML = `<div class="card hero"><strong>App could not load.</strong><p>${escapeHtml(error.message)} Run it through the included start-app.bat file.</p></div>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

$('switchToReadButton').addEventListener('click', () => startReadMode());
$('switchToTestButton').addEventListener('click', () => startTestMode());
$('previousReadButton').addEventListener('click', () => moveReadCard(-1));
$('nextReadButton').addEventListener('click', () => moveReadCard(1));
$('revealButton').addEventListener('click', reveal);
$('rightButton').addEventListener('click', () => rate(true));
$('wrongButton').addEventListener('click', () => rate(false));
$('resetButton').addEventListener('click', resetProgress);
$('homeButton').addEventListener('click', goHome);
$('backButton').addEventListener('click', goBack);
document.addEventListener('keydown', (event) => {
  if (state.mode === 'read') {
    if (event.code === 'ArrowLeft') moveReadCard(-1);
    if (event.code === 'ArrowRight') moveReadCard(1);
    return;
  }
  if (state.mode !== 'test') return;
  if (event.code === 'Space' && !state.answerVisible) { event.preventDefault(); reveal(); }
  if (event.code === 'ArrowLeft' && state.answerVisible) rate(false);
  if (event.code === 'ArrowRight' && state.answerVisible) rate(true);
});

loadDeckIndex().catch(showLoadError);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('service-worker.js').catch(() => {});
}
