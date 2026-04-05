// ============================================================
// PROMO COMMAND CENTER — Google Apps Script Backend
// Version : v1.0.0
// Projet  : Systeme de pilotage promo multi-plateforme
// Date    : 05/04/2026
// ============================================================
//
// DEPLOIEMENT :
//   1. Creer un nouveau Google Sheet vide
//   2. Extensions > Apps Script > coller ce code
//   3. Executer setup() une premiere fois (menu ou manuellement)
//   4. Deployer > Nouvelle version > Application Web
//   5. Acces : Tout le monde (anonymous)
//   6. Copier l'URL de deploiement
//
// ENDPOINTS :
//   GET  ?action=setup          → Cree les 5 onglets + seed data
//   GET  ?action=strategy       → Contenu onglet Strategie
//   GET  ?action=content        → Calendrier contenu (filtre ?date=YYYY-MM-DD)
//   GET  ?action=performance    → Metriques performance (filtre ?date= ou ?week=)
//   GET  ?action=algonotes      → Notes algorithmes
//   GET  ?action=abtests        → Historique A/B tests
//   GET  ?action=stats          → Stats resumees (semaine en cours)
//   GET  ?action=today          → Contenu prevu aujourd'hui
//   POST action=addContent      → Ajouter une entree contenu
//   POST action=updatePerf      → Mettre a jour les perfs d'une video
//   POST action=addAlgoNote     → Ajouter une note algo
//   POST action=addTest         → Ajouter un A/B test
//   POST action=updateTest      → Mettre a jour un A/B test (gagnant)
//   POST action=updateStatus    → Changer statut d'un contenu
//   POST action=updateStrategy  → Mettre a jour une ligne strategie
// ============================================================

// -- Noms des onglets --
var SHEET_STRATEGIE   = 'Strategie';
var SHEET_CONTENU     = 'Contenu';
var SHEET_PERFORMANCE = 'Performance';
var SHEET_ALGONOTES   = 'Algo Notes';
var SHEET_ABTESTS     = 'A/B Tests';

// ── Point d'entree GET ──

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';
  var date   = (e && e.parameter && e.parameter.date) || '';
  var week   = (e && e.parameter && e.parameter.week) || '';

  var result;
  try {
    switch (action) {
      case 'setup':      result = setup(); break;
      case 'strategy':   result = getStrategy(); break;
      case 'content':    result = getContent(date); break;
      case 'performance':result = getPerformance(date, week); break;
      case 'algonotes':  result = getAlgoNotes(); break;
      case 'abtests':    result = getABTests(); break;
      case 'stats':      result = getStats(); break;
      case 'today':      result = getToday(); break;
      default:           result = { ok: false, error: 'Action inconnue: ' + action };
    }
  } catch (err) {
    result = { ok: false, error: err.toString() };
  }
  return buildResponse(result);
}

// ── Point d'entree POST ──

function doPost(e) {
  var body = {};
  var action = '';
  try {
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      body = e.parameter;
    }
    action = body.action || '';
  } catch (err) {
    return buildResponse({ ok: false, error: 'Payload JSON invalide: ' + err.toString() });
  }

  var result;
  try {
    switch (action) {
      case 'addContent':      result = addContent(body); break;
      case 'updatePerf':      result = updatePerf(body); break;
      case 'addAlgoNote':     result = addAlgoNote(body); break;
      case 'addTest':         result = addTest(body); break;
      case 'updateTest':      result = updateTest(body); break;
      case 'updateStatus':    result = updateStatus(body); break;
      case 'updateStrategy':  result = updateStrategy(body); break;
      default:                result = { ok: false, error: 'Action POST inconnue: ' + action };
    }
  } catch (err) {
    result = { ok: false, error: err.toString() };
  }
  return buildResponse(result);
}

// ── Response builder ──

function buildResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ══════════════════════════════════════════════════════════════
// SETUP — Cree les 5 onglets + seed data
// ══════════════════════════════════════════════════════════════

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // -- 1. STRATEGIE --
  var s1 = getOrCreateSheet(ss, SHEET_STRATEGIE);
  s1.clear();
  s1.getRange('A1:B1').setValues([['Cle', 'Valeur']]);
  s1.getRange('A1:B1').setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  var stratData = [
    ['objectif_principal', 'Installs DictoKey (Play Store)'],
    ['objectif_secondaire', 'Trafic NoCodeFlow (affiliation Make.com 35%)'],
    ['produit_star', 'DictoKey - Clavier vocal IA, 52 langues, 4.99 EUR/mois'],
    ['avatar', 'Luna Rae "Chic Tech Maven" (HeyGen Engine III)'],
    ['voix_en', 'Luna Rae Voice 3 (ffwaswFKk4KL23PVLImO)'],
    ['voix_fr', 'OpenAI TTS nova (speed 1.12) + HeyGen lip-sync'],
    ['format_principal', 'Micro-demo 10-15s proof-first + avatar split screen'],
    ['format_secondaire', 'Slides NoCodeFlow 15-20s'],
    ['cadence_videos', '5-6/semaine (3 DictoKey EN, 2 DictoKey FR, 1 slide NCF)'],
    ['cadence_textes', 'Quotidien lun-ven (FB groupes + X + Dev.to)'],
    ['budget_mensuel', '~12 USD (HeyGen + TTS)'],
    ['tiktok_fr', '@se7en.news.ai (4323 followers, Business, lien bio OK)'],
    ['tiktok_en', '@se7en.video.ai (279 followers, Business, lien bio NON <1000)'],
    ['instagram', 'Bruce Li (Business, dormant)'],
    ['x_twitter', '@BruceLi60392934 (OAuth 2.0)'],
    ['youtube', 'A verifier'],
    ['linktree', 'linktr.ee/se7enai (DictoKey #1)'],
    ['seuil_viral_tiktok', '70% completion rate (releve de 50% en 2024)'],
    ['hook_rule', '65%+ retention a 3s = 4-7x impressions'],
    ['duree_optimale', '7-15s (facile 70% completion), 21-34s (bon compromis)'],
    ['derniere_maj', new Date().toISOString().slice(0, 10)]
  ];
  s1.getRange(2, 1, stratData.length, 2).setValues(stratData);
  s1.setColumnWidth(1, 200);
  s1.setColumnWidth(2, 500);

  // -- 2. CONTENU --
  var s2 = getOrCreateSheet(ss, SHEET_CONTENU);
  s2.clear();
  var contentHeaders = [
    'Date', 'Plateforme', 'Compte', 'Type', 'Produit', 'Hook',
    'Langue', 'Duree (s)', 'Lien post', 'Statut', 'Notes'
  ];
  s2.getRange(1, 1, 1, contentHeaders.length).setValues([contentHeaders]);
  s2.getRange(1, 1, 1, contentHeaders.length).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  // Seed: premiere semaine planifiee
  var seedContent = [
    [nextMonday(0), 'TikTok', '@se7en.news.ai', 'avatar+screen', 'DictoKey', '100 mots sans toucher le clavier', 'FR', '12', '', 'planifie', ''],
    [nextMonday(0), 'TikTok', '@se7en.video.ai', 'avatar+screen', 'DictoKey', '100 words without keyboard', 'EN', '12', '', 'planifie', ''],
    [nextMonday(0), 'Instagram', 'Bruce Li', 'repost', 'DictoKey', 'idem EN', 'EN', '12', '', 'planifie', 'sans watermark'],
    [nextMonday(0), 'YouTube Shorts', '-', 'repost', 'DictoKey', 'idem EN', 'EN', '12', '', 'planifie', 'CTA search Play Store'],
    [nextMonday(0), 'X/Twitter', '@BruceLi60392934', 'video+lien', 'DictoKey', 'idem EN', 'EN', '12', '', 'planifie', 'lien Play Store direct'],
    [nextMonday(1), 'Facebook', 'Groupes', 'texte', 'NoCodeFlow', 'article rotation', 'EN', '', '', 'planifie', 'via promo-dashboard'],
    [nextMonday(1), 'X/Twitter', '@BruceLi60392934', 'texte', 'NoCodeFlow', 'article rotation', 'EN', '', '', 'planifie', ''],
    [nextMonday(1), 'Dev.to', '@se7enai', 'article', 'NoCodeFlow', 'cross-post', 'EN', '', '', 'planifie', ''],
    [nextMonday(2), 'TikTok', '@se7en.news.ai', 'avatar+screen', 'DictoKey', 'Message en thai sans parler thai', 'FR', '13', '', 'planifie', ''],
    [nextMonday(2), 'TikTok', '@se7en.video.ai', 'avatar+screen', 'DictoKey', 'Ordered food in Thai without speaking Thai', 'EN', '13', '', 'planifie', ''],
    [nextMonday(3), 'Facebook', 'Groupes', 'texte', 'NoCodeFlow', 'article rotation', 'EN', '', '', 'planifie', ''],
    [nextMonday(3), 'X/Twitter', '@BruceLi60392934', 'texte', 'NoCodeFlow', 'article rotation', 'EN', '', '', 'planifie', ''],
    [nextMonday(4), 'TikTok', '@se7en.news.ai', 'slide', 'NoCodeFlow', '7 outils automation gratuits', 'FR', '18', '', 'planifie', ''],
    [nextMonday(4), 'TikTok', '@se7en.video.ai', 'avatar+screen', 'DictoKey', 'Email dicte en 5 secondes', 'EN', '14', '', 'planifie', ''],
  ];
  s2.getRange(2, 1, seedContent.length, contentHeaders.length).setValues(seedContent);
  s2.setColumnWidth(1, 100);
  s2.setColumnWidth(6, 250);
  s2.setColumnWidth(9, 200);
  s2.setColumnWidth(11, 200);

  // -- 3. PERFORMANCE --
  var s3 = getOrCreateSheet(ss, SHEET_PERFORMANCE);
  s3.clear();
  var perfHeaders = [
    'Date', 'Plateforme', 'Compte', 'Hook resume', 'Langue',
    'Vues', 'Watch moyen (s)', 'Completion %', 'Likes', 'Comments',
    'Shares', 'Profil visits', 'Bio clicks', 'Installs est.', 'Score', 'Notes'
  ];
  s3.getRange(1, 1, 1, perfHeaders.length).setValues([perfHeaders]);
  s3.getRange(1, 1, 1, perfHeaders.length).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  // Seed: donnees historiques connues
  var seedPerf = [
    ['2026-04-05', 'TikTok', '@se7en.video.ai', 'DictoKey v1 texte statique', 'EN', '207', '4.93', '9', '', '', '', '', '', '', 'D', 'Hook rate - texte statique'],
    ['2026-04-05', 'TikTok', '@se7en.video.ai', 'DictoKey v2 avatar split screen', 'EN', '5738', '1.0', '4', '28', '', '', '', '', '', 'D', 'Hook avatar seule ne capte pas, 1.0s watch moyen'],
  ];
  s3.getRange(2, 1, seedPerf.length, perfHeaders.length).setValues(seedPerf);
  s3.setColumnWidth(4, 250);
  s3.setColumnWidth(16, 250);

  // -- 4. ALGO NOTES --
  var s4 = getOrCreateSheet(ss, SHEET_ALGONOTES);
  s4.clear();
  var algoHeaders = ['Date', 'Plateforme', 'Changement observe', 'Source', 'Impact strategie'];
  s4.getRange(1, 1, 1, algoHeaders.length).setValues([algoHeaders]);
  s4.getRange(1, 1, 1, algoHeaders.length).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  var seedAlgo = [
    ['2026-04', 'TikTok', 'Seuil viral passe de 50% a 70% completion rate', 'Socialync 2026', 'Raccourcir videos a 10-15s pour maximiser completion'],
    ['2026-04', 'TikTok', '65%+ retention a 3s = 4-7x impressions', 'OpusClip 2026', 'Hook proof-first obligatoire, pas d\'intro'],
    ['2026-04', 'TikTok', 'Niche > viral : contenu niche resonne mieux que generique', 'Sprout Social', 'Rester focus DictoKey, pas diluer'],
    ['2026-04', 'TikTok', 'Pattern interrupt toutes les 3-5s maintient attention', 'Socialync', 'Ajouter cuts/zoom/texte overlay dans montage'],
    ['2026-04', 'TikTok', 'Lien bio Business = 1000 followers min (meme en Business)', 'TikTok support', '@se7en.video.ai (279) pas de lien cliquable'],
    ['2026-04', 'YouTube Shorts', 'Liens non cliquables dans description depuis 2024', 'YouTube support', 'CTA = overlay texte "Search DictoKey on Play Store"'],
    ['2026-04', 'YouTube Shorts', '5.91% engagement rate (meilleur toutes plateformes)', 'Loopex Digital', 'Poster systematiquement les videos sur Shorts'],
    ['2026-04', 'Instagram Reels', 'Liens cliquables = Meta Verified Plus only ($15/mois)', 'Social Media Examiner', 'Focus DM auto ou link in bio'],
    ['2026-04', 'Instagram Reels', 'Watermark TikTok = reach supprimee', 'Cross-posting guides', 'Toujours poster fichier original sans watermark'],
    ['2026-04', 'X/Twitter', 'Seul reseau avec lien direct cliquable dans le post', 'API docs', 'Toujours inclure lien Play Store dans les tweets'],
    ['2026-04', 'X/Twitter', 'Free tier = 500 posts/mois, media upload incertain', 'Dev reports', 'Tester media upload, fallback texte+lien'],
    ['2026-04', 'General', 'AI UGC = 4x CTR vs ads traditionnelles', 'VideoTok 2026', 'Confirme strategie avatar Luna Rae'],
    ['2026-04', 'General', 'Viewers detectent IA que 57% du temps (coin flip)', 'Meta-analyse 86K participants', 'Pas de stigmate AI, continuer avatars'],
    ['2026-04', 'General', '20-30 variations necessaires pour trouver gagnantes', 'TikTok Ads guide', 'Volume de test > perfectionnisme'],
  ];
  s4.getRange(2, 1, seedAlgo.length, algoHeaders.length).setValues(seedAlgo);
  s4.setColumnWidth(3, 400);
  s4.setColumnWidth(4, 200);
  s4.setColumnWidth(5, 350);

  // -- 5. A/B TESTS --
  var s5 = getOrCreateSheet(ss, SHEET_ABTESTS);
  s5.clear();
  var testHeaders = ['#', 'Date debut', 'Variable testee', 'Version A', 'Version B', 'Gagnant', 'Metrique', 'Valeur A', 'Valeur B', 'Apprentissage', 'Statut'];
  s5.getRange(1, 1, 1, testHeaders.length).setValues([testHeaders]);
  s5.getRange(1, 1, 1, testHeaders.length).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  var seedTests = [
    ['1', '', 'Hook type', 'Screen recording seul', 'Avatar + screen split', '', 'Completion %', '', '', '', 'planifie'],
    ['2', '', 'Duree video', '10s', '15s', '', 'Completion %', '', '', '', 'planifie'],
    ['3', '', 'Langue', 'EN', 'FR', '', 'Vues totales', '', '', '', 'planifie'],
    ['4', '', 'Avec/sans avatar', 'Avatar Luna Rae', 'Screen recording only', '', 'Completion %', '', '', '', 'planifie'],
    ['5', '', 'Hook script', '100 words without keyboard', 'Ordered food in Thai', '', 'Retention 3s', '', '', '', 'planifie'],
  ];
  s5.getRange(2, 1, seedTests.length, testHeaders.length).setValues(seedTests);
  s5.setColumnWidth(3, 200);
  s5.setColumnWidth(4, 200);
  s5.setColumnWidth(5, 200);
  s5.setColumnWidth(10, 300);

  // Supprimer Sheet1 par defaut si vide
  try {
    var defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('Feuille 1');
    if (defaultSheet && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);
  } catch(e) {}

  return { ok: true, message: 'Setup termine. 5 onglets crees avec seed data.', sheets: [SHEET_STRATEGIE, SHEET_CONTENU, SHEET_PERFORMANCE, SHEET_ALGONOTES, SHEET_ABTESTS] };
}

