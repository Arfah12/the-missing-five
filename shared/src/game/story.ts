/**
 * Readable story content: diary pages, documents, photographs, cassette
 * transcripts and the children's belongings. In-world text is Malay; the
 * player-facing UI around it is English.
 */

export type DocKind = 'diary' | 'document' | 'photo' | 'cassette' | 'belonging' | 'note';

export interface DocDef {
  id: string;
  kind: DocKind;
  title: string;
  /** Paragraphs. */
  body: string[];
  /** Shown under the text (translation hint, date, sticker…). */
  footer?: string;
}

export const DOCS: Record<string, DocDef> = {
  'diary-1': {
    id: 'diary-1',
    kind: 'diary',
    title: 'Diari Alya — muka surat 1',
    body: [
      '3 Ogos 1998. Hari ni cikgu Rahimah suruh kami tulis diari. Saya tak tahu nak tulis apa.',
      'Danish kata dia nampak orang tinggi berdiri dekat pokok ara malam semalam. Mira gelak. Adam takut. Saya pun takut tapi saya tak cakap.',
    ],
    footer: 'Tulisan pensel, ada lukisan bunga di tepi.',
  },
  'diary-2': {
    id: 'diary-2',
    kind: 'diary',
    title: 'Diari Alya — muka surat 2',
    body: [
      '7 Ogos 1998. Kami tunggu bas sekolah lama sangat. Sofia kata ada orang perhati kami dari belakang perhentian bas.',
      'Bila saya pusing, tak ada sesiapa. Tapi bau macam tanah basah dan bunga cempaka.',
    ],
  },
  'diary-3': {
    id: 'diary-3',
    kind: 'diary',
    title: 'Diari Alya — muka surat 3',
    body: [
      '10 Ogos 1998. Tok Ketua marah Danish sebab main dekat stor dia. Dalam stor tu ada lubang. Tok Ketua kata itu perigi lama, jangan dekat.',
      'Tapi Mira dengar ada orang menyanyi dari dalam lubang tu. Lagu dodoi.',
    ],
  },
  'diary-4': {
    id: 'diary-4',
    kind: 'diary',
    title: 'Diari Alya — muka surat 4',
    body: [
      '12 Ogos 1998. Kami berlima janji. Esok lepas sekolah kami pergi ke pondok Pak Dollah dalam hutan. Danish kata dia tahu jalan.',
      'Adam bawa kereta mainan dia. Sofia bawa reben merah dia. Saya bawa diari ni.',
    ],
  },
  'diary-5': {
    id: 'diary-5',
    kind: 'diary',
    title: 'Diari Alya — muka surat 5',
    body: [
      '13 Ogos 1998. Kami jumpa jalan bawah tanah. Gelap sangat. Dia kata dia akan jaga kami. Dia kata kami tak boleh balik lagi.',
      'Kalau sesiapa jumpa diari ni — cari kami. Kami masih di sini.',
    ],
    footer: 'Halaman terakhir. Tulisannya makin tidak kemas.',
  },
  'nota-penjaga': {
    id: 'nota-penjaga',
    kind: 'document',
    title: 'Nota Penjaga Sekolah',
    body: [
      'PERINGATAN: Kotak suis di hujung koridor selalu trip bila hujan.',
      'Kalau elektrik putus, hidupkan suis ikut turutan ini sahaja: 3 — 1 — 4 — 2.',
      'Jangan ikut nombor biasa. Nanti semua trip balik dan kena mula semula.',
    ],
    footer: '— Pak Mat, penjaga sekolah',
  },
  'surat-ketua': {
    id: 'surat-ketua',
    kind: 'document',
    title: 'Surat yang tidak dihantar',
    body: [
      'Kepada Tuan Pegawai Daerah,',
      'Saya sudah kunci stor itu dengan mangga. Nombornya tarikh yang seluruh kampung tak boleh lupa. Lubang di dalamnya saya paku dengan papan tebal.',
      'Jangan hantar orang mencari lagi. Apa yang ada di bawah sana tidak mahu dijumpai.',
    ],
    footer: '— Haji Osman, Ketua Kampung Hujan (surat bertarikh September 1998)',
  },
  'laporan-polis': {
    id: 'laporan-polis',
    kind: 'document',
    title: 'Salinan Laporan Polis',
    body: [
      'Tarikh kejadian: 13 Ogos 1998, lebih kurang jam 5.30 petang.',
      'Lima kanak-kanak dilaporkan hilang: Alya (9), Danish (10), Mira (8), Adam (8), Sofia (9). Kali terakhir dilihat berjalan ke arah Hutan Larangan.',
      'Gerakan mencari selama 21 hari tidak menemui sebarang kesan. Kes ditutup.',
    ],
    footer: 'Cop "SULIT" separuh pudar.',
  },
  kalendar: {
    id: 'kalendar',
    kind: 'note',
    title: 'Kalendar dinding',
    body: ['OGOS 1998.', 'Tarikh 13 dibulatkan dengan pen merah. Di bawahnya tertulis kecil: "mereka hilang".'],
  },
  'cassette-1': {
    id: 'cassette-1',
    kind: 'cassette',
    title: 'Kaset #1 — "Lagu Raya 1997"',
    body: [
      '[bunyi pita berdesir]',
      'Suara budak perempuan: "…satu, dua, tiga… Sofia, cakaplah! Ni rakaman rahsia kita."',
      'Suara lain, berbisik: "Jangan kuat-kuat. Dia boleh dengar."',
      '[rakaman terputus]',
    ],
  },
  'cassette-2': {
    id: 'cassette-2',
    kind: 'cassette',
    title: 'Kaset #2 — label ditulis "98.5"',
    body: [
      '[bunyi hujan]',
      'Suara lelaki tua: "Kalau ada sesiapa dengar… frekuensi radio kampung, sembilan puluh lapan perpuluhan lima. Mereka cuba bercakap melalui radio."',
      '[bunyi statik yang panjang]',
    ],
  },
  'cassette-3': {
    id: 'cassette-3',
    kind: 'cassette',
    title: 'Kaset #3 — tiada label',
    body: [
      '[bunyi air menitis, gema terowong]',
      'Lima suara kanak-kanak menyanyi lagu dodoi, perlahan dan tidak serentak.',
      'Di hujung rakaman, satu suara dewasa yang bukan manusia biasa: "Tidur… semua tidur…"',
    ],
  },
  'photo-class': {
    id: 'photo-class',
    kind: 'photo',
    title: 'Gambar kelas 1998',
    body: ['Gambar berkumpulan Kelas 3 Melati. Lima wajah dibulatkan dengan pen merah.', 'Di belakang gambar: "Alya, Danish, Mira, Adam, Sofia — kawan selamanya".'],
  },
  'photo-shop': {
    id: 'photo-shop',
    kind: 'photo',
    title: 'Gambar di kedai Pak Leman',
    body: ['Lima kanak-kanak makan aiskrim di depan kedai. Di hujung gambar, di tepi hutan, ada bayang tinggi yang kabur.'],
  },
  'photo-family': {
    id: 'photo-family',
    kind: 'photo',
    title: 'Gambar keluarga Ketua Kampung',
    body: ['Haji Osman bersama isteri dan cucunya, Mira.', 'Kaca bingkai retak tepat di wajah Mira.'],
  },
  'photo-tree': {
    id: 'photo-tree',
    kind: 'photo',
    title: 'Gambar di Pokok Ara',
    body: ['Pokok ara tua, gambar diambil waktu senja. Ada reben merah terikat di akarnya.', 'Di belakang: "Sofia jumpa pintu".'],
  },
  'belonging-alya': {
    id: 'belonging-alya',
    kind: 'belonging',
    title: 'Sepit rambut Alya',
    body: ['Sepit rambut plastik berbentuk bunga, warnanya sudah pudar. Tersorok di laci meja guru Kelas 3 Melati.', 'Alya tidak pernah balik ke kelas selepas rehat pada 13 Ogos.'],
  },
  'belonging-danish': {
    id: 'belonging-danish',
    kind: 'belonging',
    title: 'Selipar Danish',
    body: ['Sebelah selipar jepun saiz budak, tertulis "DANISH" dengan pen marker.', 'Danish selalu jalan dulu. Dia yang tunjuk jalan ke pondok ini.'],
  },
  'belonging-mira': {
    id: 'belonging-mira',
    kind: 'belonging',
    title: 'Anak patung Mira',
    body: ['Anak patung kain berbaju kurung. Ada bau bunga cempaka.', 'Seseorang meletakkannya kemas di atas katil, seolah-olah menunggu tuannya pulang.'],
  },
  'belonging-adam': {
    id: 'belonging-adam',
    kind: 'belonging',
    title: 'Kereta mainan Adam',
    body: ['Kereta mainan besi warna merah, rodanya masih berpusing.', 'Ia terletak di tengah terowong, menghala ke arah pintu besi.'],
  },
  'belonging-sofia': {
    id: 'belonging-sofia',
    kind: 'belonging',
    title: 'Reben merah Sofia',
    body: ['Reben merah yang masih terang, seolah-olah baru diikat semalam.', 'Ia terletak di tengah-tengah lima tikar kecil.'],
  },
  'pa-announcement': {
    id: 'pa-announcement',
    kind: 'note',
    title: 'Pembesar suara sekolah',
    body: ['[loceng sekolah berbunyi, kemudian suara budak perempuan dari pembesar suara]', '"Perhatian… perhatian… dengar radio… sembilan puluh lapan perpuluhan lima… dia tak dengar kat situ…"'],
  },
  'radio-message': {
    id: 'radio-message',
    kind: 'note',
    title: 'Radio — 98.5',
    body: ['[statik… kemudian lima suara bergilir-gilir]', '"Tok… kunci stor tu… hari kami hilang…" — "…satu, tiga…" — "…kosong, lapan…" — "Cepat. Dia dah bangun."'],
  },
  rakaman: {
    id: 'rakaman',
    kind: 'cassette',
    title: 'Rakaman yang dihantar kepada kamu',
    body: [
      '[pita berdesir, bunyi hujan]',
      'Suara budak perempuan, sangat dekat dengan mikrofon: "Kalau ada sesiapa dengar ni… kami kat Kampung Hujan. Kami tak boleh balik."',
      '"Dia jaga kami. Dia tak bagi kami bangun."',
      '"Tolong… cari kami. Lima orang. Jangan lupa nama kami."',
    ],
    footer: 'Pita ini sampai kepada kamu tanpa nama pengirim, 28 tahun selepas mereka hilang.',
  },
  'batu-penunggu': {
    id: 'batu-penunggu',
    kind: 'note',
    title: 'Batu Penunggu',
    body: [
      'Batu hitam, licin dan sejuk, diukir dengan tulisan Jawi yang sudah haus.',
      '"Di sini tidur Penunggu kampung. Jangan gali, jangan panggil, jangan beri dia sesiapa untuk dijaga."',
      'Di bawah ukiran itu, dicakar baru: lima nama kecil.',
      'Lima tikar kecil mengelilingi batu ini. Untuk mengejutkan mereka, setiap budak perlu barangnya kembali — dan seseorang perlu tahu apa yang berlaku pada tahun 1998.',
    ],
  },
  pengakuan: {
    id: 'pengakuan',
    kind: 'document',
    title: 'Pengakuan Haji Osman',
    body: [
      'Kami gali terowong itu untuk parit baru. Kami tak tahu kami menggali ke dalam tidurnya.',
      'Budak-budak itu jumpa pintunya di bawah pokok ara. Penunggu itu sunyi — dia ambil mereka untuk dijaga, macam anak sendiri.',
      'Saya boleh turun dan bawa mereka naik. Tapi orang tua-tua kata, kalau kita ambil balik apa yang dia jaga, dia akan bangun dan ikut kita sampai ke rumah.',
      'Jadi saya kunci stor, saya paku perigi, dan saya diam. Termasuk cucu saya sendiri. Semoga Allah ampunkan saya.',
    ],
    footer: 'Dijumpai bersama lima tikar kecil. Tulisan tangan yang menggeletar.',
  },
};
