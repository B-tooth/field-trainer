'use strict';

/**
 * Field Trainer learning engine.
 * Owns the versioned, persistent learning history used by every study area.
 */
const FieldTrainerLearning = (() => {
  const STORAGE_KEY = 'field-trainer:learning-data';
  const SCHEMA_VERSION = 2;
  const RECENT_RESULT_LIMIT = 10;
  const FIELD_READINESS_VERSION = 1;

  function emptyDatabase() {
    return {
      version: SCHEMA_VERSION,
      updatedAt: null,
      studyAreas: {}
    };
  }

  function emptyStudyArea(deckId, deckName = deckId) {
    return {
      id: deckId,
      name: deckName,
      right: 0,
      wrong: 0,
      sessions: 0,
      cards: {},
      migratedFromLegacy: false,
      updatedAt: null
    };
  }

  function emptyCardRecord(cardId) {
    return {
      id: cardId,
      seen: 0,
      correct: 0,
      wrong: 0,
      currentStreak: 0,
      bestStreak: 0,
      lastReviewed: null,
      recentResults: [],
      fieldReadiness: 0,
      learningScore: 0,
      readinessVersion: FIELD_READINESS_VERSION
    };
  }

  function normaliseCardRecord(cardId, record = {}) {
    const correct = Number(record.correct ?? record.right ?? 0) || 0;
    const wrong = Number(record.wrong ?? 0) || 0;
    const seen = Number(record.seen ?? (correct + wrong)) || 0;

    return {
      ...emptyCardRecord(cardId),
      ...record,
      id: cardId,
      seen,
      correct,
      wrong,
      currentStreak: Number(record.currentStreak ?? 0) || 0,
      bestStreak: Number(record.bestStreak ?? 0) || 0,
      recentResults: Array.isArray(record.recentResults)
        ? record.recentResults.slice(-RECENT_RESULT_LIMIT).map((value) => value ? 1 : 0)
        : [],
      fieldReadiness: Number(record.fieldReadiness ?? record.learningScore ?? 0) || 0,
      learningScore: Number(record.fieldReadiness ?? record.learningScore ?? 0) || 0,
      readinessVersion: Number(record.readinessVersion ?? 0) || 0
    };
  }

  function normaliseDatabase(value) {
    if (!value || typeof value !== 'object') {
      return emptyDatabase();
    }

    const database = {
      ...emptyDatabase(),
      ...value,
      version: SCHEMA_VERSION,
      studyAreas: {}
    };

    for (const [deckId, areaValue] of Object.entries(value.studyAreas || {})) {
      const area = {
        ...emptyStudyArea(deckId, areaValue?.name || deckId),
        ...areaValue,
        id: deckId,
        cards: {}
      };

      for (const [cardId, cardValue] of Object.entries(areaValue?.cards || {})) {
        area.cards[cardId] = normaliseCardRecord(cardId, cardValue);
      }

      database.studyAreas[deckId] = area;
    }

    return database;
  }

  function loadDatabase() {
    try {
      return normaliseDatabase(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
    } catch (error) {
      console.warn('Field Trainer could not read learning data. A fresh record will be used.', error);
      return emptyDatabase();
    }
  }

  function saveDatabase(database) {
    database.version = SCHEMA_VERSION;
    database.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
  }

  function legacyProgressKey(deckId) {
    return `species-flashcards:${deckId}`;
  }

  function readLegacyProgress(deckId) {
    try {
      return JSON.parse(localStorage.getItem(legacyProgressKey(deckId)) || 'null');
    } catch {
      return null;
    }
  }

  function ensureStudyArea(database, deck) {
    database.studyAreas[deck.id] ||= emptyStudyArea(deck.id, deck.name);
    const area = database.studyAreas[deck.id];
    area.name = deck.name || area.name;

    for (const card of deck.cards || []) {
      area.cards[card.id] = normaliseCardRecord(card.id, area.cards[card.id]);
    }

    return area;
  }

  function migrateLegacyProgress(database, deck, area) {
    if (area.migratedFromLegacy) {
      return false;
    }

    const legacy = readLegacyProgress(deck.id);

    if (legacy && typeof legacy === 'object') {
      area.right = Number(legacy.right ?? 0) || 0;
      area.wrong = Number(legacy.wrong ?? 0) || 0;

      for (const card of deck.cards || []) {
        const oldCard = legacy.cards?.[card.id];
        if (!oldCard) continue;

        const correct = Number(oldCard.right ?? 0) || 0;
        const wrong = Number(oldCard.wrong ?? 0) || 0;
        const current = area.cards[card.id] || emptyCardRecord(card.id);

        area.cards[card.id] = normaliseCardRecord(card.id, {
          ...current,
          seen: Math.max(current.seen, correct + wrong),
          correct: Math.max(current.correct, correct),
          wrong: Math.max(current.wrong, wrong)
        });
      }
    }

    area.migratedFromLegacy = true;
    return true;
  }

  function prepareDeck(deck) {
    const database = loadDatabase();
    const area = ensureStudyArea(database, deck);
    const migrated = migrateLegacyProgress(database, deck, area);

    if (migrated || !database.updatedAt) {
      saveDatabase(database);
    }

    return getDeckProgress(deck);
  }

  function getDeckProgress(deck) {
    const database = loadDatabase();
    const area = ensureStudyArea(database, deck);
    let changed = migrateLegacyProgress(database, deck, area);
    const now = new Date();

    for (const record of Object.values(area.cards)) {
      const previousScore = Number(record.fieldReadiness ?? record.learningScore ?? 0) || 0;
      const previousVersion = Number(record.readinessVersion ?? 0) || 0;
      refreshCardReadiness(record, now);
      if (record.fieldReadiness !== previousScore || previousVersion !== FIELD_READINESS_VERSION) {
        changed = true;
      }
    }

    if (changed) saveDatabase(database);

    return {
      right: area.right,
      wrong: area.wrong,
      sessions: Number(area.sessions) || 0,
      cards: Object.fromEntries(
        Object.entries(area.cards).map(([cardId, card]) => [
          cardId,
          {
            right: card.correct,
            wrong: card.wrong,
            seen: card.seen,
            currentStreak: card.currentStreak,
            bestStreak: card.bestStreak,
            lastReviewed: card.lastReviewed,
            recentResults: [...card.recentResults],
            fieldReadiness: card.fieldReadiness,
            learningScore: card.fieldReadiness,
            readinessBand: getReadinessBand(card.fieldReadiness)
          }
        ])
      )
    };
  }

  /**
   * Estimates how ready the learner is to recognise this card today.
   *
   * The score deliberately rewards repeated evidence, not a single lucky answer.
   * It combines lifetime accuracy, recent performance, current streak, number of
   * reviews and time since the card was last seen. Unseen cards always score 0.
   */
  function calculateFieldReadiness(record, now = new Date()) {
    const seen = Math.max(0, Number(record.seen) || 0);
    if (!seen) return 0;

    const correct = Math.min(seen, Math.max(0, Number(record.correct) || 0));

    // Bayesian accuracy prevents one early answer from creating an extreme score.
    // The prior is equivalent to two correct and two wrong answers (50%).
    const accuracy = (correct + 2) / (seen + 4);

    const recent = Array.isArray(record.recentResults)
      ? record.recentResults.slice(-RECENT_RESULT_LIMIT)
      : [];

    // Give the newest answers slightly more influence than older answers.
    let recentPerformance = accuracy;
    if (recent.length) {
      let weightedTotal = 0;
      let weightTotal = 0;
      recent.forEach((result, index) => {
        const weight = index + 1;
        weightedTotal += (result ? 1 : 0) * weight;
        weightTotal += weight;
      });
      recentPerformance = weightedTotal / weightTotal;
    }

    // A five-answer streak receives the full consistency contribution.
    const streakStrength = Math.min(1, (Number(record.currentStreak) || 0) / 5);

    // Ten reviews provide strong evidence; earlier results remain deliberately cautious.
    const evidence = 1 - Math.exp(-seen / 4.5);

    const demonstratedSkill =
      (accuracy * 0.55) +
      (recentPerformance * 0.30) +
      (streakStrength * 0.15);

    // No time penalty for the first week. After that, confidence declines gradually,
    // but historical learning is never erased completely.
    let retention = 1;
    const lastReviewed = Date.parse(record.lastReviewed || '');
    if (Number.isFinite(lastReviewed)) {
      const daysSinceReview = Math.max(0, (now.getTime() - lastReviewed) / 86400000);
      const daysBeyondGrace = Math.max(0, daysSinceReview - 7);
      retention = 0.6 + (0.4 * Math.pow(0.5, daysBeyondGrace / 60));
    }

    return Math.max(
      0,
      Math.min(100, Math.round(demonstratedSkill * evidence * retention * 100))
    );
  }

  function getReadinessBand(score) {
    const value = Number(score) || 0;
    if (value <= 0) return 'New';
    if (value < 40) return 'Learning';
    if (value < 65) return 'Familiar';
    if (value < 85) return 'Confident';
    return 'Field Ready';
  }

  function refreshCardReadiness(record, now = new Date()) {
    const fieldReadiness = calculateFieldReadiness(record, now);
    record.fieldReadiness = fieldReadiness;
    // Keep the former property as a compatibility alias until all UI code is migrated.
    record.learningScore = fieldReadiness;
    record.readinessVersion = FIELD_READINESS_VERSION;
    return record;
  }

  function recordAnswer(deck, cardId, isCorrect) {
    const database = loadDatabase();
    const area = ensureStudyArea(database, deck);
    migrateLegacyProgress(database, deck, area);

    const record = normaliseCardRecord(cardId, area.cards[cardId]);
    const timestamp = new Date().toISOString();

    record.seen += 1;
    record.lastReviewed = timestamp;
    record.recentResults.push(isCorrect ? 1 : 0);
    record.recentResults = record.recentResults.slice(-RECENT_RESULT_LIMIT);

    if (isCorrect) {
      record.correct += 1;
      record.currentStreak += 1;
      record.bestStreak = Math.max(record.bestStreak, record.currentStreak);
      area.right += 1;
    } else {
      record.wrong += 1;
      record.currentStreak = 0;
      area.wrong += 1;
    }

    refreshCardReadiness(record, new Date(timestamp));
    area.cards[cardId] = record;
    area.updatedAt = timestamp;
    saveDatabase(database);

    return { ...record, recentResults: [...record.recentResults] };
  }


  function recordSessionStart(deck) {
    const database = loadDatabase();
    const area = ensureStudyArea(database, deck);
    migrateLegacyProgress(database, deck, area);
    area.sessions = (Number(area.sessions) || 0) + 1;
    area.updatedAt = new Date().toISOString();
    saveDatabase(database);
    return area.sessions;
  }
  function resetDeck(deckId) {
    const database = loadDatabase();
    delete database.studyAreas[deckId];
    saveDatabase(database);
    localStorage.removeItem(legacyProgressKey(deckId));
  }

  function inspectDeck(deckId) {
    const database = loadDatabase();
    return database.studyAreas[deckId] || null;
  }

  return Object.freeze({
    STORAGE_KEY,
    SCHEMA_VERSION,
    prepareDeck,
    getDeckProgress,
    recordAnswer,
    recordSessionStart,
    calculateFieldReadiness,
    getReadinessBand,
    resetDeck,
    inspectDeck
  });
})();