// ══════════════════════════════════════════════════════════════
// GET ENDPOINTS
// ══════════════════════════════════════════════════════════════

function getStrategy() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_STRATEGIE);
  if (!sheet) return { ok: false, error: 'Onglet Strategie introuvable' };
  var data = sheet.getDataRange().getValues();
  var result = {};
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) result[data[i][0]] = data[i][1];
  }
  return { ok: true, strategy: result };
}

function getContent(date) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONTENU);
  if (!sheet) return { ok: false, error: 'Onglet Contenu introuvable' };
  var rows = sheetToObjects(sheet);
  if (date) {
    rows = rows.filter(function(r) { return r.Date === date; });
  }
  return { ok: true, content: rows, count: rows.length };
}

function getToday() {
  var today = new Date().toISOString().slice(0, 10);
  return getContent(today);
}

function getPerformance(date, week) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PERFORMANCE);
  if (!sheet) return { ok: false, error: 'Onglet Performance introuvable' };
  var rows = sheetToObjects(sheet);
  if (date) {
    rows = rows.filter(function(r) { return r.Date === date; });
  }
  if (week) {
    // Filtre par semaine (YYYY-Wxx)
    rows = rows.filter(function(r) { return getWeek(r.Date) === week; });
  }
  return { ok: true, performance: rows, count: rows.length };
}

