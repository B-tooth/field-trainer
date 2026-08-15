'use strict';

const state = {
  deck: null,
  deckPath: null,
  current: null,
  shown: 0,
  answerVisible: false,
  mode: null,
  testType: null,
  readIndex: 0,
  orderedIndex: 0,
  sessionRight: 0,
  sessionWrong: 0,
  sessionSeen: new Set(),
  mistakeCards: [],
  reviewCards: [],
  reviewIndex: 0,
  targetedReviewKind: null,
  zoomScale: 1,
  zoomX: 0,
  zoomY: 0,
  zoomDragging: false,
  zoomPointerX: 0,
  zoomPointerY: 0,
  zoomPointers: new Map(),
  zoomPinchDistance: 0,
  zoomPinchScale: 1,
  zoomLastTap: 0,
  readFilter: '',
  readCards: [],
  readAnswerHidden: false,
  availableDecks: [],
  lastDeck: null
};

const $ = (id) => document.getElementById(id);

const DECK_INDEX = '../decks/index.json';
const LAST_DECK_KEY = 'field-trainer:last-deck';

const viewIds = [
  'homeView',
  'readView',
  'testSetupView',
  'studyView',
  'resultsView',
  'progressView'
];

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Could not load ${path}.`);
  }

  return response.json();
}

function showView(viewId) {
  for (const id of viewIds) {
    $(id).classList.toggle('hidden', id !== viewId);
  }

  const onHome = viewId === 'homeView';

  $('homeButton').classList.toggle('hidden', onHome);
  $('backButton').classList.toggle('hidden', onHome);

  window.scrollTo({
    top: 0,
    behavior: 'instant'
  });
}

async function loadDeckIndex() {
  const data = await fetchJson(DECK_INDEX);
  const list = $('deckList');

  list.replaceChildren();
  state.availableDecks = [];

  for (const entry of data.decks) {
    const deck = await fetchJson(`../${entry.path}`);
    const deckFolder = `../${entry.path.replace(/deck\.json$/, '')}`;

    state.availableDecks.push({
      deck,
      path: deckFolder,
      indexPath: entry.path
    });
  }

  $('deckCount').textContent =
    `${state.availableDecks.length} ${state.availableDecks.length === 1 ? 'study area' : 'study areas'}`;

  state.lastDeck = getLastDeck();
  renderContinuePanel();

  for (const item of state.availableDecks) {
    renderDeckCard(item.deck, item.path, item.indexPath);
  }
}

function getDeckReadiness(deck) {
  const progress = getProgressFor(deck.id);
  const records = deck.cards.map((card) => progress.cards[card.id] || {});
  const reviewed = records.filter((record) => Number(record.seen) > 0);
  const totalSeen = records.reduce((sum, record) => sum + (Number(record.seen) || 0), 0);
  const score = reviewed.length
    ? Math.round(reviewed.reduce((sum, record) => sum + (Number(record.fieldReadiness) || 0), 0) / reviewed.length)
    : 0;

  return {
    score,
    band: FieldTrainerLearning.getReadinessBand(score),
    reviewedCards: reviewed.length,
    totalCards: deck.cards.length,
    totalSeen,
    progress
  };
}

function renderDeckCard(deck, deckFolder, indexPath) {
  const summary = getDeckReadiness(deck);
  const isLastDeck = state.lastDeck?.id === deck.id;
  const article = document.createElement('article');
  const started = summary.reviewedCards > 0;

  article.className = `deck-card card${isLastDeck ? ' last-deck' : ''}`;

  article.innerHTML = `
    <div class="deck-card-top">
      <div>
        <div class="deck-title-row">
          <h3>${escapeHtml(deck.name)}</h3>
          ${isLastDeck ? '<span class="resume-badge">Last used</span>' : ''}
        </div>
        <p class="deck-meta">
          ${deck.cards.length} cards · ${started ? `${summary.reviewedCards} studied` : 'Not started'}
        </p>
      </div>

      <div class="deck-readiness" aria-label="${started ? `${summary.score} Field Readiness` : 'No Field Readiness score yet'}">
        <strong>${started ? summary.score : '—'}</strong>
        <span>${started ? summary.band : 'New'}</span>
      </div>
    </div>

    <div class="mini-progress" aria-label="${summary.score}% Field Readiness">
      <span style="width:${summary.score}%"></span>
    </div>

    <div class="deck-actions deck-actions-three">
      <button class="secondary progress-deck-button">Progress</button>
      <button class="secondary read-deck-button">Read</button>
      <button class="primary test-deck-button">Test</button>
    </div>
  `;

  article
    .querySelector('.progress-deck-button')
    .addEventListener('click', () => openProgressDashboard(deck, deckFolder, indexPath));

  article
    .querySelector('.read-deck-button')
    .addEventListener('click', () => startReadMode(deck, deckFolder, indexPath));

  article
    .querySelector('.test-deck-button')
    .addEventListener('click', () => openTestSetup(deck, deckFolder, indexPath));

  $('deckList').appendChild(article);
}

function getTargetedReviewCards(kind) {
  const progress = getProgress();
  const now = Date.now();
  const forgottenAfterDays = 30;

  const candidates = state.deck.cards
    .map((card) => ({
      card,
      record: progress.cards[card.id] || {}
    }));

  if (kind === 'weak') {
    return candidates
      .filter(({ record }) => {
        const seen = Number(record.seen) || 0;
        const score = Number(record.fieldReadiness) || 0;
        return seen > 0 && score < 65;
      })
      .sort((a, b) => {
        const scoreDifference =
          (Number(a.record.fieldReadiness) || 0) -
          (Number(b.record.fieldReadiness) || 0);

        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        const aReviewed = Date.parse(a.record.lastReviewed || '') || 0;
        const bReviewed = Date.parse(b.record.lastReviewed || '') || 0;
        return aReviewed - bReviewed;
      })
      .map(({ card }) => card);
  }

  if (kind === 'forgotten') {
    return candidates
      .filter(({ record }) => {
        const seen = Number(record.seen) || 0;
        const reviewedAt = Date.parse(record.lastReviewed || '');

        if (!seen || !Number.isFinite(reviewedAt)) {
          return false;
        }

        return (now - reviewedAt) / 86400000 >= forgottenAfterDays;
      })
      .sort((a, b) => {
        const aReviewed = Date.parse(a.record.lastReviewed || '') || 0;
        const bReviewed = Date.parse(b.record.lastReviewed || '') || 0;
        return aReviewed - bReviewed;
      })
      .map(({ card }) => card);
  }

  return [];
}

function openProgressDashboard(deck, path, indexPath) {
  ensureDeck(deck, path, indexPath);
  state.mode = 'progress';

  const summary = getDeckReadiness(state.deck);
  const weakCards = getTargetedReviewCards('weak');
  const forgottenCards = getTargetedReviewCards('forgotten');

  $('progressDeckName').textContent = state.deck.name;
  $('progressReadinessScore').textContent = summary.reviewedCards ? summary.score : '—';
  $('progressReadinessBand').textContent = summary.reviewedCards
    ? summary.band
    : 'No cards studied yet';
  $('progressReadinessBar').style.width = `${summary.score}%`;
  $('progressCardCount').textContent = summary.totalCards;
  $('progressReviewCount').textContent = summary.totalSeen;
  $('progressSessionCount').textContent = Number(summary.progress.sessions) || 0;
  $('progressNeedsPractice').textContent = weakCards.length;
  $('progressForgotten').textContent = forgottenCards.length;

  const weakButton = $('progressWeakButton');
  const forgottenButton = $('progressForgottenButton');

  weakButton.disabled = weakCards.length === 0;
  weakButton.textContent = weakCards.length
    ? `Review weak cards (${weakCards.length})`
    : 'No weak cards to review';
  weakButton.title = weakCards.length
    ? 'Review cards with Field Readiness below 65'
    : 'Study some cards first, or keep practising until cards need attention';

  forgottenButton.disabled = forgottenCards.length === 0;
  forgottenButton.textContent = forgottenCards.length
    ? `Review forgotten cards (${forgottenCards.length})`
    : 'No forgotten cards yet';
  forgottenButton.title = forgottenCards.length
    ? 'Review cards not studied for at least 30 days'
    : 'A card is considered forgotten after 30 days without review';

  showView('progressView');
}

function startTargetedReview(kind) {
  if (!state.deck) {
    return;
  }

  const eligibleCards = getTargetedReviewCards(kind);

  if (eligibleCards.length === 0) {
    openProgressDashboard();
    return;
  }

  FieldTrainerLearning.recordSessionStart(state.deck);

  state.reviewCards = eligibleCards.slice(0, 20);
  state.reviewIndex = 0;
  state.targetedReviewKind = kind;
  state.mode = 'test';
  state.testType = kind;
  state.current = null;
  state.shown = 0;
  state.sessionRight = 0;
  state.sessionWrong = 0;
  state.sessionSeen = new Set();
  state.mistakeCards = [];

  $('deckName').textContent = state.deck.name;
  $('testHeading').textContent =
    kind === 'weak'
      ? 'Review weak cards'
      : 'Review forgotten cards';

  updateStats();
  showReviewCard();
  showView('studyView');
}

function saveLastDeck(indexPath) {
  if (!state.deck || !indexPath) {
    return;
  }

  const saved = {
    id: state.deck.id,
    name: state.deck.name,
    indexPath,
    updatedAt: new Date().toISOString()
  };

  localStorage.setItem(LAST_DECK_KEY, JSON.stringify(saved));
  state.lastDeck = saved;
}

function getLastDeck() {
  try {
    return JSON.parse(localStorage.getItem(LAST_DECK_KEY) || 'null');
  } catch {
    return null;
  }
}

function getLastDeckItem() {
  if (!state.lastDeck) {
    return null;
  }

  return state.availableDecks.find(
    (item) => item.deck.id === state.lastDeck.id
  ) || null;
}

function renderContinuePanel() {
  const item = getLastDeckItem();
  const panel = $('continuePanel');

  panel.classList.toggle('hidden', !item);

  if (!item) {
    return;
  }

  const summary = getDeckReadiness(item.deck);
  const readiness = summary.reviewedCards
    ? `${summary.score} Field Readiness`
    : 'Not started yet';

  $('continueDeckDetails').textContent =
    `${item.deck.name} · ${item.deck.cards.length} cards · ${readiness}`;
}

function continueLastDeck(mode) {
  const item = getLastDeckItem();

  if (!item) {
    return;
  }

  if (mode === 'read') {
    startReadMode(item.deck, item.path, item.indexPath);
  } else {
    openTestSetup(item.deck, item.path, item.indexPath);
  }
}

function getDeckById(deckId) {
  return state.availableDecks.find((item) => item.deck.id === deckId)?.deck
    || (state.deck?.id === deckId ? state.deck : null);
}

function getProgressFor(deckId) {
  const deck = getDeckById(deckId);

  return deck
    ? FieldTrainerLearning.getDeckProgress(deck)
    : { right: 0, wrong: 0, cards: {} };
}

function getProgress() {
  return FieldTrainerLearning.getDeckProgress(state.deck);
}

function setDeck(deck, path, indexPath) {
  state.deck = deck;
  state.deckPath = path;
  state.deckIndexPath = indexPath || state.deckIndexPath;
  state.current = null;
  state.shown = 0;
  state.answerVisible = false;
  state.readIndex = 0;
  state.orderedIndex = 0;
  state.sessionRight = 0;
  state.sessionWrong = 0;
  state.sessionSeen = new Set();
  state.mistakeCards = [];
  state.reviewCards = [];
  state.reviewIndex = 0;
  state.targetedReviewKind = null;
  state.readFilter = '';
  state.readCards = [...deck.cards];
  state.readAnswerHidden = false;

  FieldTrainerLearning.prepareDeck(state.deck);
  saveLastDeck(state.deckIndexPath);
}

function ensureDeck(deck, path, indexPath) {
  if (deck && path) {
    setDeck(deck, path, indexPath);
  }
}

function startReadMode(deck, path, indexPath) {
  ensureDeck(deck, path, indexPath);

  state.mode = 'read';
  state.testType = null;
  state.readIndex = 0;
  state.readFilter = '';
  state.readCards = [...state.deck.cards];
  state.readAnswerHidden = false;

  $('readDeckName').textContent = state.deck.name;
  $('readSearchInput').value = '';
  updateReadAnswerVisibility();

  renderReadCard();
  showView('readView');
}

function animateCard(elementId) {
  const element = $(elementId);

  element.classList.remove('card-enter');
  void element.offsetWidth;
  element.classList.add('card-enter');
}

function renderReadCard() {
  const hasCards = state.readCards.length > 0;

  $('readFlashcard').classList.toggle('hidden', !hasCards);
  $('readNoResults').classList.toggle('hidden', hasCards);
  $('previousReadButton').classList.toggle('hidden', !hasCards);
  $('nextReadButton').classList.toggle('hidden', !hasCards);
  $('readProgress').classList.toggle('hidden', !hasCards);
  $('readProgressBar').parentElement.classList.toggle('hidden', !hasCards);

  if (!hasCards) {
    $('readSearchSummary').textContent =
      `No results for “${state.readFilter}”`;
    $('readSearchSummary').classList.remove('hidden');
    return;
  }

  const card = state.readCards[state.readIndex];
  const currentNumber = state.readIndex + 1;
  const total = state.readCards.length;

  $('readCardImage').src = `${state.deckPath}${card.image}`;
  $('readCardImage').alt = `${card.answer} slide`;
  $('readAnswerText').textContent = card.answer;
  $('readProgress').textContent = `${currentNumber} of ${total}`;
  $('readProgressBar').style.width = `${(currentNumber / total) * 100}%`;

  $('previousReadButton').disabled = state.readIndex === 0;
  $('nextReadButton').textContent =
    state.readIndex === total - 1 ? 'Back to start ↻' : 'Next →';

  const filtered = Boolean(state.readFilter);
  $('readSearchSummary').classList.toggle('hidden', !filtered);
  $('readSearchSummary').textContent = filtered
    ? `${total} matching ${total === 1 ? 'species' : 'species'}`
    : '';

  animateCard('readFlashcard');
}

function moveReadCard(direction) {
  if (direction < 0 && state.readIndex > 0) {
    state.readIndex -= 1;
  }

  if (direction > 0) {
    state.readIndex =
      state.readIndex === state.readCards.length - 1
        ? 0
        : state.readIndex + 1;
  }

  renderReadCard();

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

function filterReadCards(query) {
  state.readFilter = query.trim();
  const normalized = state.readFilter.toLocaleLowerCase();

  state.readCards = normalized
    ? state.deck.cards.filter((card) =>
        card.answer.toLocaleLowerCase().includes(normalized)
      )
    : [...state.deck.cards];

  state.readIndex = 0;
  renderReadCard();
}

function updateReadAnswerVisibility() {
  $('readAnswerPanel').classList.toggle('answer-collapsed', state.readAnswerHidden);
  $('toggleReadAnswerButton').textContent =
    state.readAnswerHidden ? 'Show answer' : 'Hide answer';
  $('toggleReadAnswerButton').setAttribute(
    'aria-pressed',
    String(state.readAnswerHidden)
  );
}

function toggleReadAnswer() {
  state.readAnswerHidden = !state.readAnswerHidden;
  updateReadAnswerVisibility();
}

function openTestSetup(deck, path, indexPath) {
  ensureDeck(deck, path, indexPath);

  state.mode = 'test-setup';
  state.testType = null;
  state.current = null;
  state.answerVisible = false;

  $('testSetupDeckName').textContent = state.deck.name;

  showView('testSetupView');
}

function startSmartTest() {
  FieldTrainerLearning.recordSessionStart(state.deck);
  state.mode = 'test';
  state.testType = 'smart';
  state.current = null;
  state.shown = 0;
  state.sessionRight = 0;
  state.sessionWrong = 0;
  state.sessionSeen = new Set();
  state.mistakeCards = [];
  state.reviewCards = [];
  state.reviewIndex = 0;
  state.targetedReviewKind = null;

  $('deckName').textContent = state.deck.name;
  $('testHeading').textContent = 'Smart Random';

  updateStats();
  chooseSmartCard();
  showView('studyView');
}

function startOrderedTest() {
  if (!state.deck) {
    console.error('No deck selected');
    showView('homeView');
    return;
  }

  FieldTrainerLearning.recordSessionStart(state.deck);

  state.mode = 'test';
  state.testType = 'ordered';
  state.current = null;
  state.shown = 0;
  state.orderedIndex = 0;
  state.sessionRight = 0;
  state.sessionWrong = 0;
  state.sessionSeen = new Set();
  state.mistakeCards = [];
  state.reviewCards = [];
  state.reviewIndex = 0;
  state.targetedReviewKind = null;

  $('deckName').textContent = state.deck.name;
  $('testHeading').textContent = 'In Order';

  updateStats();
  showOrderedCard();
  showView('studyView');
}

function cardWeight(card, progress) {
  const result = progress.cards[card.id] || {
    right: 0,
    wrong: 0
  };

  return Math.max(
    1,
    1 + result.wrong * 2 - result.right * 0.35
  );
}

function chooseSmartCard() {
  const progress = getProgress();

  let pool = state.deck.cards.filter(
    (card) => !state.current || card.id !== state.current.id
  );

  if (pool.length === 0) {
    pool = state.deck.cards;
  }

  const weights = pool.map(
    (card) => cardWeight(card, progress)
  );

  let pick =
    Math.random() *
    weights.reduce((sum, weight) => sum + weight, 0);

  let chosen = pool[0];

  for (let i = 0; i < pool.length; i += 1) {
    pick -= weights[i];

    if (pick <= 0) {
      chosen = pool[i];
      break;
    }
  }

  displayTestCard(chosen);
}

function showOrderedCard() {
  const card = state.deck.cards[state.orderedIndex];
  displayTestCard(card);
}

function startMistakeReview() {
  if (state.mistakeCards.length === 0) {
    return;
  }

  FieldTrainerLearning.recordSessionStart(state.deck);

  state.reviewCards = [...state.mistakeCards];
  state.mistakeCards = [];
  state.reviewIndex = 0;
  state.targetedReviewKind = null;
  state.mode = 'test';
  state.testType = 'review';
  state.current = null;
  state.shown = 0;
  state.sessionRight = 0;
  state.sessionWrong = 0;
  state.sessionSeen = new Set();

  $('deckName').textContent = state.deck.name;
  $('testHeading').textContent = 'Review mistakes';

  updateStats();
  showReviewCard();
  showView('studyView');
}

function showReviewCard() {
  const card = state.reviewCards[state.reviewIndex];
  displayTestCard(card);
}

function displayTestCard(card) {
  state.current = card;
  state.shown += 1;
  state.sessionSeen.add(card.id);
  state.answerVisible = false;

  $('cardImage').src = `${state.deckPath}${card.image}`;
  $('cardImage').alt = 'Flashcard question slide';
  $('answerText').textContent = card.answer;

  $('answerPanel').classList.add('hidden');
  $('ratingControls').classList.add('hidden');
  $('revealControls').classList.remove('hidden');

  updateSessionProgress();
  animateCard('testFlashcard');
}

function updateSessionProgress() {
  const total = state.deck.cards.length;

  if (state.testType === 'ordered') {
    const currentNumber = state.orderedIndex + 1;

    $('progressText').textContent =
      `Card ${currentNumber} of ${total}`;

    $('testProgressBar').style.width =
      `${(currentNumber / total) * 100}%`;

    return;
  }

  if (['review', 'weak', 'forgotten'].includes(state.testType)) {
    const reviewTotal = state.reviewCards.length;
    const currentNumber = state.reviewIndex + 1;
    const label =
      state.testType === 'review'
        ? 'Mistake'
        : state.testType === 'weak'
          ? 'Weak card'
          : 'Forgotten card';

    $('progressText').textContent =
      `${label} ${currentNumber} of ${reviewTotal}`;

    $('testProgressBar').style.width =
      `${(currentNumber / reviewTotal) * 100}%`;

    return;
  }

  const seen = state.sessionSeen.size;

  $('progressText').textContent =
    `${seen} of ${total} cards seen · ${state.shown} shown`;

  $('testProgressBar').style.width =
    `${Math.min(100, (seen / total) * 100)}%`;
}

function reveal() {
  if (state.mode !== 'test') {
    return;
  }

  state.answerVisible = true;

  $('answerPanel').classList.remove('hidden');
  $('revealControls').classList.add('hidden');
  $('ratingControls').classList.remove('hidden');
}

function rate(isRight) {
  if (state.mode !== 'test' || !state.answerVisible) {
    return;
  }

  recordAnswer(isRight);

  if (state.testType === 'ordered') {
    moveToNextOrderedCard();
    return;
  }

  if (['review', 'weak', 'forgotten'].includes(state.testType)) {
    moveToNextReviewCard();
    return;
  }

  if (state.sessionSeen.size >= state.deck.cards.length) {
    showResults();
    return;
  }

  chooseSmartCard();
}

function recordAnswer(isRight) {
  FieldTrainerLearning.recordAnswer(
    state.deck,
    state.current.id,
    isRight
  );

  if (isRight) {
    state.sessionRight += 1;
  } else {
    state.sessionWrong += 1;

    const alreadyRecorded = state.mistakeCards.some(
      (card) => card.id === state.current.id
    );

    if (!alreadyRecorded) {
      state.mistakeCards.push(state.current);
    }
  }

  updateStats();
}

function moveToNextOrderedCard() {
  const isFinalCard =
    state.orderedIndex >= state.deck.cards.length - 1;

  if (isFinalCard) {
    showResults();
    return;
  }

  state.orderedIndex += 1;
  showOrderedCard();
}

function moveToNextReviewCard() {
  const isFinalCard =
    state.reviewIndex >= state.reviewCards.length - 1;

  if (isFinalCard) {
    showResults();
    return;
  }

  state.reviewIndex += 1;
  showReviewCard();
}

function showResults() {
  const completedTestType = state.testType;
  state.mode = 'results';

  const total =
    state.sessionRight + state.sessionWrong;

  const accuracy = total
    ? Math.round((state.sessionRight / total) * 100)
    : 0;

  const resultCopy = {
    review: {
      title: 'Review complete',
      message: 'You have reviewed every card from your previous mistakes.'
    },
    weak: {
      title: 'Weak card review complete',
      message: 'You have completed this weak-card review session.'
    },
    forgotten: {
      title: 'Forgotten card review complete',
      message: 'You have completed this forgotten-card review session.'
    }
  };

  const copy = resultCopy[completedTestType] || {
    title: 'Test complete',
    message: 'You have completed this test session.'
  };

  $('resultsDeckName').textContent = state.deck.name;
  $('resultsTitle').textContent = copy.title;
  $('resultsMessage').textContent = copy.message;
  $('resultsAccuracy').textContent = `${accuracy}%`;
  $('resultsRight').textContent = state.sessionRight;
  $('resultsWrong').textContent = state.sessionWrong;
  $('resultsTotal').textContent = total;

  $('reviewMistakesButton').classList.toggle(
    'hidden',
    state.mistakeCards.length === 0
  );

  $('restartOrderedButton').classList.toggle(
    'hidden',
    completedTestType !== 'ordered'
  );

  showView('resultsView');
}

function updateStats() {
  const progress = getProgress();
  const total = progress.right + progress.wrong;

  $('rightCount').textContent = progress.right;
  $('wrongCount').textContent = progress.wrong;

  $('accuracy').textContent = total
    ? `${Math.round((progress.right / total) * 100)}%`
    : '—';
}

function resetProgress() {
  const confirmed = confirm(
    `Reset all saved results for ${state.deck.name}?`
  );

  if (!confirmed) {
    return;
  }

  FieldTrainerLearning.resetDeck(state.deck.id);
  FieldTrainerLearning.prepareDeck(state.deck);

  updateStats();

  state.sessionRight = 0;
  state.sessionWrong = 0;
  state.sessionSeen = new Set();
  state.shown = 0;

  state.mistakeCards = [];

  if (state.testType === 'ordered') {
    state.orderedIndex = 0;
    showOrderedCard();
    return;
  }

  if (['review', 'weak', 'forgotten'].includes(state.testType)) {
    state.reviewIndex = 0;
    showReviewCard();
    return;
  }

  state.current = null;
  chooseSmartCard();
}

function goHome() {
  state.deck = null;
  state.deckPath = null;
  state.mode = null;
  state.testType = null;

  showView('homeView');
  loadDeckIndex().catch(showLoadError);
}

function goBack() {
  if (state.mode === 'test') {
    openTestSetup();
    return;
  }

  if (state.mode === 'results') {
    openTestSetup();
    return;
  }

  goHome();
}


function openImageZoom(sourceImage) {
  const zoomImage = $('zoomImage');

  zoomImage.src = sourceImage.src;
  zoomImage.alt = sourceImage.alt || 'Zoomed flashcard image';

  state.zoomScale = 1;
  state.zoomX = 0;
  state.zoomY = 0;
  state.zoomDragging = false;
  state.zoomPointers.clear();
  state.zoomPinchDistance = 0;
  state.zoomPinchScale = 1;

  updateZoomTransform();

  $('imageZoom').classList.remove('hidden');
  document.body.classList.add('zoom-open');
  $('closeZoomButton').focus();
}

function closeImageZoom() {
  $('imageZoom').classList.add('hidden');
  document.body.classList.remove('zoom-open');
  state.zoomPointers.clear();
  state.zoomDragging = false;
}

function getZoomBounds(scale = state.zoomScale) {
  const stage = $('zoomStage');
  const image = $('zoomImage');
  const stageRect = stage.getBoundingClientRect();

  const naturalRatio =
    image.naturalWidth && image.naturalHeight
      ? image.naturalWidth / image.naturalHeight
      : 1;

  let baseWidth = stageRect.width * 0.92;
  let baseHeight = baseWidth / naturalRatio;

  if (baseHeight > stageRect.height * 0.92) {
    baseHeight = stageRect.height * 0.92;
    baseWidth = baseHeight * naturalRatio;
  }

  const scaledWidth = baseWidth * scale;
  const scaledHeight = baseHeight * scale;

  return {
    x: Math.max(0, (scaledWidth - stageRect.width) / 2),
    y: Math.max(0, (scaledHeight - stageRect.height) / 2)
  };
}

function clampZoomPosition() {
  if (state.zoomScale <= 1) {
    state.zoomX = 0;
    state.zoomY = 0;
    return;
  }

  const bounds = getZoomBounds();

  state.zoomX = Math.min(bounds.x, Math.max(-bounds.x, state.zoomX));
  state.zoomY = Math.min(bounds.y, Math.max(-bounds.y, state.zoomY));
}

function updateZoomTransform() {
  clampZoomPosition();

  $('zoomImage').style.transform =
    `translate3d(${state.zoomX}px, ${state.zoomY}px, 0) scale(${state.zoomScale})`;

  $('zoomPercent').textContent = `${Math.round(state.zoomScale * 100)}%`;
  $('zoomStage').classList.toggle('can-pan', state.zoomScale > 1);
}

function setZoom(newScale, clientX, clientY) {
  const oldScale = state.zoomScale;
  const nextScale = Math.min(5, Math.max(1, newScale));

  if (nextScale === oldScale) {
    return;
  }

  const rect = $('zoomStage').getBoundingClientRect();
  const focusX = clientX ?? rect.left + rect.width / 2;
  const focusY = clientY ?? rect.top + rect.height / 2;
  const localX = focusX - rect.left - rect.width / 2;
  const localY = focusY - rect.top - rect.height / 2;
  const ratio = nextScale / oldScale;

  state.zoomX = localX - (localX - state.zoomX) * ratio;
  state.zoomY = localY - (localY - state.zoomY) * ratio;
  state.zoomScale = nextScale;

  updateZoomTransform();
}

function changeZoom(delta, clientX, clientY) {
  setZoom(state.zoomScale + delta, clientX, clientY);
}

function resetImageZoom() {
  state.zoomScale = 1;
  state.zoomX = 0;
  state.zoomY = 0;
  updateZoomTransform();
}

function pointerDistance(points) {
  const [a, b] = points;

  return Math.hypot(
    b.clientX - a.clientX,
    b.clientY - a.clientY
  );
}

function pointerMidpoint(points) {
  const [a, b] = points;

  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2
  };
}

function startZoomPointer(event) {
  state.zoomPointers.set(event.pointerId, event);

  const stage = $('zoomStage');

  if (state.zoomPointers.size === 2) {
    const points = [...state.zoomPointers.values()];
    state.zoomPinchDistance = pointerDistance(points);
    state.zoomPinchScale = state.zoomScale;
    state.zoomDragging = false;
    stage.classList.remove('dragging');
    return;
  }

  if (state.zoomScale > 1) {
    state.zoomDragging = true;
    state.zoomPointerX = event.clientX;
    state.zoomPointerY = event.clientY;
    stage.classList.add('dragging');
  }

  stage.setPointerCapture(event.pointerId);
}

function moveZoomPointer(event) {
  if (!state.zoomPointers.has(event.pointerId)) {
    return;
  }

  state.zoomPointers.set(event.pointerId, event);

  if (state.zoomPointers.size === 2) {
    const points = [...state.zoomPointers.values()];
    const distance = pointerDistance(points);
    const midpoint = pointerMidpoint(points);

    if (state.zoomPinchDistance > 0) {
      const scale = state.zoomPinchScale * (distance / state.zoomPinchDistance);
      setZoom(scale, midpoint.x, midpoint.y);
    }

    return;
  }

  if (!state.zoomDragging) {
    return;
  }

  state.zoomX += event.clientX - state.zoomPointerX;
  state.zoomY += event.clientY - state.zoomPointerY;
  state.zoomPointerX = event.clientX;
  state.zoomPointerY = event.clientY;

  updateZoomTransform();
}

function endZoomPointer(event) {
  state.zoomPointers.delete(event.pointerId);

  if ($('zoomStage').hasPointerCapture(event.pointerId)) {
    $('zoomStage').releasePointerCapture(event.pointerId);
  }

  if (state.zoomPointers.size < 2) {
    state.zoomPinchDistance = 0;
  }

  if (state.zoomPointers.size === 1 && state.zoomScale > 1) {
    const remaining = [...state.zoomPointers.values()][0];
    state.zoomDragging = true;
    state.zoomPointerX = remaining.clientX;
    state.zoomPointerY = remaining.clientY;
  } else {
    state.zoomDragging = false;
    $('zoomStage').classList.remove('dragging');
  }

  updateZoomTransform();
}

function handleZoomDoubleAction(event) {
  event.preventDefault();

  if (state.zoomScale > 1) {
    resetImageZoom();
  } else {
    setZoom(2, event.clientX, event.clientY);
  }
}

function handleZoomTap(event) {
  if (event.pointerType !== 'touch') {
    return;
  }

  const now = Date.now();

  if (now - state.zoomLastTap < 320) {
    handleZoomDoubleAction(event);
    state.zoomLastTap = 0;
  } else {
    state.zoomLastTap = now;
  }
}

function showLoadError(error) {
  $('deckList').innerHTML = `
    <div class="card hero">
      <strong>App could not load.</strong>
      <p>
        ${escapeHtml(error.message)}
        Run it through the included start-app.bat file.
      </p>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    })[character]
  );
}


