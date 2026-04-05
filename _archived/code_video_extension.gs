// ============================================================
// PROMO DASHBOARD — Extension Video (Phase 0)
// Version : v1.0.0
// A fusionner dans code.gs (ajouter a la fin)
// + ajouter les cases dans doGet/doPost
// ============================================================

// ── Constantes video ─────────────────────────────────────────

var SHEET_NAME_STRATEGIE   = 'Strategie';
var SHEET_NAME_CONTENU     = 'Contenu';
var SHEET_NAME_PERFORMANCE = 'Performance';
var SHEET_NAME_ALGONOTES   = 'AlgoNotes';
var SHEET_NAME_ABTESTS     = 'ABTests';

// ── Helper : sheet to objects ────────────────────────────────

function sheetToObjects(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var obj = { _row: i + 1 };
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    result.push(obj);
  }
  return result;
}

// ── Helper : ISO week ────────────────────────────────────────

function getWeekISO(dateStr) {
  var d = dateStr ? new Date(dateStr) : new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  var week1 = new Date(d.getFullYear(), 0, 4);
  var weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return d.getFullYear() + '-W' + (weekNum < 10 ? '0' : '') + weekNum;
}

// ── GET : todayVideos ────────────────────────────────────────

function getTodayVideos() {
  var today = formatDate(new Date());
  var contenu = sheetToObjects(SHEET_NAME_CONTENU);
  var todayTasks = contenu.filter(function(r) {
    return String(r.date) === today;
  });
  return {
    ok: true,
    date: today,
    videos: todayTasks,
    count: todayTasks.length
  };
}

// ── GET : strategy ───────────────────────────────────────────

function getStrategy() {
  var rows = sheetToObjects(SHEET_NAME_STRATEGIE);
  var strategy = {};
  rows.forEach(function(r) {
    strategy[r.key] = r.value;
  });
  return { ok: true, strategy: strategy };
}

// ── GET : performance ────────────────────────────────────────

function getPerformance(dateFilter, weekFilter) {
  var perf = sheetToObjects(SHEET_NAME_PERFORMANCE);
  if (dateFilter) {
    perf = perf.filter(function(r) { return String(r.date) === dateFilter; });
  }
  if (weekFilter) {
    perf = perf.filter(function(r) { return getWeekISO(r.date) === weekFilter; });
  }
  return { ok: true, performance: perf, count: perf.length };
}

// ── GET : algonotes ──────────────────────────────────────────

function getAlgoNotes() {
  var notes = sheetToObjects(SHEET_NAME_ALGONOTES);
  return { ok: true, notes: notes, count: notes.length };
}

// ── GET : abtests ────────────────────────────────────────────

function getABTests() {
  var tests = sheetToObjects(SHEET_NAME_ABTESTS);
  return { ok: true, tests: tests, count: tests.length };
}

// ── GET : videoStats ─────────────────────────────────────────

function getVideoStats(dateFilter) {
  var today = dateFilter || formatDate(new Date());
  var week = getWeekISO(today);

  // Contenu de la semaine
  var contenu = sheetToObjects(SHEET_NAME_CONTENU);
  var weekContent = contenu.filter(function(r) { return getWeekISO(r.date) === week; });
  var wc = { planifie: 0, en_production: 0, publie: 0, skip: 0, total: 0 };
  weekContent.forEach(function(r) {
    var s = String(r.statut || '').toLowerCase();
    if (wc[s] !== undefined) wc[s]++;
    wc.total++;
  });

  // Performance de la semaine
  var perf = sheetToObjects(SHEET_NAME_PERFORMANCE);
  var weekPerf = perf.filter(function(r) { return getWeekISO(r.date) === week; });
  var wp = { total_vues: 0, total_likes: 0, best_hook: '', best_completion: 0 };
  weekPerf.forEach(function(r) {
    wp.total_vues += Number(r.vues) || 0;
    wp.total_likes += Number(r.likes) || 0;
    var comp = Number(r.completion) || 0;
    if (comp > wp.best_completion) {
      wp.best_completion = comp;
      wp.best_hook = String(r.hook || '').substring(0, 60);
    }
  });

  // Tests actifs
  var tests = sheetToObjects(SHEET_NAME_ABTESTS);
  var actifs = tests.filter(function(t) { return String(t.statut) === 'en_cours'; }).length;
  var termines = tests.filter(function(t) { return String(t.statut) === 'termine'; }).length;

  // Taches video aujourd'hui
  var todayVideos = contenu.filter(function(r) { return String(r.date) === today; });

  return {
    ok: true,
    date: today,
    week: week,
    today: {
      planifie: todayVideos.filter(function(r) { return r.statut === 'planifie'; }).length,
      publie: todayVideos.filter(function(r) { return r.statut === 'publie'; }).length,
      total: todayVideos.length
    },
    week_content: wc,
    week_perf: wp,
    tests: { actifs: actifs, termines: termines }
  };
}

