// ============================================================
// PROMO DASHBOARD — Google Apps Script Backend
// Version : v2.0.0
// Projet  : NoCodeFlow — Stratégie Promo Multi-Plateforme
// Auteur  : Claude Code (Anthropic) — 16/03/2026
// ============================================================
//
// DÉPLOIEMENT :
//   Extensions > Apps Script > coller ce code
//   Déployer > Nouvelle version > Application Web
//   Accès : Tout le monde (anonymous)
//   Copier l'URL de déploiement → variable APPS_SCRIPT_URL dans le dashboard HTML
// ============================================================

// ── Constantes ──────────────────────────────────────────────

var SHEET_NAME_CONFIG   = 'Config';
var SHEET_NAME_PLANNING = 'Planning';
var SHEET_NAME_ARTICLES = 'Articles';
var SHEET_NAME_TEXTES   = 'Textes';
var SHEET_NAME_STRATEGIE   = 'Strategie';
var SHEET_NAME_CONTENU     = 'Contenu';
var SHEET_NAME_PERFORMANCE = 'Performance';
var SHEET_NAME_ALGONOTES   = 'AlgoNotes';
var SHEET_NAME_ABTESTS     = 'ABTests';

// ── Point d'entrée GET ──────────────────────────────────────

function doGet(e) {
  var action = e && e.parameter && e.parameter.action ? e.parameter.action : '';
  var date   = e && e.parameter && e.parameter.date   ? e.parameter.date   : '';

  var result;
  try {
    switch (action) {
      case 'today':
        result = getToday();
        break;
      case 'config':
        result = getConfig();
        break;
      case 'stats':
        result = getStats(date);
        break;
      case 'setup':
        result = setup();
        break;
      case 'debug':
        result = getDebug(date);
        break;
      case 'todayVideos':
        result = getTodayVideos();
        break;
      case 'allVideos':
        result = getAllVideos();
        break;
      case 'strategy':
        result = getStrategy();
        break;
      case 'performance':
        result = getPerformance(date, e && e.parameter ? e.parameter.week : '');
        break;
      case 'algonotes':
        result = getAlgoNotes();
        break;
      case 'abtests':
        result = getABTests();
        break;
      case 'videoStats':
        result = getVideoStats(date);
        break;
      case 'setupVideo':
        result = setupVideo();
        break;
      case 'addMissingConfig':
        result = addMissingConfig();
        break;
      case 'refreshContent':
        result = refreshContent();
        break;
      case 'weekPlanning':
        result = getWeekPlanning(date);
        break;
      case 'trendingAngles':
        result = getTrendingAngles();
        break;
      default:
        result = { ok: false, error: 'Action inconnue : ' + action };
    }
  } catch (err) {
    result = { ok: false, error: err.toString() };
  }

  return buildResponse(result);
}

// ── Point d'entrée POST ─────────────────────────────────────

function doPost(e) {
  var body   = {};
  var action = '';

  try {
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      body = e.parameter;
    }
    action = body.action || (e && e.parameter && e.parameter.action) || '';
  } catch (err) {
    return buildResponse({ ok: false, error: 'Payload JSON invalide : ' + err.toString() });
  }

  var result;
  try {
    switch (action) {
      case 'done':
        result = markDone(body);
        break;
      case 'skip':
        result = markSkip(body);
        break;
      case 'toggle':
        result = toggleActive(body);
        break;
      case 'generate':
        result = generatePlanning(body);
        break;
      case 'addContent':
        result = addContent(body);
        break;
      case 'updateVideoStatus':
        result = updateVideoStatus(body);
        break;
      case 'updatePerf':
        result = updatePerf(body);
        break;
      case 'addAlgoNote':
        result = addAlgoNote(body);
        break;
      case 'addTest':
        result = addTest(body);
        break;
      case 'updateTest':
        result = updateTest(body);
        break;
      case 'updateStrategy':
        result = updateStrategy(body);
        break;
      default:
        result = { ok: false, error: 'Action POST inconnue : ' + action };
    }
  } catch (err) {
    result = { ok: false, error: err.toString() };
  }

  return buildResponse(result);
}

// ── Helper : réponse JSON + CORS ────────────────────────────