$('progressContinueButton').addEventListener('click', startSmartTest);
$('progressWeakButton').addEventListener('click', () => startTargetedReview('weak'));
$('progressForgottenButton').addEventListener('click', () => startTargetedReview('forgotten'));

$('continueReadButton').addEventListener(
  'click',
  () => continueLastDeck('read')
);

$('continueTestButton').addEventListener(
  'click',
  () => continueLastDeck('test')
);

$('readSearchInput').addEventListener('input', (event) => {
  filterReadCards(event.target.value);
});

$('clearReadSearchButton').addEventListener('click', () => {
  $('readSearchInput').value = '';
  filterReadCards('');
  $('readSearchInput').focus();
});

$('toggleReadAnswerButton').addEventListener(
  'click',
  toggleReadAnswer
);

$('switchToTestButton').addEventListener(
  'click',
  () => openTestSetup()
);

$('setupReadButton').addEventListener(
  'click',
  () => startReadMode()
);

$('startSmartButton').addEventListener(
  'click',
  startSmartTest
);

$('startOrderedButton').addEventListener(
  'click',
  startOrderedTest
);

$('changeTestButton').addEventListener(
  'click',
  () => openTestSetup()
);

$('previousReadButton').addEventListener(
  'click',
  () => moveReadCard(-1)
);

