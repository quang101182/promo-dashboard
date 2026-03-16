// ============================================================
// PROMO DASHBOARD — Google Apps Script Backend
// Version : v1.0.0
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

  // Tâches du jour : date = today ET status = pending
  var tasks = planning
    .filter(function(row) {
      return row.date === today && row.status === 'pending';
    })
    .map(function(row) {
      var cfgKey   = normalizeKey(row.platform, row.group);
      var cfg      = configIndex[cfgKey] || {};
      var article  = articlesIndex[row.article] || {};

      // Textes correspondants pour cette platform + article (toutes variantes)
      var matchingTextes = textes.filter(function(t) {
        return t.platform === row.platform && t.article === row.article;
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
    ok    : true,
    date  : today,
    tasks : tasks,
    count : tasks.length
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
  function shouldPostToday(frequency) {
    switch ((frequency || '').toLowerCase()) {
      case 'daily':
        return dow >= 1 && dow <= 5; // lun-ven
      case '3x-week':
        return dow === 1 || dow === 3 || dow === 5; // lun, mer, ven
      case 'weekly':
        return dow === 1; // lundi seulement
      default:
        return false;
    }
  }

  // Articles triés par shareCount ASC (les moins partagés en priorité)
  var sortedArticles = articles.slice().sort(function(a, b) {
    return (parseInt(a.shareCount, 10) || 0) - (parseInt(b.shareCount, 10) || 0);
  });

  // Vérifie si une ligne Planning existe déjà pour (date, platform, group)
  var existingKeys = {};
  planning.forEach(function(r) {
    if (r.date === dateStr) {
      existingKeys[normalizeKey(r.platform, r.group)] = true;
    }
  });

  var generated = [];
  var errors    = [];

  activeConfigs.forEach(function(cfg, idx) {
    if (!shouldPostToday(cfg.frequency)) return;

    var key = normalizeKey(cfg.platform, cfg.group);
    if (existingKeys[key]) return; // déjà planifié

    // Choisir l'article le moins partagé qui n'a pas déjà été posté
    // dans ce groupe (vérification anti-doublon simple via Planning)
    var postedSlugs = {};
    planning.forEach(function(r) {
      if (r.platform === cfg.platform && r.group === cfg.group && r.status === 'done') {
        postedSlugs[r.article] = true;
      }
    });

    var chosenArticle = null;
    for (var i = 0; i < sortedArticles.length; i++) {
      if (!postedSlugs[sortedArticles[i].slug]) {
        chosenArticle = sortedArticles[i];
        break;
      }
    }

    if (!chosenArticle) {
      // Tous les articles ont été postés → reprendre le moins récent
      chosenArticle = sortedArticles[0] || null;
    }

    if (!chosenArticle) {
      errors.push('Aucun article disponible pour ' + cfg.platform + ' / ' + cfg.group);
      return;
    }

    // Ajouter la ligne dans Planning
    var planHeaders = getHeaders(planSheet);
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
    existingKeys[key] = true;

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
    errors    : errors,
    count     : generated.length
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
      ['Facebook', 'NO CODE APP Builder',       'https://www.facebook.com/groups/nocodeappbuilder',       'MANUEL', true,  'daily',    '', '125K membres'],
      ['Facebook', 'n8n Builders',              'https://www.facebook.com/groups/n8nbuilders',            'MANUEL', true,  'daily',    '', '147K membres'],
      ['Facebook', 'n8n Hub',                   'https://www.facebook.com/groups/n8nhub',                 'MANUEL', true,  '3x-week',  '', '37K membres'],
      ['Facebook', 'AI for Everyone',           'https://www.facebook.com/groups/aiforeveryone',          'MANUEL', true,  '3x-week',  '', '21K membres'],
      ['Facebook', 'Low code & no code',        'https://www.facebook.com/groups/lowcodenocode',          'MANUEL', true,  'weekly',   '', '3.5K membres'],
      ['Reddit',   'r/nocode',                  'https://www.reddit.com/r/nocode',                        'MANUEL', false, 'weekly',   '', 'Phase 3 — attente karma'],
      ['Reddit',   'r/n8n',                     'https://www.reddit.com/r/n8n',                           'MANUEL', false, 'weekly',   '', 'Phase 3 — attente karma'],
      ['Twitter',  'auto-post',                 '',                                                        'AUTO',   false, 'daily',    '', 'Phase 2 — attente setup API'],
      ['LinkedIn', 'profil',                    'https://www.linkedin.com',                                'MANUEL', false, '3x-week',  '', 'Phase 4'],
    ];
    cfgSheet.getRange(2, 1, cfgRows.length, cfgRows[0].length).setValues(cfgRows);
  }

  // ── Articles ──
  var artSheet = ss.getSheetByName(SHEET_NAME_ARTICLES);
  var artData  = artSheet.getDataRange().getValues();
  if (artData.length <= 1) {
    var artRows = [
      // slug, title, url, lastShared, shareCount
      ['best-free-automation-tools', '7 Best Free Automation Tools in 2026',           'https://nocode-flow.com/best-free-automation-tools',    '', 1],
      ['zapier-alternatives',        '10 Best Zapier Alternatives (Free & Paid)',       'https://nocode-flow.com/zapier-alternatives',            '', 0],
      ['n8n-vs-zapier',              'n8n vs Zapier: Which is Better in 2026?',         'https://nocode-flow.com/n8n-vs-zapier',                  '', 0],
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
       'What\'s the best FREE automation tool in 2026?\n\nI compared 7 tools so you don\'t have to.\n\n→ {title}\n{url}\n\nWhich one are you using?',
       'A'],
      ['Facebook', 'best-free-automation-tools',
       'Stop paying for automation tools you don\'t need.\n\nI tested 7 free options and ranked them.\n\n→ {title}\n{url}\n\nHave you tried any of these?',
       'B'],
      ['Facebook', 'zapier-alternatives',
       'Still paying $50+/month for automation?\n\n10 alternatives that do the same thing for less (or free).\n\n→ {title}\n{url}\n\nWhich one would you switch to?',
       'A'],
      ['Facebook', 'zapier-alternatives',
       'I\'ve been testing Zapier alternatives for 2 weeks.\n\nHere are the 10 best ones (some are completely free).\n\n→ {title}\n{url}\n\nDrop your thoughts below 👇',
       'B'],
      ['Facebook', 'n8n-vs-zapier',
       'n8n is free and self-hostable. Zapier charges per task.\n\nIs the switch worth it?\n\n→ {title}\n{url}\n\nHave you used n8n before?',
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
