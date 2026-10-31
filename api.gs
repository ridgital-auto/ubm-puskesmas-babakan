// ============================================================
// API UBM Puskesmas Babakan (Apps Script, dipasang SEKALI)
// Database: Sheet e-RM UBM, ID sama seperti Code.gs lama.
// Frontend GitHub Pages memanggil API ini lewat GET:
//   <URL_API>?action=getData
//   <URL_API>?action=saveKlien&payload={...json...}
// Aksi: getData, saveKlien, saveKonselingAwal, saveKonseling,
//        updateKlienStatus, saveJadwal, updateKehadiran
// Semua tulis memakai GET agar tidak hilang saat Apps Script
// me-redirect dari script.google.com ke googleusercontent.com.
// Link API ini HANYA untuk Tim UBM, jangan dipublikasikan.
// ============================================================
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  try {
    if (action === 'ping') {
      return jsonOut_({ ok: true, service: 'UBM API' });
    }
    if (action === 'getData') {
      return jsonOut_({ ok: true, data: getData() });
    }
    var payload = {};
    if (e.parameter.payload) payload = JSON.parse(e.parameter.payload);
    var lock = LockService.getScriptLock();
    lock.tryLock(30000);
    var result;
    if (action === 'saveKlien') result = saveKlien(payload);
    else if (action === 'saveKonselingAwal') result = saveKonselingAwal(payload);
    else if (action === 'saveKonseling') result = saveKonseling(payload);
    else if (action === 'updateKlienStatus') result = updateKlienStatus(payload);
    else if (action === 'saveJadwal') result = saveJadwal(payload);
    else if (action === 'updateKehadiran') result = updateKehadiran(payload);
    else if (action === 'deleteKonselingRow') result = deleteKonselingRow(payload);
    else if (action === 'deleteKlien') result = deleteKlien(payload);
    else if (action === 'updateKonselingRow') result = updateKonselingRow(payload);
    else if (action === 'saveKonselorBaru') result = saveKonselorBaru(payload);
    else throw new Error('Aksi tidak dikenal: ' + action);
    lock.releaseLock();
    return jsonOut_({ ok: true, data: result });
  } catch (err) {
    try { LockService.getScriptLock().releaseLock(); } catch (e2) {}
    return jsonOut_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
// ============================================================
// Web App UBM Puskesmas Babakan
// Database: Google Sheet "e-RM UBM Puskesmas Babakan"
// Spreadsheet ID: 16h7TiyO2quO1xR7IHcHNh0fe0Gy_mrc2djFZhgThKDo
// Cara pakai (Apps Script):
//  1. Buka Sheet e-RM UBM > Ekstensi > Apps Script
//  2. Tempel file ini sebagai Code.gs, dan index.html sebagai file HTML
//  3. Deploy > Deployment baru > Jenis: Aplikasi web
//     Jalankan sebagai: Saya (akun pemilik Sheet)
//     Yang memiliki akses: Siapa pun (link hanya dibagikan ke Tim UBM)
//  4. Izinkan akses Spreadsheet saat diminta.
// Skema Sheet TIDAK diubah oleh aplikasi ini: hanya menambah baris
// dan mengubah kolom Status (Klien) serta Kehadiran/Keterangan (Jadwal).
// ============================================================
var SHEET_ID = '16h7TiyO2quO1xR7IHcHNh0fe0Gy_mrc2djFZhgThKDo';
var TAB_KLIEN = 'Klien';
var TAB_KONSELING = 'Konseling & FU';
var TAB_JADWAL = 'Jadwal Perjanjian';
var TAB_KONSELOR = 'Konselor';
var KONSELOR_AWAL = ['dr. Abdi Azhim Zauli Azra', 'Hj. Nurainun, S.Kep, Ners', 'Imanda Lestari, SKM'];


function ss_() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function readTab_(name) {
  var sheet = ss_().getSheetByName(name);
  var values = sheet.getDataRange().getValues();
  // Baris 1 = header, dibuang. Sertakan nomor baris Sheet (untuk update).
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    // Lewati baris kosong total
    var empty = true;
    for (var j = 0; j < row.length; j++) {
      if (row[j] !== '' && row[j] !== null) { empty = false; break; }
    }
    if (empty) continue;
    out.push({ row: i + 1, values: row.map(function (v) {
      // Tanggal dari Sheet dikirim sebagai string ISO agar stabil di browser
      if (Object.prototype.toString.call(v) === '[object Date]') {
        return Utilities.formatDate(v, 'Asia/Makassar', 'yyyy-MM-dd');
      }
      return v;
    })});
  }
  return out;
}

function pastikanTabKonselor_() {
  var ss = ss_();
  var sheet = ss.getSheetByName(TAB_KONSELOR);
  if (!sheet) {
    sheet = ss.insertSheet(TAB_KONSELOR);
    sheet.appendRow(['Nama']);
    KONSELOR_AWAL.forEach(function (n) { sheet.appendRow([n]); });
  }
  return sheet;
}