$('nextReadButton').addEventListener(
  'click',
  () => moveReadCard(1)
);

$('revealButton').addEventListener(
  'click',
  reveal
);

$('rightButton').addEventListener(
  'click',
  () => rate(true)
);

$('wrongButton').addEventListener(
  'click',
  () => rate(false)
);

$('resetButton').addEventListener(
  'click',
  resetProgress
);

$('reviewMistakesButton').addEventListener(
  'click',
  startMistakeReview
);

$('restartOrderedButton').addEventListener(
  'click',
  startOrderedTest
);

$('resultsSmartButton').addEventListener(
  'click',
  startSmartTest
);

$('resultsHomeButton').addEventListener(
  'click',
  goHome
);

$('homeButton').addEventListener(
  'click',
  goHome
);

$('backButton').addEventListener(
  'click',
  goBack
);

for (const imageId of ['readCardImage', 'cardImage']) {
  $(imageId).addEventListener(
    'click',
    (event) => openImageZoom(event.currentTarget)
  );
}

$('closeZoomButton').addEventListener(
  'click',
  closeImageZoom
);

$('zoomInButton').addEventListener(
  'click',
  () => changeZoom(0.5)
);

$('zoomOutButton').addEventListener(
  'click',
  () => changeZoom(-0.5)
);

