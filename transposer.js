const CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_MAP = {
  'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
};

function normalizeNote(note) {
  if (!note) return note;
  const capitalized = note.charAt(0).toUpperCase() + note.slice(1);
  return FLAT_MAP[capitalized] || capitalized;
}

function getSemitoneDistance(fromKey, toKey) {
  const normFrom = normalizeNote(fromKey);
  const normTo = normalizeNote(toKey);
  const fromIdx = CHROMATIC_SCALE.indexOf(normFrom);
  const toIdx = CHROMATIC_SCALE.indexOf(normTo);
  if (fromIdx === -1 || toIdx === -1) return 0;
  return toIdx - fromIdx;
}

function transposeNote(note, semitones) {
  const norm = normalizeNote(note);
  const idx = CHROMATIC_SCALE.indexOf(norm);
  if (idx === -1) return note; // Return original if unknown
  let newIdx = (idx + semitones) % 12;
  if (newIdx < 0) newIdx += 12;
  return CHROMATIC_SCALE[newIdx];
}

function transposeSingleChord(chordStr, semitones) {
  if (!chordStr || semitones === 0) return chordStr;
  if (chordStr.includes('/')) {
    const parts = chordStr.split('/');
    return `${transposeSingleChord(parts[0], semitones)}/${transposeSingleChord(parts[1], semitones)}`;
  }
  const chordRegex = /^([A-G][#b]?)(.*)$/;
  const match = chordStr.match(chordRegex);
  if (!match) return chordStr;
  const rootNote = match[1];
  const qualitySuffix = match[2];
  const transposedRoot = transposeNote(rootNote, semitones);
  return `${transposedRoot}${qualitySuffix}`;
}

function transposeBracketedContent(text, semitones) {
  if (!text || semitones === 0) return text;
  return text.replace(/\[([^\]]+)\]/g, (match, chord) => {
    const sectionHeaders = ['intro', 'verse', 'chorus', 'bridge', 'pre-chorus', 'outro', 'solo', 'instrumental'];
    const lowerChord = chord.toLowerCase();
    if (sectionHeaders.some(s => lowerChord.includes(s))) {
      return match; // Do not transpose section headers
    }
    const transposed = transposeSingleChord(chord, semitones);
    return `[${transposed}]`;
  });
}

window.Transposer = {
  CHROMATIC_SCALE,
  normalizeNote,
  getSemitoneDistance,
  transposeSingleChord,
  transposeBracketedContent
};