// ── POST : addContent ────────────────────────────────────────

function addContent(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_CONTENU);
  if (!sheet) return { ok: false, error: 'Onglet Contenu introuvable' };

  var row = [
    body.date || formatDate(new Date()),
    body.plateforme || 'TikTok',
    body.compte || '',
    body.type || 'slide',
    body.produit || '',
    body.hook || '',
    body.langue || 'FR',
    body.duree || '',
    body.lien || '',
    body.statut || 'planifie',
    body.notes || '',
    body.promoCmd || ''
  ];
  sheet.appendRow(row);
  return { ok: true, added: row };
}

// ── POST : updateVideoStatus ─────────────────────────────────

function updateVideoStatus(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_CONTENU);
  if (!sheet) return { ok: false, error: 'Onglet Contenu introuvable' };

  var rowNum = Number(body.row);
  if (!rowNum || rowNum < 2) return { ok: false, error: 'row invalide' };

  // Colonne statut = 10, lien = 9
  if (body.statut) sheet.getRange(rowNum, 10).setValue(body.statut);
  if (body.lien) sheet.getRange(rowNum, 9).setValue(body.lien);

  return { ok: true, updated: rowNum, statut: body.statut };
}

// ── POST : updatePerf ────────────────────────────────────────

function updatePerf(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_PERFORMANCE);
  if (!sheet) return { ok: false, error: 'Onglet Performance introuvable' };

  var row = [
    body.date || formatDate(new Date()),
    body.plateforme || 'TikTok',
    body.compte || '',
    body.hook || '',
    body.langue || '',
    Number(body.vues) || 0,
    Number(body.watchMoyen) || 0,
    Number(body.completion) || 0,
    Number(body.likes) || 0,
    Number(body.comments) || 0,
    Number(body.shares) || 0,
    Number(body.profilVisits) || 0,
    Number(body.bioClicks) || 0,
    Number(body.installs) || 0,
    body.score || '',
    body.notes || ''
  ];
  sheet.appendRow(row);
  return { ok: true, added: row };
}

// ── POST : addAlgoNote ───────────────────────────────────────

function addAlgoNote(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_ALGONOTES);
  if (!sheet) return { ok: false, error: 'Onglet AlgoNotes introuvable' };

  var row = [
    body.date || formatDate(new Date()),
    body.plateforme || '',
    body.changement || '',
    body.source || '',
    body.impact || ''
  ];
  sheet.appendRow(row);
  return { ok: true, added: row };
}

// ── POST : addTest ───────────────────────────────────────────

function addTest(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_ABTESTS);
  if (!sheet) return { ok: false, error: 'Onglet ABTests introuvable' };

  var lastRow = sheet.getLastRow();
  var num = lastRow; // auto-increment

  var row = [
    num,
    body.dateDebut || formatDate(new Date()),
    body.variable || '',
    body.versionA || '',
    body.versionB || '',
    '', // gagnant
    body.metrique || '',
    '', // valeurA
    '', // valeurB
    '', // apprentissage
    'planifie'
  ];
  sheet.appendRow(row);
  return { ok: true, added: row, num: num };
}

