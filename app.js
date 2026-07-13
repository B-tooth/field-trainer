const state = { deck:null, deckPath:null, current:null, shown:0 };
const $ = id => document.getElementById(id);

async function loadDeckIndex(){
  const res = await fetch('decks/index.json');
  if(!res.ok) throw new Error('Could not load deck index.');
  const data = await res.json();
  const list = $('deckList');
  for(const entry of data.decks){
    const resDeck = await fetch(entry.path);
    const deck = await resDeck.json();
    const button = document.createElement('button');
    button.className='deck-button';
    button.innerHTML=`<strong>${escapeHtml(deck.name)}</strong><span>${deck.cards.length} cards</span>`;
    button.onclick=()=>startDeck(deck, entry.path.replace(/deck\.json$/,''));
    list.appendChild(button);
  }
}

function progressKey(){ return `species-flashcards:${state.deck.id}`; }
function getProgress(){
  const empty={right:0,wrong:0,cards:{}};
  try { return {...empty,...JSON.parse(localStorage.getItem(progressKey())||'{}')}; }
  catch { return empty; }
}
function saveProgress(p){ localStorage.setItem(progressKey(),JSON.stringify(p)); }

function startDeck(deck, path){
  state.deck=deck; state.deckPath=path; state.shown=0;
  $('homeView').classList.add('hidden'); $('studyView').classList.remove('hidden'); $('homeButton').classList.remove('hidden');
  $('deckName').textContent=deck.name;
  updateStats(); chooseCard();
}

function cardWeight(card,p){
  const cp=p.cards[card.id]||{right:0,wrong:0};
  return Math.max(1, 1 + cp.wrong*2 - cp.right*0.35);
}
function chooseCard(){
  const p=getProgress();
  let pool=state.deck.cards.filter(c=>!state.current || c.id!==state.current.id);
  if(pool.length===0) pool=state.deck.cards;
  const weights=pool.map(c=>cardWeight(c,p));
  let pick=Math.random()*weights.reduce((a,b)=>a+b,0);
  let chosen=pool[0];
  for(let i=0;i<pool.length;i++){ pick-=weights[i]; if(pick<=0){chosen=pool[i];break;} }
  state.current=chosen; state.shown++;
  $('cardImage').src=state.deckPath+chosen.image;
  $('answerText').textContent=chosen.answer;
  $('answerPanel').classList.add('hidden'); $('ratingControls').classList.add('hidden'); $('revealControls').classList.remove('hidden');
  $('progressText').textContent=`Card ${state.shown}`;
}
function reveal(){ $('answerPanel').classList.remove('hidden'); $('revealControls').classList.add('hidden'); $('ratingControls').classList.remove('hidden'); }
function rate(isRight){
  const p=getProgress();
  p.cards[state.current.id] ||= {right:0,wrong:0};
  if(isRight){p.right++;p.cards[state.current.id].right++;} else {p.wrong++;p.cards[state.current.id].wrong++;}
  saveProgress(p); updateStats(); chooseCard();
}
function updateStats(){
  const p=getProgress(), total=p.right+p.wrong;
  $('rightCount').textContent=p.right; $('wrongCount').textContent=p.wrong;
  $('accuracy').textContent=total?`${Math.round(p.right/total*100)}%`:'—';
}
function resetProgress(){
  if(confirm(`Reset all saved results for ${state.deck.name}?`)){ localStorage.removeItem(progressKey()); updateStats(); chooseCard(); }
}
function goHome(){
  state.deck=null; $('studyView').classList.add('hidden'); $('homeView').classList.remove('hidden'); $('homeButton').classList.add('hidden');
}
function escapeHtml(s){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

$('revealButton').onclick=reveal; $('rightButton').onclick=()=>rate(true); $('wrongButton').onclick=()=>rate(false); $('resetButton').onclick=resetProgress; $('homeButton').onclick=goHome;
loadDeckIndex().catch(err=>{ $('deckList').innerHTML=`<div class="card intro"><strong>App could not load.</strong><p>${escapeHtml(err.message)} Run it through a local web server rather than double-clicking index.html.</p></div>`; });
if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('service-worker.js').catch(()=>{});