function buildResponse(data) {
  var output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

// Note CORS : Apps Script Web App ne supporte pas les headers
// personnalisés nativement. Pour éviter les erreurs CORS depuis
// un front-end externe, utiliser le mode "no-cors" en fetch ou
// un proxy. Si le dashboard est hébergé sur Pages, passer par
// un Worker Cloudflare ou utiliser jsonp. La réponse JSON est
// correctement typée (application/json) pour les requêtes
// same-origin ou proxifiées.

// ── ACTION : today ──────────────────────────────────────────
// Retourne les tâches du jour (Planning date=today, status=pending)
// + textes associés + infos Config + infos Articles

function getToday() {
  var today = formatDate(new Date());

  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var planning = getSheetData(ss, SHEET_NAME_PLANNING);
  var config   = getSheetData(ss, SHEET_NAME_CONFIG);
  var articles = getSheetData(ss, SHEET_NAME_ARTICLES);
  var textes   = getSheetData(ss, SHEET_NAME_TEXTES);

  // Index Config par (platform+group)
  var configIndex = {};
  config.forEach(function(row) {
    var key = normalizeKey(row.platform, row.group);
    configIndex[key] = row;
  });

  // Index Articles par slug
  var articlesIndex = {};
  articles.forEach(function(row) {
    articlesIndex[row.slug] = row;
  });

  // Toutes les taches du jour (pour compter le total planifie)
  var allToday = planning.filter(function(row) { return row.date === today; });

  // Toutes les taches du jour (pending + done + skipped) — le frontend grise les done
  var tasks = allToday
    .map(function(row) {
      var cfgKey   = normalizeKey(row.platform, row.group);
      var cfg      = configIndex[cfgKey] || {};
      var article  = articlesIndex[row.article] || {};

      // Textes correspondants pour cette platform + article (toutes variantes)
      // Supporte article='*' (wildcard = fonctionne avec tous les articles)
      var matchingTextes = textes.filter(function(t) {
        return t.platform === row.platform && (t.article === row.article || t.article === '*');
      });

      // Résoudre les placeholders dans le template
      var resolvedTextes = matchingTextes.map(function(t) {
        return {
          variant  : t.variant,
          template : t.template,
          resolved : resolveTemplate(t.template, article)
        };
      });

      return {
        row       : row._row,
        date      : row.date,
        platform  : row.platform,
        group     : row.group,
        article   : row.article,
        status    : row.status,
        doneAt    : row.doneAt || '',
        // Infos Config
        groupUrl  : cfg.url      || '',
        type      : cfg.type     || 'MANUEL',
        active    : cfg.active   !== undefined ? cfg.active : true,
        frequency : cfg.frequency || '',
        // Infos Article
        articleTitle : article.title || row.article,
        articleUrl   : article.url   || '',
        shareCount   : article.shareCount || 0,
        // Textes
        textes    : resolvedTextes
      };
    });

  return {
    ok           : true,
    date         : today,
    tasks        : tasks,
    count        : tasks.length,
    totalPlanned : allToday.length
  };
}

// ── ACTION : config ─────────────────────────────────────────
// Retourne toutes les lignes de l'onglet Config

function getConfig() {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var config = getSheetData(ss, SHEET_NAME_CONFIG);
  return { ok: true, config: config };
}

// ── ACTION : stats ───────────────────────────────────────────
// Compteurs done / skipped / pending pour une date donnée (défaut = aujourd'hui)

function getStats(date) {
  if (!date) date = formatDate(new Date());

  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var planning = getSheetData(ss, SHEET_NAME_PLANNING);

  var rows = planning.filter(function(r) { return r.date === date; });

  var counts = { pending: 0, done: 0, skipped: 0 };
  rows.forEach(function(r) {
    var s = r.status || 'pending';
    if (counts[s] !== undefined) counts[s]++;
    else counts.pending++;
  });

  // Stats semaine (lun-dim de la semaine contenant la date)
  var weekStats = getWeekStats(planning, date);

  return {
    ok      : true,
    date    : date,
    today   : counts,
    week    : weekStats
  };
}

function getWeekStats(planning, dateStr) {
  var d = parseDate(dateStr);
  if (!d) return {};

  var day   = d.getDay(); // 0=dim, 1=lun
  var diff  = (day === 0) ? -6 : 1 - day; // lundi de la semaine
  var monday = new Date(d);
  monday.setDate(d.getDate() + diff);

  var sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  var rows = planning.filter(function(r) {
    var rd = parseDate(r.date);
    return rd && rd >= monday && rd <= sunday;
  });

  var counts = { pending: 0, done: 0, skipped: 0, total: rows.length };
  rows.forEach(function(r) {
    var s = r.status || 'pending';
    if (counts[s] !== undefined) counts[s]++;
    else counts.pending++;
  });

  return counts;
}

// ── ACTION : done ────────────────────────────────────────────
// Marque status=done + doneAt + incrémente shareCount dans Articles

function markDone(body) {
  var row      = parseInt(body.row, 10);
  var platform = body.platform || '';
  var group    = body.group    || '';
  var article  = body.article  || '';

  if (!row) return { ok: false, error: 'Paramètre row manquant' };

  var ss          = SpreadsheetApp.getActiveSpreadsheet();
  var planSheet   = ss.getSheetByName(SHEET_NAME_PLANNING);
  var articSheet  = ss.getSheetByName(SHEET_NAME_ARTICLES);

  if (!planSheet)  return { ok: false, error: 'Onglet Planning introuvable' };
  if (!articSheet) return { ok: false, error: 'Onglet Articles introuvable' };

  // Colonnes Planning : date(1) platform(2) group(3) article(4) status(5) doneAt(6)
  var planHeaders = getHeaders(planSheet);
  var statusCol   = planHeaders.indexOf('status')  + 1;
  var doneAtCol   = planHeaders.indexOf('doneAt')  + 1;

  if (statusCol < 1) return { ok: false, error: 'Colonne status introuvable dans Planning' };

  planSheet.getRange(row, statusCol).setValue('done');
  if (doneAtCol >= 1) {
    planSheet.getRange(row, doneAtCol).setValue(new Date().toISOString());
  }

  // Si article renseigné → incrémenter shareCount dans Articles
  if (article) {
    var artHeaders   = getHeaders(articSheet);
    var artSlugCol   = artHeaders.indexOf('slug')        + 1;
    var artCountCol  = artHeaders.indexOf('shareCount')  + 1;
    var artSharedCol = artHeaders.indexOf('lastShared')  + 1;

    if (artSlugCol >= 1 && artCountCol >= 1) {
      var artData = articSheet.getDataRange().getValues();
      for (var i = 1; i < artData.length; i++) {
        if (artData[i][artSlugCol - 1] === article) {
          var currentCount = parseInt(artData[i][artCountCol - 1], 10) || 0;
          articSheet.getRange(i + 1, artCountCol).setValue(currentCount + 1);
          if (artSharedCol >= 1) {
            articSheet.getRange(i + 1, artSharedCol).setValue(new Date().toISOString());
          }
          break;
        }
      }
    }
  }

  return { ok: true, row: row, status: 'done', doneAt: new Date().toISOString() };
}

// ── ACTION : skip ────────────────────────────────────────────
// Marque status=skipped

function markSkip(body) {
  var row = parseInt(body.row, 10);
  if (!row) return { ok: false, error: 'Paramètre row manquant' };

  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var planSheet = ss.getSheetByName(SHEET_NAME_PLANNING);
  if (!planSheet) return { ok: false, error: 'Onglet Planning introuvable' };

  var planHeaders = getHeaders(planSheet);
  var statusCol   = planHeaders.indexOf('status') + 1;
  if (statusCol < 1) return { ok: false, error: 'Colonne status introuvable dans Planning' };

  planSheet.getRange(row, statusCol).setValue('skipped');

  return { ok: true, row: row, status: 'skipped' };
}

// ── ACTION : toggle ───────────────────────────────────────────
// Toggle active dans Config (TRUE/FALSE)

function toggleActive(body) {
  var row    = parseInt(body.row, 10);
  var active = body.active; // true | false | 'true' | 'false'
  if (!row) return { ok: false, error: 'Paramètre row manquant' };

  // Normaliser la valeur booléenne
  if (typeof active === 'string') {
    active = active.toLowerCase() === 'true';
  }
  active = Boolean(active);

  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var cfgSheet  = ss.getSheetByName(SHEET_NAME_CONFIG);
  if (!cfgSheet) return { ok: false, error: 'Onglet Config introuvable' };

  var cfgHeaders = getHeaders(cfgSheet);
  var activeCol  = cfgHeaders.indexOf('active') + 1;
  if (activeCol < 1) return { ok: false, error: 'Colonne active introuvable dans Config' };

  cfgSheet.getRange(row, activeCol).setValue(active);

  return { ok: true, row: row, active: active };
}

// ── ACTION : generate ─────────────────────────────────────────
// Génère le planning du jour (ou d'une date) basé sur Config + rotation articles

function generatePlanning(body) {
  var dateStr = body.date || formatDate(new Date());

  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var config   = getSheetData(ss, SHEET_NAME_CONFIG);
  var articles = getSheetData(ss, SHEET_NAME_ARTICLES);
  var planning = getSheetData(ss, SHEET_NAME_PLANNING);
  var planSheet = ss.getSheetByName(SHEET_NAME_PLANNING);

  if (!planSheet) return { ok: false, error: 'Onglet Planning introuvable' };

  // Déterminer le jour de la semaine (0=dim … 6=sam)
  var d   = parseDate(dateStr);
  var dow = d ? d.getDay() : new Date().getDay(); // 0=dim, 1=lun … 6=sam

  // Entrées Config actives uniquement
  var activeConfigs = config.filter(function(c) {
    return c.active === true || c.active === 'TRUE' || c.active === 'true';
  });

  // Vérifier si une entrée est à planifier ce jour selon sa fréquence
  // Utilise l'index du groupe (configIdx) pour répartir les weekly sur différents jours
  function shouldPostToday(frequency, configIdx) {
    switch ((frequency || '').toLowerCase()) {
      case 'daily':
        return dow >= 1 && dow <= 5; // lun-ven
      case '3x-week':
        // Groupe pair: lun/mer/ven, groupe impair: mar/jeu/sam
        if (configIdx % 2 === 0) return dow === 1 || dow === 3 || dow === 5;
        else return dow === 2 || dow === 4 || dow === 6;
      case 'weekly':
        // Répartir les weekly sur différents jours (lun, mar, mer...)
        var weeklyDay = 1 + (configIdx % 5); // 1=lun, 2=mar, 3=mer, 4=jeu, 5=ven
        return dow === weeklyDay;
      default:
        return false;
    }
  }

  // Articles triés par shareCount ASC (les moins partagés en priorité)
  var sortedArticles = articles.slice().sort(function(a, b) {
    return (parseInt(a.shareCount, 10) || 0) - (parseInt(b.shareCount, 10) || 0);
  });

  // Compteur pour varier l'article choisi par groupe
  var articleOffset = 0;

  // Vérifie si une ligne Planning existe déjà pour (date, platform, group)
  // On stocke le status + _row pour pouvoir reset les done/skipped
  var existingRows = {};
  planning.forEach(function(r) {
    if (r.date === dateStr) {
      existingRows[normalizeKey(r.platform, r.group)] = { status: r.status, _row: r._row };
    }
  });

  var planHeaders = getHeaders(planSheet);
  var statusCol   = planHeaders.indexOf('status') + 1;
  var doneAtCol   = planHeaders.indexOf('doneAt') + 1;

  var generated = [];
  var reset     = [];
  var errors    = [];

  activeConfigs.forEach(function(cfg, idx) {
    if (!shouldPostToday(cfg.frequency, idx)) return;

    var key = normalizeKey(cfg.platform, cfg.group);
    var existing = existingRows[key];

    if (existing) {
      // Si deja pending → rien a faire
      if (existing.status === 'pending') return;
      // Si done ou skipped → reset a pending (bouton Generer = re-generer)
      if (statusCol >= 1) {
        planSheet.getRange(existing._row, statusCol).setValue('pending');
        if (doneAtCol >= 1) planSheet.getRange(existing._row, doneAtCol).setValue('');
        reset.push({ platform: cfg.platform, group: cfg.group, from: existing.status });
      }
      return;
    }

    // Choisir l'article le moins partagé qui n'a pas déjà été posté
    // dans ce groupe (vérification anti-doublon simple via Planning)
    var postedSlugs = {};
    planning.forEach(function(r) {
      if (r.platform === cfg.platform && r.group === cfg.group && r.status === 'done') {
        postedSlugs[r.article] = true;
      }
    });

    // Choisir un article different par groupe (offset par idx)
    var candidates = sortedArticles.filter(function(a) { return !postedSlugs[a.slug]; });
    if (candidates.length === 0) candidates = sortedArticles.slice(); // cycle
    var chosenArticle = candidates.length > 0
      ? candidates[(articleOffset++) % candidates.length]
      : null;

    if (!chosenArticle) {
      errors.push('Aucun article disponible pour ' + cfg.platform + ' / ' + cfg.group);
      return;
    }

    // Ajouter la ligne dans Planning
    var newRow = [];
    planHeaders.forEach(function(h) {
      switch (h) {
        case 'date'     : newRow.push(dateStr);              break;
        case 'platform' : newRow.push(cfg.platform);         break;
        case 'group'    : newRow.push(cfg.group);            break;
        case 'article'  : newRow.push(chosenArticle.slug);   break;
        case 'status'   : newRow.push('pending');            break;
        case 'doneAt'   : newRow.push('');                   break;
        default         : newRow.push('');
      }
    });
    planSheet.appendRow(newRow);
    existingRows[key] = { status: 'pending', _row: planSheet.getLastRow() };

    generated.push({
      platform : cfg.platform,
      group    : cfg.group,
      article  : chosenArticle.slug
    });
  });

  return {
    ok        : true,
    date      : dateStr,
    generated : generated,
    reset     : reset,
    errors    : errors,
    count     : generated.length + reset.length
  };
}

// ── SETUP — Crée les onglets s'ils n'existent pas ─────────────

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  ensureSheet(ss, SHEET_NAME_CONFIG, [
    'platform', 'group', 'url', 'type', 'active', 'frequency', 'lastPosted', 'notes'
  ]);

  ensureSheet(ss, SHEET_NAME_PLANNING, [
    'date', 'platform', 'group', 'article', 'status', 'doneAt'
  ]);

  ensureSheet(ss, SHEET_NAME_ARTICLES, [
    'slug', 'title', 'url', 'lastShared', 'shareCount'
  ]);

  ensureSheet(ss, SHEET_NAME_TEXTES, [
    'platform', 'article', 'template', 'variant'
  ]);

  seedTestData(ss);

  return { ok: true, message: 'Setup terminé. Onglets créés et données de test injectées.' };
}

function ensureSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    Logger.log('Onglet créé : ' + name);
  } else {
    // Vérifier si les headers existent, sinon les ajouter
    var existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (!existing || existing[0] === '') {
      sheet.insertRowBefore(1);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }
  return sheet;
}

// ── Données de test ────────────────────────────────────────────

function seedTestData(ss) {
  var today = formatDate(new Date());

  // ── Config ──
  var cfgSheet = ss.getSheetByName(SHEET_NAME_CONFIG);
  var cfgData  = cfgSheet.getDataRange().getValues();
  if (cfgData.length <= 1) { // uniquement headers ou vide
    var cfgRows = [
      // platform, group, url, type, active, frequency, lastPosted, notes
      ['Facebook', 'NO CODE APP Builder',       'https://www.facebook.com/groups',       'MANUEL', true,  'weekly',   '', '125K membres'],
      ['Facebook', 'n8n Builders',              'https://www.facebook.com/groups',            'MANUEL', true,  'weekly',   '', '147K membres'],
      ['Facebook', 'n8n Hub',                   'https://www.facebook.com/groups',                 'MANUEL', true,  'weekly',   '', '37K membres'],
      ['Facebook', 'AI for Everyone',           'https://www.facebook.com/groups',          'MANUEL', true,  'weekly',   '', '21K membres'],
      ['Facebook', 'Low code & no code',        'https://www.facebook.com/groups',          'MANUEL', true,  'weekly',   '', '3.5K membres'],
      ['Reddit',   'r/nocode',                  'https://www.reddit.com',                        'MANUEL', false, 'weekly',   '', 'Phase 3 — attente karma'],
      ['Reddit',   'r/n8n',                     'https://www.reddit.com',                           'MANUEL', false, 'weekly',   '', 'Phase 3 — attente karma'],
      ['Twitter',  '@BruceLi60392934',          'https://x.com/compose/tweet',                              'MANUEL', true,  'weekly',   '', 'Se7en Vision AI'],
      ['TikTok',   '@se7en.video.ai',          'https://www.tiktok.com/@se7en.video.ai',                            'MANUEL', true,  'weekly',   '', '280 followers - Se7en AI Tools - Videos EN'],
      ['TikTok',   '@se7en.news.ai',           'https://www.tiktok.com/@se7en.news.ai',                             'MANUEL', true,  'weekly',   '', '4323 followers - Videos FR'],
      ['Instagram','Bruce Li',                  'https://www.instagram.com/',                                        'MANUEL', true,  'weekly',   '', 'Business account - Reels cross-post'],
      ['YouTube',  '@se7enai',                  'https://www.youtube.com/',                                          'MANUEL', false, 'weekly',   '', 'Shorts - A configurer'],
      ['Dev.to',   '@se7enai',                 'https://dev.to/new',                                      'MANUEL', true,  'weekly',   '', 'Cross-post articles'],
      ['LinkedIn', 'profil',                    'https://www.linkedin.com',                                'MANUEL', false, '3x-week',  '', 'En pause - discretion employeur'],
    ];
    cfgSheet.getRange(2, 1, cfgRows.length, cfgRows[0].length).setValues(cfgRows);
  }

  // ── Articles ──
  var artSheet = ss.getSheetByName(SHEET_NAME_ARTICLES);
  var artData  = artSheet.getDataRange().getValues();
  if (artData.length <= 1) {
    var artRows = [
      // slug, title, url, lastShared, shareCount
      ['best-free-automation-tools',         '7 Best Free Automation Tools in 2026',                                      'https://nocode-flow.com/best-free-automation-tools',         '', 0],
      ['zapier-alternatives',                '10 Best Zapier Alternatives (Free & Paid)',                                  'https://nocode-flow.com/zapier-alternatives',                '', 0],
      ['n8n-vs-zapier',                      'n8n vs Zapier: Which is Better in 2026?',                                    'https://nocode-flow.com/n8n-vs-zapier',                      '', 0],
      ['make-vs-zapier-pricing',             'Make vs Zapier Pricing 2026: Complete Cost Comparison',                      'https://nocode-flow.com/make-vs-zapier-pricing',             '', 0],
      ['n8n-gmail-automation-tutorial',      'How to Automate Gmail with n8n (Complete Step-by-Step Guide)',               'https://nocode-flow.com/n8n-gmail-automation-tutorial',      '', 0],
      ['automate-social-media-no-code',      'How to Automate Social Media Without Writing a Single Line of Code',        'https://nocode-flow.com/automate-social-media-no-code',      '', 0],
      ['n8n-vs-make',                        'n8n vs Make.com 2026: The Ultimate Head-to-Head Comparison',                 'https://nocode-flow.com/n8n-vs-make',                        '', 0],
      ['n8n-telegram-bot-tutorial',          'How to Build a Telegram Bot with n8n -- No Coding Required',                 'https://nocode-flow.com/n8n-telegram-bot-tutorial',          '', 0],
      ['automate-google-sheets-make',        'How to Automate Google Sheets with Make.com (Step-by-Step)',                 'https://nocode-flow.com/automate-google-sheets-make',        '', 0],
      ['what-is-no-code-automation',         'What is No-Code Automation? Everything You Need to Know in 2026',            'https://nocode-flow.com/what-is-no-code-automation',         '', 0],
      ['subtitle-translation-tools-compared','SubWhisper Pro vs VEED vs Kapwing 2026: Best AI Subtitle Translation Tool', 'https://nocode-flow.com/subtitle-translation-tools-compared','', 0],
      ['n8n-vs-make-vs-zapier',              'n8n vs Make vs Zapier 2026: Ultimate No-Code Automation Comparison',         'https://nocode-flow.com/n8n-vs-make-vs-zapier',              '', 0],
      ['automate-invoice-processing',        'How to Automate Invoice Processing Without Code (2026 Guide)',               'https://nocode-flow.com/automate-invoice-processing',        '', 0],
      ['best-ai-transcription-tools',        'Best AI Transcription Tools 2026: Complete Guide for Content Creators',      'https://nocode-flow.com/best-ai-transcription-tools',        '', 0],
      ['telegram-voice-transcription-bot',   'How to Transcribe Telegram Voice Messages Instantly with AI (Free Bot)',     'https://nocode-flow.com/telegram-voice-transcription-bot',   '', 0],
    ];
    artSheet.getRange(2, 1, artRows.length, artRows[0].length).setValues(artRows);
  }

  // ── Textes ──
  var txtSheet = ss.getSheetByName(SHEET_NAME_TEXTES);
  var txtData  = txtSheet.getDataRange().getValues();
  if (txtData.length <= 1) {
    var txtRows = [
      // platform, article, template, variant
      ['Facebook', 'best-free-automation-tools',
       'What\'s the best FREE automation tool in 2026?\n\nI compared 7 tools so you don\'t have to.\n\n>> {title}\n{url}\n\nWhich one are you using?',
       'A'],
      ['Facebook', 'best-free-automation-tools',
       'Stop paying for automation tools you don\'t need.\n\nI tested 7 free options and ranked them.\n\n>> {title}\n{url}\n\nHave you tried any of these?',
       'B'],
      ['Facebook', 'zapier-alternatives',
       'Still paying $50+/month for automation?\n\n10 alternatives that do the same thing for less (or free).\n\n>> {title}\n{url}\n\nWhich one would you switch to?',
       'A'],
      ['Facebook', 'zapier-alternatives',
       'I\'ve been testing Zapier alternatives for 2 weeks.\n\nHere are the 10 best ones (some are completely free).\n\n>> {title}\n{url}\n\nDrop your thoughts below',
       'B'],
      ['Facebook', 'n8n-vs-zapier',
       'n8n is free and self-hostable. Zapier charges per task.\n\nIs the switch worth it?\n\n>> {title}\n{url}\n\nHave you used n8n before?',
       'A'],
      ['Reddit', 'best-free-automation-tools',
       'I spent a week testing every free automation tool I could find.\n\nRanked them by ease of use, features, and limits.\n\nFull comparison: {url}\n\nFeel free to add your own experience in the comments.',
       'A'],
      ['Reddit', 'zapier-alternatives',
       'Zapier pricing just keeps going up. Here are 10 alternatives worth considering.\n\nSome are free, some are cheaper, some are self-hosted.\n\nDetailed comparison: {url}\n\nHappy to answer questions.',
       'A'],
      ['Twitter', 'best-free-automation-tools',
       '7 free automation tools compared (2026)\n\nNo paywalls, no fluff — just the tools:\n\n{url}',
       'A'],
      ['Twitter', 'zapier-alternatives',
       'Zapier alternatives that won\'t break the bank:\n\n{url}\n\n10 options compared — free tiers, pricing, features.',
       'A'],
      ['LinkedIn', 'best-free-automation-tools',
       'If your team is spending time on repetitive tasks, automation is the answer.\n\nBut you don\'t need expensive tools.\n\nI compared 7 free options to help you choose:\n{url}\n\nWhich tools are you using to automate workflows?',
       'A'],
      ['TikTok', '*',
       '{title}\n\nFull breakdown on the blog -- link in bio\n\n#nocode #automation #n8n #zapier #ai #tools #tech #buildinpublic #indiehacker',
       'A'],
      ['TikTok', '*',
       'Stop paying for tools that have free alternatives.\n\n{title}\n\nLink in bio for the full article\n\n#nocode #automation #ai #tech #productivity #freelancer #buildinpublic',
       'B'],
      ['Dev.to', '*',
       'Cross-post reminder:\n\n{title}\n\nOriginal: {url}\n\nCopy the article content to dev.to/new and set canonical_url to the original.',
       'A'],
    ];
    txtSheet.getRange(2, 1, txtRows.length, txtRows[0].length).setValues(txtRows);
  }

  // ── Planning : quelques lignes pour aujourd'hui ──
  var planSheet = ss.getSheetByName(SHEET_NAME_PLANNING);
  var planData  = planSheet.getDataRange().getValues();
  if (planData.length <= 1) {
    var planRows = [
      // date, platform, group, article, status, doneAt
      [today, 'Facebook', 'NO CODE APP Builder', 'zapier-alternatives',        'pending', ''],
      [today, 'Facebook', 'n8n Builders',         'best-free-automation-tools', 'pending', ''],
      [today, 'Facebook', 'n8n Hub',              'n8n-vs-zapier',              'pending', ''],
    ];
    planSheet.getRange(2, 1, planRows.length, planRows[0].length).setValues(planRows);
  }
}

