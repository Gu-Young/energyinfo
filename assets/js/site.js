/* 에너지정보처리연구실 홈페이지 스크립트
 * 1) data/*.csv(매시간 자동 갱신)를 먼저 읽어 즉시 표시하고
 * 2) 공개 구글 시트를 백그라운드로 다시 읽어, 바뀐 내용이 있으면 바로 반영합니다.
 */
(function () {
  'use strict';

  var SHEET_ID = '145hCMhMUhEPcBmXvujrmHPllScyMAska0wyY7S1hklA';
  var DATASETS = {
    papers:   { file: 'papers.csv',   tab: '논문',   head: ['ID', '구분', '연도'] },
    patents:  { file: 'patents.csv',  tab: '특허',   head: ['ID', '구분', '상태'] },
    projects: { file: 'projects.csv', tab: '과제',   head: ['ID', '과제명(국문)', '과제명(영문)'] },
    news:     { file: 'news.csv',     tab: '소식',   head: ['ID', '날짜', '제목'] },
    members:  { file: 'members.csv',  tab: '구성원', head: ['ID', '상태', '과정'] }
  };
  var MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
  var AGENCY_LOGOS = ['ketep', 'knu', 'kdi', 'kepco', 'nrf', 'etri', 'dongguk'];

  /* ---------- 공통 유틸 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function parseCSV(text) {
    var rows = [], row = [], cell = '', q = false, i, c;
    text = String(text || '').replace(/^﻿/, '');
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows
      .map(function (r) { return r.map(function (x) { return x.trim(); }); })
      .filter(function (r) { return r.some(function (x) { return x !== ''; }); });
  }
  function validHead(rows, head) {
    return rows.length > 0 && head.every(function (h, i) { return rows[0][i] === h; });
  }
  function rowsKey(rows) {
    return JSON.stringify(rows.map(function (r) {
      var a = r.slice(); while (a.length && a[a.length - 1] === '') a.pop(); return a;
    }));
  }

  /* 로컬 CSV로 먼저 그리고, 시트에 새 내용이 있으면 다시 그립니다. */
  // 예전 사이트에서 옮겨 온 논문·특허 링크 (ID별). 시트의 DOI/링크 칸에 값이 있으면 시트가 우선합니다.
  // data/jcr.csv: JCR에서 조회해 둔 IF·상위% (ID별). 시트 L~O열에 값이 있으면 시트가 우선합니다.
  var LINKS = {}, JCR = {};
  function side(file, fn) {
    return fetch('data/' + file, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (t) { parseCSV(t).slice(1).forEach(fn); })
      .catch(function () {});
  }
  var linksReady = Promise.all([
    side('links.csv', function (r) { if (r[0] && r[1]) LINKS[r[0]] = r[1]; }),
    side('jcr.csv', function (r) { if (r[0]) JCR[r[0]] = r.slice(1); })
  ]);

  function load(name, render) {
    var d = DATASETS[name], localKey = null;
    var local = linksReady.then(function () { return fetch('data/' + d.file, { cache: 'no-cache' }); })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (t) {
        var rows = parseCSV(t);
        localKey = rowsKey(rows);
        render(rows.slice(1));
      })
      .catch(function () { render([]); });
    var url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
      '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(d.tab);
    var remote = fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); });
    Promise.all([local, remote]).then(function (res) {
      var rows = parseCSV(res[1]);
      if (validHead(rows, d.head) && rowsKey(rows) !== localKey) render(rows.slice(1));
    }).catch(function () { /* 시트를 읽지 못하면 저장된 데이터를 그대로 사용 */ });
  }

  function ym(s) { return String(s || '').replace('-', '.'); }
  function dotDate(s) {
    var m = String(s || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    return m ? m[1] + '. ' + ('0' + m[2]).slice(-2) + '. ' + ('0' + m[3]).slice(-2) + '.' : esc(s);
  }
  function imgSrc(name, dir) {
    name = String(name || '').trim();
    if (!name) return '';
    return /^https?:\/\//.test(name) ? name : 'assets/img/' + dir + '/' + name;
  }
  function splitList(s) {
    return String(s || '').split(/[;\n]/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function setBusy(el, on) { if (el) el.setAttribute('aria-busy', on ? 'true' : 'false'); }

  /* ---------- 데이터 → 객체 ---------- */
  function toPaper(r) {
    return { id: r[0], kind: r[1], year: r[2], month: r[3], title: r[4], authors: r[5],
             venue: r[6], vol: r[7], no: r[8], pages: r[9], doi: r[10] || LINKS[r[0]] || '',
             // 시트 L~O열: 최신 IF, 최신 JCR 상위%, 출판연도 IF, 출판연도 JCR 상위%
             ifNow: r[11] || jc(r[0], 0), rankNow: r[12] || jc(r[0], 1), ifPub: r[13] || jc(r[0], 2), rankPub: r[14] || jc(r[0], 3) };
  }
  function jc(id, i) { return (JCR[id] && JCR[id][i]) || ''; }
  function pct(v) { v = String(v || '').replace(/%|상위|top/gi, '').trim(); return v ? v + '%' : ''; }
  // 화면에는 최신 IF·JCR 상위%만 표시합니다 (출판연도 값은 시트에만 보관).
  function jcrBadge(p) {
    var now = [p.ifNow ? 'IF ' + esc(p.ifNow) : '', p.rankNow ? 'JCR 상위 ' + esc(pct(p.rankNow)) : ''].filter(Boolean).join(' · ');
    return now ? '<span class="jcr"><b>' + now + '</b></span>' : '';
  }
  function toPatent(r) {
    var reg = r[2] === '등록';
    var date = reg ? r[9] : r[7];
    return { id: r[0], div: r[1], status: r[2], country: r[3], title: r[4], authors: r[5],
             num: reg ? r[8] : r[6], date: date, year: (String(date).match(/\d{4}/) || [''])[0],
             link: r[10] || LINKS[r[0]] || '' };
  }
  function toProject(r) {
    return { id: r[0], ko: r[1], en: r[2], prog: r[3], agency: r[4], key: (r[5] || '').toLowerCase(),
             start: r[6], end: r[7], role: r[8], status: r[9] };
  }
  function byIdNum(a, b) { return String(a.id).localeCompare(String(b.id), undefined, { numeric: true }); }

  function paperDetail(p) {
    var dom = /국내/.test(p.kind), parts = [];
    var pages = String(p.pages || '');
    if (dom) {
      if (p.vol) parts.push('제' + p.vol + '권');
      if (p.no) parts.push('제' + p.no + '호');
      var head = parts.join(' '); parts = head ? [head] : [];
      if (pages) parts.push(/^Art/i.test(pages) ? pages : 'pp. ' + pages);
      if (p.year) parts.push(p.year + '년' + (p.month ? ' ' + p.month + '월' : ''));
    } else {
      if (p.vol) parts.push('vol. ' + p.vol);
      if (p.no) parts.push('no. ' + p.no);
      if (pages) parts.push(/^Art\.?\s*/i.test(pages) ? pages.replace(/^Art\.?\s*(no\.)?\s*/i, 'Art. no. ') : 'pp. ' + pages);
      var mm = parseInt(p.month, 10);
      if (p.year) parts.push((mm >= 1 && mm <= 12 ? MONTHS[mm - 1] + ' ' : '') + p.year);
    }
    return parts.join(', ');
  }
  function doiUrl(doi) {
    doi = String(doi || '').trim();
    if (!doi) return '';
    return /^https?:/.test(doi) ? doi : 'https://doi.org/' + doi.replace(/^doi:\s*/i, '');
  }
  function pubItem(p, q) {
    var url = doiUrl(p.doi);
    var title = url
      ? '<a class="pub-title" href="' + esc(url) + '" target="_blank" rel="noopener">' + highlight(p.title, q) + '</a>'
      : '<span class="pub-title">' + highlight(p.title, q) + '</span>';
    var det = paperDetail(p);
    return title +
      '<span class="pub-authors">' + highlight(p.authors, q, true) + '</span>' +
      '<span class="pub-venue"><i>' + highlight(p.venue, q) + '</i>' + (det ? ', ' + esc(det) : '') + '</span>' + jcrBadge(p);
  }
  function patentItem(t, q) {
    var dom = t.country === '대한민국' || t.div === '국내';
    var label = (t.country || '') + ' 특허 ' + (t.status || '');
    var num = t.num ? (dom ? '제' + t.num + '호' : t.num) : '';
    var det = [num, t.date ? dotDate(t.date) : ''].filter(Boolean).join(', ');
    var url = doiUrl(t.link);
    var title = url
      ? '<a class="pub-title" href="' + esc(url) + '" target="_blank" rel="noopener">' + highlight(t.title, q) + '</a>'
      : '<span class="pub-title">' + highlight(t.title, q) + '</span>';
    return title +
      '<span class="pub-authors">' + highlight(t.authors, q, true) + '</span>' +
      '<span class="pub-venue"><i>' + esc(label.trim()) + '</i>' + (det ? ', ' + det : '') + '</span>';
  }
  function projectCard(p, tag) {
    tag = tag || 'h3';
    var pi = /책임/.test(p.role);
    var logo = AGENCY_LOGOS.indexOf(p.key) >= 0
      ? '<img src="assets/img/agency/' + p.key + '.png" alt="" loading="lazy">' : '';
    return '<article class="proj">' +
      '<div class="meta"><span class="pill' + (pi ? ' pi' : '') + '">' + esc(p.role) + '</span>' +
      '<span>' + esc(ym(p.start)) + ' – ' + esc(ym(p.end)) + '</span></div>' +
      '<' + tag + '>' + esc(p.ko) + '</' + tag + '>' +
      (p.en ? '<p class="en">' + esc(p.en) + '</p>' : '') +
      (p.prog ? '<p class="prog">' + esc(p.prog) + '</p>' : '') +
      '<div class="agency">' + logo + '<span>' + esc(p.agency) + '</span></div>' +
      '</article>';
  }
  function isOngoing(p) {
    if (p.status) return /진행/.test(p.status);
    var now = new Date(), cur = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);
    return String(p.end) >= cur;
  }
  function sortProjects(list) {
    return list.slice().sort(function (a, b) {
      return String(b.start).localeCompare(String(a.start)) || byIdNum(a, b);
    });
  }
  function sortPapers(list) {
    return list.slice().sort(function (a, b) {
      return (b.year - a.year) || ((parseInt(b.month, 10) || 0) - (parseInt(a.month, 10) || 0)) || byIdNum(a, b);
    });
  }

  function toNews(r) {
    return { id: r[0], date: r[1], title: r[2], photos: splitList(r[3]).map(function (n) { return imgSrc(n, 'news'); }), link: r[4] };
  }
  function sortNews(list) {
    return list.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || -byIdNum(a, b); });
  }

  /* ---------- 탭 ---------- */
  function renderTabs(el, tabs, current, onPick) {
    el.innerHTML = tabs.map(function (t) {
      return '<button type="button" class="tab" role="tab" data-key="' + esc(t.key) + '" aria-selected="' +
        (t.key === current) + '">' + esc(t.label) +
        (t.count != null ? ' <span class="n">' + t.count + '</span>' : '') + '</button>';
    }).join('');
    var btns = $all('.tab', el);
    btns.forEach(function (b, i) {
      b.setAttribute('tabindex', b.getAttribute('aria-selected') === 'true' ? '0' : '-1');
      b.addEventListener('click', function () { onPick(b.getAttribute('data-key')); });
      b.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var k = btns[(i + d + btns.length) % btns.length].getAttribute('data-key');
        onPick(k);
        var nb = el.querySelector('.tab[data-key="' + k + '"]');
        if (nb) nb.focus();
      });
    });
  }
  function hashKey(valid, fallback) {
    var h = decodeURIComponent(location.hash.replace(/^#/, ''));
    return valid.indexOf(h) >= 0 ? h : fallback;
  }
  function setHash(k) { history.replaceState(null, '', '#' + encodeURIComponent(k)); }

  /* ---------- 홈 ---------- */
  function homeNews(el) {
    load('news', function (rows) {
      var list = sortNews(rows.map(toNews)).slice(0, 4);
      if (!list.length) { el.innerHTML = ''; return; }
      var f = list[0];
      var html = '<a class="news-feature" href="news.html#' + esc(f.id) + '">' +
        (f.photos[0] ? '<img class="cover" src="' + esc(f.photos[0]) + '" alt="">' : '<div class="ph r43"></div>') +
        '<div class="txt"><span class="date">' + dotDate(f.date) + '</span><h3>' + esc(f.title) + '</h3></div></a>';
      html += '<div class="news-side">' + list.slice(1).map(function (n) {
        return '<a class="news-row" href="news.html#' + esc(n.id) + '">' +
          (n.photos[0] ? '<img class="cover" src="' + esc(n.photos[0]) + '" alt="" loading="lazy">' : '<div class="ph r43"></div>') +
          '<div class="txt"><span class="date">' + dotDate(n.date) + '</span><h3>' + esc(n.title) + '</h3></div></a>';
      }).join('') + '</div>';
      el.innerHTML = html;
      setBusy(el, false);
      reveal(el);
    });
  }
  function homePubs(el) {
    load('papers', function (rows) {
      var list = sortPapers(rows.map(toPaper).filter(function (p) { return p.kind === '국제 저널'; })).slice(0, 4);
      el.innerHTML = list.map(function (p) {
        return '<li><span class="yr">' + esc(p.year) + '</span><div class="pub-body">' + pubItem(p) + '</div></li>';
      }).join('');
      setBusy(el, false);
      reveal(el);
    });
  }
  function homeProjects(el) {
    load('projects', function (rows) {
      var list = sortProjects(rows.map(toProject).filter(isOngoing)).slice(0, 6);
      el.innerHTML = list.map(function (p) { return projectCard(p); }).join('');
      setBusy(el, false);
      reveal(el);
    });
  }

  /* ---------- Publications ---------- */
  // 저자 목록에서 연구실 구성원 이름을 굵게 표시합니다 (교수 + 구성원 탭의 이름).
  var memberRe = null;
  function initials(en) {
    var parts = String(en || '').trim().split(/\s+/);
    if (parts.length < 2) return [];
    var last = parts.pop();
    var giv = parts.join(' ').split(/[\s-]+/).map(function (x) { return x.charAt(0).toUpperCase() + '.'; });
    return [giv.join(' ') + ' ' + last, giv.join('-') + ' ' + last];
  }
  function reEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function setMembers(list) {
    var names = ['G.-Y. Kwon', '권구영'];
    list.forEach(function (m) { if (m.name) names.push(m.name); names = names.concat(initials(m.en)); });
    memberRe = new RegExp('(' + names.filter(Boolean).map(reEsc).join('|') + ')', 'g');
  }
  function highlight(s, q, members) {
    s = esc(s);
    if (members && memberRe) s = s.replace(memberRe, '<b>$1</b>');
    if (q) {
      var re = new RegExp('(' + reEsc(esc(q)) + ')', 'gi');
      // 태그(<b> 등) 바깥의 글자에만 표시
      s = s.split(/(<[^>]+>)/).map(function (part, i) { return i % 2 ? part : part.replace(re, '<mark>$1</mark>'); }).join('');
    }
    return s;
  }
  function publications(root) {
    var KINDS = ['국제 저널', '국제 학술대회', '국내 저널', '국내 학술대회', '특허'];
    var papers = [], patents = [], current = hashKey(KINDS, KINDS[0]);
    var tabsEl = $('[data-tabs]', root), listEl = $('[data-list]', root);
    var input = $('#pub-q', root), noteEl = $('[data-note]', root), chartEl = $('[data-chart]', root), xEl = $('[data-chart-x]', root);
    function items() {
      return current === '특허'
        ? patents.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || byIdNum(a, b); })
        : sortPapers(papers.filter(function (p) { return p.kind === current; }));
    }
    function text(it) { return [it.year, it.title, it.authors, it.venue, it.country, it.num].join(' ').toLowerCase(); }
    function drawChart(all, q) {
      var years = {}, ys = all.map(function (it) { return +it.year; }).filter(Boolean);
      if (!ys.length) { chartEl.innerHTML = ''; xEl.innerHTML = ''; return; }
      all.forEach(function (it) { years[it.year] = (years[it.year] || 0) + 1; });
      var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), mx = 0, bars = '', xs = '', y;
      for (y in years) mx = Math.max(mx, years[y]);
      for (y = y0; y <= y1; y++) {
        var n = years[y] || 0;
        bars += '<button type="button" class="bar' + (String(y) === q ? ' on' : '') + '" data-y="' + y + '" aria-label="' + y + '년 ' + n + '건">' +
          (n ? '<em>' + n + '</em>' : '') + '<i style="height:' + (n / mx * 84) + '%"></i></button>';
        xs += '<span>&#39;' + String(y).slice(2) + '</span>';
      }
      chartEl.innerHTML = bars;
      xEl.innerHTML = xs;
      $all('.bar', chartEl).forEach(function (b) {
        b.addEventListener('click', function () {
          var yy = b.getAttribute('data-y');
          input.value = input.value.trim() === yy ? '' : yy;
          draw();
        });
      });
    }
    function draw() {
      var counts = {};
      KINDS.forEach(function (k) { counts[k] = k === '특허' ? patents.length : papers.filter(function (p) { return p.kind === k; }).length; });
      renderTabs(tabsEl, KINDS.map(function (k) { return { key: k, label: k, count: counts[k] }; }), current, function (k) {
        current = k; setHash(k); draw();
      });
      var all = items(), q = input.value.trim(), ql = q.toLowerCase();
      var list = q ? all.filter(function (it) { return text(it).indexOf(ql) >= 0; }) : all;
      drawChart(all, q);
      noteEl.textContent = q ? '“' + q + '” 검색 결과 ' + list.length + '건' : current + ' ' + all.length + '건';
      if (!list.length) {
        listEl.innerHTML = '<div class="empty">' + (q ? '검색 결과가 없습니다.' : '등록된 항목이 없습니다.') + '</div>';
        return;
      }
      var groups = [], last = null;
      list.forEach(function (it) {
        var y = it.year || '—';
        if (!last || last.year !== y) { last = { year: y, items: [] }; groups.push(last); }
        last.items.push(it);
      });
      listEl.innerHTML = groups.map(function (g) {
        return '<div class="year-group"><h2>' + esc(g.year) + '</h2><ol>' + g.items.map(function (it) {
          return '<li>' + (current === '특허' ? patentItem(it, q) : pubItem(it, q)) + '</li>';
        }).join('') + '</ol></div>';
      }).join('');
      setBusy(listEl, false);
      reveal(listEl);
    }
    input.addEventListener('input', draw);
    load('papers', function (rows) { papers = rows.map(toPaper); draw(); });
    load('patents', function (rows) { patents = rows.map(toPatent); draw(); });
    load('members', function (rows) { setMembers(rows.map(toMember)); draw(); });
    window.addEventListener('hashchange', function () { current = hashKey(KINDS, current); draw(); });
  }

  /* ---------- Research ---------- */
  function timeline(list) {
    var starts = list.map(function (p) { return parseInt(p.start, 10); }).filter(Boolean);
    var ends = list.map(function (p) { return parseInt(p.end, 10); }).filter(Boolean);
    if (!starts.length) return '<div class="empty">등록된 과제가 없습니다.</div>';
    var Y0 = Math.min.apply(null, starts), Y1 = Math.max.apply(null, ends.concat([new Date().getFullYear()])) + 1;
    var span = (Y1 - Y0) * 12;
    function pos(v) { var m = String(v).match(/(\d{4})\D+(\d{1,2})/); return m ? ((+m[1] - Y0) * 12 + (+m[2] - 1)) / span * 100 : 0; }
    var now = new Date(), nowPos = pos(now.getFullYear() + '-' + (now.getMonth() + 1));
    var grid = 'background-image:linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:' + (100 / (Y1 - Y0)) + '% 100%';
    var head = '<div class="tl-head"><div></div><div class="tl-years" style="grid-template-columns:repeat(' + (Y1 - Y0) + ',1fr)">';
    for (var y = Y0; y < Y1; y++) head += '<span>' + y + '</span>';
    head += '</div></div>';
    var rows = list.slice().sort(function (a, b) { return String(a.start).localeCompare(String(b.start)); }).map(function (p) {
      var l = pos(p.start), r = pos(p.end) + 100 / span;
      return '<div class="tl-row"><div class="nm">' + esc(p.ko) + '<small>' + esc(p.agency) + ' · ' + esc(ym(p.start)) + '–' + esc(ym(p.end)) + '</small></div>' +
        '<div class="tl-track" style="' + grid + '"><div class="tl-now" style="left:' + nowPos + '%"></div>' +
        '<div class="tl-bar' + (/책임/.test(p.role) ? ' pi' : '') + '" style="left:' + l + '%;width:' + Math.max(.8, r - l) + '%" title="' + esc(p.role) + '"></div></div></div>';
    }).join('');
    return '<div class="tl-legend"><span><i style="background:var(--teal)"></i>연구책임자</span><span><i style="background:#C5CEE6"></i>참여연구자</span>' +
      '<span><i style="border-top:2px dashed #E0795A;height:0;border-radius:0"></i>오늘</span></div>' +
      '<div class="tl"><div class="tl-in">' + head + rows + '</div></div>';
  }
  function research(root) {
    var KEYS = ['ongoing', 'completed', 'timeline'], LABEL = { ongoing: '진행 중인 과제', completed: '완료된 과제', timeline: '타임라인' };
    var all = [], current = hashKey(KEYS, 'ongoing');
    var tabsEl = $('[data-tabs]', root), listEl = $('[data-list]', root);
    function draw() {
      var on = all.filter(isOngoing), done = all.filter(function (p) { return !isOngoing(p); });
      renderTabs(tabsEl, KEYS.map(function (k) {
        return { key: k, label: LABEL[k], count: k === 'timeline' ? null : (k === 'ongoing' ? on : done).length };
      }), current, function (k) { current = k; setHash(k); draw(); });
      if (current === 'timeline') {
        listEl.className = 'stack';
        listEl.style.gap = '14px';
        listEl.innerHTML = timeline(all);
      } else {
        listEl.className = 'proj-grid';
        listEl.style.gap = '';
        var list = sortProjects(current === 'ongoing' ? on : done);
        listEl.innerHTML = list.length ? list.map(function (p) { return projectCard(p, 'h2'); }).join('')
          : '<div class="empty">등록된 과제가 없습니다.</div>';
      }
      setBusy(listEl, false);
      reveal(listEl);
    }
    load('projects', function (rows) { all = rows.map(toProject); draw(); });
    window.addEventListener('hashchange', function () { current = hashKey(KEYS, current); draw(); });
  }

  /* ---------- Members ---------- */
  var ROLE_EN = {
    '박사과정': 'Ph.D. Student', '석박통합과정': 'Integrated M.S.–Ph.D. Student', '석사과정': 'M.S. Student',
    '학부연구생': 'Undergraduate Researcher', '박사후연구원': 'Postdoctoral Researcher', '연구원': 'Researcher'
  };
  function toMember(r) {
    return { id: r[0], state: r[1], course: r[2], name: r[3], en: r[4], interests: r[5], email: r[6],
             photo: imgSrc(r[7], 'people'), note: r[8] };
  }
  function memberCard(m, alumni) {
    var role = ROLE_EN[m.course] || m.course;
    var photo = m.photo
      ? '<img src="' + esc(m.photo) + '" alt="' + esc(m.name) + ' 사진" loading="lazy">'
      : '<div class="ph">사진 준비 중</div>';
    var dl = '';
    if (m.interests) dl += '<div><dt>Research Interests</dt><dd>' + esc(m.interests) + '</dd></div>';
    if (alumni && m.note) dl += '<div><dt>Current Position</dt><dd>' + esc(m.note) + '</dd></div>';
    if (m.email) dl += '<div><dt>E-mail</dt><dd><a href="mailto:' + esc(m.email) + '">' + esc(m.email) + '</a></dd></div>';
    return '<article class="mem">' + photo + '<div class="txt">' +
      '<div class="nm">' + esc(m.name) + (m.en ? ' <small>' + esc(m.en) + '</small>' : '') + '</div>' +
      (role ? '<span class="role">' + esc(role) + '</span>' : '') +
      (dl ? '<dl>' + dl + '</dl>' : '') + '</div></article>';
  }
  function members(root) {
    var KEYS = ['current', 'alumni'], LABEL = { current: 'Current Members', alumni: 'Alumni' };
    var all = [], current = hashKey(KEYS, 'current');
    var tabsEl = $('[data-tabs]', root), listEl = $('[data-list]', root);
    function section(title, list, soft, alumni) {
      if (!list.length) return '';
      return '<section class="section' + (soft ? ' soft' : '') + '"><div class="wrap stack">' +
        '<div class="sec-head"><h2>' + esc(title) + '</h2></div>' +
        '<div class="mem-grid">' + list.map(function (m) { return memberCard(m, alumni); }).join('') + '</div></div></section>';
    }
    function draw() {
      var cur = all.filter(function (m) { return !/졸업/.test(m.state); });
      var alu = all.filter(function (m) { return /졸업/.test(m.state); });
      renderTabs(tabsEl, KEYS.map(function (k) { return { key: k, label: LABEL[k] }; }), current, function (k) {
        current = k; setHash(k); draw();
      });
      var html;
      if (current === 'current') {
        var postdoc = cur.filter(function (m) { return /박사후|연구원/.test(m.course); });
        var under = cur.filter(function (m) { return /학부/.test(m.course); });
        var grad = cur.filter(function (m) { return postdoc.indexOf(m) < 0 && under.indexOf(m) < 0; });
        html = section('Researchers', postdoc, false) +
          section('Graduate Students', grad, false) +
          section('Undergraduate Researchers', under, true);
      } else {
        html = section('Alumni', alu, false, true);
      }
      listEl.innerHTML = html || '<section class="section"><div class="wrap"><div class="empty">' +
        (current === 'alumni' ? '졸업생 정보는 구성원이 학위를 마치면 이곳에 추가됩니다.' : '등록된 구성원이 없습니다.') +
        '</div></div></section>';
      setBusy(listEl, false);
    }
    load('members', function (rows) { all = rows.map(toMember).sort(byIdNum); draw(); });
    window.addEventListener('hashchange', function () { current = hashKey(KEYS, current); draw(); });
  }

  /* ---------- News ---------- */
  function newsPage(root) {
    var listEl = $('[data-list]', root), lb = $('#lightbox'), items = [], cur = null, idx = 0, lastFocus = null;
    function show() {
      var n = items[cur];
      $('img', lb).src = n.photos[idx] || '';
      $('img', lb).alt = n.title;
      $('.date', lb).textContent = dotDate(n.date);
      $('.ttl', lb).textContent = n.title;
      $('.count', lb).textContent = n.photos.length > 1 ? (idx + 1) + ' / ' + n.photos.length : '';
      $('.lb-prev', lb).hidden = $('.lb-next', lb).hidden = n.photos.length < 2;
      if (n.photos.length > 1) { var pre = new Image(); pre.src = n.photos[(idx + 1) % n.photos.length]; }
    }
    function open(i) {
      if (!items[i] || !items[i].photos.length) return;
      lastFocus = document.activeElement;
      cur = i; idx = 0; show();
      lb.classList.add('on'); document.body.style.overflow = 'hidden';
      $('.lb-close', lb).focus();
      history.replaceState(null, '', '#' + encodeURIComponent(items[i].id));
    }
    function close() {
      lb.classList.remove('on'); document.body.style.overflow = '';
      history.replaceState(null, '', location.pathname);
      if (lastFocus) lastFocus.focus();
    }
    function step(d) { var n = items[cur].photos.length; idx = (idx + d + n) % n; show(); }
    $('.lb-close', lb).addEventListener('click', close);
    $('.lb-prev', lb).addEventListener('click', function () { step(-1); });
    $('.lb-next', lb).addEventListener('click', function () { step(1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('on')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    });
    var touchX = null;
    lb.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (touchX == null) return;
      var dx = e.changedTouches[0].clientX - touchX; touchX = null;
      if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    });
    var opened = false;
    load('news', function (rows) {
      items = sortNews(rows.map(toNews));
      listEl.innerHTML = items.length ? items.map(function (n, i) {
        return '<button type="button" class="news-card" data-i="' + i + '" id="' + esc(n.id) + '">' +
          '<div class="img">' + (n.photos[0] ? '<img class="cover" src="' + esc(n.photos[0]) + '" alt="" loading="lazy">' : '<div class="ph r43"></div>') +
          (n.photos.length > 1 ? '<span class="cnt">+' + (n.photos.length - 1) + '</span>' : '') + '</div>' +
          '<span class="date">' + dotDate(n.date) + '</span><span class="nt">' + esc(n.title) + '</span></button>';
      }).join('') : '<div class="empty">등록된 소식이 없습니다.</div>';
      $all('.news-card', listEl).forEach(function (b) {
        b.addEventListener('click', function () { open(+b.getAttribute('data-i')); });
      });
      setBusy(listEl, false);
      reveal(listEl);
      var h = decodeURIComponent(location.hash.replace(/^#/, ''));
      if (!opened && h) {
        for (var i = 0; i < items.length; i++) if (items[i].id === h) { opened = true; open(i); break; }
      }
    });
  }

  /* ---------- 스크롤 효과 ---------- */
  // 화면 아래에 있는 요소만 숨겼다가, 스크롤로 보일 때 살짝 떠오르며 나타납니다.
  var REVEAL = '.area, .news-feature, .news-row, .pub-list li, .proj, .mem, .year-group, .news-card, .interest, ' +
    '.timeline li, .c-card, .area-row, .intro > *, .pillars .p, .join, .map-wrap, .prof > *, .tl';
  var io = null, reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  function reveal(root) {
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    if (!io) io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target, sib = el.parentNode ? Array.prototype.indexOf.call(el.parentNode.children, el) : 0;
        el.style.transitionDelay = (sib % 4) * 70 + 'ms';
        el.classList.remove('pre');
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.08 });
    var vh = window.innerHeight;
    $all(REVEAL, root || document).forEach(function (el) {
      if (el.classList.contains('reveal')) return;
      el.classList.add('reveal');
      if (el.getBoundingClientRect().top > vh) { el.classList.add('pre'); io.observe(el); }
    });
  }

  /* ---------- 카카오맵 (지도 퍼가기) ---------- */
  // 지도 근처까지 스크롤했을 때만 불러오고, 실패하면 아래에 깔린 지도 이미지가 그대로 보입니다.
  function kakaoMap(box) {
    var ts = box.getAttribute('data-kakao-map'), key = box.getAttribute('data-kakao-key');
    var el = document.getElementById('daumRoughmapContainer' + ts);
    if (!el) return;
    var lastW = 0, timer = null;
    function render() {
      var w = Math.floor(box.clientWidth), h = w < 600 ? 360 : 460;
      if (!w || Math.abs(w - lastW) < 3) return;
      lastW = w;
      el.innerHTML = '';
      try {
        new window.daum.roughmap.Lander({ timestamp: ts, key: key, mapWidth: String(w), mapHeight: String(h) }).render();
        box.classList.add('live');
      } catch (e) { box.classList.remove('live'); }
    }
    function ready() {
      render();
      window.addEventListener('resize', function () { clearTimeout(timer); timer = setTimeout(render, 200); });
    }
    function load() {
      if (window.daum && window.daum.roughmap && window.daum.roughmap.Lander) { ready(); return; }
      // 카카오 로더는 document.write로 본체를 넣으므로, 그 순간만 가로채 일반 script로 붙입니다.
      var write = document.write;
      document.write = function (html) {
        var m = /src="([^"]+)"/.exec(html);
        document.write = write;
        if (!m) return;
        var s = document.createElement('script');
        s.src = m[1]; s.charset = 'UTF-8'; s.onload = ready;
        document.head.appendChild(s);
      };
      var l = document.createElement('script');
      l.src = 'https://ssl.daumcdn.net/dmaps/map_js_init/roughmapLoader.js';
      l.charset = 'UTF-8';
      l.onerror = function () { document.write = write; };
      document.head.appendChild(l);
    }
    if ('IntersectionObserver' in window) {
      var ob = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { ob.disconnect(); load(); }
      }, { rootMargin: '400px 0px' });
      ob.observe(box);
    } else load();
  }

  /* ---------- 맨 위로 버튼 ---------- */
  function toTop() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'to-top';
    b.setAttribute('aria-label', '맨 위로 이동');
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    document.body.appendChild(b);
    function onScroll() { b.classList.toggle('on', window.scrollY > window.innerHeight * 0.8); }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    b.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      var skip = document.querySelector('.brand');
      if (skip) setTimeout(function () { skip.focus({ preventScroll: true }); }, 400);
    });
  }

  /* ---------- 시작 ---------- */
  function init() {
    var header = $('.site-header'), btn = $('.menu-btn');
    if (header) {
      var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 8); };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    function setMenu(on) {
      header.classList.toggle('menu-open', on);
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
      btn.setAttribute('aria-label', on ? '메뉴 닫기' : '메뉴 열기');
    }
    if (btn) {
      btn.addEventListener('click', function () { setMenu(!header.classList.contains('menu-open')); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && header.classList.contains('menu-open')) { setMenu(false); btn.focus(); } });
      document.addEventListener('click', function (e) { if (header.classList.contains('menu-open') && !header.contains(e.target)) setMenu(false); });
    }
    var RENDER = {
      'home-news': homeNews, 'home-pubs': homePubs, 'home-projects': homeProjects,
      'publications': publications, 'research': research, 'members': members, 'news': newsPage
    };
    $all('[data-render]').forEach(function (el) {
      var fn = RENDER[el.getAttribute('data-render')];
      if (fn) fn(el);
    });
    reveal(document);
    $all('[data-kakao-map]').forEach(kakaoMap);
    toTop();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