function getData() {
  pastikanTabKonselor_();
  return {
    klien: readTab_(TAB_KLIEN),
    konseling: readTab_(TAB_KONSELING),
    jadwal: readTab_(TAB_JADWAL),
    konselor: readTab_(TAB_KONSELOR)
  };
}

function saveKonselorBaru(o) {
  var nama = String(o.nama || '').trim();
  if (!nama) throw new Error('Nama konselor tidak boleh kosong.');
  var sheet = pastikanTabKonselor_();
  var last = sheet.getLastRow();
  if (last >= 2) {
    var vals = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]).trim().toLowerCase() === nama.toLowerCase()) return { ok: true, sudahAda: true };
    }
  }
  sheet.appendRow([nama]);
  return { ok: true };
}

function fagerstromLabel_(skor) {
  skor = Number(skor);
  if (isNaN(skor)) return '';
  if (skor <= 3) return 'Rendah';
  if (skor <= 6) return 'Sedang';
  return 'Tinggi';
}

function saveKlien(o) {
  // o: objek dari form Klien Baru, kunci sesuai kolom Sheet
  var nik = String(o.nik || '').replace(/\D/g, '');
  if (nik.length !== 16) throw new Error('NIK harus 16 digit angka.');
  var sheet = ss_().getSheetByName(TAB_KLIEN);
  var last = sheet.getLastRow();
  // Cek NIK ganda (kolom C)
  if (last >= 2) {
    var niks = sheet.getRange(2, 3, last - 1, 1).getValues();
    for (var i = 0; i < niks.length; i++) {
      if (String(niks[i][0]).replace(/\D/g, '') === nik) {
        throw new Error('NIK ini sudah terdaftar. Cari di Daftar Klien, jangan daftar ulang.');
      }
    }
  }
  var no = last < 2 ? 1 : last; // baris berikutnya = nomor urut (header di baris 1)
  // Jika ada baris kosong di tengah, nomor tetap dihitung dari baris terakhir
  var row = [
    no,
    o.tanggalDaftar || '',
    nik,
    o.nama || '',
    o.tanggalLahir || '',
    o.lp || '',
    o.alamat || '',
    o.noHp || '',
    o.pendidikan || '',
    o.pekerjaan || '',
    o.statusKawin || '',
    o.golDarah || '',
    o.skorFagerstrom === '' || o.skorFagerstrom === null ? '' : Number(o.skorFagerstrom),
    o.motivasi === '' || o.motivasi === null ? '' : Number(o.motivasi),
    o.tahap || '',
    o.tanggalBerhenti || '',
    o.status || 'Aktif'
  ];
  sheet.appendRow(row);
  return { ok: true, no: no, nik: nik };
}

function findKlienRowByNik_(nik) {
  var sheet = ss_().getSheetByName(TAB_KLIEN);
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var niks = sheet.getRange(2, 3, last - 1, 1).getValues();
  for (var i = 0; i < niks.length; i++) {
    if (String(niks[i][0]).replace(/\D/g, '') === String(nik).replace(/\D/g, '')) {
      return i + 2;
    }
  }
  return -1;
}

function saveKonselingAwal(o) {
  // o: nik, nama, tanggal, batangPerHari, usiaMulai, jenisRokok,
  //    skorFagerstrom, motivasi, tahap, tanggalBerhenti, metode, dukungan,
  //    co, bb, td, statusAwal (Lampiran 1, teks bebas)
  var r = findKlienRowByNik_(o.nik);
  if (r < 0) throw new Error('Klien tidak ditemukan. Daftarkan dulu di Klien Baru.');
  var sheet = ss_().getSheetByName(TAB_KLIEN);
  // Kolom: M=Skor Fagerstrom(13), N=Motivasi(14), O=Tahap(15), P=Tanggal berhenti(16)
  sheet.getRange(r, 13).setValue(o.skorFagerstrom === '' ? '' : Number(o.skorFagerstrom));
  sheet.getRange(r, 14).setValue(o.motivasi === '' ? '' : Number(o.motivasi));
  sheet.getRange(r, 15).setValue(o.tahap || '');
  sheet.getRange(r, 16).setValue(o.tanggalBerhenti || '');
  var label = fagerstromLabel_(o.skorFagerstrom);
  var ringkas = 'Konseling awal 4T. Profil: ' + (o.batangPerHari || '-') + ' batang/hari, mulai merokok usia ' +
    (o.usiaMulai || '-') + ', jenis: ' + (o.jenisRokok || '-') + '. Fagerstrom ' + o.skorFagerstrom +
    ' (' + label + '), motivasi ' + o.motivasi + '/10, tahap: ' + (o.tahap || '-') + '.' +
    (o.vapeInfo ? ' Rokok elektronik: ' + o.vapeInfo : '') +
    (o.motAlasan ? ' Alasan motivasi: ' + o.motAlasan : '');
  var tindak = 'Tanggal berhenti: ' + (o.tanggalBerhenti || '(belum ditentukan)') +
    '. Metode: ' + (o.metode || '-') + '. Dukungan keluarga: ' + (o.dukungan || '-') +
    '. Antisipasi gejala putus nikotin minggu pertama sudah dibahas.' +
    (o.konselor ? ' Konselor: ' + o.konselor + '.' : '') +
    (o.statusAwal ? ' Status awal (Lampiran 1): ' + o.statusAwal : '');
  var ks = ss_().getSheetByName(TAB_KONSELING);
  ks.appendRow([o.nik, o.nama || '', o.tanggal || '', 'Konseling 1', 'Masih merokok', o.co || '', o.bb || '', o.td || '', ringkas, tindak]);
  return { ok: true };
}