// ── Utilitaires ────────────────────────────────────────────────

// Lire un onglet et retourner un tableau d'objets {header: value}
// Chaque objet a aussi _row = numéro de ligne réel dans le Sheet (1-indexé)
function getSheetData(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0].map(function(h) { return h.toString().trim(); });
  var rows    = [];

  for (var i = 1; i < data.length; i++) {
    var row = { _row: i + 1 }; // numéro de ligne réel dans le Sheet
    headers.forEach(function(h, j) {
      var val = data[i][j];
      // Normaliser booléens
      if (val === true  || val === 'TRUE'  || val === 'true')  val = true;
      if (val === false || val === 'FALSE' || val === 'false') val = false;
      // Normaliser dates (objets Date → string YYYY-MM-DD)
      if (val instanceof Date) val = formatDate(val);
      row[h] = val;
    });
    rows.push(row);
  }

  return rows;
}

// Obtenir les headers d'un onglet (tableau de strings)
function getHeaders(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
    return h.toString().trim();
  });
}

// Formater une date en YYYY-MM-DD
function formatDate(date) {
  var y  = date.getFullYear();
  var m  = ('0' + (date.getMonth() + 1)).slice(-2);
  var d  = ('0' + date.getDate()).slice(-2);
  return y + '-' + m + '-' + d;
}

// Parser une string YYYY-MM-DD en Date
function parseDate(str) {
  if (!str) return null;
  var parts = str.toString().split('-');
  if (parts.length < 3) return null;
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
}

// Clé composite pour l'index (platform+group), insensible à la casse
function normalizeKey(platform, group) {
  return ((platform || '') + '|' + (group || '')).toLowerCase();
}

// Remplacer {title} et {url} dans un template
function resolveTemplate(template, article) {
  if (!template) return '';
  return template
    .replace(/\{title\}/g, article.title || '')
    .replace(/\{url\}/g,   article.url   || '');
}

// ── DEBUG — Diagnostic complet ──────────────────────────────

function getDebug(dateParam) {
  var today = dateParam || formatDate(new Date());
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var config   = getSheetData(ss, SHEET_NAME_CONFIG);
  var planning = getSheetData(ss, SHEET_NAME_PLANNING);
  var articles = getSheetData(ss, SHEET_NAME_ARTICLES);

  // Jour de la semaine
  var d   = parseDate(today);
  var dow = d ? d.getDay() : -1;
  var dayNames = ['dim','lun','mar','mer','jeu','ven','sam'];

  // Simuler shouldPostToday pour chaque config active
  var activeConfigs = config.filter(function(c) {
    return c.active === true || c.active === 'TRUE' || c.active === 'true';
  });

  var scheduleCheck = activeConfigs.map(function(cfg, idx) {
    var freq = (cfg.frequency || '').toLowerCase();
    var shouldPost = false;
    var reason = '';

    switch (freq) {
      case 'daily':
        shouldPost = dow >= 1 && dow <= 5;
        reason = shouldPost ? 'daily lun-ven OK' : 'daily mais weekend';
        break;
      case '3x-week':
        if (idx % 2 === 0) {
          shouldPost = dow === 1 || dow === 3 || dow === 5;
          reason = 'pair idx=' + idx + ' -> lun/mer/ven, dow=' + dow + ' ' + dayNames[dow];
        } else {
          shouldPost = dow === 2 || dow === 4 || dow === 6;
          reason = 'impair idx=' + idx + ' -> mar/jeu/sam, dow=' + dow + ' ' + dayNames[dow];
        }
        break;
      case 'weekly':
        var weeklyDay = 1 + (idx % 5);
        shouldPost = dow === weeklyDay;
        reason = 'weekly jour=' + weeklyDay + '(' + dayNames[weeklyDay] + '), dow=' + dow + '(' + dayNames[dow] + ')';
        break;
      default:
        reason = 'frequence inconnue: ' + freq;
    }

    return {
      platform: cfg.platform,
      group: cfg.group,
      frequency: cfg.frequency,
      configIdx: idx,
      shouldPost: shouldPost,
      reason: reason
    };
  });

  // Planning du jour (toutes les lignes, pas juste pending)
  var todayPlanning = planning.filter(function(r) { return r.date === today; });

  // Planning du jour avec types de date
  var todayPlanningDebug = todayPlanning.map(function(r) {
    return {
      _row: r._row,
      date: r.date,
      dateType: typeof r.date,
      platform: r.platform,
      group: r.group,
      article: r.article,
      status: r.status,
      statusType: typeof r.status,
      doneAt: r.doneAt
    };
  });

  // Toutes les lignes Planning brutes (pour voir les dates)
  var allPlanningDates = planning.map(function(r) {
    return { _row: r._row, date: r.date, dateType: typeof r.date, status: r.status, statusType: typeof r.status };
  });

  return {
    ok: true,
    debug: true,
    serverDate: today,
    serverDow: dow,
    serverDowName: dayNames[dow] || '?',
    serverTimestamp: new Date().toISOString(),
    configCount: config.length,
    activeConfigCount: activeConfigs.length,
    articlesCount: articles.length,
    totalPlanningRows: planning.length,
    todayPlanningRows: todayPlanning.length,
    scheduleCheck: scheduleCheck,
    todayPlanning: todayPlanningDebug,
    allPlanningDates: allPlanningDates,
    configRaw: config.map(function(c) {
      return { _row: c._row, platform: c.platform, group: c.group, active: c.active, activeType: typeof c.active, frequency: c.frequency, type: c.type };
    })
  };
}