function getAlgoNotes() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ALGONOTES);
  if (!sheet) return { ok: false, error: 'Onglet Algo Notes introuvable' };
  return { ok: true, notes: sheetToObjects(sheet) };
}

function getABTests() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ABTESTS);
  if (!sheet) return { ok: false, error: 'Onglet A/B Tests introuvable' };
  return { ok: true, tests: sheetToObjects(sheet) };
}

function getStats() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Stats contenu
  var contentSheet = ss.getSheetByName(SHEET_CONTENU);
  var contentRows = contentSheet ? sheetToObjects(contentSheet) : [];
  var today = new Date().toISOString().slice(0, 10);
  var thisWeek = getWeek(today);

  var todayTasks = contentRows.filter(function(r) { return r.Date === today; });
  var weekTasks = contentRows.filter(function(r) { return getWeek(r.Date) === thisWeek; });

  var todayStats = countStatuses(todayTasks);
  var weekStats = countStatuses(weekTasks);

  // Stats performance
  var perfSheet = ss.getSheetByName(SHEET_PERFORMANCE);
  var perfRows = perfSheet ? sheetToObjects(perfSheet) : [];
  var weekPerfs = perfRows.filter(function(r) { return getWeek(r.Date) === thisWeek; });

  var totalVues = 0, totalLikes = 0, bestHook = '', bestCompletion = 0;
  weekPerfs.forEach(function(r) {
    totalVues += parseInt(r.Vues || '0', 10);
    totalLikes += parseInt(r.Likes || '0', 10);
    var comp = parseFloat(r['Completion %'] || '0');
    if (comp > bestCompletion) {
      bestCompletion = comp;
      bestHook = r['Hook resume'] || '';
    }
  });

  // Stats A/B tests
  var testSheet = ss.getSheetByName(SHEET_ABTESTS);
  var testRows = testSheet ? sheetToObjects(testSheet) : [];
  var activeTests = testRows.filter(function(r) { return r.Statut === 'en_cours'; }).length;
  var completedTests = testRows.filter(function(r) { return r.Statut === 'termine'; }).length;

  return {
    ok: true,
    date: today,
    week: thisWeek,
    today: todayStats,
    week_content: weekStats,
    week_perf: {
      total_vues: totalVues,
      total_likes: totalLikes,
      best_hook: bestHook,
      best_completion: bestCompletion
    },
    tests: { actifs: activeTests, termines: completedTests }
  };
}