function saveKonseling(o) {
  // o: nik, nama, tanggal, jenis, statusMerokok, co, bb, td, kendala, tindak
  var r = findKlienRowByNik_(o.nik);
  if (r < 0) throw new Error('Klien tidak ditemukan. Daftarkan dulu di Klien Baru.');
  // Penilaian ulang opsional dari form toggle: perbarui kolom Klien M/N bila diisi
  if (o.skorFagerstrom !== '' && o.skorFagerstrom !== null && o.skorFagerstrom !== undefined) {
    ss_().getSheetByName(TAB_KLIEN).getRange(r, 13).setValue(Number(o.skorFagerstrom));
  }
  if (o.motivasi !== '' && o.motivasi !== null && o.motivasi !== undefined) {
    ss_().getSheetByName(TAB_KLIEN).getRange(r, 14).setValue(Number(o.motivasi));
  }
  var tindak = o.tindak || '';
  var penilaian = [];
  if (o.skorFagerstrom !== '' && o.skorFagerstrom !== null && o.skorFagerstrom !== undefined) penilaian.push('Fagerstrom ' + o.skorFagerstrom + ' (' + fagerstromLabel_(o.skorFagerstrom) + ')');
  if (o.motivasi !== '' && o.motivasi !== null && o.motivasi !== undefined) penilaian.push('Motivasi ' + o.motivasi + '/10');
  if (o.motAlasan) penilaian.push('Alasan motivasi: ' + o.motAlasan);
  if (o.jenisRokok) penilaian.push('Jenis rokok: ' + o.jenisRokok);
  if (o.vapeInfo) penilaian.push('Rokok elektronik: ' + o.vapeInfo);
  if (o.konselor) penilaian.push('Konselor: ' + o.konselor);
  if (penilaian.length) tindak = (tindak ? tindak + ' | ' : '') + 'Penilaian: ' + penilaian.join('; ');
  var ks = ss_().getSheetByName(TAB_KONSELING);
  ks.appendRow([
    o.nik, o.nama || '', o.tanggal || '', o.jenis || '',
    o.statusMerokok || '',
    o.co === '' || o.co === null ? '' : Number(o.co),
    o.bb === '' || o.bb === null ? '' : Number(o.bb),
    o.td || '',
    o.kendala || '', tindak
  ]);
  return { ok: true };
}

function updateKlienStatus(o) {
  // o: nik, status
  // Aturan baru: SUKSES hanya setelah 12 bulan berhenti tercatat di tab Konseling & FU.
  // Yang belum berhenti dicatat Konseling 1-6, yang sudah berhenti dicatat FU 1-7 (FU 7 = 12 bulan = CAR 12).
  var allowed = ['Aktif', 'SUKSES', 'KAMBUH', 'DO', 'Dirujuk'];
  if (allowed.indexOf(o.status) < 0) throw new Error('Status tidak dikenal.');
  var r = findKlienRowByNik_(o.nik);
  if (r < 0) throw new Error('Klien tidak ditemukan.');
  if (o.status === 'SUKSES') {
    var ks = ss_().getSheetByName(TAB_KONSELING);
    var last = ks.getLastRow();
    var hasCAR12 = false;
    if (last >= 2) {
      var vals = ks.getRange(2, 1, last - 1, 4).getValues();
      for (var i = 0; i < vals.length; i++) {
        if (String(vals[i][0]).replace(/\D/g, '') === String(o.nik).replace(/\D/g, '') && (String(vals[i][3]) === 'CAR 12' || String(vals[i][3]) === 'FU 7')) { hasCAR12 = true; break; }
      }
    }
    if (!hasCAR12) throw new Error('SUKSES hanya bisa dipilih setelah FU 7 (12 bulan setelah berhenti) atau CAR 12 tercatat untuk klien ini.');
  }
  ss_().getSheetByName(TAB_KLIEN).getRange(r, 17).setValue(o.status);
  return { ok: true };
}