// ── AUTO-GENERATE — Cron minuit ──────────────────────────────
// Appelé automatiquement par le trigger installé via installTrigger()

function autoGenerate() {
  var result = generatePlanning({ date: formatDate(new Date()) });
  Logger.log('Auto-generate: ' + JSON.stringify(result));
}

// Installe le trigger quotidien à minuit (à lancer UNE SEULE FOIS manuellement)
function installTrigger() {
  // Supprimer les anciens triggers autoGenerate pour éviter les doublons
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'autoGenerate') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // Créer le nouveau trigger : chaque jour entre 00:00 et 01:00
  ScriptApp.newTrigger('autoGenerate')
    .timeBased()
    .everyDays(1)
    .atHour(0)
    .create();
  Logger.log('Trigger installé : autoGenerate chaque jour à minuit');
}

// ── RESET MARKETING v2 — Strategie optimisee ───────────────────
// Lancer UNE FOIS pour appliquer la nouvelle strategie
function resetMarketing() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── 1. CONFIG : frequences optimisees (max 2-3 posts/jour) ──
  var cfgSheet = ss.getSheetByName(SHEET_NAME_CONFIG);
  var lastCfg = cfgSheet.getLastRow();
  if (lastCfg > 1) cfgSheet.deleteRows(2, lastCfg - 1);
  var cfgRows = [
    ['Facebook', 'NO CODE APP Builder',  'https://www.facebook.com/groups',  'MANUEL', true,  'weekly',   '', '125K - Lundi'],
    ['Facebook', 'n8n Builders',         'https://www.facebook.com/groups',       'MANUEL', true,  'weekly',   '', '147K - Mardi'],
    ['Facebook', 'n8n Hub',              'https://www.facebook.com/groups',            'MANUEL', true,  'weekly',   '', '37K - Mercredi'],
    ['Facebook', 'AI for Everyone',      'https://www.facebook.com/groups',     'MANUEL', true,  'weekly',   '', '21K - Jeudi'],
    ['Facebook', 'Low code & no code',   'https://www.facebook.com/groups',     'MANUEL', true,  'weekly',   '', '3.5K - Vendredi'],
    ['Reddit',   'r/nocode',             'https://www.reddit.com',                   'MANUEL', false, 'weekly',   '', 'Phase 3 - attente karma'],
    ['Reddit',   'r/n8n',                'https://www.reddit.com',                      'MANUEL', false, 'weekly',   '', 'Phase 3 - attente karma'],
    ['Twitter',  '@BruceLi60392934',     'https://x.com/compose/tweet',                         'MANUEL', true,  'weekly',   '', 'Se7en Vision AI'],
    ['TikTok',   '@se7en.video.ai',     'https://www.tiktok.com/@se7en.video.ai',                      'MANUEL', true,  'weekly',   '', '280 followers - Se7en AI Tools - Videos EN'],
    ['TikTok',   '@se7en.news.ai',      'https://www.tiktok.com/@se7en.news.ai',                       'MANUEL', true,  'weekly',   '', '4323 followers - Videos FR'],
    ['Instagram','Bruce Li',             'https://www.instagram.com/',                                  'MANUEL', true,  'weekly',   '', 'Business account - Reels cross-post'],
    ['YouTube',  '@se7enai',             'https://www.youtube.com/',                                    'MANUEL', false, 'weekly',   '', 'Shorts - A configurer'],
    ['Dev.to',   '@se7enai',            'https://dev.to/new',                                 'MANUEL', true,  'weekly',   '', 'Cross-post articles'],
    ['LinkedIn', 'profil',               'https://www.linkedin.com',                           'MANUEL', false, '3x-week',  '', 'En pause - discretion employeur'],
  ];
  cfgSheet.getRange(2, 1, cfgRows.length, cfgRows[0].length).setValues(cfgRows);

  // ── 2. ARTICLES : 15 articles reels de nocode-flow.com ──
  var artSheet = ss.getSheetByName(SHEET_NAME_ARTICLES);
  var lastArt = artSheet.getLastRow();
  if (lastArt > 1) artSheet.deleteRows(2, lastArt - 1);
  var artRows = [
    ['best-free-automation-tools',         '7 Best Free Automation Tools in 2026',                                      'https://nocode-flow.com/best-free-automation-tools',         '', 0],
    ['zapier-alternatives',                '10 Best Zapier Alternatives (Free & Paid)',                                  'https://nocode-flow.com/zapier-alternatives',                '', 0],
    ['n8n-vs-zapier',                      'n8n vs Zapier: Which is Better in 2026?',                                    'https://nocode-flow.com/n8n-vs-zapier',                      '', 0],
    ['make-vs-zapier-pricing',             'Make vs Zapier Pricing 2026: Complete Cost Comparison',                      'https://nocode-flow.com/make-vs-zapier-pricing',             '', 0],
    ['n8n-gmail-automation-tutorial',      'How to Automate Gmail with n8n (Complete Step-by-Step Guide)',               'https://nocode-flow.com/n8n-gmail-automation-tutorial',      '', 0],
    ['automate-social-media-no-code',      'How to Automate Social Media Without Writing a Single Line of Code',        'https://nocode-flow.com/automate-social-media-no-code',      '', 0],
    ['n8n-vs-make',                        'n8n vs Make.com 2026: The Ultimate Head-to-Head Comparison',                 'https://nocode-flow.com/n8n-vs-make',                        '', 0],
    ['n8n-telegram-bot-tutorial',          'How to Build a Telegram Bot with n8n -- No Coding Required',                 'https://nocode-flow.com/n8n-telegram-bot-tutorial',          '', 0],
    ['automate-google-sheets-make',        'How to Automate Google Sheets with Make.com (Step-by-Step)',                 'https://nocode-flow.com/automate-google-sheets-make',        '', 0],
    ['what-is-no-code-automation',         'What is No-Code Automation? Everything You Need to Know in 2026',            'https://nocode-flow.com/what-is-no-code-automation',         '', 0],
    ['subtitle-translation-tools-compared','SubWhisper Pro vs VEED vs Kapwing 2026: Best AI Subtitle Translation Tool', 'https://nocode-flow.com/subtitle-translation-tools-compared','', 0],
    ['n8n-vs-make-vs-zapier',              'n8n vs Make vs Zapier 2026: Ultimate No-Code Automation Comparison',         'https://nocode-flow.com/n8n-vs-make-vs-zapier',              '', 0],
    ['automate-invoice-processing',        'How to Automate Invoice Processing Without Code (2026 Guide)',               'https://nocode-flow.com/automate-invoice-processing',        '', 0],
    ['best-ai-transcription-tools',        'Best AI Transcription Tools 2026: Complete Guide for Content Creators',      'https://nocode-flow.com/best-ai-transcription-tools',        '', 0],
    ['telegram-voice-transcription-bot',   'How to Transcribe Telegram Voice Messages Instantly with AI (Free Bot)',     'https://nocode-flow.com/telegram-voice-transcription-bot',   '', 0],
  ];
  artSheet.getRange(2, 1, artRows.length, artRows[0].length).setValues(artRows);

  // ── 3. TEXTES : 5 variantes FB + 2 Reddit + 2 Twitter + 1 LinkedIn ──
  var txtSheet = ss.getSheetByName(SHEET_NAME_TEXTES);
  var lastTxt = txtSheet.getLastRow();
  if (lastTxt > 1) txtSheet.deleteRows(2, lastTxt - 1);
  var txtRows = [
    // Facebook — 5 variantes generiques (marchent avec tous les articles)
    ['Facebook', '*',
     'Quick question for the group - what free automation tool are you actually using day-to-day in 2026?\n\nI spent some time putting together a comparison and was surprised by a few hidden gems.\n\n{title}\n{url}\n\nWould love to hear what you are running in your own stack.',
     'A'],
    ['Facebook', '*',
     'Honest take: I wasted about 3 months picking the wrong automation tool when I started.\n\nKept switching, breaking workflows, starting over. Eventually I mapped out the actual differences.\n\nWrote it up here:\n{title}\n{url}\n\nWhat tool did you start with? Would you choose the same one again?',
     'B'],
    ['Facebook', '*',
     'The eternal debate never really ends does it.\n\nEvery week someone asks which tool to use. So I tried to write the most honest comparison based on actual use, not marketing pages.\n\n{title}\n{url}\n\nHas your opinion shifted compared to 12 months ago?',
     'C'],
    ['Facebook', '*',
     'One thing that changed how I use automation: stop building big complex workflows first.\n\nStart with one trigger, one action, test it, then layer on top.\n\nHere is a beginner-friendly breakdown:\n{title}\n{url}\n\nAny other practical tips you always give to people just starting out?',
     'D'],
    ['Facebook', '*',
     'Problem I kept running into: beautiful automation workflow in theory, completely broken in practice because the free plan limits kicked in.\n\nSpent too long figuring out which tools are actually usable without paying.\n\n{title}\n{url}\n\nAnyone else been burned by free tier limits?',
     'E'],
    // Reddit — 2 variantes
    ['Reddit', '*',
     'I have been deep-diving into no-code automation tools lately and put together a comparison that cuts through the marketing noise.\n\nTested them myself and wrote up what I found.\n\n{url}\n\nHappy to answer questions. Curious what the community is running in production.',
     'A'],
    ['Reddit', '*',
     'Not trying to sell anything here. I run a small blog on no-code automation and this is one of the pieces I put the most research into.\n\nFull write-up: {url}\n\nIf you think I got something wrong, tell me - I update articles based on feedback.',
     'B'],
    // Twitter — 2 variantes
    ['Twitter', '*',
     'Most people pick the wrong automation tool because they compare features instead of what matters at their stage.\n\nI broke it down here: {url}\n\nWhat made you pick your current tool?',
     'A'],
    ['Twitter', '*',
     'Tested the top no-code automation tools so you do not have to.\n\nVerdict: it depends on exactly two things.\n\n{url}',
     'B'],
    // TikTok — 2 variantes (caption + hashtags, pas d'URL cliquable)
    ['TikTok', '*',
     '{title}\n\nFull breakdown on the blog -- link in bio\n\n#nocode #automation #n8n #zapier #ai #tools #tech #buildinpublic #indiehacker',
     'A'],
    ['TikTok', '*',
     'Stop paying for tools that have free alternatives.\n\n{title}\n\nLink in bio for the full article\n\n#nocode #automation #ai #tech #productivity #freelancer #buildinpublic',
     'B'],
    // Dev.to — 1 variante (cross-post avec canonical URL)
    ['Dev.to', '*',
     'Cross-post reminder:\n\n{title}\n\nOriginal: {url}\n\nCopy the article content to dev.to/new and set canonical_url to the original.',
     'A'],
    // LinkedIn — 1 variante
    ['LinkedIn', '*',
     'If your team is spending time on repetitive tasks, automation is the answer.\n\nBut you do not need expensive tools.\n\nI compared the best free options:\n{url}\n\nWhich tools are you using to automate workflows?',
     'A'],
  ];
  txtSheet.getRange(2, 1, txtRows.length, txtRows[0].length).setValues(txtRows);

  // ── 4. PLANNING : nettoyer et regenerer ──
  var planSheet = ss.getSheetByName(SHEET_NAME_PLANNING);
  var lastPlan = planSheet.getLastRow();
  if (lastPlan > 1) planSheet.deleteRows(2, lastPlan - 1);

  // Flush pour s'assurer que deleteRows est applique avant de regenerer
  SpreadsheetApp.flush();

  // Generer le planning du jour
  generatePlanning({ date: formatDate(new Date()) });

  Logger.log('Reset marketing complet. Config + Articles + Textes + Planning regenere.');
}

