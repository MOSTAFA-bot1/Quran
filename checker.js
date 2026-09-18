// Quran verse checker: compares a recitation against the expected verse and
// reports every wrong, missing or extra word.
(function (global) {
  'use strict';

  const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u08F0-\u08FF]/g;
  const DAGGER_ALEF = /\u0670/g;
  const TATWEEL = /\u0640/g;
  const ZERO_WIDTH = /[\u200B-\u200F\u061C\uFEFF]/g;
  const NON_ARABIC = /[^\u0621-\u064A\s]/g;

  function normalizeArabic(text) {
    if (!text) return '';
    return text
      .replace(DIACRITICS, '')
      .replace(TATWEEL, '')
      .replace(ZERO_WIDTH, '')
      .replace(DAGGER_ALEF, '\u0627')
      .replace(/[\u0622\u0623\u0625\u0627\u0671\u0672\u0673\u0675]/g, '\u0627')
      .replace(/[\u0649\u0626\u06CC\u06D2\u064A]/g, '\u064A')
      .replace(/[\u0624\u06C4\u06C5\u06C6\u06C7\u0648]/g, '\u0648')
      .replace(/[\u0629\u06BE\u06C1\u06C2\u06D5]/g, '\u0647')
      .replace(/[\u06A9\u06AA]/g, '\u0643')
      .replace(NON_ARABIC, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Mushaf spelling omits some alefs that ordinary spelling writes (العلمين /
  // العالمين), so words are matched on an alef-insensitive key.
  function comparisonKey(word) {
    if (word.length < 2) return word;
    return word[0] + word.slice(1).replace(/\u0627/g, '');
  }

  function sameWord(a, b) {
    return a === b || comparisonKey(a) === comparisonKey(b);
  }

  function tokenize(text) {
    const normalized = normalizeArabic(text);
    return normalized ? normalized.split(' ') : [];
  }

  function editDistance(a, b) {
    const rows = a.length + 1;
    const cols = b.length + 1;
    let previous = new Array(cols);
    let current = new Array(cols);
    for (let j = 0; j < cols; j++) previous[j] = j;
    for (let i = 1; i < rows; i++) {
      current[0] = i;
      for (let j = 1; j < cols; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      }
      const swap = previous;
      previous = current;
      current = swap;
    }
    return previous[cols - 1];
  }

  function similarity(a, b) {
    if (!a.length && !b.length) return 1;
    const longest = Math.max(a.length, b.length);
    return 1 - editDistance(a, b) / longest;
  }

  // Word level alignment. Returns a list of { type, expected, actual } where
  // type is one of 'correct' | 'wrong' | 'missing' | 'extra'.
  function alignWords(expected, actual) {
    const rows = expected.length + 1;
    const cols = actual.length + 1;
    const cost = [];
    for (let i = 0; i < rows; i++) {
      cost.push(new Array(cols).fill(0));
      cost[i][0] = i;
    }
    for (let j = 0; j < cols; j++) cost[0][j] = j;

    for (let i = 1; i < rows; i++) {
      for (let j = 1; j < cols; j++) {
        const substitution = cost[i - 1][j - 1] + (sameWord(expected[i - 1], actual[j - 1]) ? 0 : 1);
        cost[i][j] = Math.min(substitution, cost[i - 1][j] + 1, cost[i][j - 1] + 1);
      }
    }

    const ops = [];
    let i = expected.length;
    let j = actual.length;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && cost[i][j] === cost[i - 1][j - 1] + (sameWord(expected[i - 1], actual[j - 1]) ? 0 : 1)) {
        ops.push(
          sameWord(expected[i - 1], actual[j - 1])
            ? { type: 'correct', expected: expected[i - 1], actual: actual[j - 1] }
            : { type: 'wrong', expected: expected[i - 1], actual: actual[j - 1] }
        );
        i--;
        j--;
      } else if (i > 0 && cost[i][j] === cost[i - 1][j] + 1) {
        ops.push({ type: 'missing', expected: expected[i - 1], actual: null });
        i--;
      } else {
        ops.push({ type: 'extra', expected: null, actual: actual[j - 1] });
        j--;
      }
    }
    return ops.reverse();
  }

  function describe(op, position) {
    if (op.type === 'wrong') {
      const close = similarity(op.expected, op.actual) >= 0.6;
      return {
        type: 'wrong',
        position,
        expected: op.expected,
        actual: op.actual,
        ar: close
          ? `كلمة قريبة من الصواب رقم ${position}: قلت «${op.actual}» والصواب «${op.expected}»`
          : `كلمة خاطئة رقم ${position}: قلت «${op.actual}» والصواب «${op.expected}»`,
        en: `Word ${position} is wrong: you said "${op.actual}", the correct word is "${op.expected}"`
      };
    }
    if (op.type === 'missing') {
      return {
        type: 'missing',
        position,
        expected: op.expected,
        actual: null,
        ar: `كلمة ناقصة رقم ${position}: «${op.expected}»`,
        en: `Missing word at position ${position}: "${op.expected}"`
      };
    }
    return {
      type: 'extra',
      position,
      expected: null,
      actual: op.actual,
      ar: `كلمة زائدة بعد الكلمة رقم ${position}: «${op.actual}»`,
      en: `Extra word after position ${position}: "${op.actual}"`
    };
  }

  function checkVerse(expectedText, actualText) {
    const expected = tokenize(expectedText);
    const actual = tokenize(actualText);

    if (expected.length === 0) {
      return {
        status: 'unknown',
        accuracy: 0,
        ops: [],
        mistakes: [],
        ar: 'لا توجد آية للمقارنة',
        en: 'No verse to compare against'
      };
    }
    if (actual.length === 0) {
      return {
        status: 'empty',
        accuracy: 0,
        ops: expected.map(word => ({ type: 'missing', expected: word, actual: null })),
        mistakes: [],
        ar: 'لم يتم التقاط أي تلاوة',
        en: 'Nothing was recited'
      };
    }

    const ops = alignWords(expected, actual);
    const mistakes = [];
    let expectedPosition = 0;
    let correct = 0;

    ops.forEach(op => {
      if (op.type === 'correct') {
        expectedPosition++;
        correct++;
        return;
      }
      if (op.type === 'extra') {
        mistakes.push(describe(op, expectedPosition));
        return;
      }
      expectedPosition++;
      mistakes.push(describe(op, expectedPosition));
    });

    const accuracy = Math.round((correct / expected.length) * 100);
    const status = mistakes.length === 0 ? 'correct' : 'incorrect';

    return {
      status,
      accuracy,
      ops,
      mistakes,
      ar: status === 'correct'
        ? `أحسنت، التلاوة صحيحة (${accuracy}%)`
        : `التلاوة بها ${mistakes.length} خطأ — الدقة ${accuracy}%`,
      en: status === 'correct'
        ? `Correct recitation (${accuracy}%)`
        : `${mistakes.length} mistake(s) found — accuracy ${accuracy}%`
    };
  }

  global.QuranChecker = { normalizeArabic, tokenize, similarity, sameWord, alignWords, checkVerse };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.QuranChecker;
  }
})(typeof window !== 'undefined' ? window : globalThis);