$('resetZoomButton').addEventListener(
  'click',
  resetImageZoom
);

$('imageZoom').addEventListener('click', (event) => {
  if (event.target === $('imageZoom')) {
    closeImageZoom();
  }
});

$('zoomStage').addEventListener('wheel', (event) => {
  event.preventDefault();
  changeZoom(event.deltaY < 0 ? 0.35 : -0.35, event.clientX, event.clientY);
}, { passive: false });

$('zoomStage').addEventListener('dblclick', handleZoomDoubleAction);
$('zoomStage').addEventListener('pointerdown', startZoomPointer);
$('zoomStage').addEventListener('pointermove', moveZoomPointer);
$('zoomStage').addEventListener('pointerup', (event) => {
  handleZoomTap(event);
  endZoomPointer(event);
});
$('zoomStage').addEventListener('pointercancel', endZoomPointer);
window.addEventListener('resize', updateZoomTransform);

document.addEventListener('keydown', (event) => {
  if (
    event.code === 'Escape' &&
    !$('imageZoom').classList.contains('hidden')
  ) {
    closeImageZoom();
    return;
  }

  if (!$('imageZoom').classList.contains('hidden')) {
    if (event.code === 'Equal' || event.code === 'NumpadAdd') {
      changeZoom(0.5);
    }

    if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
      changeZoom(-0.5);
    }

    if (event.code === 'Digit0' || event.code === 'Numpad0') {
      resetImageZoom();
    }

    return;
  }

  if (state.mode === 'read') {
    if (document.activeElement === $('readSearchInput')) {
      if (event.code === 'Escape') {
        $('readSearchInput').value = '';
        filterReadCards('');
        $('readSearchInput').blur();
      }
      return;
    }

    if (event.code === 'ArrowLeft') {
      moveReadCard(-1);
    }

    if (event.code === 'ArrowRight') {
      moveReadCard(1);
    }

    return;
  }

  if (state.mode !== 'test') {
    return;
  }

  if (
    event.code === 'Space' &&
    !state.answerVisible
  ) {
    event.preventDefault();
    reveal();
  }

  if (
    event.code === 'ArrowLeft' &&
    state.answerVisible
  ) {
    rate(false);
  }

  if (
    event.code === 'ArrowRight' &&
    state.answerVisible
  ) {
    rate(true);
  }
});

loadDeckIndex().catch(showLoadError);

if (
  'serviceWorker' in navigator &&
  location.protocol.startsWith('http')
) {
  navigator.serviceWorker
    .register('service-worker.js')
    .catch(() => {});
}