// ============================================================
// EXTENSION VIDEO — Phase 0 (ajout 05/04/2026)
// 5 nouveaux onglets : Strategie, Contenu, Performance, AlgoNotes, ABTests
// ============================================================

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

// ── GET : allVideos ──────────────────────────────────────────

function getAllVideos() {
  var contenu = sheetToObjects(SHEET_NAME_CONTENU);
  return { ok: true, videos: contenu, count: contenu.length };
}

// ── GET : todayVideos ────────────────────────────────────────

function getTodayVideos() {
  var today = formatDate(new Date());
  var contenu = sheetToObjects(SHEET_NAME_CONTENU);
  var todayTasks = contenu.filter(function(r) {
    return String(r.date) === today;
  });
  return { ok: true, date: today, videos: todayTasks, count: todayTasks.length };
}

// ── GET : strategy ───────────────────────────────────────────

function getStrategy() {
  var rows = sheetToObjects(SHEET_NAME_STRATEGIE);
  var strategy = {};
  rows.forEach(function(r) { strategy[r.key] = r.value; });
  return { ok: true, strategy: strategy };
}

// ── GET : performance ────────────────────────────────────────

function getPerformance(dateFilter, weekFilter) {
  var perf = sheetToObjects(SHEET_NAME_PERFORMANCE);
  if (dateFilter) perf = perf.filter(function(r) { return String(r.date) === dateFilter; });
  if (weekFilter) perf = perf.filter(function(r) { return getWeekISO(r.date) === weekFilter; });
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
  var contenu = sheetToObjects(SHEET_NAME_CONTENU);
  var weekContent = contenu.filter(function(r) { return getWeekISO(r.date) === week; });
  var wc = { planifie: 0, en_production: 0, publie: 0, skip: 0, total: 0 };
  weekContent.forEach(function(r) {
    var s = String(r.statut || '').toLowerCase();
    if (wc[s] !== undefined) wc[s]++;
    wc.total++;
  });
  var perf = sheetToObjects(SHEET_NAME_PERFORMANCE);
  var weekPerf = perf.filter(function(r) { return getWeekISO(r.date) === week; });
  var wp = { total_vues: 0, total_likes: 0, best_hook: '', best_completion: 0 };
  weekPerf.forEach(function(r) {
    wp.total_vues += Number(r.vues) || 0;
    wp.total_likes += Number(r.likes) || 0;
    var comp = Number(r.completion) || 0;
    if (comp > wp.best_completion) { wp.best_completion = comp; wp.best_hook = String(r.hook || '').substring(0, 60); }
  });
  var tests = sheetToObjects(SHEET_NAME_ABTESTS);
  var todayVideos = contenu.filter(function(r) { return String(r.date) === today; });
  return {
    ok: true, date: today, week: week,
    today: { planifie: todayVideos.filter(function(r) { return r.statut === 'planifie'; }).length, publie: todayVideos.filter(function(r) { return r.statut === 'publie'; }).length, total: todayVideos.length },
    week_content: wc, week_perf: wp,
    tests: { actifs: tests.filter(function(t) { return String(t.statut) === 'en_cours'; }).length, termines: tests.filter(function(t) { return String(t.statut) === 'termine'; }).length }
  };
}

// ── POST : addContent ────────────────────────────────────────

function addContent(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_CONTENU);
  if (!sheet) return { ok: false, error: 'Onglet Contenu introuvable' };
  var row = [
    body.date || formatDate(new Date()), body.plateforme || 'TikTok', body.compte || '',
    body.type || 'slide', body.produit || '', body.hook || '', body.langue || 'FR',
    body.duree || '', body.lien || '', body.statut || 'planifie', body.notes || '', body.promoCmd || ''
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
    body.date || formatDate(new Date()), body.plateforme || 'TikTok', body.compte || '',
    body.hook || '', body.langue || '', Number(body.vues) || 0, Number(body.watchMoyen) || 0,
    Number(body.completion) || 0, Number(body.likes) || 0, Number(body.comments) || 0,
    Number(body.shares) || 0, Number(body.profilVisits) || 0, Number(body.bioClicks) || 0,
    Number(body.installs) || 0, body.score || '', body.notes || ''
  ];
  sheet.appendRow(row);
  return { ok: true, added: row };
}

// ── POST : addAlgoNote ───────────────────────────────────────

function addAlgoNote(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_ALGONOTES);
  if (!sheet) return { ok: false, error: 'Onglet AlgoNotes introuvable' };
  sheet.appendRow([body.date || formatDate(new Date()), body.plateforme || '', body.changement || '', body.source || '', body.impact || '']);
  return { ok: true };
}

// ── POST : addTest ───────────────────────────────────────────

function addTest(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_ABTESTS);
  if (!sheet) return { ok: false, error: 'Onglet ABTests introuvable' };
  var num = sheet.getLastRow();
  sheet.appendRow([num, body.dateDebut || formatDate(new Date()), body.variable || '', body.versionA || '', body.versionB || '', '', body.metrique || '', '', '', '', 'planifie']);
  return { ok: true, num: num };
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
    if (data[i][0] === body.key) { sheet.getRange(i + 1, 2).setValue(body.value); found = true; break; }
  }
  if (!found) sheet.appendRow([body.key, body.value]);
  return { ok: true, key: body.key, updated: found, inserted: !found };
}

// ── SETUP VIDEO — Cree les 5 onglets + seed data ─────────────

