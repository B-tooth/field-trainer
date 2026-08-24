'use strict';

/** Field Trainer v0.7.4 learning engine. */
const FieldTrainerLearning = (() => {
  const STORAGE_KEY = 'field-trainer:learning-data';
  const SCHEMA_VERSION = 3;
  const TEST_HISTORY_LIMIT = 50;

  const nowIso = () => new Date().toISOString();
  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

  function emptyDatabase() {
    return { version: SCHEMA_VERSION, updatedAt: null, studyAreas: {} };
  }

  function emptyCardRecord(cardId) {
    return {
      id: cardId,
      testCorrect: 0,
      testWrong: 0,
      lastTestCorrect: null,
      lastTestedAt: null
    };
  }

  function emptyStudyArea(deck) {
    return {
      id: deck.id,
      name: deck.name,
      sessions: 0,
      completedTests: 0,
      testHistory: [],
      lastCompletedTestAt: null,
      legacyReadiness: null,
      cards: {},
      updatedAt: null
    };
  }

  function loadDatabase() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return emptyDatabase();
      return { ...emptyDatabase(), ...raw, version: SCHEMA_VERSION, studyAreas: raw.studyAreas || {} };
    } catch {
      return emptyDatabase();
    }
  }

  function saveDatabase(database) {
    database.version = SCHEMA_VERSION;
    database.updatedAt = nowIso();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
  }

  function ensureArea(database, deck) {
    const existing = database.studyAreas[deck.id];
    if (!existing) {
      database.studyAreas[deck.id] = emptyStudyArea(deck);
    }
    const area = database.studyAreas[deck.id];
    area.id = deck.id;
    area.name = deck.name;
    area.sessions = Number(area.sessions) || 0;
    area.completedTests = Number(area.completedTests) || 0;
    area.testHistory = Array.isArray(area.testHistory) ? area.testHistory : [];
    area.cards = area.cards || {};

    // Preserve the old v0.7.x readiness as a display-only baseline until the
    // learner completes their first v0.7.4 multiple-choice Test.
    if (!area.testHistory.length && area.legacyReadiness == null) {
      const oldScores = deck.cards
        .map((card) => Number(area.cards?.[card.id]?.fieldReadiness))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (oldScores.length) {
        area.legacyReadiness = Math.round(oldScores.reduce((a, b) => a + b, 0) / oldScores.length);
      }
    }

    for (const card of deck.cards) {
      const old = area.cards[card.id] || {};
      area.cards[card.id] = {
        ...old,
        ...emptyCardRecord(card.id),
        testCorrect: Number(old.testCorrect) || 0,
        testWrong: Number(old.testWrong) || 0,
        lastTestCorrect: typeof old.lastTestCorrect === 'boolean' ? old.lastTestCorrect : null,
        lastTestedAt: old.lastTestedAt || null
      };
    }
    return area;
  }

  function weightedTestScore(history) {
    const scores = history.slice(-3).map((entry) => Number(entry.percentage) || 0);
    if (!scores.length) return null;
    if (scores.length >= 3 && scores.slice(-3).every((score) => score === 100)) return 100;

    const weightsByCount = {
      1: [1],
      2: [0.375, 0.625], // older, latest = normalised 30/50
      3: [0.2, 0.3, 0.5]
    };
    const weights = weightsByCount[scores.length];
    return Math.round(scores.reduce((sum, score, index) => sum + score * weights[index], 0));
  }

  function applyDecay(baseScore, lastCompletedTestAt, now = new Date()) {
    if (baseScore == null) return null;
    const timestamp = Date.parse(lastCompletedTestAt || '');
    if (!Number.isFinite(timestamp)) return clamp(Math.round(baseScore));
    const days = Math.max(0, (now.getTime() - timestamp) / 86400000);
    const periods = Math.floor(days / 30);
    return clamp(Math.round(baseScore) - periods * 10);
  }

  function getFieldReadiness(area, now = new Date()) {
    const rolling = weightedTestScore(area.testHistory || []);
    if (rolling != null) return applyDecay(rolling, area.lastCompletedTestAt, now);
    return area.legacyReadiness == null ? null : clamp(Number(area.legacyReadiness) || 0);
  }

  function getReadinessBand(score) {
    if (score == null) return 'New';
    const value = Number(score) || 0;
    if (value < 40) return 'Learning';
    if (value < 65) return 'Familiar';
    if (value < 85) return 'Confident';
    return 'Field Ready';
  }

  function prepareDeck(deck) {
    const database = loadDatabase();
    ensureArea(database, deck);
    saveDatabase(database);
    return getDeckProgress(deck);
  }

  function getDeckProgress(deck) {
    const database = loadDatabase();
    const area = ensureArea(database, deck);
    const fieldReadiness = getFieldReadiness(area);
    saveDatabase(database);

    const cards = Object.fromEntries(deck.cards.map((card) => {
      const record = area.cards[card.id];
      return [card.id, {
        testCorrect: record.testCorrect,
        testWrong: record.testWrong,
        lastTestCorrect: record.lastTestCorrect,
        lastTestedAt: record.lastTestedAt
      }];
    }));

    const totalTestAnswers = Object.values(cards)
      .reduce((sum, record) => sum + record.testCorrect + record.testWrong, 0);

    return {
      sessions: area.sessions,
      completedTests: area.completedTests,
      testHistory: [...area.testHistory],
      lastCompletedTestAt: area.lastCompletedTestAt,
      fieldReadiness,
      readinessBand: getReadinessBand(fieldReadiness),
      totalTestAnswers,
      cards
    };
  }

  function recordSessionStart(deck) {
    const database = loadDatabase();
    const area = ensureArea(database, deck);
    area.sessions += 1;
    area.updatedAt = nowIso();
    saveDatabase(database);
    return area.sessions;
  }

  function recordCompletedTest(deck, results) {
    const database = loadDatabase();
    const area = ensureArea(database, deck);
    const completedAt = nowIso();
    const total = results.length;
    const correct = results.filter((result) => result.correct).length;
    const percentage = total ? Math.round((correct / total) * 100) : 0;

    for (const result of results) {
      const record = area.cards[result.cardId] || emptyCardRecord(result.cardId);
      if (result.correct) record.testCorrect = (Number(record.testCorrect) || 0) + 1;
      else record.testWrong = (Number(record.testWrong) || 0) + 1;
      record.lastTestCorrect = Boolean(result.correct);
      record.lastTestedAt = completedAt;
      area.cards[result.cardId] = record;
    }

    area.testHistory.push({ completedAt, percentage, correct, total });
    area.testHistory = area.testHistory.slice(-TEST_HISTORY_LIMIT);
    area.completedTests += 1;
    area.lastCompletedTestAt = completedAt;
    area.legacyReadiness = null;
    area.updatedAt = completedAt;
    saveDatabase(database);

    return { percentage, fieldReadiness: getFieldReadiness(area), completedAt };
  }

  function getWeakCardIds(deck) {
    const progress = getDeckProgress(deck);
    return deck.cards
      .filter((card) => progress.cards[card.id]?.lastTestCorrect === false)
      .map((card) => card.id);
  }

  function resetDeck(deckId) {
    const database = loadDatabase();
    delete database.studyAreas[deckId];
    saveDatabase(database);
    localStorage.removeItem(`field-trainer:test-session:${deckId}`);
  }

  function inspectDeck(deckId) {
    return loadDatabase().studyAreas[deckId] || null;
  }

  return Object.freeze({
    STORAGE_KEY,
    SCHEMA_VERSION,
    prepareDeck,
    getDeckProgress,
    recordSessionStart,
    recordCompletedTest,
    getWeakCardIds,
    weightedTestScore,
    applyDecay,
    getReadinessBand,
    resetDeck,
    inspectDeck
  });
})();
