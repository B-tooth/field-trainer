'use strict';

const state = {
  deck: null, deckPath: null, deckIndexPath: null, mode: null,
  availableDecks: [], lastDeck: null,
  readCards: [], readIndex: 0, readFilter: '', readAnswerHidden: true,
  learnOrder: 'ordered',
  testQueue: [], testPosition: 0, testResults: [], current: null,
  reviewQueue: [], reviewRight: 0, reviewWrong: 0,
  zoomScale: 1, zoomX: 0, zoomY: 0, zoomDragging: false,
  zoomPointerX: 0, zoomPointerY: 0, zoomPointers: new Map(),
  zoomPinchDistance: 0, zoomPinchScale: 1, zoomLastTap: 0
};

const $ = (id) => document.getElementById(id);
const DECK_INDEX = '../decks/index.json';
const LAST_DECK_KEY = 'field-trainer:last-deck';
const TEST_SESSION_PREFIX = 'field-trainer:test-session:';
const viewIds = ['homeView','readView','testSetupView','studyView','resultsView','progressView'];

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load ${path}.`);
  return response.json();
}

function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
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
  state.availableDecks = [];
  $('deckList').replaceChildren();
  for (const entry of data.decks) {
    const deck = await fetchJson(`../${entry.path}`);
    const path = `../${entry.path.replace(/deck\.json$/, '')}`;
    FieldTrainerLearning.prepareDeck(deck);
    state.availableDecks.push({ deck, path, indexPath: entry.path });
  }
  $('deckCount').textContent = `${state.availableDecks.length} ${state.availableDecks.length === 1 ? 'study area' : 'study areas'}`;
  state.lastDeck = getLastDeck();
  renderContinuePanel();
  for (const item of state.availableDecks) renderDeckCard(item.deck, item.path, item.indexPath);
}

function getDeckSummary(deck) {
  const progress = FieldTrainerLearning.getDeckProgress(deck);
  const weak = FieldTrainerLearning.getWeakCardIds(deck).length;
  return {
    score: progress.fieldReadiness,
    band: progress.readinessBand,
    weak,
    totalCards: deck.cards.length,
    progress
  };
}

function renderDeckCard(deck, path, indexPath) {
  const summary = getDeckSummary(deck);
  const hasScore = summary.score != null;
  const savedTest = loadTestSession(deck.id);
  const article = document.createElement('article');
  article.className = `deck-card card${state.lastDeck?.id === deck.id ? ' last-deck' : ''}`;
  article.innerHTML = `
    <div class="deck-card-top">
      <div>
        <div class="deck-title-row"><h3>${escapeHtml(deck.name)}</h3>${state.lastDeck?.id === deck.id ? '<span class="resume-badge">Last used</span>' : ''}</div>
        <p class="deck-meta">${deck.cards.length} cards · ${summary.progress.completedTests} completed ${summary.progress.completedTests === 1 ? 'test' : 'tests'}</p>
      </div>
      <div class="deck-readiness"><strong>${hasScore ? summary.score : '—'}</strong><span>${hasScore ? summary.band : 'New'}</span></div>
    </div>
    <div class="mini-progress"><span style="width:${hasScore ? summary.score : 0}%"></span></div>
    <div class="deck-actions deck-actions-study">
      <button class="secondary progress-deck-button">Progress</button>
      <button class="secondary learn-deck-button">Learn</button>
      <button class="primary test-deck-button">${savedTest ? `Continue Test · ${savedTest.position}/${savedTest.queue.length}` : 'Test'}</button>
      <button class="secondary weak-deck-button" ${summary.weak ? '' : 'disabled'}>${summary.weak ? `Review Weak · ${summary.weak}` : 'No Weak Cards'}</button>
    </div>`;
  article.querySelector('.progress-deck-button').addEventListener('click', () => openProgressDashboard(deck, path, indexPath));
  article.querySelector('.learn-deck-button').addEventListener('click', () => openLearnSetup(deck, path, indexPath));
  article.querySelector('.test-deck-button').addEventListener('click', () => startOrResumeTest(deck, path, indexPath));
  article.querySelector('.weak-deck-button').addEventListener('click', () => startWeakReview(deck, path, indexPath));
  $('deckList').appendChild(article);
}

function setDeck(deck, path, indexPath) {
  if (deck && path) {
    state.deck = deck; state.deckPath = path; state.deckIndexPath = indexPath || state.deckIndexPath;
    FieldTrainerLearning.prepareDeck(deck); saveLastDeck(state.deckIndexPath);
  }
}
function ensureDeck(deck, path, indexPath) { if (deck && path) setDeck(deck, path, indexPath); }

function saveLastDeck(indexPath) {
  if (!state.deck || !indexPath) return;
  const saved = { id: state.deck.id, name: state.deck.name, indexPath, updatedAt: new Date().toISOString() };
  localStorage.setItem(LAST_DECK_KEY, JSON.stringify(saved)); state.lastDeck = saved;
}
function getLastDeck() { try { return JSON.parse(localStorage.getItem(LAST_DECK_KEY) || 'null'); } catch { return null; } }
function getLastDeckItem() { return state.availableDecks.find((item) => item.deck.id === state.lastDeck?.id) || null; }
function renderContinuePanel() {
  const item = getLastDeckItem(); $('continuePanel').classList.toggle('hidden', !item); if (!item) return;
  const summary = getDeckSummary(item.deck); const saved = loadTestSession(item.deck.id);
  $('continueDeckDetails').textContent = `${item.deck.name} · ${item.deck.cards.length} cards · ${summary.score == null ? 'No Field Readiness yet' : `${summary.score} Field Readiness`}`;
  $('continueReadButton').textContent = 'Learn';
  $('continueTestButton').textContent = saved ? `Continue Test · ${saved.position}/${saved.queue.length}` : 'Test';
}
function continueLastDeck(mode) { const item = getLastDeckItem(); if (!item) return; mode === 'read' ? openLearnSetup(item.deck,item.path,item.indexPath) : startOrResumeTest(item.deck,item.path,item.indexPath); }

/* LEARN ---------------------------------------------------------------- */
function openLearnSetup(deck, path, indexPath) {
  ensureDeck(deck,path,indexPath); state.mode = 'test-setup';
  $('testSetupDeckName').textContent = state.deck.name;
  $('testSetupTitle').textContent = 'Choose how to learn';
  $('smartOptionEyebrow').textContent = 'STRUCTURED'; $('smartOptionTitle').textContent = 'In Order';
  $('smartOptionText').textContent = 'Work through every card in its original slide order. Learning does not affect Field Readiness.';
  $('startSmartButton').textContent = 'Learn In Order';
  $('orderedOptionEyebrow').textContent = 'MIX IT UP'; $('orderedOptionTitle').textContent = 'Random';
  $('orderedOptionText').textContent = 'Work through every card once in a shuffled order. Learning does not affect Field Readiness.';
  $('startOrderedButton').textContent = 'Learn Random';
  $('setupReadButton').classList.add('hidden');
  showView('testSetupView');
}

function startLearn(order) {
  state.mode = 'read'; state.learnOrder = order; state.readIndex = 0; state.readFilter = '';
  state.readCards = order === 'random' ? shuffle(state.deck.cards) : [...state.deck.cards];
  state.readAnswerHidden = true;
  $('readDeckName').textContent = state.deck.name;
  $('readModeHeading').textContent = order === 'random' ? 'Learn · Random' : 'Learn · In Order';
  $('readSearchInput').value = ''; updateReadAnswerVisibility(); renderReadCard(); showView('readView');
}
function animateCard(id) { const element=$(id); element.classList.remove('card-enter'); void element.offsetWidth; element.classList.add('card-enter'); }
function renderReadCard() {
  const hasCards = state.readCards.length > 0;
  $('readFlashcard').classList.toggle('hidden', !hasCards); $('readNoResults').classList.toggle('hidden', hasCards);
  $('previousReadButton').classList.toggle('hidden', !hasCards); $('nextReadButton').classList.toggle('hidden', !hasCards);
  if (!hasCards) return;
  const card=state.readCards[state.readIndex], current=state.readIndex+1, total=state.readCards.length;
  $('readCardImage').src=`${state.deckPath}${card.image}`; $('readCardImage').alt='Learning card'; $('readAnswerText').textContent=card.answer;
  $('readProgress').textContent=`${current} of ${total}`; $('readProgressBar').style.width=`${current/total*100}%`;
  $('previousReadButton').disabled=state.readIndex===0; $('nextReadButton').textContent=state.readIndex===total-1?'Finish ↻':'Next →';
  $('readSearchSummary').classList.toggle('hidden', !state.readFilter);
  $('readSearchSummary').textContent=state.readFilter?`${total} matching cards`:''; animateCard('readFlashcard');
}
function moveReadCard(direction) {
  if (direction<0 && state.readIndex>0) state.readIndex-=1;
  if (direction>0) state.readIndex=state.readIndex===state.readCards.length-1?0:state.readIndex+1;
  state.readAnswerHidden=true; updateReadAnswerVisibility(); renderReadCard(); window.scrollTo({top:0,behavior:'smooth'});
}
function filterReadCards(query) {
  state.readFilter=query.trim(); const q=state.readFilter.toLocaleLowerCase();
  const base=state.learnOrder==='random'?state.readCards:[...state.deck.cards];
  state.readCards=q?state.deck.cards.filter((card)=>card.answer.toLocaleLowerCase().includes(q)): (state.learnOrder==='random'?shuffle(state.deck.cards):[...state.deck.cards]);
  state.readIndex=0; renderReadCard();
}
function updateReadAnswerVisibility() {
  $('readAnswerPanel').classList.toggle('hidden', state.readAnswerHidden);
  $('toggleReadAnswerButton').classList.toggle('hidden', !state.readAnswerHidden);
  $('toggleReadAnswerButton').textContent = 'Show answer';
}

function toggleReadAnswer() {
  state.readAnswerHidden = false;
  updateReadAnswerVisibility();
}

/* TEST ----------------------------------------------------------------- */
function testSessionKey(deckId){return `${TEST_SESSION_PREFIX}${deckId}`;}
function loadTestSession(deckId){try{return JSON.parse(localStorage.getItem(testSessionKey(deckId))||'null');}catch{return null;}}
function saveTestSession(){
  if(!state.deck||state.mode!=='test'||state.testType!=='multiple-choice')return;
  localStorage.setItem(testSessionKey(state.deck.id),JSON.stringify({queue:state.testQueue.map(c=>c.id),position:state.testPosition,results:state.testResults,updatedAt:new Date().toISOString()}));
}
function clearTestSession(){if(state.deck)localStorage.removeItem(testSessionKey(state.deck.id));}
function startOrResumeTest(deck,path,indexPath){
  ensureDeck(deck,path,indexPath); const saved=loadTestSession(state.deck.id);
  if(saved&&Array.isArray(saved.queue)&&saved.position<saved.queue.length){resumeTest(saved);return;}
  startNewTest();
}
function startNewTest(){
  FieldTrainerLearning.recordSessionStart(state.deck); state.mode='test'; state.testType='multiple-choice';
  state.testQueue=shuffle(state.deck.cards); state.testPosition=0; state.testResults=[]; saveTestSession(); showTestCard(); showView('studyView');
}
function resumeTest(saved){
  state.mode='test'; state.testType='multiple-choice';
  const byId=new Map(state.deck.cards.map(c=>[c.id,c])); state.testQueue=saved.queue.map(id=>byId.get(id)).filter(Boolean);
  state.testPosition=Math.min(Number(saved.position)||0,state.testQueue.length-1); state.testResults=Array.isArray(saved.results)?saved.results:[];
  showTestCard(); showView('studyView');
}
function buildChoices(card){
  const unique=[...new Set(state.deck.cards.map(c=>c.answer))].filter(answer=>answer!==card.answer);
  return shuffle([card.answer,...shuffle(unique).slice(0,3)]);
}
function showTestCard(){
  const card=state.testQueue[state.testPosition]; if(!card){finishTest();return;} state.current=card;
  $('deckName').textContent=state.deck.name; $('testHeading').textContent='Test';
  $('cardImage').src=`${state.deckPath}${card.image}`; $('cardImage').alt='Multiple-choice test card';
  $('answerPanel').classList.add('hidden'); $('revealControls').classList.add('hidden'); $('ratingControls').classList.add('hidden');
  $('multipleChoiceControls').classList.remove('hidden'); $('testStats').classList.add('hidden');
  const choices=buildChoices(card); const container=$('multipleChoiceControls'); container.replaceChildren();
  choices.forEach((answer)=>{const button=document.createElement('button');button.className='choice-button secondary';button.textContent=answer;button.addEventListener('click',()=>answerChoice(answer));container.appendChild(button);});
  $('progressText').textContent=`Question ${state.testPosition+1} of ${state.testQueue.length}`;
  $('testProgressBar').style.width=`${state.testPosition/state.testQueue.length*100}%`; animateCard('testFlashcard');
}
function answerChoice(answer){
  const correct=answer===state.current.answer; state.testResults.push({cardId:state.current.id,correct}); state.testPosition+=1; saveTestSession();
  if(state.testPosition>=state.testQueue.length)finishTest();else showTestCard();
}
function finishTest(){
  const result=FieldTrainerLearning.recordCompletedTest(state.deck,state.testResults); clearTestSession();
  const right=state.testResults.filter(r=>r.correct).length, total=state.testResults.length, wrong=total-right;
  showResults('test',right,wrong,`Field Readiness is now ${result.fieldReadiness}.`);
}
function restartTest(){
  if(loadTestSession(state.deck.id)&&!confirm('Restart this Test? Your unfinished Test progress will be discarded.'))return;
  clearTestSession();startNewTest();
}

/* REVIEW WEAK ---------------------------------------------------------- */
function getWeakCards(){const ids=new Set(FieldTrainerLearning.getWeakCardIds(state.deck));return state.deck.cards.filter(c=>ids.has(c.id));}
function startWeakReview(deck,path,indexPath){
  ensureDeck(deck,path,indexPath); const weak=getWeakCards(); if(!weak.length){openProgressDashboard();return;}
  FieldTrainerLearning.recordSessionStart(state.deck); state.mode='test';state.testType='weak';state.reviewQueue=shuffle(weak);state.reviewRight=0;state.reviewWrong=0;showWeakCard();showView('studyView');
}
function showWeakCard(){
  if(!state.reviewQueue.length){showResults('weak',state.reviewRight,state.reviewWrong,'Every weak card was answered correctly at least once in this review.');return;}
  state.current=state.reviewQueue[0]; $('deckName').textContent=state.deck.name;$('testHeading').textContent='Review Weak Cards';
  $('cardImage').src=`${state.deckPath}${state.current.image}`;$('answerText').textContent=state.current.answer;
  $('answerPanel').classList.add('hidden');$('revealControls').classList.remove('hidden');$('ratingControls').classList.add('hidden');$('multipleChoiceControls').classList.add('hidden');$('testStats').classList.remove('hidden');
  $('rightCount').textContent=state.reviewRight;$('wrongCount').textContent=state.reviewWrong;const total=state.reviewRight+state.reviewWrong;$('accuracy').textContent=total?`${Math.round(state.reviewRight/total*100)}%`:'—';
  $('progressText').textContent=`${state.reviewQueue.length} weak ${state.reviewQueue.length===1?'card':'cards'} remaining`;$('testProgressBar').style.width='0%';animateCard('testFlashcard');
}
function reveal(){if(state.testType!=='weak')return;$('answerPanel').classList.remove('hidden');$('revealControls').classList.add('hidden');$('ratingControls').classList.remove('hidden');}
function rateWeak(isRight){
  if(state.testType!=='weak'||$('answerPanel').classList.contains('hidden'))return;
  const card=state.reviewQueue.shift();
  if(isRight)state.reviewRight+=1;else{state.reviewWrong+=1;state.reviewQueue.push(card);}
  showWeakCard();
}

/* PROGRESS ------------------------------------------------------------- */
function openProgressDashboard(deck,path,indexPath){
  ensureDeck(deck,path,indexPath);state.mode='progress';const summary=getDeckSummary(state.deck);const score=summary.score;
  $('progressDeckName').textContent=state.deck.name;$('progressReadinessScore').textContent=score==null?'—':score;
  $('progressReadinessBand').textContent=score==null?'Complete a Test to set Field Readiness':summary.band;$('progressReadinessBar').style.width=`${score||0}%`;
  $('progressCardCount').textContent=summary.totalCards;$('progressReviewCount').textContent=summary.progress.totalTestAnswers;
  $('progressSessionCount').textContent=summary.progress.completedTests;$('progressNeedsPractice').textContent=summary.weak;
  $('progressForgottenMetric').classList.add('hidden');
  $('progressContinueButton').textContent=loadTestSession(state.deck.id)?`Continue Test · ${loadTestSession(state.deck.id).position}/${loadTestSession(state.deck.id).queue.length}`:'Start Test';
  $('progressWeakButton').disabled=summary.weak===0;$('progressWeakButton').textContent=summary.weak?`Review Weak Cards (${summary.weak})`:'No Weak Cards';
  $('progressForgottenButton').classList.add('hidden');$('progressActionNote').textContent='Only completed Tests affect Field Readiness. Learn and Review are practice only.';
  showView('progressView');
}

function showResults(type,right,wrong,message){
  state.mode='results';const total=right+wrong,accuracy=total?Math.round(right/total*100):0;
  $('resultsDeckName').textContent=state.deck.name;$('resultsTitle').textContent=type==='test'?'Test complete':'Weak card review complete';
  $('resultsMessage').textContent=message;$('resultsAccuracy').textContent=`${accuracy}%`;$('resultsRight').textContent=right;$('resultsWrong').textContent=wrong;$('resultsTotal').textContent=total;
  $('reviewMistakesButton').classList.add('hidden');$('restartOrderedButton').classList.add('hidden');$('resultsSmartButton').textContent=type==='test'?'Test Again':'Start Test';
  showView('resultsView');
}

function resetProgress(){if(!confirm(`Reset all saved results for ${state.deck.name}?`))return;FieldTrainerLearning.resetDeck(state.deck.id);FieldTrainerLearning.prepareDeck(state.deck);goHome();}
function goHome(){state.mode=null;state.deck=null;state.deckPath=null;showView('homeView');loadDeckIndex().catch(showLoadError);}
function goBack(){if(state.mode==='test'&&state.testType==='multiple-choice'){saveTestSession();goHome();return;}if(state.mode==='read'||state.mode==='progress'||state.mode==='results'||state.mode==='test')goHome();else goHome();}

/* IMAGE ZOOM ----------------------------------------------------------- */
function openImageZoom(sourceImage){const z=$('zoomImage');z.src=sourceImage.src;z.alt=sourceImage.alt||'Zoomed flashcard image';state.zoomScale=1;state.zoomX=0;state.zoomY=0;state.zoomDragging=false;state.zoomPointers.clear();state.zoomPinchDistance=0;state.zoomPinchScale=1;updateZoomTransform();$('imageZoom').classList.remove('hidden');document.body.classList.add('zoom-open');$('closeZoomButton').focus();}
function closeImageZoom(){$('imageZoom').classList.add('hidden');document.body.classList.remove('zoom-open');state.zoomPointers.clear();state.zoomDragging=false;}
function getZoomBounds(scale=state.zoomScale){const s=$('zoomStage'),i=$('zoomImage'),r=s.getBoundingClientRect(),ratio=i.naturalWidth&&i.naturalHeight?i.naturalWidth/i.naturalHeight:1;let w=r.width*.92,h=w/ratio;if(h>r.height*.92){h=r.height*.92;w=h*ratio;}return{x:Math.max(0,(w*scale-r.width)/2),y:Math.max(0,(h*scale-r.height)/2)};}
function clampZoomPosition(){if(state.zoomScale<=1){state.zoomX=0;state.zoomY=0;return;}const b=getZoomBounds();state.zoomX=Math.min(b.x,Math.max(-b.x,state.zoomX));state.zoomY=Math.min(b.y,Math.max(-b.y,state.zoomY));}
function updateZoomTransform(){clampZoomPosition();$('zoomImage').style.transform=`translate3d(${state.zoomX}px,${state.zoomY}px,0) scale(${state.zoomScale})`;$('zoomPercent').textContent=`${Math.round(state.zoomScale*100)}%`;$('zoomStage').classList.toggle('can-pan',state.zoomScale>1);}
function setZoom(newScale,clientX,clientY){const old=state.zoomScale,next=Math.min(5,Math.max(1,newScale));if(next===old)return;const r=$('zoomStage').getBoundingClientRect(),fx=clientX??r.left+r.width/2,fy=clientY??r.top+r.height/2,lx=fx-r.left-r.width/2,ly=fy-r.top-r.height/2,ratio=next/old;state.zoomX=lx-(lx-state.zoomX)*ratio;state.zoomY=ly-(ly-state.zoomY)*ratio;state.zoomScale=next;updateZoomTransform();}
function changeZoom(delta,x,y){setZoom(state.zoomScale+delta,x,y);}function resetImageZoom(){state.zoomScale=1;state.zoomX=0;state.zoomY=0;updateZoomTransform();}
function pointerDistance(p){return Math.hypot(p[1].clientX-p[0].clientX,p[1].clientY-p[0].clientY);}function pointerMidpoint(p){return{x:(p[0].clientX+p[1].clientX)/2,y:(p[0].clientY+p[1].clientY)/2};}
function startZoomPointer(e){state.zoomPointers.set(e.pointerId,e);const s=$('zoomStage');if(state.zoomPointers.size===2){const p=[...state.zoomPointers.values()];state.zoomPinchDistance=pointerDistance(p);state.zoomPinchScale=state.zoomScale;state.zoomDragging=false;return;}if(state.zoomScale>1){state.zoomDragging=true;state.zoomPointerX=e.clientX;state.zoomPointerY=e.clientY;}s.setPointerCapture(e.pointerId);}
function moveZoomPointer(e){if(!state.zoomPointers.has(e.pointerId))return;state.zoomPointers.set(e.pointerId,e);if(state.zoomPointers.size===2){const p=[...state.zoomPointers.values()],d=pointerDistance(p),m=pointerMidpoint(p);if(state.zoomPinchDistance>0)setZoom(state.zoomPinchScale*(d/state.zoomPinchDistance),m.x,m.y);return;}if(!state.zoomDragging)return;state.zoomX+=e.clientX-state.zoomPointerX;state.zoomY+=e.clientY-state.zoomPointerY;state.zoomPointerX=e.clientX;state.zoomPointerY=e.clientY;updateZoomTransform();}
function endZoomPointer(e){state.zoomPointers.delete(e.pointerId);state.zoomDragging=false;updateZoomTransform();}
function handleZoomDoubleAction(e){e.preventDefault();state.zoomScale>1?resetImageZoom():setZoom(2,e.clientX,e.clientY);}
function handleZoomTap(e){if(e.pointerType!=='touch')return;const n=Date.now();if(n-state.zoomLastTap<320){handleZoomDoubleAction(e);state.zoomLastTap=0;}else state.zoomLastTap=n;}
function showLoadError(error){$('deckList').innerHTML=`<div class="card hero"><strong>App could not load.</strong><p>${escapeHtml(error.message)}</p></div>`;}
function escapeHtml(value){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

/* EVENTS --------------------------------------------------------------- */
$('continueReadButton').addEventListener('click',()=>continueLastDeck('read'));
$('continueTestButton').addEventListener('click',()=>continueLastDeck('test'));
$('startSmartButton').addEventListener('click',()=>startLearn('ordered'));
$('startOrderedButton').addEventListener('click',()=>startLearn('random'));
$('setupReadButton').addEventListener('click',()=>startLearn('ordered'));
$('switchToTestButton').addEventListener('click',()=>startOrResumeTest());
$('previousReadButton').addEventListener('click',()=>moveReadCard(-1));$('nextReadButton').addEventListener('click',()=>moveReadCard(1));
$('readSearchInput').addEventListener('input',e=>filterReadCards(e.target.value));$('clearReadSearchButton').addEventListener('click',()=>{$('readSearchInput').value='';filterReadCards('');});$('toggleReadAnswerButton').addEventListener('click',toggleReadAnswer);
$('revealButton').addEventListener('click',reveal);$('rightButton').addEventListener('click',()=>rateWeak(true));$('wrongButton').addEventListener('click',()=>rateWeak(false));$('resetButton').addEventListener('click',resetProgress);
$('progressContinueButton').addEventListener('click',()=>startOrResumeTest());$('progressWeakButton').addEventListener('click',()=>startWeakReview());
$('resultsSmartButton').addEventListener('click',()=>startOrResumeTest());$('resultsHomeButton').addEventListener('click',goHome);$('restartOrderedButton').addEventListener('click',restartTest);$('reviewMistakesButton').addEventListener('click',()=>startWeakReview());
$('homeButton').addEventListener('click',goHome);$('backButton').addEventListener('click',goBack);
for(const id of ['readCardImage','cardImage'])$(id).addEventListener('click',e=>openImageZoom(e.currentTarget));
$('closeZoomButton').addEventListener('click',closeImageZoom);$('zoomInButton').addEventListener('click',()=>changeZoom(.5));$('zoomOutButton').addEventListener('click',()=>changeZoom(-.5));$('resetZoomButton').addEventListener('click',resetImageZoom);
$('imageZoom').addEventListener('click',e=>{if(e.target===$('imageZoom'))closeImageZoom();});$('zoomStage').addEventListener('wheel',e=>{e.preventDefault();changeZoom(e.deltaY<0?.35:-.35,e.clientX,e.clientY);},{passive:false});$('zoomStage').addEventListener('dblclick',handleZoomDoubleAction);$('zoomStage').addEventListener('pointerdown',startZoomPointer);$('zoomStage').addEventListener('pointermove',moveZoomPointer);$('zoomStage').addEventListener('pointerup',e=>{handleZoomTap(e);endZoomPointer(e);});$('zoomStage').addEventListener('pointercancel',endZoomPointer);window.addEventListener('resize',updateZoomTransform);
document.addEventListener('keydown',e=>{if(e.code==='Escape'&&!$('imageZoom').classList.contains('hidden')){closeImageZoom();return;}if(state.mode==='read'){if(e.code==='ArrowLeft')moveReadCard(-1);if(e.code==='ArrowRight')moveReadCard(1);}if(state.testType==='weak'){if(e.code==='Space'&&$('answerPanel').classList.contains('hidden')){e.preventDefault();reveal();}if(e.code==='ArrowLeft'&&!$('answerPanel').classList.contains('hidden'))rateWeak(false);if(e.code==='ArrowRight'&&!$('answerPanel').classList.contains('hidden'))rateWeak(true);}});

loadDeckIndex().catch(showLoadError);
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('service-worker.js').catch(()=>{});