function saveJadwal(o) {
  // o: tanggal, hari, jam, nik, nama, kehadiran, keterangan
  // Aturan layanan: Senin-Kamis, 12.00-13.00 WITA, maks 2 klien/hari
  var d = new Date(o.tanggal + 'T00:00:00');
  var dow = d.getDay(); // 0=Minggu, 5=Jumat, 6=Sabtu
  if (dow === 0 || dow === 5 || dow === 6) {
    throw new Error('Jadwal konseling hanya Senin-Kamis. Pilih hari Senin, Selasa, Rabu, atau Kamis.');
  }
  var sheet = ss_().getSheetByName(TAB_JADWAL);
  var last = sheet.getLastRow();
  var count = 0;
  if (last >= 2) {
    var vals = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      var v = vals[i][0];
      var s = (Object.prototype.toString.call(v) === '[object Date]')
        ? Utilities.formatDate(v, 'Asia/Makassar', 'yyyy-MM-dd') : String(v);
      if (s === o.tanggal) count++;
    }
  }
  if (count >= 2) {
    throw new Error('Tanggal ini sudah penuh (2 klien). Pilih tanggal lain.');
  }
  sheet.appendRow([
    o.tanggal, o.hari || '', o.jam || '12.00-13.00 WITA',
    o.nik || '', o.nama || '', o.kehadiran || '', o.keterangan || ''
  ]);
  return { ok: true, sudahTerisi: count + 1 };
}

function deleteKonselingRow(o) {
  // o: row (nomor baris Sheet di tab Konseling & FU). Hapus 1 baris riwayat berdasarkan tanggal/barisnya.
  var sheet = ss_().getSheetByName(TAB_KONSELING);
  var last = sheet.getLastRow();
  if (!o.row || o.row < 2 || o.row > last) throw new Error('Baris riwayat tidak ditemukan.');
  sheet.deleteRow(o.row);
  return { ok: true };
}

function deleteKlien(o) {
  // o: nik. Hapus klien + semua riwayat konseling/FU + semua jadwal untuk NIK itu (dari bawah ke atas).
  var nik = String(o.nik || '').replace(/\D/g, '');
  var r = findKlienRowByNik_(nik);
  if (r < 0) throw new Error('Klien tidak ditemukan.');
  var ks = ss_().getSheetByName(TAB_KONSELING);
  var last = ks.getLastRow();
  var hapusKonseling = 0;
  if (last >= 2) {
    var vals = ks.getRange(2, 1, last - 1, 1).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      if (String(vals[i][0]).replace(/\D/g, '') === nik) { ks.deleteRow(i + 2); hapusKonseling++; }
    }
  }
  var js = ss_().getSheetByName(TAB_JADWAL);
  last = js.getLastRow();
  var hapusJadwal = 0;
  if (last >= 2) {
    var jvals = js.getRange(2, 4, last - 1, 1).getValues();
    for (var j = jvals.length - 1; j >= 0; j--) {
      if (String(jvals[j][0]).replace(/\D/g, '') === nik) { js.deleteRow(j + 2); hapusJadwal++; }
    }
  }
  ss_().getSheetByName(TAB_KLIEN).deleteRow(r);
  return { ok: true, hapusKonseling: hapusKonseling, hapusJadwal: hapusJadwal };
}

function updateKonselingRow(o) {
  // o: row (nomor baris Sheet di tab Konseling & FU) + tanggal, jenis, statusMerokok, co, bb, td, kendala, tindak.
  // Mengubah satu baris riwayat berdasarkan tanggal/barisnya; NIK dan nama tidak diubah.
  var sheet = ss_().getSheetByName(TAB_KONSELING);
  var last = sheet.getLastRow();
  if (!o.row || o.row < 2 || o.row > last) throw new Error('Baris riwayat tidak ditemukan.');
  var co = (o.co === '' || o.co === null || o.co === undefined) ? '' : Number(o.co);
  var bb = (o.bb === '' || o.bb === null || o.bb === undefined) ? '' : Number(o.bb);
  sheet.getRange(o.row, 3, 1, 8).setValues([[o.tanggal || '', o.jenis || '', o.statusMerokok || '', co, bb, o.td || '', o.kendala || '', o.tindak || '']]);
  return { ok: true };
}

function updateKehadiran(o) {
  // o: row (nomor baris Sheet di tab Jadwal), kehadiran, keterangan
  var sheet = ss_().getSheetByName(TAB_JADWAL);
  sheet.getRange(o.row, 6).setValue(o.kehadiran || '');
  sheet.getRange(o.row, 7).setValue(o.keterangan || '');
  return { ok: true };
}
