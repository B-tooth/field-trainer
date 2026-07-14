'use strict';

const state = {
  deck: null,
  deckPath: null,
  current: null,
  shown: 0,
  answerVisible: false,
  mode: null
};
const $ = (id) => document.getElementById(id);
const DECK_INDEX = '../decks/index.json';
const viewIds = ['homeView', 'modeView', 'readView', 'studyView'];

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load ${path}.`);
  return response.json();
}

function showView(viewId) {
  for (const id of viewIds) $(id).classList.toggle('hidden', id !== viewId);
  $('homeButton').classList.toggle('hidden', viewId === 'homeView');
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

    const button = document.createElement('button');
    button.className = 'deck-button';
    button.innerHTML = `<strong>${escapeHtml(deck.name)}</strong><span>${deck.cards.length} cards · ${accuracy}</span>`;
    button.addEventListener('click', () => chooseMode(deck, deckFolder));
    list.appendChild(button);
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
}

function chooseMode(deck, path) {
  setDeck(deck, path);
  state.mode = null;
  $('modeDeckName').textContent = deck.name;
  $('modeDeckDetails').textContent = `${deck.cards.length} cards`;
  showView('modeView');
}

function startReadMode() {
  state.mode = 'read';
  $('readDeckName').textContent = state.deck.name;
  $('readProgress').textContent = `${state.deck.cards.length} slides with answers`;
  renderReadCards();
  showView('readView');
}

function renderReadCards() {
  const list = $('readCardList');
  list.replaceChildren();

  state.deck.cards.forEach((card, index) => {
    const article = document.createElement('article');
    article.className = 'read-card card';

    const counter = document.createElement('p');
    counter.className = 'read-card-number';
    counter.textContent = `${index + 1} of ${state.deck.cards.length}`;

    const image = document.createElement('img');
    image.src = `${state.deckPath}${card.image}`;
    image.alt = `${card.answer} slide`;
    image.loading = index < 2 ? 'eager' : 'lazy';

    const answer = document.createElement('div');
    answer.className = 'answer-panel read-answer';
    answer.innerHTML = `<span>Answer</span><h2>${escapeHtml(card.answer)}</h2>`;

    article.append(counter, image, answer);
    list.appendChild(article);
  });
}

function startTestMode() {
  state.mode = 'test';
  state.current = null;
  state.shown = 0;
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
  state.answerVisible = false;
  $('cardImage').src = `${state.deckPath}${chosen.image}`;
  $('answerText').textContent = chosen.answer;
  $('answerPanel').classList.add('hidden');
  $('ratingControls').classList.add('hidden');
  $('revealControls').classList.remove('hidden');
  $('progressText').textContent = `Card ${state.shown}`;
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

function showLoadError(error) {
  $('deckList').innerHTML = `<div class="card intro"><strong>App could not load.</strong><p>${escapeHtml(error.message)} Run it through the included start-app.bat file.</p></div>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

$('readModeButton').addEventListener('click', startReadMode);
$('testModeButton').addEventListener('click', startTestMode);
$('switchToReadButton').addEventListener('click', startReadMode);
$('switchToTestButton').addEventListener('click', startTestMode);
$('revealButton').addEventListener('click', reveal);
$('rightButton').addEventListener('click', () => rate(true));
$('wrongButton').addEventListener('click', () => rate(false));
$('resetButton').addEventListener('click', resetProgress);
$('homeButton').addEventListener('click', goHome);
document.addEventListener('keydown', (event) => {
  if (state.mode !== 'test') return;
  if (event.code === 'Space' && !state.answerVisible) { event.preventDefault(); reveal(); }
  if (event.code === 'ArrowLeft' && state.answerVisible) rate(false);
  if (event.code === 'ArrowRight' && state.answerVisible) rate(true);
});

loadDeckIndex().catch(showLoadError);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('service-worker.js').catch(() => {});
}