// ══════════════════════════════════════════════════════════════
// POST ENDPOINTS
// ══════════════════════════════════════════════════════════════

function addContent(body) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONTENU);
  if (!sheet) return { ok: false, error: 'Onglet Contenu introuvable' };
  var row = [
    body.date || new Date().toISOString().slice(0, 10),
    body.plateforme || '',
    body.compte || '',
    body.type || '',
    body.produit || 'DictoKey',
    body.hook || '',
    body.langue || 'EN',
    body.duree || '',
    body.lien || '',
    body.statut || 'planifie',
    body.notes || ''
  ];
  sheet.appendRow(row);
  return { ok: true, added: row, rowNum: sheet.getLastRow() };
}

function updateStatus(body) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONTENU);
  if (!sheet) return { ok: false, error: 'Onglet Contenu introuvable' };
  var row = parseInt(body.row, 10);
  if (!row || row < 2) return { ok: false, error: 'Row invalide' };
  var statusCol = 10; // colonne J = Statut
  sheet.getRange(row, statusCol).setValue(body.statut || 'publie');
  if (body.lien) sheet.getRange(row, 9).setValue(body.lien); // colonne I = Lien
  return { ok: true, row: row, statut: body.statut };
}

function updatePerf(body) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PERFORMANCE);
  if (!sheet) return { ok: false, error: 'Onglet Performance introuvable' };
  var row = [
    body.date || new Date().toISOString().slice(0, 10),
    body.plateforme || '',
    body.compte || '',
    body.hook || '',
    body.langue || '',
    body.vues || '',
    body.watch_moyen || '',
    body.completion || '',
    body.likes || '',
    body.comments || '',
    body.shares || '',
    body.profil_visits || '',
    body.bio_clicks || '',
    body.installs || '',
    body.score || '',
    body.notes || ''
  ];
  sheet.appendRow(row);
  return { ok: true, added: row, rowNum: sheet.getLastRow() };
}