function setupVideo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Strategie
  var stratSheet = ss.getSheetByName(SHEET_NAME_STRATEGIE);
  if (!stratSheet) {
    stratSheet = ss.insertSheet(SHEET_NAME_STRATEGIE);
    stratSheet.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
    var stratData = [
      ['objectif_principal', 'Installs DictoKey (Play Store, 4.99 EUR/mois)'],
      ['objectif_secondaire', 'Trafic NoCodeFlow (affiliation Make.com 35%)'],
      ['produit_star', 'DictoKey'],
      ['avatar', 'Luna Rae Chic Tech Maven (HeyGen Engine III)'],
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

  // Contenu
  var contSheet = ss.getSheetByName(SHEET_NAME_CONTENU);
  if (!contSheet) {
    contSheet = ss.insertSheet(SHEET_NAME_CONTENU);
    contSheet.getRange(1, 1, 1, 12).setValues([['date', 'plateforme', 'compte', 'type', 'produit', 'hook', 'langue', 'duree', 'lien', 'statut', 'notes', 'promoCmd']]);
    var today = new Date();
    var monday = new Date(today);
    monday.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
    var seed = [];
    for (var w = 0; w < 2; w++) {
      var base = new Date(monday); base.setDate(base.getDate() + w * 7);
      var lun = new Date(base);
      seed.push([formatDate(lun), 'TikTok', '@se7en.video.ai', 'pip', 'DictoKey', 'AI voice keyboard - type 10x faster', 'EN', '', '', 'planifie', '', '/promo pip en DictoKey AI voice keyboard type 10x faster']);
      var mer = new Date(base); mer.setDate(mer.getDate() + 2);
      seed.push([formatDate(mer), 'TikTok', '@se7en.news.ai', 'pip', 'DictoKey', 'Clavier vocal IA - dictee 10x plus rapide', 'FR', '', '', 'planifie', '', '/promo pip fr DictoKey clavier vocal IA dictee rapide']);
      var ven = new Date(base); ven.setDate(ven.getDate() + 4);
      seed.push([formatDate(ven), 'TikTok', '@se7en.video.ai', 'slide', 'NoCodeFlow', 'Automate everything without writing code', 'EN', '', '', 'planifie', '', '/promo en NoCodeFlow automate everything without code']);
    }
    contSheet.getRange(2, 1, seed.length, 12).setValues(seed);
  }

  // Performance
  var perfSheet = ss.getSheetByName(SHEET_NAME_PERFORMANCE);
  if (!perfSheet) {
    perfSheet = ss.insertSheet(SHEET_NAME_PERFORMANCE);
    perfSheet.getRange(1, 1, 1, 16).setValues([['date', 'plateforme', 'compte', 'hook', 'langue', 'vues', 'watchMoyen', 'completion', 'likes', 'comments', 'shares', 'profilVisits', 'bioClicks', 'installs', 'score', 'notes']]);
  }

  // AlgoNotes
  var algoSheet = ss.getSheetByName(SHEET_NAME_ALGONOTES);
  if (!algoSheet) {
    algoSheet = ss.insertSheet(SHEET_NAME_ALGONOTES);
    algoSheet.getRange(1, 1, 1, 5).setValues([['date', 'plateforme', 'changement', 'source', 'impact']]);
    var algoSeed = [
      [formatDate(new Date()), 'TikTok', 'Seuil viral monte a 70% completion rate', 'Socialync 2026', 'Raccourcir les videos (7-15s)'],
      [formatDate(new Date()), 'TikTok', 'Retention 3s: 65%+ = 4-7x impressions', 'OpusClip', 'Hook payoff dans les 3 premieres secondes'],
      [formatDate(new Date()), 'Instagram', 'Watermark TikTok supprime la reach', 'Sprout Social', 'Toujours poster fichier original sans watermark'],
      [formatDate(new Date()), 'General', 'AI UGC = 4x CTR vs ads traditionnelles', 'HeyGen research', 'Investir dans avatar IA plutot que contenu statique']
    ];
    algoSheet.getRange(2, 1, algoSeed.length, 5).setValues(algoSeed);
  }

  // ABTests
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

// ── ADD MISSING CONFIG — Ajoute les plateformes manquantes sans reset ──

function addMissingConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_CONFIG);
  if (!sheet) return { ok: false, error: 'Onglet Config introuvable' };

  // Lire les groupes existants
  var data = sheet.getDataRange().getValues();
  var existing = {};
  for (var i = 1; i < data.length; i++) {
    var key = (data[i][0] || '') + '||' + (data[i][1] || '');
    existing[key] = true;
  }

  // Plateformes a ajouter si absentes
  var toAdd = [
    ['TikTok',   '@se7en.news.ai',  'https://www.tiktok.com/@se7en.news.ai',  'MANUEL', true,  'weekly', '', '4323 followers - Videos FR'],
    ['Instagram','Bruce Li',         'https://www.instagram.com/',              'MANUEL', true,  'weekly', '', 'Business account - Reels cross-post'],
    ['YouTube',  '@se7enai',         'https://www.youtube.com/',                'MANUEL', false, 'weekly', '', 'Shorts - A configurer'],
  ];

  var added = [];
  for (var j = 0; j < toAdd.length; j++) {
    var k = toAdd[j][0] + '||' + toAdd[j][1];
    if (!existing[k]) {
      sheet.appendRow(toAdd[j]);
      added.push(toAdd[j][0] + ' / ' + toAdd[j][1]);
    }
  }

  // Mettre a jour les notes du TikTok EN existant si besoin
  for (var m = 1; m < data.length; m++) {
    if (data[m][0] === 'TikTok' && data[m][1] === '@se7en.video.ai') {
      var currentNotes = String(data[m][7] || '');
      if (currentNotes.indexOf('Videos EN') === -1) {
        sheet.getRange(m + 1, 8).setValue(currentNotes + ' - Videos EN');
      }
    }
  }

  return { ok: true, added: added, message: added.length > 0 ? added.length + ' plateforme(s) ajoutee(s)' : 'Toutes les plateformes sont deja presentes' };
}

// ── Rotation intelligente de contenu avec IA (Gemini Flash) ──