// ── POST : updateTest ────────────────────────────────────────

function updateTest(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_ABTESTS);
  if (!sheet) return { ok: false, error: 'Onglet ABTests introuvable' };

  var rowNum = Number(body.row);
  if (!rowNum || rowNum < 2) return { ok: false, error: 'row invalide' };

  if (body.gagnant) sheet.getRange(rowNum, 6).setValue(body.gagnant);
  if (body.valeurA) sheet.getRange(rowNum, 8).setValue(body.valeurA);
  if (body.valeurB) sheet.getRange(rowNum, 9).setValue(body.valeurB);
  if (body.apprentissage) sheet.getRange(rowNum, 10).setValue(body.apprentissage);
  if (body.statut) sheet.getRange(rowNum, 11).setValue(body.statut);

  return { ok: true, updated: rowNum };
}

// ── POST : updateStrategy ────────────────────────────────────

function updateStrategy(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_STRATEGIE);
  if (!sheet) return { ok: false, error: 'Onglet Strategie introuvable' };

  var data = sheet.getDataRange().getValues();
  var found = false;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === body.key) {
      sheet.getRange(i + 1, 2).setValue(body.value);
      found = true;
      break;
    }
  }
  if (!found) {
    sheet.appendRow([body.key, body.value]);
  }
  return { ok: true, key: body.key, updated: found, inserted: !found };
}

// ── SETUP VIDEO — Cree les 5 onglets + seed data ─────────────

