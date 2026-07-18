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
  zoomScale: 1,
  zoomX: 0,
  zoomY: 0,
  zoomDragging: false,
  zoomPointerX: 0,
  zoomPointerY: 0,
  zoomPointers: new Map(),
  zoomPinchDistance: 0,
  zoomPinchScale: 1,
  zoomLastTap: 0
};

const $ = (id) => document.getElementById(id);

const DECK_INDEX = '../decks/index.json';

const viewIds = [
  'homeView',
  'readView',
  'testSetupView',
  'studyView',
  'resultsView'
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

  for (const entry of data.decks) {
    const deck = await fetchJson(`../${entry.path}`);
    const deckFolder = `../${entry.path.replace(/deck\.json$/, '')}`;
    const progress = getProgressFor(deck.id);
    const totalAnswers = progress.right + progress.wrong;

    const accuracy = totalAnswers
      ? `${Math.round((progress.right / totalAnswers) * 100)}% accuracy`
      : 'Not started';

    const article = document.createElement('article');

    article.className = 'deck-card card';

    article.innerHTML = `
      <div class="deck-card-top">
        <div>
          <h3>${escapeHtml(deck.name)}</h3>
          <p class="deck-meta">
            ${deck.cards.length} cards · ${accuracy}
          </p>
        </div>

        <span class="deck-icon" aria-hidden="true">◉</span>
      </div>

      <div class="deck-actions">
        <button class="secondary read-deck-button">Read</button>
        <button class="primary test-deck-button">Test</button>
      </div>
    `;

    article
      .querySelector('.read-deck-button')
      .addEventListener('click', () => startReadMode(deck, deckFolder));

    article
      .querySelector('.test-deck-button')
      .addEventListener('click', () => openTestSetup(deck, deckFolder));

    list.appendChild(article);
  }
}

function progressKey(deckId) {
  return `species-flashcards:${deckId}`;
}

function getProgressFor(deckId) {
  const empty = {
    right: 0,
    wrong: 0,
    cards: {}
  };

  try {
    const saved = JSON.parse(
      localStorage.getItem(progressKey(deckId)) || '{}'
    );

    return {
      ...empty,
      ...saved,
      cards: saved.cards || {}
    };
  } catch {
    return empty;
  }
}

function getProgress() {
  return getProgressFor(state.deck.id);
}

function saveProgress(progress) {
  localStorage.setItem(
    progressKey(state.deck.id),
    JSON.stringify(progress)
  );
}

function setDeck(deck, path) {
  state.deck = deck;
  state.deckPath = path;
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
}

function ensureDeck(deck, path) {
  if (deck && path) {
    setDeck(deck, path);
  }
}

function startReadMode(deck, path) {
  ensureDeck(deck, path);

  state.mode = 'read';
  state.testType = null;
  state.readIndex = 0;

  $('readDeckName').textContent = state.deck.name;

  renderReadCard();
  showView('readView');
}

function renderReadCard() {
  const card = state.deck.cards[state.readIndex];
  const currentNumber = state.readIndex + 1;
  const total = state.deck.cards.length;

  $('readCardImage').src = `${state.deckPath}${card.image}`;
  $('readCardImage').alt = `${card.answer} slide`;
  $('readAnswerText').textContent = card.answer;
  $('readProgress').textContent = `${currentNumber} of ${total}`;
  $('readProgressBar').style.width =
    `${(currentNumber / total) * 100}%`;

  $('previousReadButton').disabled = state.readIndex === 0;

  $('nextReadButton').textContent =
    state.readIndex === total - 1
      ? 'Back to start ↻'
      : 'Next →';
}

function moveReadCard(direction) {
  if (direction < 0 && state.readIndex > 0) {
    state.readIndex -= 1;
  }

  if (direction > 0) {
    state.readIndex =
      state.readIndex === state.deck.cards.length - 1
        ? 0
        : state.readIndex + 1;
  }

  renderReadCard();

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

function openTestSetup(deck, path) {
  ensureDeck(deck, path);

  state.mode = 'test-setup';
  state.testType = null;
  state.current = null;
  state.answerVisible = false;

  $('testSetupDeckName').textContent = state.deck.name;

  showView('testSetupView');
}

function startSmartTest() {
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

  state.reviewCards = [...state.mistakeCards];
  state.mistakeCards = [];
  state.reviewIndex = 0;
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

  if (state.testType === 'review') {
    const reviewTotal = state.reviewCards.length;
    const currentNumber = state.reviewIndex + 1;

    $('progressText').textContent =
      `Mistake ${currentNumber} of ${reviewTotal}`;

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

  if (state.testType === 'review') {
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
  const progress = getProgress();

  progress.cards[state.current.id] ||= {
    right: 0,
    wrong: 0
  };

  if (isRight) {
    progress.right += 1;
    progress.cards[state.current.id].right += 1;
    state.sessionRight += 1;
  } else {
    progress.wrong += 1;
    progress.cards[state.current.id].wrong += 1;
    state.sessionWrong += 1;

    const alreadyRecorded = state.mistakeCards.some(
      (card) => card.id === state.current.id
    );

    if (!alreadyRecorded) {
      state.mistakeCards.push(state.current);
    }
  }

  saveProgress(progress);
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

  const isReview = completedTestType === 'review';

  $('resultsDeckName').textContent = state.deck.name;
  $('resultsTitle').textContent =
    isReview ? 'Review complete' : 'Test complete';
  $('resultsMessage').textContent =
    isReview
      ? 'You have reviewed every card from your previous mistakes.'
      : 'You have completed this test session.';
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

  localStorage.removeItem(progressKey(state.deck.id));

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

  if (state.testType === 'review') {
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