function refreshContent() {
  // 1. Recuperer la cle Gemini
  var geminiKey = '';
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var stratSheet = ss.getSheetByName(SHEET_NAME_STRATEGIE);
    if (stratSheet) {
      var stratData = stratSheet.getDataRange().getValues();
      for (var i = 0; i < stratData.length; i++) {
        if (String(stratData[i][0]).toLowerCase() === 'gemini_key') {
          geminiKey = String(stratData[i][1]).trim();
          break;
        }
      }
    }
  } catch (e) { /* ignore */ }
  if (!geminiKey) {
    geminiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_KEY') || '';
  }
  if (!geminiKey) {
    return { ok: false, error: 'Cle Gemini introuvable (ni dans Strategie ni dans ScriptProperties)' };
  }

  var endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey;

  // 2. Generer les templates texte
  var promptTextes = 'You are a social media marketing expert promoting 2 specific products. Generate 5 Facebook/Twitter post templates.\n\n'
    + 'PRODUCTS (use ONLY these verified features):\n'
    + '1. DictoKey - AI voice keyboard for Android. Dictate instead of typing. 52 languages supported. AI auto-correction. $4.99/month on Google Play Store. Website: dictokey.com\n'
    + '2. NoCodeFlow - Blog about no-code automation (n8n, Make.com, Zapier). Free tutorials and comparisons at nocode-flow.com\n\n'
    + 'RULES:\n'
    + '- Each template uses a DIFFERENT angle: question, tip, comparison, challenge, testimonial\n'
    + '- Use {title} as placeholder for the article/feature name\n'
    + '- Use {url} as placeholder for the link\n'
    + '- Platform must be "facebook" or "twitter" ONLY (no linkedin, no instagram)\n'
    + '- 3 templates about DictoKey, 2 about NoCodeFlow\n'
    + '- Mix English (3) and French (2)\n'
    + '- ALWAYS mention the product name (DictoKey or NoCodeFlow) explicitly\n'
    + '- End with a clear CTA (download, try, read, check out + {url})\n'
    + '- Do NOT invent features (no noise cancellation, no offline mode)\n'
    + '- Short, punchy, conversational tone\n\n'
    + 'RESPOND WITH ONLY valid JSON, no markdown:\n'
    + '{"templates":[{"platform":"facebook","article":"*","template":"Your actual post text with {title} and {url}","variant":"angle_name"}]}';

  var textesResult = callGemini(endpoint, promptTextes);
  if (!textesResult.ok) {
    return { ok: false, error: 'Erreur Gemini textes : ' + textesResult.error };
  }

  // 3. Generer les hooks video
  var promptVideos = 'You are a TikTok/Reels content expert. Generate 5 video hooks for short-form video promotion.\n\n'
    + 'PRODUCTS (verified features ONLY):\n'
    + '1. DictoKey - AI voice keyboard for Android. Type by speaking. 10x faster than typing. 52 languages. AI correction. Play Store.\n'
    + '2. NoCodeFlow - No-code automation blog. Tutorials for n8n, Make.com, Zapier at nocode-flow.com.\n\n'
    + 'RULES:\n'
    + '- Each hook must use a DIFFERENT style: proof-first, shocking-question, before-after, statistic, challenge\n'
    + '- Maximum 8 words per hook\n'
    + '- MUST mention the product name in the hook or it will be added after\n'
    + '- Hook must grab attention in the first 3 seconds of a video\n'
    + '- 3 hooks for DictoKey in ENGLISH\n'
    + '- 2 hooks for NoCodeFlow in FRENCH\n'
    + '- Be creative, punchy, NOT corporate\n'
    + '- Do NOT invent features\n\n'
    + 'RESPOND WITH ONLY valid JSON, no markdown:\n'
    + '{"videos":[{"produit":"DictoKey","hook":"Your hook text","langue":"EN","angle":"style_name"}]}';

  var videosResult = callGemini(endpoint, promptVideos);
  if (!videosResult.ok) {
    return { ok: false, error: 'Erreur Gemini videos : ' + videosResult.error };
  }

  // 4. Ecrire les templates dans l'onglet Textes (ajouter apres les existants)
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var textesSheet = ss.getSheetByName(SHEET_NAME_TEXTES);
  var nbTextes = 0;
  if (textesSheet && textesResult.data && textesResult.data.templates) {
    var templates = textesResult.data.templates;
    var lastRow = textesSheet.getLastRow();
    for (var i = 0; i < templates.length; i++) {
      var t = templates[i];
      textesSheet.getRange(lastRow + 1 + i, 1, 1, 4).setValues([[
        t.platform || 'facebook',
        t.article || '*',
        t.template || '',
        t.variant || ''
      ]]);
      nbTextes++;
    }
  }

  // 5. Ecrire les videos dans l'onglet Contenu (ajouter pour la semaine prochaine)
  var contenuSheet = ss.getSheetByName(SHEET_NAME_CONTENU);
  var nbVideos = 0;
  if (contenuSheet && videosResult.data && videosResult.data.videos) {
    var videos = videosResult.data.videos;
    var lastRowC = contenuSheet.getLastRow();
    // Calculer les dates de la semaine prochaine (lun, mer, ven)
    var today = new Date();
    var dayOfWeek = today.getDay(); // 0=dim, 1=lun...
    var daysUntilNextMon = (dayOfWeek === 0) ? 1 : (8 - dayOfWeek);
    var nextMon = new Date(today.getTime() + daysUntilNextMon * 86400000);
    var nextWed = new Date(nextMon.getTime() + 2 * 86400000);
    var nextFri = new Date(nextMon.getTime() + 4 * 86400000);
    var scheduleDates = [nextMon, nextWed, nextFri, nextMon, nextWed];

    for (var j = 0; j < videos.length; j++) {
      var v = videos[j];
      var schedDate = scheduleDates[j % scheduleDates.length];
      var dateStr = Utilities.formatDate(schedDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      var compte = (v.langue === 'FR') ? '@se7en.news.ai' : '@se7en.video.ai';
      var plateforme = 'TikTok';
      var langCode = (v.langue || 'EN').toLowerCase();
      var command = '/promo pip ' + langCode + ' ' + (v.hook || '');
      // Columns: date, plateforme, compte, type, produit, hook, langue, duree, lien, statut, notes, promoCmd
      contenuSheet.getRange(lastRowC + 1 + j, 1, 1, 12).setValues([[
        dateStr, plateforme, compte, 'pip', v.produit || '', v.hook || '',
        (v.langue || 'EN').toUpperCase(), '', '', 'planifie', v.angle || '', command
      ]]);
      nbVideos++;
    }
  }

  return { ok: true, textes: nbTextes, videos: nbVideos };
}

// ── Week Planning : retourne les taches planifiees pour une semaine (lun-ven) ──

function getWeekPlanning(weekStartStr) {
  // Si pas de date fournie, calculer le lundi de la semaine courante
  var monday;
  if (weekStartStr) {
    monday = parseDate(weekStartStr);
  }
  if (!monday) {
    var now = new Date();
    var day = now.getDay(); // 0=dim, 1=lun...
    var diff = (day === 0) ? -6 : 1 - day;
    monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  }

  // Generer les 5 dates de la semaine (lun a ven)
  var weekDates = [];
  for (var d = 0; d < 5; d++) {
    var dt = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + d);
    weekDates.push(formatDate(dt));
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var planning = getSheetData(ss, SHEET_NAME_PLANNING);

  // Creer un index rapide des dates de la semaine
  var weekSet = {};
  weekDates.forEach(function(ds) { weekSet[ds] = true; });

  // Filtrer les lignes qui tombent dans cette semaine
  var filtered = planning.filter(function(row) {
    return weekSet[row.date] === true;
  });

  var result = filtered.map(function(row) {
    return {
      date: row.date,
      platform: row.platform || '',
      group: row.group || '',
      article: row.article || '',
      status: row.status || '',
      doneAt: row.doneAt || '',
      _row: row._row
    };
  });

  return { ok: true, planning: result };
}

// ── Trending Angles : Gemini genere 6 angles promo tendance ──

function getTrendingAngles() {
  // 1. Recuperer la cle Gemini (meme logique que refreshContent)
  var geminiKey = '';
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var stratSheet = ss.getSheetByName(SHEET_NAME_STRATEGIE);
    if (stratSheet) {
      var stratData = stratSheet.getDataRange().getValues();
      for (var i = 0; i < stratData.length; i++) {
        if (String(stratData[i][0]).toLowerCase() === 'gemini_key') {
          geminiKey = String(stratData[i][1]).trim();
          break;
        }
      }
    }
  } catch (e) { /* ignore */ }
  if (!geminiKey) {
    geminiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_KEY') || '';
  }
  if (!geminiKey) {
    return { ok: false, error: 'Cle Gemini introuvable (ni dans Strategie ni dans ScriptProperties)' };
  }

  var endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey;

  // 2. Prompt pour 6 angles tendance
  var prompt = 'You are a social media trend analyst and marketing strategist. Your job is to identify CURRENT trending topics in AI, productivity, and no-code spaces, then suggest promotional angles that leverage these trends.\n\n'
    + 'Generate exactly 6 trending promo angles:\n'
    + '- 3 for DictoKey (AI voice keyboard for Android, dictate instead of typing, 52 languages, AI auto-correction, $4.99/month on Google Play Store, website: dictokey.com)\n'
    + '- 3 for NoCodeFlow (no-code automation blog, tutorials for n8n/Make.com/Zapier, free content at nocode-flow.com)\n\n'
    + 'RULES:\n'
    + '- Each angle MUST reference a REAL current trend (AI agents, voice-first interfaces, automation replacing jobs, etc.)\n'
    + '- Explain the trend briefly and how to leverage it for promotion\n'
    + '- hookFR = catchy hook in French, hookEN = catchy hook in English\n'
    + '- platform = the BEST social platform for this angle (tiktok, twitter, facebook, linkedin, instagram)\n'
    + '- Be creative, current, and actionable\n'
    + '- Do NOT invent product features\n\n'
    + 'RESPOND WITH ONLY valid JSON, no markdown:\n'
    + '{"angles":[{"product":"DictoKey","trend":"description of the current trend","angle":"the promo angle to use","hookFR":"accroche en francais","hookEN":"hook in english","platform":"tiktok"}]}';

  var geminiResult = callGemini(endpoint, prompt);
  if (!geminiResult.ok) {
    return { ok: false, error: 'Erreur Gemini trending angles : ' + geminiResult.error };
  }

  var angles = (geminiResult.data && geminiResult.data.angles) ? geminiResult.data.angles : [];
  return { ok: true, angles: angles };
}

// ── Helper : appeler Gemini Flash et parser la reponse JSON ──

function callGemini(endpoint, prompt) {
  try {
    var payload = {
      contents: [{ parts: [{ text: prompt }] }]
    };
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(endpoint, options);
    var code = response.getResponseCode();
    if (code !== 200) {
      return { ok: false, error: 'HTTP ' + code + ' : ' + response.getContentText().substring(0, 200) };
    }
    var json = JSON.parse(response.getContentText());
    var text = json.candidates[0].content.parts[0].text;
    // Nettoyer le markdown eventuel autour du JSON
    var cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    var data = JSON.parse(cleaned);
    return { ok: true, data: data };
  } catch (e) {
    return { ok: false, error: e.toString() };
  }
}
