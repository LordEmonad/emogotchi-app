/**
 * The word filter: anything sexual about children, and nothing else. Swearing, slurs, edgy slogans are all allowed
 * (operator, 2026-09-27: "let people say slurs and shit thats fine", then "self harm and nazi stuff is fine dude just
 * have the csam blocked obviously. crypto is full of degenerates i dont wanna be too strict"; a friend's project is
 * called r3tards and could not go in a bio). A match refuses the message (or name, or bio) with a plain explanation;
 * nothing is silently rewritten. Admins can still delete, mute and ban, and add words from the admin tools.
 *
 * The list is kept in ROT13 so the file can be read, grepped and reviewed without the words sitting in it in the
 * clear. The operator adds words at runtime from the admin tools (table `filter_words`).
 *
 * Matching looks through the usual disguises: case, accents, look-alike digits and symbols (0 for o, 1 for i, $ for s),
 * repeated letters, and, for the longer terms and phrases, spaces and punctuation between the letters. A doubled
 * letter in a term must stay doubled in the text.
 */
const rot13 = (s) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));

// [term, mode]: 'sub' matches anywhere in the text with every non-letter removed; 'word' matches a whole word only
// (so "lollipop" and "speedo" are fine)
const BUILTIN = [
  // anything sexual about children: never optional
  ['crqb', 'word'], ['crqbf', 'word'], ['crqbcuvyr', 'sub'], ['cnrqbcuvyr', 'sub'], ['puvyqcbea', 'sub'], ['ybyv', 'word'], ['ybyvpba', 'sub'],
].map(([t, mode]) => [rot13(t), mode]);

// what a digit or a symbol is usually standing in for
const LEET = { '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', '6': 'g', '¡': 'i', '€': 'e', '£': 'l' };

/** lowercase, accents off, look-alikes mapped; letters and separators only */
function fold(text) {
  return String(text ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[0-9!|@$+¡€£]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]+/g, ' ');
}

/** a term as a pattern: each run of one letter must appear at least that many times ("gg" stays doubled) */
function pattern(term) {
  let p = '';
  for (const run of term.match(/(.)\1*/g) ?? []) p += `${run[0]}{${run.length},}`;
  return p;
}

const compile = (term, mode) => mode === 'sub'
  ? { mode, re: new RegExp(pattern(term)) }
  : { mode, re: new RegExp(`(?:^| )${pattern(term)}(?= |$)`) };
const BUILTIN_RE = BUILTIN.map(([t, mode]) => compile(t, mode));

let extra = { at: 0, list: [] };

/** The operator's own words, read from D1 at most once a minute per isolate. */
async function extraWords(env) {
  if (!env.DB) return [];
  if (Date.now() - extra.at < 60_000) return extra.list;
  try {
    const { results } = await env.DB.prepare('SELECT word FROM filter_words').all();
    extra = { at: Date.now(), list: results.map((r) => { const w = fold(r.word).replace(/ /g, ''); return w ? compile(w, w.length >= 5 ? 'sub' : 'word') : null; }).filter(Boolean) };
  } catch { /* keep the last list */ }
  return extra.list;
}
/** Forget the cached list (the admin tools just changed it). */
export function resetFilterCache() { extra = { at: 0, list: [] }; }

/** Does this text contain a filtered word? `extraList` is for tests; the Worker passes env. */
export function matchesFilter(text, extraList = []) {
  const f = ' ' + fold(text).trim() + ' ';
  const squashed = f.replace(/ /g, '');
  const words = f.replace(/ +/g, ' ');
  for (const { mode, re } of [...BUILTIN_RE, ...extraList]) {
    if (mode === 'sub' ? re.test(squashed) : re.test(words.trim())) return true;
  }
  return false;
}

export async function filtered(env, text) {
  return matchesFilter(text, await extraWords(env));
}

export const FILTER_MESSAGE = 'That has a word Emotown does not allow. Please say it another way.';
