/** How a game finishes (Game Over now; the four story endings arrive in Phase 7). */

export type EndingId = 'truth' | 'escape' | 'forgotten' | 'last-night';

export interface GameStats {
  /** Seconds played. */
  timeS: number;
  /** Children whose belongings were found (0–5). */
  children: number;
  /** Journal entries found (documents, diary pages, photos, tapes…). */
  clues: number;
  totalClues: number;
  /** Times anyone went down. */
  downs: number;
}

export interface GameEnd {
  kind: 'gameover' | 'ending';
  ending: EndingId | null;
  title: string;
  subtitle: string;
  /** Paragraphs shown on the end screen. */
  text: string[];
  stats: GameStats;
}

/* ───────────────────────── Phase 7: choices and the four endings ───────────────────────── */

/** What you need to have read to understand what happened in 1998. */
export const MYSTERY_DOCS = ['surat-ketua', 'cassette-3', 'pengakuan'] as const;

/** Freeing the children wakes the Penunggu: get to the car before dawn. */
export const DAWN_S = 6 * 60;

export type ChoiceId = 'altar' | 'car';
export type ChoiceOption = 'free' | 'sleep' | 'leave' | 'stay';

export interface ChoiceDef {
  title: string;
  text: string[];
  options: { id: ChoiceOption; label: string; hint: string }[];
}

export const CHOICES: Record<ChoiceId, ChoiceDef> = {
  altar: {
    title: 'Batu Penunggu',
    text: [
      'Lima tikar kecil. Lima barang yang kamu bawa. Penunggu itu bernafas perlahan di dalam gelap, menjaga tidur mereka.',
      'Kalau kamu kejutkan mereka, dia juga akan bangun.',
    ],
    options: [
      { id: 'free', label: 'Kembalikan barang mereka. Sebut nama mereka.', hint: 'Free the children – then reach the car before dawn.' },
      { id: 'sleep', label: 'Biarkan mereka tidur.', hint: 'Leave them with their guardian – and leave quietly.' },
    ],
  },
  car: {
    title: 'Kereta',
    text: ['Kunci masih tergantung. Kali ini, enjin batuk… dan hidup.'],
    options: [
      { id: 'leave', label: 'Tinggalkan Kampung Hujan.', hint: 'The game ends for everyone.' },
      { id: 'stay', label: 'Belum lagi.', hint: 'Keep searching.' },
    ],
  },
};

export interface Decision {
  choice: ChoiceId;
  option: ChoiceOption;
  by: string;
}

export interface EndingFacts {
  /** How the game ended. */
  via: 'car' | 'dawn' | 'allDown';
  /** The choice made at the Batu Penunggu (null if none). */
  final: 'free' | 'sleep' | null;
  children: number;
}

/**
 * Pure ending logic:
 *  – freed the children and got away before dawn  → THE TRUTH
 *  – freed them but dawn came / everyone fell     → THE LAST NIGHT
 *  – let them sleep and left, or left having found most of them → THE ESCAPE
 *  – left early, knowing little                    → THE FORGOTTEN
 * Returns null for a plain Game Over (everyone down before any final choice).
 */
export function decideEnding(f: EndingFacts): EndingId | null {
  if (f.final === 'free') return f.via === 'car' ? 'truth' : 'last-night';
  if (f.via === 'allDown') return null;
  if (f.final === 'sleep') return 'escape';
  return f.children >= 3 ? 'escape' : 'forgotten';
}

export const ENDINGS: Record<EndingId, { title: string; subtitle: string; text: string[] }> = {
  truth: {
    title: 'The Truth',
    subtitle: 'Kebenaran',
    text: [
      'Di atas lima tikar kecil, kamu letakkan sepit rambut, selipar, anak patung, kereta mainan dan reben merah. Kamu sebut nama mereka satu-satu: Alya. Danish. Mira. Adam. Sofia.',
      'Penunggu itu menjerit sepanjang malam. Tapi bila fajar menyinsing di jalan tanah merah, enjin kereta hidup, dan di tepi hutan berdiri lima budak kecil — melambai, kemudian hilang dalam cahaya pagi.',
      'Seminggu kemudian, surat Haji Osman yang tidak pernah dihantar tiba di pejabat daerah. Kes 1998 dibuka semula. Kali ini, nama mereka tidak dilupakan.',
    ],
  },
  escape: {
    title: 'The Escape',
    subtitle: 'Kami Lari',
    text: [
      'Kamu memandu keluar tanpa menoleh. Pokok tumbang di belakang kereta seolah-olah tidak pernah ada.',
      'Di cermin pandang belakang, lima budak berdiri di tengah jalan, dalam hujan. Mereka tidak melambai.',
      'Di bawah Kampung Hujan, Penunggu itu terus menyanyi lagu dodoi. Mereka masih tidur. Mereka masih menunggu seseorang yang akan habiskan apa yang kamu mulakan.',
    ],
  },
  forgotten: {
    title: 'The Forgotten',
    subtitle: 'Dilupakan',
    text: [
      'Kamu pergi sebelum memahami apa-apa. Lebih selamat begitu, kata kamu.',
      'Tiga minggu kemudian, pita kaset yang sama tiba lagi di peti surat. Rakaman yang sama. Suara budak yang sama.',
      'Tetapi di hujung pita kali ini, selepas lima nama mereka, ada satu lagi nama yang disebut perlahan. Nama kamu.',
    ],
  },
  'last-night': {
    title: 'The Last Night',
    subtitle: 'Malam Terakhir',
    text: [
      'Fajar tidak pernah tiba di Kampung Hujan malam itu.',
      'Lima budak itu bangun, berlari ke arah cahaya — dan Penunggu yang marah mencari sesiapa sahaja untuk dijaga menggantikan mereka.',
      'Pada tahun 2026, poster baharu ditampal di perhentian bas lama. HILANG. Di bawah tajuk itu, gambar kamu.',
    ],
  },
};