function setupVideo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── Strategie ──
  var stratSheet = ss.getSheetByName(SHEET_NAME_STRATEGIE);
  if (!stratSheet) {
    stratSheet = ss.insertSheet(SHEET_NAME_STRATEGIE);
    stratSheet.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
    var stratData = [
      ['objectif_principal', 'Installs DictoKey (Play Store, 4.99 EUR/mois)'],
      ['objectif_secondaire', 'Trafic NoCodeFlow (affiliation Make.com 35%)'],
      ['produit_star', 'DictoKey'],
      ['avatar', 'Luna Rae "Chic Tech Maven" (HeyGen Engine III)'],
      ['voix_en', 'Luna Rae Voice 3 (ffwaswFKk4KL23PVLImO)'],
      ['voix_fr', 'OpenAI TTS nova (speed 1.12) + HeyGen lip-sync'],
      ['format_principal', 'Split screen (screen recording + avatar) 9:16 vertical'],
      ['cadence_videos', '3 videos/semaine (Lun EN, Mer FR, Ven bonus)'],
      ['budget_mensuel', '~12 USD (HeyGen + TTS)'],
      ['tiktok_fr', '@se7en.news.ai (4323 followers)'],
      ['tiktok_en', '@se7en.video.ai (280 followers)'],
      ['seuil_viral_tiktok', '70% completion rate'],
      ['hook_rule', '65%+ retention a 3s = 4-7x impressions'],
      ['duree_optimale', '7-15s (facile 70% completion), 21-34s (bon compromis)']
    ];
    stratSheet.getRange(2, 1, stratData.length, 2).setValues(stratData);
  }

  // ── Contenu ──
  var contSheet = ss.getSheetByName(SHEET_NAME_CONTENU);
  if (!contSheet) {
    contSheet = ss.insertSheet(SHEET_NAME_CONTENU);
    contSheet.getRange(1, 1, 1, 12).setValues([['date', 'plateforme', 'compte', 'type', 'produit', 'hook', 'langue', 'duree', 'lien', 'statut', 'notes', 'promoCmd']]);

    // Seed : une semaine de contenu planifie
    var today = new Date();
    var monday = new Date(today);
    monday.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));

    var seed = [];
    for (var w = 0; w < 2; w++) {
      var base = new Date(monday);
      base.setDate(base.getDate() + w * 7);

      // Lundi : Video DictoKey EN
      var lun = new Date(base);
      seed.push([formatDate(lun), 'TikTok', '@se7en.video.ai', 'slide', 'DictoKey', 'AI voice keyboard - type 10x faster', 'EN', '', '', 'planifie', '', '/promo en DictoKey AI voice keyboard type 10x faster']);

      // Mercredi : Video DictoKey FR
      var mer = new Date(base);
      mer.setDate(mer.getDate() + 2);
      seed.push([formatDate(mer), 'TikTok', '@se7en.news.ai', 'slide', 'DictoKey', 'Clavier vocal IA - dictee 10x plus rapide', 'FR', '', '', 'planifie', '', '/promo fr DictoKey clavier vocal IA dictee rapide']);

      // Vendredi : Video NoCodeFlow EN
      var ven = new Date(base);
      ven.setDate(ven.getDate() + 4);
      seed.push([formatDate(ven), 'TikTok', '@se7en.video.ai', 'slide', 'NoCodeFlow', 'Automate everything without writing code', 'EN', '', '', 'planifie', '', '/promo en NoCodeFlow automate everything without code']);
    }
    contSheet.getRange(2, 1, seed.length, 12).setValues(seed);
  }

  // ── Performance ──
  var perfSheet = ss.getSheetByName(SHEET_NAME_PERFORMANCE);
  if (!perfSheet) {
    perfSheet = ss.insertSheet(SHEET_NAME_PERFORMANCE);
    perfSheet.getRange(1, 1, 1, 16).setValues([['date', 'plateforme', 'compte', 'hook', 'langue', 'vues', 'watchMoyen', 'completion', 'likes', 'comments', 'shares', 'profilVisits', 'bioClicks', 'installs', 'score', 'notes']]);
  }

  // ── AlgoNotes ──
  var algoSheet = ss.getSheetByName(SHEET_NAME_ALGONOTES);
  if (!algoSheet) {
    algoSheet = ss.insertSheet(SHEET_NAME_ALGONOTES);
    algoSheet.getRange(1, 1, 1, 5).setValues([['date', 'plateforme', 'changement', 'source', 'impact']]);
    var algoSeed = [
      [formatDate(new Date()), 'TikTok', 'Seuil viral monte a 70% completion rate', 'Socialync 2026', 'Raccourcir les videos (7-15s)'],
      [formatDate(new Date()), 'TikTok', 'Retention 3s: 65%+ = 4-7x impressions', 'OpusClip', 'Hook payoff dans les 3 premieres secondes'],
      [formatDate(new Date()), 'TikTok', 'Pattern interrupt toutes les 3-5 secondes', 'TikTok support', 'Coupes, zooms, texte overlay reguliers'],
      [formatDate(new Date()), 'Instagram', 'Watermark TikTok supprime la reach', 'Sprout Social', 'Toujours poster fichier original sans watermark'],
      [formatDate(new Date()), 'General', 'AI UGC = 4x CTR vs ads traditionnelles', 'HeyGen research', 'Investir dans avatar IA plutot que contenu statique']
    ];
    algoSheet.getRange(2, 1, algoSeed.length, 5).setValues(algoSeed);
  }

  // ── ABTests ──
  var testSheet = ss.getSheetByName(SHEET_NAME_ABTESTS);
  if (!testSheet) {
    testSheet = ss.insertSheet(SHEET_NAME_ABTESTS);
    testSheet.getRange(1, 1, 1, 11).setValues([['num', 'dateDebut', 'variable', 'versionA', 'versionB', 'gagnant', 'metrique', 'valeurA', 'valeurB', 'apprentissage', 'statut']]);
    var testSeed = [
      [1, formatDate(new Date()), 'Hook type', 'Screen recording seul', 'Avatar + screen split', '', 'Completion %', '', '', '', 'planifie'],
      [2, formatDate(new Date()), 'Duree video', '10 secondes', '15 secondes', '', 'Completion %', '', '', '', 'planifie'],
      [3, formatDate(new Date()), 'Langue', 'EN', 'FR', '', 'Vues', '', '', '', 'planifie']
    ];
    testSheet.getRange(2, 1, testSeed.length, 11).setValues(testSeed);
  }

  return { ok: true, message: 'Setup video complete - 5 onglets crees' };
}