function addAlgoNote(body) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ALGONOTES);
  if (!sheet) return { ok: false, error: 'Onglet Algo Notes introuvable' };
  var row = [
    body.date || new Date().toISOString().slice(0, 7),
    body.plateforme || '',
    body.changement || '',
    body.source || '',
    body.impact || ''
  ];
  sheet.appendRow(row);
  return { ok: true, added: row };
}

function addTest(body) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ABTESTS);
  if (!sheet) return { ok: false, error: 'Onglet A/B Tests introuvable' };
  var lastRow = sheet.getLastRow();
  var nextNum = lastRow; // numero sequentiel
  var row = [
    String(nextNum),
    body.date || new Date().toISOString().slice(0, 10),
    body.variable || '',
    body.version_a || '',
    body.version_b || '',
    '',
    body.metrique || 'Completion %',
    '', '', '',
    'en_cours'
  ];
  sheet.appendRow(row);
  return { ok: true, added: row, testNum: nextNum };
}

function updateTest(body) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ABTESTS);
  if (!sheet) return { ok: false, error: 'Onglet A/B Tests introuvable' };
  var row = parseInt(body.row, 10);
  if (!row || row < 2) return { ok: false, error: 'Row invalide' };
  if (body.gagnant) sheet.getRange(row, 6).setValue(body.gagnant);
  if (body.valeur_a) sheet.getRange(row, 8).setValue(body.valeur_a);
  if (body.valeur_b) sheet.getRange(row, 9).setValue(body.valeur_b);
  if (body.apprentissage) sheet.getRange(row, 10).setValue(body.apprentissage);
  sheet.getRange(row, 11).setValue('termine');
  return { ok: true, row: row, statut: 'termine' };
}

function updateStrategy(body) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_STRATEGIE);
  if (!sheet) return { ok: false, error: 'Onglet Strategie introuvable' };
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === body.cle) {
      sheet.getRange(i + 1, 2).setValue(body.valeur);
      return { ok: true, updated: body.cle, valeur: body.valeur };
    }
  }
  // Cle pas trouvee, ajouter
  sheet.appendRow([body.cle, body.valeur]);
  return { ok: true, added: body.cle, valeur: body.valeur };
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function sheetToObjects(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = { _row: i + 1 };
    for (var j = 0; j < headers.length; j++) {
      var val = data[i][j];
      // Convertir les dates en string YYYY-MM-DD
      if (val instanceof Date) {
        val = val.toISOString().slice(0, 10);
      }
      obj[headers[j]] = val;
    }
    rows.push(obj);
  }
  return rows;
}

function countStatuses(rows) {
  var counts = { planifie: 0, en_production: 0, publie: 0, skip: 0, total: rows.length };
  rows.forEach(function(r) {
    var s = (r.Statut || '').toLowerCase().replace(/é/g, 'e');
    if (s === 'planifie') counts.planifie++;
    else if (s === 'en_production') counts.en_production++;
    else if (s === 'publie') counts.publie++;
    else if (s === 'skip') counts.skip++;
  });
  return counts;
}

function getWeek(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  var week1 = new Date(d.getFullYear(), 0, 4);
  var weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return d.getFullYear() + '-W' + (weekNum < 10 ? '0' : '') + weekNum;
}

function nextMonday(dayOffset) {
  var d = new Date();
  var day = d.getDay();
  var diff = (day === 0 ? 1 : 8 - day); // jours jusqu'a lundi prochain
  d.setDate(d.getDate() + diff + dayOffset);
  return d.toISOString().slice(0, 10);
}
