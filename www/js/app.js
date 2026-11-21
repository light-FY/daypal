/* 伴办 · 应用编排层
 * 无框架、无构建步骤；所有状态保存在本机。
 */
(function (global) {
  'use strict';
  const BB = (global.BB = global.BB || {});
  const U = BB.util;
  const Store = BB.store;
  const UI = BB.ui;
  const Notify = BB.notify;
  const Parser = BB.parser;

  const App = {};
  BB.app = App;

  const state = {
    data: Store.load(),
    route: { name: 'today' },
    now: new Date(),
    calendarCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    selectedDate: U.dateKey(new Date()),
    lastListRoute: '#/today',
    lastDayKey: U.dateKey(new Date()),
    inbox: { type: 'all', status: 'active', sort: 'due', tag: '' },
    search: { q: '', type: 'all', priority: 'all', tag: '', status: 'active' },
    searchReturn: '#/inbox',
    composer: null,
    confirm: null,
    addingMilestone: false,
    pendingImport: null,
    toasts: [],
    remindersBusy: false,
    statusSignature: '',
    installedPrompt: null,
  };

  const $ = function (sel, root) {
    return (root || document).querySelector(sel);
  };
  const $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  function now() {
    return new Date();
  }

  function currentHash() {
    return location.hash || '#/today';
  }

  function navigate(hash, replace) {
    if (replace) {
      history.replaceState(null, '', hash);
      onRouteChange();
      return;
    }
    if (location.hash === hash) {
      onRouteChange();
      return;
    }
    location.hash = hash;
  }

  function parseRoute() {
    const raw = (location.hash || '#/today').replace(/^#\/?/, '');
    if (!raw) return { name: 'today' };
    const split = raw.split('?');
    const parts = split[0].split('/').filter(Boolean);
    if (parts[0] === 'task' && parts[1]) return { name: 'task', id: decodeURIComponent(parts[1]) };
    if (['today', 'calendar', 'inbox', 'search', 'settings'].indexOf(parts[0]) > -1) {
      return { name: parts[0], query: new URLSearchParams(split[1] || '') };
    }
    return { name: 'today' };
  }

  function greeting() {
    const h = state.now.getHours();
    if (h < 5) return '夜深了';
    if (h < 11) return '早上好';
    if (h < 13) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  function goBack() {
    if (state.route.name === 'task') {
      navigate(state.lastListRoute || '#/today');
      return;
    }
    if (state.route.name === 'search') {
      navigate(state.searchReturn || '#/inbox');
      return;
    }
    if (history.length > 1) history.back();
    else navigate('#/today');
  }

  /* ------------------------------------------------------------------ */
  /* 应用启动                                                            */
  /* ------------------------------------------------------------------ */

  function init() {
    injectStaticIcons();
    applyPreferences();
    state.route = parseRoute();
    if (state.route.name === 'calendar' && state.route.query && state.route.query.get('date')) {
      const key = state.route.query.get('date');
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
        state.selectedDate = key;
        const d = U.fromKey(key);
        state.calendarCursor = new Date(d.getFullYear(), d.getMonth(), 1);
      }
    }
    bindGlobalEvents();
    render(true);
    $('#offlineBanner').hidden = true;
    Notify.registerSW().catch(function () {});
    setTimeout(checkReminders, 1500);
    setInterval(tickClock, 1000);
    setInterval(checkReminders, 20000);
    setInterval(checkDayBoundary, 30000);
    window.addEventListener('online', function () {
      const banner = $('#offlineBanner');
      if (banner) banner.hidden = true;
    });
    window.addEventListener('offline', function () {
      const banner = $('#offlineBanner');
      if (banner) banner.hidden = false;
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        state.now = new Date();
        checkReminders();
        if (state.route.name === 'settings') render(false);
      }
    });
    window.addEventListener('storage', function (e) {
      if (e.key !== Store.KEY || !e.newValue) return;
      state.data = Store.load();
      render(false);
    });
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      state.installedPrompt = e;
    });
  }

  function injectStaticIcons() {
    $$('[data-icon]').forEach(function (el) {
      el.innerHTML = UI.icon(el.dataset.icon, '', el.dataset.size || 22);
    });
  }

  function applyPreferences() {
    const reduce = !!(state.data.settings && state.data.settings.reduceMotion);
    document.documentElement.classList.toggle('reduce-motion', reduce);
  }

  /* ------------------------------------------------------------------ */
  /* 路由与渲染                                                          */
  /* ------------------------------------------------------------------ */

  function onRouteChange() {
    state.route = parseRoute();
    state.addingMilestone = false;
    if (state.composer) {
      state.composer = null;
      const overlay = $('#overlayRoot');
      if (overlay) overlay.innerHTML = '';
      document.body.classList.remove('sheet-open');
    }
    if (state.confirm) closeConfirm();
    if (state.route.name === 'calendar' && state.route.query && state.route.query.get('date')) {
      const key = state.route.query.get('date');
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
        state.selectedDate = key;
        const d = U.fromKey(key);
        state.calendarCursor = new Date(d.getFullYear(), d.getMonth(), 1);
      }
    }
    if (state.route.name !== 'task') {
      state.lastListRoute = currentHash();
    }
    render(true);
  }

  function render(scrollTop) {
    state.now = new Date();
    state.route = state.route || parseRoute();
    const route = state.route;
    const hidden = route.name === 'task';
    document.body.classList.toggle('tabbar-hidden', hidden);
    document.body.dataset.route = route.name;
    const tabFor = route.name === 'search' ? 'inbox' : route.name;
    $$('#tabbar .tab').forEach(function (el) {
      const active = el.dataset.tab === tabFor && !hidden;
      el.classList.toggle('active', active);
      if (active) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    const view = $('#view');
    view.classList.toggle('view-detail', hidden);
    view.innerHTML = pageHTML(route);
    if (scrollTop) window.scrollTo(0, 0);
    updateCountdowns();
    afterRender(route);
  }

  function pageHTML(route) {
    switch (route.name) {
      case 'calendar':
        return pageCalendar();
      case 'inbox':
        return pageInbox();
      case 'search':
        return pageSearch();
      case 'settings':
        return pageSettings();
      case 'task':
        return pageTaskDetail(route.id);
      default:
        return pageToday();
    }
  }

  function afterRender(route) {
    if (route.name === 'calendar') bindCalendarSwipe();
    if (route.name === 'search') {
      const input = $('#searchInput');
      if (input && !state.search.q) {
        setTimeout(function () {
          try {
            input.focus({ preventScroll: true });
          } catch (e) {
            input.focus();
          }
        }, 90);
      }
    }
    if (state.addingMilestone) {
      const input = $('#msTitle');
      if (input) {
        setTimeout(function () {
          input.focus({ preventScroll: true });
        }, 60);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* 今日                                                                */
  /* ------------------------------------------------------------------ */

  function sortByDue(a, b) {
    if (!a.dueAt && !b.dueAt) return new Date(b.createdAt) - new Date(a.createdAt);
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return new Date(a.dueAt) - new Date(b.dueAt);
  }

  function sortByPriority(a, b) {
    const rank = { high: 0, medium: 1, low: 2 };
    const d = (rank[a.priority] == null ? 1 : rank[a.priority]) - (rank[b.priority] == null ? 1 : rank[b.priority]);
    if (d !== 0) return d;
    return sortByDue(a, b);
  }

  function todayData() {
    const ref = state.now;
    const active = state.data.tasks.filter(function (t) {
      return t.status === 'active';
    });
    const overdue = active.filter(function (t) {
      return t.dueAt && new Date(t.dueAt).getTime() < ref.getTime();
    }).sort(sortByDue);
    const today = active.filter(function (t) {
      return t.dueAt && U.sameDay(t.dueAt, ref) && new Date(t.dueAt).getTime() >= ref.getTime();
    }).sort(sortByDue);
    const shown = {};
    overdue.concat(today).forEach(function (t) {
      shown[t.id] = true;
    });
    const weekEnd = U.endOfDay(U.addDays(ref, 7));
    const upcoming = active.filter(function (t) {
      if (shown[t.id] || !t.dueAt) return false;
      const d = new Date(t.dueAt);
      return d.getTime() > U.endOfDay(ref).getTime() && d.getTime() <= weekEnd.getTime();
    }).sort(sortByDue);
    upcoming.forEach(function (t) {
      shown[t.id] = true;
    });
    const longterm = active.filter(function (t) {
      return !shown[t.id] && t.type === 'longterm';
    }).sort(sortByDue);
    longterm.forEach(function (t) {
      shown[t.id] = true;
    });
    const anytime = active.filter(function (t) {
      return !shown[t.id] && !t.dueAt;
    }).sort(sortByPriority);
    const completed = state.data.tasks.filter(function (t) {
      return t.status === 'done' && t.completedAt && U.sameDay(t.completedAt, ref);
    }).sort(function (a, b) {
      return new Date(b.completedAt) - new Date(a.completedAt);
    });
    const nearest = active.filter(function (t) {
      return t.dueAt;
    }).sort(sortByDue)[0] || null;
    const activeToday = active.filter(function (t) {
      return t.dueAt && U.sameDay(t.dueAt, ref);
    });
    return {
      active: active,
      overdue: overdue,
      today: today,
      upcoming: upcoming,
      longterm: longterm,
      anytime: anytime,
      completed: completed,
      nearest: nearest,
      activeToday: activeToday,
      todayCount: activeToday.length,
      focus:
        nearest &&
        (new Date(nearest.dueAt).getTime() < ref.getTime() + 48 * 3600000
          ? nearest
          : null),
    };
  }

  function pageToday() {
    const d = todayData();
    const ref = state.now;
    const overdueBeforeToday = d.overdue.filter(function (t) {
      return !U.sameDay(t.dueAt, ref);
    }).length;
    const totalToday = d.activeToday.length + overdueBeforeToday;
    const headline =
      totalToday > 0
        ? (overdueBeforeToday ? '还有 <em>' : '今天有 <em>') + totalToday + '</em> 件事'
        : d.completed.length
          ? '今天已经收工'
          : '今天，慢慢来';
    let sub = '';
    if (d.overdue.length) {
      sub = d.overdue.length + ' 件已逾期 · 先处理最急的一件，别让雪球滚大';
    } else if (d.nearest && new Date(d.nearest.dueAt).getTime() - ref.getTime() < 48 * 3600000) {
      sub = '下一件 · ' + d.nearest.title + ' · ' + UI.shortCountdown(d.nearest, ref);
    } else if (d.completed.length) {
      sub = '已完成 ' + d.completed.length + ' 件，剩下的可以慢慢来';
    } else if (d.active.length) {
      sub = '没有赶着要交的东西，先做一件想做的小事';
    } else {
      sub = '还没有待办。用一句话告诉伴办你想做什么';
    }
    const showNotify =
      Notify.isSupported() &&
      Notify.permission() === 'default' &&
      !state.data.settings.notificationsAsked;
    const showDemo =
      state.data.tasks.some(function (t) {
        return t.demo;
      }) && !state.data.meta.demoBannerDismissed;

    return (
      '<header class="page-head today-head">' +
      '<div class="topline">' +
      '<a class="brand" href="#/today" aria-label="伴办首页">' +
      '<span class="brand-mark">' +
      UI.icon('check', '', 15) +
      '</span>' +
      '<span class="brand-name">伴办</span>' +
      '</a>' +
      '<div class="head-actions">' +
      '<button class="icon-btn" data-action="open-search" aria-label="搜索任务">' +
      UI.icon('search', '', 20) +
      '</button>' +
      '</div>' +
      '</div>' +
      '<p class="date-kicker">' +
      U.escapeHTML(U.formatDate(ref, { relative: false })) +
      ' · ' +
      U.escapeHTML(U.weekdayCn(ref, true)) +
      '<span class="kicker-dot"></span>第 ' +
      weekOfYear(ref) +
      ' 周</p>' +
      '<h1 class="hero-title">' +
      greeting() +
      '，<br><span>' +
      headline +
      '</span></h1>' +
      '<p class="hero-sub">' +
      U.escapeHTML(sub) +
      '</p>' +
      '<div class="today-metabar">' +
      '<span><b>' +
      d.activeToday.length +
      '</b> 今天</span>' +
      '<span><b>' +
      d.overdue.length +
      '</b> 逾期</span>' +
      '<span><b>' +
      d.completed.length +
      '</b> 已完成</span>' +
      '<span class="metabar-spacer"></span>' +
      '<span class="mini-legend"><i class="dot t-deadline"></i>限时<i class="dot t-recurring"></i>定期<i class="dot t-longterm"></i>长期</span>' +
      '</div>' +
      '</header>' +
      '<button class="smart-entry" data-action="open-composer" aria-label="用一句话新建任务">' +
      '<span class="smart-entry-icon">' +
      UI.icon('sparkle', '', 17) +
      '</span>' +
      '<span class="smart-entry-copy"><strong>告诉伴办你要做什么</strong><small>“明天下午三点交高数作业，重要”</small></span>' +
      '<span class="smart-entry-plus">' +
      UI.icon('plus', '', 17) +
      '</span>' +
      '</button>' +
      (showDemo ? demoBanner() : '') +
      (showNotify ? notifyBanner() : '') +
      (d.focus ? focusCard(d.focus, ref) : '') +
      todaySections(d, ref) +
      (totalToday === 0 && d.anytime.length === 0 && d.longterm.length === 0 && !d.completed.length
        ? UI.emptyState({
            icon: 'sun',
            title: '今天没有安排',
            text: '把脑子里那件小事记下来，伴办帮你排好时间。',
            action: 'open-composer',
            actionLabel: '记一件事',
          })
        : '') +
      completedBlock(d.completed, ref)
    );
  }

  function weekOfYear(d) {
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    const first = new Date(date.getFullYear(), 0, 4);
    return (
      1 +
      Math.round(
        ((date.getTime() - first.getTime()) / 86400000 - 3 + ((first.getDay() + 6) % 7)) / 7
      )
    );
  }

  function demoBanner() {
    return (
      '<div class="demo-banner">' +
      '<span class="demo-dot"></span>' +
      '<div><strong>先看看示例</strong><p>这些任务演示了四种类型，随时可以清空。</p></div>' +
      '<div class="demo-actions">' +
      '<button data-action="clear-demo">清空</button>' +
      '<button data-action="dismiss-demo">保留</button>' +
      '</div>' +
      '</div>'
    );
  }

  function notifyBanner() {
    return (
      '<div class="notify-banner">' +
      '<span class="notify-banner-icon">' +
      UI.icon('bell', '', 18) +
      '</span>' +
      '<div class="notify-banner-copy"><strong>别错过截止</strong><span>开启通知，截止前 24h / 3h / 30min 提醒你</span></div>' +
      '<div class="notify-banner-actions">' +
      '<button class="btn-mini primary" data-action="enable-notifications">开启</button>' +
      '<button class="btn-mini text" data-action="dismiss-notifications">以后</button>' +
      '</div>' +
      '</div>'
    );
  }

  function focusCard(task, ref) {
    const meta = UI.typeMeta(task.type);
    const overdue = UI.isOverdue(task, ref);
    const remaining = task.dueAt ? new Date(task.dueAt).getTime() - ref.getTime() : 0;
    return (
      '<article class="focus-card t-' +
      meta.key +
      (overdue ? ' is-overdue' : '') +
      '">' +
      '<div class="focus-glow" aria-hidden="true"></div>' +
      '<div class="focus-top">' +
      '<span class="focus-eyebrow">' +
      (overdue ? 'OVERDUE · 先处理它' : 'UP NEXT · 接下来') +
      '</span>' +
      '<span class="focus-type">' +
      UI.icon(meta.icon, '', 13) +
      meta.label +
      '</span>' +
      '</div>' +
      '<h2 class="focus-title">' +
      U.escapeHTML(task.title) +
      '</h2>' +
      '<div class="focus-when">' +
      UI.icon('clock', '', 14) +
      '<span>' +
      U.escapeHTML(UI.whenText(task, ref)) +
      (task.tags && task.tags.length ? ' · #' + U.escapeHTML(task.tags[0]) : '') +
      '</span>' +
      '</div>' +
      '<div class="focus-bottom">' +
      '<div class="focus-count"><span class="focus-count-label">' +
      (overdue ? '已逾期' : '距离截止') +
      '</span><strong data-focus-countdown data-due="' +
      U.escapeHTML(task.dueAt || '') +
      '">' +
      U.escapeHTML(overdue ? U.formatOverdue(-remaining) : U.formatRemaining(remaining, 'short')) +
      '</strong></div>' +
      '<div class="focus-actions">' +
      '<button class="focus-open" data-action="open-task" data-id="' +
      U.escapeHTML(task.id) +
      '">查看任务</button>' +
      '<button class="focus-done" data-action="toggle-task" data-id="' +
      U.escapeHTML(task.id) +
      '" aria-label="完成任务">' +
      UI.icon('check', '', 16) +
      '</button>' +
      '</div>' +
      '</div>' +
      (task.type === 'longterm' ? UI.progressMarkup(task) : '') +
      '</article>'
    );
  }

  function todaySections(d, ref) {
    let html = '';
    if (d.overdue.length) html += taskSection('已逾期', d.overdue, ref, 'danger');
    if (d.today.length) html += taskSection('今天', d.today, ref);
    if (d.upcoming.length) html += taskSection('接下来 7 天', d.upcoming, ref);
    if (d.longterm.length) html += taskSection('长期任务', d.longterm, ref, 'longterm');
    if (d.anytime.length) html += taskSection('随时可做', d.anytime, ref);
    return html;
  }

  function taskSection(title, tasks, ref, tone) {
    return (
      '<section class="task-section ' +
      (tone ? 'tone-' + tone : '') +
      '">' +
      UI.sectionHead(title, tasks.length) +
      '<div class="task-list">' +
      tasks
        .map(function (t) {
          return UI.taskCard(t, ref, { notes: true });
        })
        .join('') +
      '</div>' +
      '</section>'
    );
  }

  function completedBlock(tasks, ref) {
    if (!tasks.length) return '';
    return (
      '<details class="completed-block">' +
      '<summary><span>' +
      UI.icon('checkCircle', '', 16) +
      '今天已完成</span><span class="completed-count">' +
      tasks.length +
      ' 件</span>' +
      UI.icon('chevronRight', 'summary-chev', 16) +
      '</summary>' +
      '<div class="task-list">' +
      tasks
        .map(function (t) {
          return UI.taskCard(t, ref, { notes: false });
        })
        .join('') +
      '</div>' +
      '</details>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* 日历                                                                */
  /* ------------------------------------------------------------------ */

  function pageCalendar() {
    const cursor = state.calendarCursor;
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const weekStart = state.data.settings.weekStart;
    const days = U.monthMatrix(year, month, weekStart);
    const selected = U.fromKey(state.selectedDate);
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    const orderedNames = [];
    for (let i = 0; i < 7; i++) orderedNames.push(dayNames[(weekStart + i) % 7]);
    const tasksByDay = {};
    state.data.tasks.forEach(function (t) {
      if (t.status === 'done') return;
      if (t.dueAt) {
        const k = U.dateKey(t.dueAt);
        (tasksByDay[k] = tasksByDay[k] || []).push(t);
      }
      if (t.type === 'longterm') {
        (t.milestones || []).forEach(function (m) {
          if (!m.done && m.dueAt) {
            const k = U.dateKey(m.dueAt);
            (tasksByDay[k] = tasksByDay[k] || []).push(t);
          }
        });
      }
    });
    const selectedTasks = state.data.tasks
      .filter(function (t) {
        return t.dueAt && U.dateKey(t.dueAt) === state.selectedDate;
      })
      .sort(function (a, b) {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        return sortByPriority(a, b);
      });
    const selectedMilestones = [];
    state.data.tasks.forEach(function (t) {
      if (t.type !== 'longterm') return;
      (t.milestones || []).forEach(function (m) {
        if (m.dueAt && U.dateKey(m.dueAt) === state.selectedDate) {
          selectedMilestones.push({ task: t, milestone: m });
        }
      });
    });
    const selectedLabel = U.formatDate(selected, { relative: false }) + ' ' + U.weekdayCn(selected, true);
    const isCurrentMonth = year === state.now.getFullYear() && month === state.now.getMonth();

    return (
      '<header class="page-head calendar-head">' +
      '<div class="topline">' +
      '<div><p class="eyebrow">CALENDAR</p><h1 class="page-title">日历</h1></div>' +
      '<button class="btn-pill" data-action="calendar-today">' +
      (isCurrentMonth ? '回到今天' : '今天') +
      '</button>' +
      '</div>' +
      '<div class="month-row">' +
      '<div class="month-title-wrap"><span class="month-year">' +
      year +
      '</span><h2 class="month-title">' +
      (month + 1) +
      '<small>月</small></h2></div>' +
      '<div class="month-nav">' +
      '<button class="icon-btn small" data-action="calendar-prev" aria-label="上个月">' +
      UI.icon('chevronLeft', '', 18) +
      '</button>' +
      '<button class="icon-btn small" data-action="calendar-next" aria-label="下个月">' +
      UI.icon('chevronRight', '', 18) +
      '</button>' +
      '</div>' +
      '</div>' +
      '</header>' +
      '<section class="calendar-card" aria-label="月历">' +
      '<div class="weekday-row">' +
      orderedNames
        .map(function (n, i) {
          return '<span class="' + ((weekStart + i) % 7 === 0 || (weekStart + i) % 7 === 6 ? 'weekend' : '') + '">' + n + '</span>';
        })
        .join('') +
      '</div>' +
      '<div class="calendar-grid" id="calendarGrid">' +
      days
        .map(function (day) {
          const key = U.dateKey(day);
          const outside = day.getMonth() !== month;
          const today = U.sameDay(day, state.now);
          const isSelected = key === state.selectedDate;
          const dayTasks = (tasksByDay[key] || []).slice();
          const types = [];
          dayTasks.forEach(function (t) {
            if (types.indexOf(t.type) < 0) types.push(t.type);
          });
          const dots = types
            .slice(0, 3)
            .map(function (type) {
              return '<i class="cal-dot t-' + type + '"></i>';
            })
            .join('');
          return (
            '<button class="cal-day' +
            (outside ? ' outside' : '') +
            (today ? ' is-today' : '') +
            (isSelected ? ' is-selected' : '') +
            '" data-action="calendar-select" data-date="' +
            key +
            '" aria-label="' +
            U.escapeHTML(U.formatDateWithWeek(day, state.now)) +
            (dayTasks.length ? '，' + dayTasks.length + ' 件待办' : '') +
            '"' +
            (isSelected ? ' aria-pressed="true"' : '') +
            '>' +
            '<span class="cal-num">' +
            day.getDate() +
            '</span>' +
            '<span class="cal-dots">' +
            dots +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '</section>' +
      '<section class="day-panel">' +
      '<div class="day-panel-head">' +
      '<div><p class="eyebrow">SELECTED</p><h2>' +
      U.escapeHTML(selectedLabel) +
      '</h2></div>' +
      '<button class="add-day-btn" data-action="open-composer" data-date="' +
      state.selectedDate +
      '" aria-label="在这一天新建任务">' +
      UI.icon('plus', '', 18) +
      '<span>添加</span>' +
      '</button>' +
      '</div>' +
      (selectedTasks.length
        ? '<div class="task-list">' +
          selectedTasks
            .map(function (t) {
              return UI.taskCard(t, state.now, { notes: false });
            })
            .join('') +
          '</div>'
        : UI.emptyState({
            icon: 'calendar',
            title: '这一天还是空白',
            text: '可以提前放一件事进来，也可以留给自己。',
          })) +
      (selectedMilestones.length
        ? '<div class="milestone-list compact">' +
          selectedMilestones
            .map(function (x) {
              return (
                '<button class="milestone-row" data-action="open-task" data-id="' +
                U.escapeHTML(x.task.id) +
                '">' +
                '<span class="ms-mark">' +
                UI.icon('target', '', 14) +
                '</span>' +
                '<span class="ms-main"><strong>' +
                U.escapeHTML(x.milestone.title) +
                '</strong><small>' +
                U.escapeHTML(x.task.title) +
                ' · 阶段</small></span>' +
                '<span class="' +
                (x.milestone.done ? 'ms-done' : '') +
                '">' +
                (x.milestone.done ? '已完成' : '待完成') +
                '</span>' +
                '</button>'
              );
            })
            .join('') +
          '</div>'
        : '') +
      '</section>'
    );
  }

  function bindCalendarSwipe() {
    const grid = $('#calendarGrid');
    if (!grid) return;
    let x0 = 0;
    let y0 = 0;
    let tracking = false;
    grid.addEventListener(
      'touchstart',
      function (e) {
        if (!e.touches || e.touches.length !== 1) return;
        x0 = e.touches[0].clientX;
        y0 = e.touches[0].clientY;
        tracking = true;
      },
      { passive: true }
    );
    grid.addEventListener(
      'touchend',
      function (e) {
        if (!tracking || !e.changedTouches || !e.changedTouches.length) return;
        tracking = false;
        const dx = e.changedTouches[0].clientX - x0;
        const dy = e.changedTouches[0].clientY - y0;
        if (Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
        if (dx < 0) moveCalendar(1);
        else moveCalendar(-1);
      },
      { passive: true }
    );
  }

  function moveCalendar(delta) {
    const cur = state.calendarCursor;
    const next = U.addMonths(new Date(cur.getFullYear(), cur.getMonth(), 1), delta);
    state.calendarCursor = new Date(next.getFullYear(), next.getMonth(), 1);
    state.selectedDate = U.dateKey(state.calendarCursor);
    render(false);
  }

  /* ------------------------------------------------------------------ */
  /* 收件箱                                                              */
  /* ------------------------------------------------------------------ */

  function allTags() {
    const map = {};
    state.data.tasks.forEach(function (t) {
      (t.tags || []).forEach(function (tag) {
        map[tag] = (map[tag] || 0) + 1;
      });
    });
    return Object.keys(map).sort(function (a, b) {
      return map[b] - map[a] || a.localeCompare(b, 'zh-CN');
    });
  }

  function inboxFiltered() {
    const f = state.inbox;
    return state.data.tasks
      .filter(function (t) {
        if (f.status !== 'all' && t.status !== f.status) return false;
        if (f.type !== 'all' && t.type !== f.type) return false;
        if (f.tag && (t.tags || []).indexOf(f.tag) < 0) return false;
        return true;
      })
      .slice();
  }

  function pageInbox() {
    const f = state.inbox;
    const items = inboxFiltered();
    const tags = allTags();
    const hasFilter = f.type !== 'all' || f.tag || f.status !== 'active';
    return (
      '<header class="page-head inbox-head">' +
      '<div class="topline">' +
      '<div><p class="eyebrow">INBOX</p><h1 class="page-title">收件箱</h1></div>' +
      '<button class="icon-btn" data-action="open-search" aria-label="搜索和筛选">' +
      UI.icon('search', '', 20) +
      '</button>' +
      '</div>' +
      '<p class="page-lead">所有想法先放这儿，再一件件安排。</p>' +
      '</header>' +
      '<button class="search-entry" data-action="open-search">' +
      UI.icon('search', '', 17) +
      '<span>搜索标题、标签、备注</span>' +
      '</button>' +
      UI.typeFilters(f.type, 'inbox-type') +
      '<div class="list-toolbar">' +
      UI.segmented(
        [
          { value: 'active', label: '进行中' },
          { value: 'done', label: '已完成' },
          { value: 'all', label: '全部' },
        ],
        f.status,
        'inbox-status'
      ) +
      '<select class="select compact" id="inboxSort" aria-label="排序方式">' +
      '<option value="due"' +
      (f.sort === 'due' ? ' selected' : '') +
      '>按截止</option>' +
      '<option value="priority"' +
      (f.sort === 'priority' ? ' selected' : '') +
      '>按优先级</option>' +
      '<option value="created"' +
      (f.sort === 'created' ? ' selected' : '') +
      '>最近创建</option>' +
      '</select>' +
      '</div>' +
      UI.tagChips(tags.slice(0, 12), f.tag, 'inbox-tag') +
      '<div class="result-meta"><span>' +
      items.length +
      ' 条任务</span>' +
      (hasFilter
        ? '<button class="text-link" data-action="inbox-clear">清除筛选</button>'
        : '<span class="muted">按截止时间排列</span>') +
      '</div>' +
      inboxBody(items, f.sort) +
      (items.length === 0
        ? UI.emptyState({
            icon: 'inbox',
            title: hasFilter ? '没有符合条件的任务' : '收件箱是空的',
            text: hasFilter ? '换个筛选条件，或者清除筛选看看全部。' : '把还没想好时间的事先放进来，之后再来安排。',
            action: hasFilter ? 'inbox-clear' : 'open-composer',
            actionLabel: hasFilter ? '清除筛选' : '记一件事',
          })
        : '')
    );
  }

  function inboxBody(items, sort) {
    if (!items.length) return '';
    if (sort === 'priority') {
      return (
        '<section class="task-section">' +
        UI.sectionHead('按优先级', items.length) +
        '<div class="task-list">' +
        items
          .sort(sortByPriority)
          .map(function (t) {
            return UI.taskCard(t, state.now, { notes: false });
          })
          .join('') +
        '</div></section>'
      );
    }
    if (sort === 'created') {
      return (
        '<section class="task-section">' +
        UI.sectionHead('最近创建', items.length) +
        '<div class="task-list">' +
        items
          .sort(function (a, b) {
            return new Date(b.createdAt) - new Date(a.createdAt);
          })
          .map(function (t) {
            return UI.taskCard(t, state.now, { notes: false });
          })
          .join('') +
        '</div></section>'
      );
    }
    const groups = [
      { key: 'overdue', title: '已逾期', items: [] },
      { key: 'today', title: '今天', items: [] },
      { key: 'week', title: '接下来 7 天', items: [] },
      { key: 'later', title: '以后', items: [] },
      { key: 'none', title: '没有日期', items: [] },
      { key: 'done', title: '已完成', items: [] },
    ];
    items.forEach(function (t) {
      if (t.status === 'done') {
        groups[5].items.push(t);
        return;
      }
      if (!t.dueAt) {
        groups[4].items.push(t);
        return;
      }
      const due = new Date(t.dueAt);
      if (due.getTime() < state.now.getTime()) groups[0].items.push(t);
      else if (U.sameDay(due, state.now)) groups[1].items.push(t);
      else if (due.getTime() <= U.endOfDay(U.addDays(state.now, 7)).getTime()) groups[2].items.push(t);
      else groups[3].items.push(t);
    });
    return groups
      .filter(function (g) {
        return g.items.length;
      })
      .map(function (g) {
        if (g.key === 'done') {
          g.items.sort(function (a, b) {
            return new Date(b.completedAt || b.updatedAt) - new Date(a.completedAt || a.updatedAt);
          });
        } else {
          g.items.sort(sortByDue);
        }
        return (
          '<section class="task-section ' +
          (g.key === 'overdue' ? 'tone-danger' : '') +
          '">' +
          UI.sectionHead(g.title, g.items.length) +
          '<div class="task-list">' +
          g.items
            .map(function (t) {
              return UI.taskCard(t, state.now, { notes: false });
            })
            .join('') +
          '</div></section>'
        );
      })
      .join('');
  }

  /* ------------------------------------------------------------------ */
  /* 搜索筛选                                                            */
  /* ------------------------------------------------------------------ */

  function searchFiltered() {
    const s = state.search;
    const q = s.q.trim().toLowerCase();
    return state.data.tasks
      .filter(function (t) {
        if (s.status !== 'all' && t.status !== s.status) return false;
        if (s.type !== 'all' && t.type !== s.type) return false;
        if (s.priority !== 'all' && t.priority !== s.priority) return false;
        if (s.tag && (t.tags || []).indexOf(s.tag) < 0) return false;
        if (!q) return true;
        const hay = [t.title, t.notes, (t.tags || []).join(' '), t.sourceText].join(' ').toLowerCase();
        return hay.indexOf(q) > -1;
      })
      .map(function (t) {
        let score = 0;
        if (q) {
          if (String(t.title).toLowerCase().indexOf(q) > -1) score += 5;
          if ((t.tags || []).join(' ').toLowerCase().indexOf(q) > -1) score += 3;
          if (String(t.notes || '').toLowerCase().indexOf(q) > -1) score += 1;
        }
        return { task: t, score: score };
      })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        if (a.task.status !== b.task.status) return a.task.status === 'active' ? -1 : 1;
        return sortByDue(a.task, b.task);
      })
      .map(function (x) {
        return x.task;
      });
  }

  function pageSearch() {
    const s = state.search;
    const tags = allTags();
    const hasFilter = s.type !== 'all' || s.priority !== 'all' || s.tag || s.status !== 'active';
    return (
      '<header class="search-head">' +
      '<button class="icon-btn" data-action="back" aria-label="返回">' +
      UI.icon('arrowLeft', '', 21) +
      '</button>' +
      '<div class="search-input-wrap">' +
      UI.icon('search', '', 18) +
      '<input id="searchInput" class="search-input" type="search" placeholder="搜任务、标签、备注" autocomplete="off" value="' +
      U.escapeHTML(s.q) +
      '" aria-label="搜索任务" />' +
      (s.q
        ? '<button class="search-clear" data-action="clear-search" aria-label="清空搜索">' +
          UI.icon('close', '', 14) +
          '</button>'
        : '') +
      '</div>' +
      '</header>' +
      '<div class="search-filter-block">' +
      UI.typeFilters(s.type, 'search-type') +
      '<div class="search-subfilters">' +
      UI.segmented(
        [
          { value: 'all', label: '全部' },
          { value: 'high', label: '高优' },
          { value: 'medium', label: '中优' },
          { value: 'low', label: '低优' },
        ],
        s.priority,
        'search-priority'
      ) +
      '</div>' +
      UI.tagChips(tags.slice(0, 10), s.tag, 'search-tag') +
      '<div class="search-status-row">' +
      UI.segmented(
        [
          { value: 'active', label: '进行中' },
          { value: 'done', label: '已完成' },
          { value: 'all', label: '全部' },
        ],
        s.status,
        'search-status'
      ) +
      (hasFilter || s.q
        ? '<button class="text-link" data-action="search-reset">重置</button>'
        : '') +
      '</div>' +
      '</div>' +
      '<div id="searchResults">' +
      searchResultsBlock() +
      '</div>'
    );
  }

  function searchResultsBlock() {
    const s = state.search;
    const items = searchFiltered();
    const title = s.q.trim() ? '“' + s.q.trim() + '” 的结果' : '全部任务';
    return (
      '<div class="result-meta search-meta"><span>' +
      items.length +
      ' 条 · ' +
      U.escapeHTML(title) +
      '</span><span class="muted">' +
      (s.status === 'done' ? '已完成' : s.status === 'all' ? '全部状态' : '进行中') +
      '</span></div>' +
      (items.length
        ? '<div class="task-list search-list">' +
          items
            .map(function (t) {
              return UI.taskCard(t, state.now, { notes: true, highlight: s.q.trim() });
            })
            .join('') +
          '</div>'
        : UI.emptyState({
            icon: 'search',
            title: s.q.trim() ? '没有找到相关任务' : '没有符合条件的任务',
            text: s.q.trim()
              ? '试试更短的关键词，或者搜索标签名。'
              : '换个筛选条件，或者回到收件箱看看。',
            action: 'search-reset',
            actionLabel: '重置筛选',
          }))
    );
  }

  function updateSearchResults() {
    const box = $('#searchResults');
    if (box) box.innerHTML = searchResultsBlock();
    const clearBtn = $('.search-clear');
    if (state.search.q && !clearBtn) {
      const wrap = $('.search-input-wrap');
      if (wrap) {
        const b = document.createElement('button');
        b.className = 'search-clear';
        b.dataset.action = 'clear-search';
        b.setAttribute('aria-label', '清空搜索');
        b.innerHTML = UI.icon('close', '', 14);
        wrap.appendChild(b);
      }
    } else if (!state.search.q && clearBtn) {
      clearBtn.remove();
    }
  }

  /* ------------------------------------------------------------------ */
  /* 设置                                                                */
  /* ------------------------------------------------------------------ */

  function permissionInfo() {
    const p = Notify.permission();
    if (p === 'granted') {
      return { label: '已开启', desc: '系统通知已允许，伴办会在截止前提醒你', tone: 'ok' };
    }
    if (p === 'denied') {
      return { label: '已关闭', desc: '通知被浏览器拦截，需要在浏览器设置里重新允许', tone: 'danger' };
    }
    if (p === 'unsupported') {
      return { label: '不支持', desc: '当前浏览器不支持系统通知，仍会显示应用内提醒', tone: 'muted' };
    }
    return { label: '未开启', desc: '开启后，锁屏或切到后台也能收到提醒', tone: 'warn' };
  }

  function pageSettings() {
    const s = state.data.settings;
    const p = permissionInfo();
    const demoCount = state.data.tasks.filter(function (t) {
      return t.demo;
    }).length;
    return (
      '<header class="page-head settings-head">' +
      '<p class="eyebrow">SETTINGS</p>' +
      '<h1 class="page-title">设置</h1>' +
      '<p class="page-lead">所有任务都只存在这台手机上，不需要账号。</p>' +
      '</header>' +
      '<section class="settings-group">' +
      '<div class="group-head"><h2>提醒</h2><span class="group-note">' +
      p.label +
      '</span></div>' +
      '<div class="settings-card">' +
      '<div class="setting-row">' +
      '<span class="setting-icon">' +
      UI.icon('bell', '', 19) +
      '</span>' +
      '<div class="setting-copy"><strong>系统通知</strong><small class="' +
      p.tone +
      '">' +
      p.desc +
      '</small></div>' +
      (Notify.permission() === 'granted'
        ? '<button class="btn-pill small" data-action="notify-test">测试</button>'
        : '<button class="btn-pill small accent" data-action="enable-notifications">开启</button>') +
      '</div>' +
      '<div class="setting-divider"></div>' +
      '<div class="subhead">截止前分级提醒</div>' +
      reminderSwitch('提前 24 小时', '给大任务留出准备时间', 'h24', s.reminders.h24) +
      reminderSwitch('提前 3 小时', '适合课程作业和会议', 'h3', s.reminders.h3) +
      reminderSwitch('提前 30 分钟', '最后确认一遍', 'm30', s.reminders.m30) +
      '<div class="setting-row select-row">' +
      '<span class="setting-icon">' +
      UI.icon('rotate', '', 19) +
      '</span>' +
      '<div class="setting-copy"><strong>逾期强提醒</strong><small>逾期后每隔一段时间再次提醒</small></div>' +
      '<select class="select tiny" id="overdueRepeat" aria-label="逾期提醒间隔">' +
      [5, 10, 30, 60]
        .map(function (m) {
          return (
            '<option value="' +
            m +
            '"' +
            (s.reminders.overdueRepeatMin === m ? ' selected' : '') +
            '>' +
            m +
            ' 分钟</option>'
          );
        })
        .join('') +
      '</select>' +
      '</div>' +
      '<div class="setting-note">' +
      UI.icon('target', '', 15) +
      '<span>长期任务的每个阶段，会在阶段到期前 24 小时和到期时各提醒一次。</span>' +
      '</div>' +
      (window.BB && BB.native && BB.native.isAndroid
        ? '<div class="setting-row">' +
          '<span class="setting-icon">' +
          UI.icon('clock', '', 19) +
          '</span>' +
          '<div class="setting-copy"><strong>精确提醒</strong><small>允许系统精确闹钟，避免 24h / 3h / 30min 提醒被延后</small></div>' +
          '<button class="btn-pill small" data-action="request-exact-alarm">' +
          (BB.native.exactAllowed() ? '已允许' : '去允许') +
          '</button>' +
          '</div>'
        : '') +
      '</div></section>' +
      '<section class="settings-group">' +
      '<div class="group-head"><h2>每日简报</h2></div>' +
      '<div class="settings-card">' +
      settingSwitch('每天早上汇总今天', '用一条通知告诉你今天的待办', 'digest', s.digest, 'toggle-setting') +
      (s.digest
        ? '<div class="setting-row inline-time">' +
          '<span class="setting-icon">' +
          UI.icon('clock', '', 19) +
          '</span>' +
          '<div class="setting-copy"><strong>简报时间</strong><small>通知权限开启后生效</small></div>' +
          '<input class="time-input" type="time" id="digestTime" value="' +
          U.escapeHTML(s.digestTime) +
          '" aria-label="每日简报时间" />' +
          '</div>'
        : '') +
      '</div></section>' +
      '<section class="settings-group">' +
      '<div class="group-head"><h2>显示与交互</h2></div>' +
      '<div class="settings-card">' +
      '<div class="setting-row">' +
      '<span class="setting-icon">' +
      UI.icon('calendar', '', 19) +
      '</span>' +
      '<div class="setting-copy"><strong>每周从哪天开始</strong><small>影响日历排列</small></div>' +
      UI.segmented(
        [
          { value: '1', label: '周一' },
          { value: '0', label: '周日' },
        ],
        String(s.weekStart),
        'set-weekstart'
      ) +
      '</div>' +
      settingSwitch('减少动效', '关闭弹层和卡片的过渡动画', 'reduceMotion', s.reduceMotion, 'toggle-setting') +
      (window.BB && BB.native
        ? ''
        : '<button class="setting-row action-row" data-action="install-app">' +
          '<span class="setting-icon">' +
          UI.icon('phone', '', 19) +
          '</span>' +
          '<span class="setting-copy"><strong>安装到主屏幕</strong><small>像 App 一样打开，提醒会更稳定</small></span>' +
          UI.icon('chevronRight', 'row-chev', 16) +
          '</button>') +
      '</div></section>' +
      '<section class="settings-group">' +
      '<div class="group-head"><h2>数据</h2><span class="group-note">仅本机</span></div>' +
      '<div class="settings-card data-card">' +
      '<button class="setting-row action-row" data-action="export-data">' +
      '<span class="setting-icon">' +
      UI.icon('download', '', 19) +
      '</span>' +
      '<span class="setting-copy"><strong>导出备份</strong><small>生成 JSON 备份，可保存或分享</small></span>' +
      UI.icon('chevronRight', 'row-chev', 16) +
      '</button>' +
      '<button class="setting-row action-row" data-action="import-data">' +
      '<span class="setting-icon">' +
      UI.icon('upload', '', 19) +
      '</span>' +
      '<span class="setting-copy"><strong>导入备份</strong><small>会覆盖当前所有任务</small></span>' +
      UI.icon('chevronRight', 'row-chev', 16) +
      '</button>' +
      '<button class="setting-row action-row" data-action="load-demo">' +
      '<span class="setting-icon">' +
      UI.icon('sparkle', '', 19) +
      '</span>' +
      '<span class="setting-copy"><strong>重新载入示例</strong><small>' +
      (demoCount ? '当前有 ' + demoCount + ' 条示例任务' : '看看四种任务类型长什么样') +
      '</small></span>' +
      UI.icon('chevronRight', 'row-chev', 16) +
      '</button>' +
      '<button class="setting-row action-row danger-row" data-action="clear-data">' +
      '<span class="setting-icon">' +
      UI.icon('trash', '', 19) +
      '</span>' +
      '<span class="setting-copy"><strong>清空所有任务</strong><small>此操作不可撤销，建议先导出备份</small></span>' +
      UI.icon('chevronRight', 'row-chev', 16) +
      '</button>' +
      '<input type="file" id="importFile" accept="application/json,.json" hidden />' +
      '</div></section>' +
      '<section class="settings-group">' +
      '<div class="group-head"><h2>关于</h2></div>' +
      '<div class="about-card">' +
      '<div class="about-brand">' +
      '<span class="brand-mark big">' +
      UI.icon('check', '', 20) +
      '</span>' +
      '<div><strong>伴办</strong><span>版本 0.9.1 · 移动版</span></div>' +
      '</div>' +
      '<p>日历、备忘录和智能待办，合成一件小事。用大白话记下任务，剩下的交给伴办。</p>' +
      '<div class="about-badges"><span>' +
      UI.icon('lock', '', 13) +
      '本地存储</span><span>' +
      UI.icon('phone', '', 13) +
      '手机优先</span><span>' +
      UI.icon('shield', '', 13) +
      '无账号</span></div>' +
      '<div class="about-note">' +
      (window.BB && BB.native
        ? 'Android 版通过系统闹钟排程本地通知：App 在后台或关闭后仍会尽量按时提醒；若系统限制了后台活动，可能略有延迟。所有数据只存在本机。'
        : '提醒依赖浏览器通知能力：App 在前台或后台运行时最可靠；完全关闭浏览器后，系统可能不会按时唤醒网页。需要更强提醒时可安装到主屏幕。') +
      '</div>' +
      '</div></section>' +
      '<p class="settings-foot">伴办 · 把今天，一件件做完。</p>'
    );
  }

  function reminderSwitch(label, desc, key, checked) {
    return (
      '<div class="setting-row">' +
      '<span class="setting-icon light">' +
      UI.icon('bell', '', 17) +
      '</span>' +
      '<div class="setting-copy"><strong>' +
      label +
      '</strong><small>' +
      desc +
      '</small></div>' +
      '<button class="switch ' +
      (checked ? 'on' : '') +
      '" data-action="toggle-reminder" data-key="' +
      key +
      '" role="switch" aria-checked="' +
      !!checked +
      '" aria-label="' +
      label +
      '"></button>' +
      '</div>'
    );
  }

  function settingSwitch(label, desc, key, checked, action) {
    return (
      '<div class="setting-row">' +
      '<span class="setting-icon">' +
      UI.icon(key === 'digest' ? 'sun' : 'sparkle', '', 19) +
      '</span>' +
      '<div class="setting-copy"><strong>' +
      label +
      '</strong><small>' +
      desc +
      '</small></div>' +
      '<button class="switch ' +
      (checked ? 'on' : '') +
      '" data-action="' +
      action +
      '" data-key="' +
      key +
      '" role="switch" aria-checked="' +
      !!checked +
      '" aria-label="' +
      label +
      '"></button>' +
      '</div>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* 任务详情                                                            */
  /* ------------------------------------------------------------------ */

  function pageTaskDetail(id) {
    const task = Store.getTask(state.data, id);
    if (!task) {
      return (
        '<div class="not-found">' +
        UI.emptyState({
          icon: 'file',
          title: '这个任务不在了',
          text: '它可能已经被删除。',
          action: 'back',
          actionLabel: '返回',
        }) +
        '</div>'
      );
    }
    const meta = UI.typeMeta(task.type);
    const done = task.status === 'done';
    const overdue = UI.isOverdue(task, state.now);
    const dueFull = task.dueAt
      ? U.formatDate(task.dueAt, { relative: false, now: state.now }) +
        ' ' +
        U.weekdayCn(task.dueAt, true) +
        (task.hasTime ? ' ' + U.formatTime(task.dueAt) : '')
      : '未设置时间';
    const ms = task.milestones || [];
    const msDone = ms.filter(function (m) {
      return m.done;
    }).length;
    const nextTask = task.nextTaskId ? Store.getTask(state.data, task.nextTaskId) : null;
    return (
      '<header class="detail-bar">' +
      '<button class="icon-btn" data-action="back" aria-label="返回">' +
      UI.icon('arrowLeft', '', 21) +
      '</button>' +
      '<span class="detail-bar-title">' +
      meta.full +
      '</span>' +
      '<button class="text-btn" data-action="edit-task" data-id="' +
      U.escapeHTML(task.id) +
      '">编辑</button>' +
      '</header>' +
      '<div class="detail-content">' +
      '<section class="detail-hero t-' +
      meta.key +
      (done ? ' is-done' : '') +
      '">' +
      '<div class="detail-type-row">' +
      UI.typeBadge(task.type) +
      UI.priorityFlag(task.priority) +
      (done ? '<span class="status-done">已完成</span>' : '') +
      '</div>' +
      '<h1 class="detail-title">' +
      U.escapeHTML(task.title) +
      '</h1>' +
      '<div class="detail-meta">' +
      '<span>' +
      UI.icon('calendar', '', 15) +
      U.escapeHTML(dueFull) +
      '</span>' +
      (task.recurrence ? '<span>' + UI.icon('repeat', '', 15) + U.escapeHTML(U.describeRecurrence(task.recurrence)) + '</span>' : '') +
      '</div>' +
      (task.tags.length
        ? '<div class="detail-tags">' +
          task.tags
            .map(function (t) {
              return '<span class="tag">#' + U.escapeHTML(t) + '</span>';
            })
            .join('') +
          '</div>'
        : '') +
      countdownPanel(task, done, overdue, dueFull) +
      '</section>' +
      longtermPanel(task, ms, msDone) +
      (task.notes
        ? '<section class="detail-card notes-card"><div class="card-head"><h2>备注</h2></div><p class="notes-text">' +
          U.escapeHTML(task.notes).replace(/\n/g, '<br>') +
          '</p></section>'
        : '') +
      (nextTask
        ? '<section class="detail-card next-card"><div class="card-head"><h2>下一次</h2><span class="card-hint">已自动生成</span></div>' +
          '<button class="next-task-row" data-action="open-task" data-id="' +
          U.escapeHTML(nextTask.id) +
          '"><span><strong>' +
          U.escapeHTML(U.formatDateWithWeek(nextTask.dueAt, state.now)) +
          (nextTask.hasTime ? ' ' + U.formatTime(nextTask.dueAt) : '') +
          '</strong><small>' +
          U.escapeHTML(nextTask.title) +
          '</small></span>' +
          UI.icon('chevronRight', '', 17) +
          '</button></section>'
        : '') +
      (task.sourceText
        ? '<section class="detail-card source-card">' +
          '<div class="card-head"><h2>这句话，变成了任务</h2>' +
          (task.parseMeta && task.parseMeta.confidence
            ? '<span class="confidence">识别度 ' + Math.round(task.parseMeta.confidence * 100) + '%</span>'
            : '') +
          '</div>' +
          '<blockquote>“' +
          U.escapeHTML(task.sourceText) +
          '”</blockquote>' +
          (task.parseMeta && task.parseMeta.matches
            ? '<div class="parse-chips">' +
              task.parseMeta.matches
                .filter(function (m) {
                  return m.field !== 'type';
                })
                .slice(0, 5)
                .map(function (m) {
                  return '<span>' + U.escapeHTML(m.label) + '</span>';
                })
                .join('') +
              '</div>'
            : '') +
          '<button class="text-link" data-action="reparse-task" data-id="' +
          U.escapeHTML(task.id) +
          '">' +
          UI.icon('sparkle', '', 14) +
          ' 重新用这句话识别</button>' +
          '</section>'
        : '') +
      '<section class="detail-meta-foot">' +
      '<span>创建于 ' +
      U.formatDateTime(task.createdAt, true, state.now) +
      '</span>' +
      '<span>更新于 ' +
      U.formatDateTime(task.updatedAt, true, state.now) +
      '</span>' +
      '<button class="delete-link" data-action="delete-task" data-id="' +
      U.escapeHTML(task.id) +
      '">删除任务</button>' +
      '</section>' +
      '</div>' +
      '<footer class="detail-footer">' +
      '<button class="btn btn-soft btn-edit" data-action="edit-task" data-id="' +
      U.escapeHTML(task.id) +
      '">' +
      UI.icon('edit', '', 17) +
      '编辑</button>' +
      '<button class="btn btn-primary btn-complete" data-action="toggle-task" data-id="' +
      U.escapeHTML(task.id) +
      '">' +
      UI.icon(done ? 'rotate' : 'check', '', 18) +
      (done ? '恢复任务' : task.recurrence ? '完成本次' : '完成任务') +
      '</button>' +
      '</footer>'
    );
  }

  function countdownPanel(task, done, overdue, dueFull) {
    if (done) {
      return (
        '<div class="countdown-panel done">' +
        '<span class="count-label">已完成</span>' +
        '<strong class="count-value small">' +
        U.escapeHTML(task.completedAt ? U.formatDateTime(task.completedAt, true, state.now) : '完成') +
        '</strong>' +
        '</div>'
      );
    }
    if (!task.dueAt) {
      if (task.type === 'longterm') return '';
      return (
        '<div class="countdown-panel quiet">' +
        '<span class="count-label">没有时间压力</span>' +
        '<p>随时可以做，先放在收件箱里也没关系。</p>' +
        '</div>'
      );
    }
    const remaining = new Date(task.dueAt).getTime() - state.now.getTime();
    const created = new Date(task.createdAt).getTime();
    const due = new Date(task.dueAt).getTime();
    const elapsed = U.clamp(((state.now.getTime() - created) / Math.max(1, due - created)) * 100, 0, 100);
    return (
      '<div class="countdown-panel ' +
      (overdue ? 'overdue' : '') +
      '" data-detail-countdown data-due="' +
      U.escapeHTML(task.dueAt) +
      '">' +
      '<div class="count-head"><span class="count-label">' +
      (overdue ? '已逾期' : task.recurrence ? '距离本次截止' : '距离截止') +
      '</span><span class="count-due">' +
      U.escapeHTML(dueFull) +
      '</span></div>' +
      '<strong class="count-value" id="detailCountdown">' +
      U.escapeHTML(
        overdue
          ? U.formatOverdue(-remaining)
          : U.formatRemaining(remaining, 'full')
      ) +
      '</strong>' +
      '<div class="count-track"><span style="width:' +
      (overdue ? 100 : elapsed) +
      '%"></span></div>' +
      '</div>'
    );
  }

  function longtermPanel(task, ms, msDone) {
    if (task.type !== 'longterm') return '';
    const p = UI.progressOf(task);
    const readOnly = task.status === 'done';
    return (
      '<section class="detail-card progress-card" id="progressSection">' +
      '<div class="card-head"><h2>总体进度</h2><strong class="progress-number" id="progressValue">' +
      p +
      '%</strong></div>' +
      '<div class="big-track"><span id="progressBar" style="width:' +
      p +
      '%"></span></div>' +
      (ms.length
        ? '<p class="progress-caption">按阶段推进 · 已完成 ' +
          msDone +
          ' / ' +
          ms.length +
          ' 个阶段</p>' +
        '<div class="milestone-list">' +
          ms
            .slice()
            .sort(function (a, b) {
              if (!a.dueAt && !b.dueAt) return a.done - b.done;
              if (!a.dueAt) return 1;
              if (!b.dueAt) return -1;
              return new Date(a.dueAt) - new Date(b.dueAt);
            })
            .map(function (m) {
              const over = !m.done && m.dueAt && new Date(m.dueAt).getTime() < state.now.getTime();
              const checkHtml = readOnly
                ? '<span class="ms-check ' + (m.done ? 'checked' : '') + '">' + UI.icon('check', '', 12) + '</span>'
                : '<button class="ms-check ' +
                  (m.done ? 'checked' : '') +
                  '" data-action="toggle-milestone" data-id="' +
                  U.escapeHTML(task.id) +
                  '" data-ms="' +
                  U.escapeHTML(m.id) +
                  '" aria-label="' +
                  (m.done ? '恢复阶段' : '完成阶段') +
                  '">' +
                  UI.icon('check', '', 12) +
                  '</button>';
              return (
                '<div class="milestone-item ' +
                (m.done ? 'done' : '') +
                (over ? ' overdue' : '') +
                '">' +
                checkHtml +
                '<div class="ms-copy"><strong>' +
                U.escapeHTML(m.title) +
                '</strong><small>' +
                (m.dueAt
                  ? U.formatDate(m.dueAt, { now: state.now }) +
                    (U.formatDate(m.dueAt, { now: state.now }) && U.formatTime(m.dueAt) !== '23:59'
                      ? ' ' + U.formatTime(m.dueAt)
                      : '')
                  : '未设截止') +
                '</small></div>' +
                (readOnly
                  ? ''
                  : '<button class="ms-delete" data-action="delete-milestone" data-id="' +
                    U.escapeHTML(task.id) +
                    '" data-ms="' +
                    U.escapeHTML(m.id) +
                    '" aria-label="删除阶段">' +
                    UI.icon('close', '', 13) +
                    '</button>') +
                '</div>'
              );
            })
            .join('') +
          '</div>'
        : readOnly
          ? '<p class="progress-caption">这个长期任务已经完成。</p>'
          : '<div class="progress-manual">' +
            '<input type="range" id="progressRange" min="0" max="100" step="5" value="' +
            p +
            '" data-id="' +
            U.escapeHTML(task.id) +
            '" aria-label="任务进度" />' +
            '<div class="progress-actions">' +
            '<button class="btn-mini" data-action="progress-minus" data-id="' +
            U.escapeHTML(task.id) +
            '">−10%</button>' +
            '<span>拖动或点按调整</span>' +
            '<button class="btn-mini" data-action="progress-plus" data-id="' +
            U.escapeHTML(task.id) +
            '">+10%</button>' +
            '</div></div>') +
      (readOnly
        ? ''
        : state.addingMilestone
          ? milestoneForm(task)
          : '<button class="add-stage-btn" data-action="add-milestone" data-id="' +
            U.escapeHTML(task.id) +
            '">' +
            UI.icon('plus', '', 15) +
            '添加阶段</button>') +
      '</section>'
    );
  }

  function milestoneForm(task) {
    return (
      '<form class="milestone-form" id="milestoneForm" data-task="' +
      U.escapeHTML(task.id) +
      '">' +
      '<div class="ms-form-head"><strong>新阶段</strong><button type="button" class="icon-btn tiny" data-action="cancel-milestone" aria-label="取消">' +
      UI.icon('close', '', 14) +
      '</button></div>' +
      '<input class="input" id="msTitle" placeholder="比如：文献综述" maxlength="80" required />' +
      '<div class="ms-form-row">' +
      '<input class="input" type="date" id="msDate" />' +
      '<input class="input" type="time" id="msTime" />' +
      '</div>' +
      '<button class="btn btn-primary btn-sm full" type="submit">添加阶段</button>' +
      '</form>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* 新建 / 编辑弹层                                                      */
  /* ------------------------------------------------------------------ */

  function uiFreqFromRecurrence(rec) {
    if (!rec) return 'none';
    if (rec.freq === 'weekly') {
      const days = (rec.weekdays || []).slice().sort(function (a, b) {
        return a - b;
      });
      if (days.join(',') === '1,2,3,4,5') return 'weekdays';
    }
    return rec.freq || 'none';
  }

  function openComposer(opts) {
    const o = opts || {};
    const ref = new Date();
    let draft;
    if (o.taskId) {
      const task = Store.getTask(state.data, o.taskId);
      if (!task) {
        showToast('任务不在了');
        return;
      }
      const rec = task.recurrence;
      const dueDate = task.dueAt ? U.dateKey(task.dueAt) : '';
      const dueTime = task.dueAt && task.hasTime ? U.formatTime(task.dueAt) : '';
      draft = {
        mode: 'edit',
        taskId: task.id,
        raw: task.sourceText || task.title,
        title: task.title,
        notes: task.notes || '',
        type: task.type,
        priority: task.priority,
        dueDate: dueDate,
        dueTime: dueTime,
        tagsText: (task.tags || []).join(' '),
        recurrence: {
          freq: uiFreqFromRecurrence(rec),
          interval: rec ? rec.interval || 1 : 1,
          weekdays: rec && rec.weekdays && rec.weekdays.length
            ? rec.weekdays.slice()
            : task.dueAt
              ? [new Date(task.dueAt).getDay()]
              : [],
          monthDay: rec ? rec.monthDay : null,
        },
        parsed: task.parseMeta || null,
        manualTouched: false,
        dirty: false,
      };
    } else {
      const type = o.type || (o.date ? 'deadline' : 'normal');
      draft = {
        mode: 'create',
        taskId: null,
        raw: '',
        title: '',
        notes: '',
        type: type,
        priority: 'medium',
        dueDate: o.date || '',
        dueTime: '',
        tagsText: '',
        recurrence: {
          freq: 'none',
          interval: 1,
          weekdays: o.date ? [U.fromKey(o.date).getDay()] : [],
          monthDay: null,
        },
        parsed: null,
        manualTouched: false,
        dirty: false,
      };
    }
    state.composer = draft;
    renderComposerShell();
    document.body.classList.add('sheet-open');
    setTimeout(function () {
      if (o.reparse && draft.raw) {
        const rawEl = $('#rawInput');
        if (rawEl) rawEl.value = draft.raw;
        parseRawNow(false);
        return;
      }
      const rawEl = $('#rawInput');
      const titleEl = $('#titleInput');
      if (draft.mode === 'create' && rawEl) {
        rawEl.focus({ preventScroll: true });
      } else if (titleEl) {
        titleEl.focus({ preventScroll: true });
        try {
          titleEl.setSelectionRange(titleEl.value.length, titleEl.value.length);
        } catch (e) {
          /* ignore */
        }
      }
    }, 80);
  }

  function renderComposerShell() {
    const root = $('#overlayRoot');
    if (!root) return;
    root.innerHTML = composerHTML();
    syncComposerDom();
  }

  function composerHTML() {
    const c = state.composer;
    if (!c) return '';
    const type = draftType();
    const typeMeta = UI.typeMeta(type);
    return (
      '<div class="sheet-backdrop" aria-hidden="true"></div>' +
      '<section class="sheet composer-sheet" role="dialog" aria-modal="true" aria-labelledby="composerTitle">' +
      '<div class="sheet-grip" aria-hidden="true"></div>' +
      '<header class="sheet-head">' +
      '<div><p class="eyebrow">' +
      (c.mode === 'edit' ? 'EDIT TASK' : 'SMART CAPTURE') +
      '</p><h2 id="composerTitle">' +
      (c.mode === 'edit' ? '编辑任务' : '记一件事') +
      '</h2></div>' +
      '<div class="sheet-head-actions">' +
      (c.mode === 'edit'
        ? '<button class="icon-btn" data-action="delete-task" data-id="' +
          U.escapeHTML(c.taskId) +
          '" aria-label="删除任务">' +
          UI.icon('trash', '', 19) +
          '</button>'
        : '') +
      '<button class="icon-btn" data-action="close-sheet" aria-label="关闭">' +
      UI.icon('close', '', 20) +
      '</button>' +
      '</div>' +
      '</header>' +
      '<form class="composer-form" id="taskForm" novalidate>' +
      '<div class="sheet-scroll">' +
      '<section class="smart-capture">' +
      '<div class="smart-capture-head">' +
      '<span class="smart-spark">' +
      UI.icon('sparkle', '', 16) +
      '</span>' +
      '<label for="rawInput">用大白话说一句</label>' +
      '<span class="smart-confidence" id="smartConfidence">' +
      smartConfidenceText() +
      '</span>' +
      '</div>' +
      '<textarea id="rawInput" class="smart-textarea" rows="3" maxlength="500" placeholder="例如：明天下午三点交高数作业，重要 #作业">' +
      U.escapeHTML(c.raw) +
      '</textarea>' +
      '<div class="smart-capture-foot">' +
      '<span>标题、时间、优先级、重复、标签会自动拆出来</span>' +
      '<button type="button" class="btn-ghost-sm" data-action="parse-now">' +
      UI.icon('sparkle', '', 13) +
      '重新识别</button>' +
      '</div>' +
      '</section>' +
      '<div id="parsePreview">' +
      parsePreviewHTML() +
      '</div>' +
      '<section class="form-card">' +
      '<div class="field">' +
      '<label class="field-label" for="titleInput">标题</label>' +
      '<input class="input title-input" id="titleInput" maxlength="120" value="' +
      U.escapeHTML(c.title) +
      '" placeholder="这件事叫什么" />' +
      '</div>' +
      '<div class="field">' +
      '<span class="field-label">任务类型</span>' +
      '<div class="type-choice-grid" role="group" aria-label="任务类型">' +
      Object.keys(UI.TYPES)
        .map(function (key) {
          const m = UI.TYPES[key];
          return (
            '<button type="button" class="type-choice t-' +
            key +
            (type === key ? ' active' : '') +
            '" data-action="type-select" data-type="' +
            key +
            '" aria-pressed="' +
            (type === key) +
            '">' +
            '<span class="type-choice-icon">' +
            UI.icon(m.icon, '', 18) +
            '</span><span class="type-choice-label">' +
            m.label +
            '</span></button>'
          );
        })
        .join('') +
      '</div>' +
      '<p class="field-hint" id="typeHint">' +
      U.escapeHTML(typeMeta.desc) +
      '</p>' +
      '</div>' +
      '<div class="field">' +
      '<div class="field-label-row"><span class="field-label">截止时间</span><span class="field-hint inline" id="dueHint">' +
      (type === 'longterm' ? '长期任务可以不设目标日' : '留空时间表示当天截止') +
      '</span></div>' +
      '<div class="date-input-row">' +
      '<input class="input date-input" type="date" id="dueDate" value="' +
      U.escapeHTML(c.dueDate) +
      '" aria-label="日期" />' +
      '<input class="input time-input" type="time" id="dueTime" value="' +
      U.escapeHTML(c.dueTime) +
      '" aria-label="时间" />' +
      (c.dueDate
        ? '<button type="button" class="clear-date" data-action="clear-date" aria-label="清除日期">' +
          UI.icon('close', '', 14) +
          '</button>'
        : '') +
      '</div>' +
      '<div class="quick-date-row">' +
      '<button type="button" class="quick-date" data-action="quick-date" data-preset="today">今天</button>' +
      '<button type="button" class="quick-date" data-action="quick-date" data-preset="tomorrow">明天</button>' +
      '<button type="button" class="quick-date" data-action="quick-date" data-preset="nextmon">下周一</button>' +
      '<button type="button" class="quick-date" data-action="quick-date" data-preset="tonight">今晚</button>' +
      '</div>' +
      '</div>' +
      '<div class="field">' +
      '<span class="field-label">优先级</span>' +
      '<div class="priority-choice-row">' +
      [
        { value: 'high', label: '高', sub: '先做' },
        { value: 'medium', label: '中', sub: '正常' },
        { value: 'low', label: '低', sub: '有空' },
      ]
        .map(function (p) {
          return (
            '<button type="button" class="priority-choice p-' +
            p.value +
            (c.priority === p.value ? ' active' : '') +
            '" data-action="priority-select" data-priority="' +
            p.value +
            '" aria-pressed="' +
            (c.priority === p.value) +
            '"><span>' +
            p.label +
            '</span><small>' +
            p.sub +
            '</small></button>'
          );
        })
        .join('') +
      '</div>' +
      '</div>' +
      '<div class="field">' +
      '<span class="field-label">重复</span>' +
      '<div class="repeat-row">' +
      '<select class="select" id="repeatFreq" aria-label="重复规则">' +
      [
        ['none', '不重复'],
        ['daily', '每天'],
        ['weekdays', '每个工作日'],
        ['weekly', '每周'],
        ['monthly', '每月'],
        ['yearly', '每年'],
      ]
        .map(function (x) {
          return (
            '<option value="' +
            x[0] +
            '"' +
            (c.recurrence.freq === x[0] ? ' selected' : '') +
            '>' +
            x[1] +
            '</option>'
          );
        })
        .join('') +
      '</select>' +
      '<span class="interval-wrap" id="intervalWrap">每 <input class="input interval-input" id="repeatInterval" type="number" min="1" max="52" value="' +
      c.recurrence.interval +
      '" aria-label="重复间隔" /><span id="intervalUnit">周</span></span>' +
      '</div>' +
      '<div class="weekday-panel" id="weekdayPanel">' +
      [1, 2, 3, 4, 5, 6, 0]
        .map(function (day) {
          return (
            '<button type="button" class="weekday-chip' +
            (c.recurrence.weekdays.indexOf(day) > -1 ? ' active' : '') +
            '" data-action="weekday-toggle" data-day="' +
            day +
            '" aria-pressed="' +
            (c.recurrence.weekdays.indexOf(day) > -1) +
            '">' +
            U.WEEKDAY_CN[day] +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '<p class="field-hint" id="repeatHint"></p>' +
      '</div>' +
      '<div class="field">' +
      '<label class="field-label" for="tagsInput">标签</label>' +
      '<input class="input" id="tagsInput" value="' +
      U.escapeHTML(c.tagsText) +
      '" placeholder="用空格分隔，如 课程 作业" />' +
      '</div>' +
      '<div class="field">' +
      '<label class="field-label" for="notesInput">备注</label>' +
      '<textarea class="input notes-input" id="notesInput" rows="3" maxlength="2000" placeholder="补充一点细节，之后会感谢现在的自己">' +
      U.escapeHTML(c.notes) +
      '</textarea>' +
      '</div>' +
      '</section>' +
      '<div class="sheet-scroll-spacer"></div>' +
      '</div>' +
      '<footer class="sheet-footer">' +
      '<button type="button" class="btn btn-soft" data-action="close-sheet">取消</button>' +
      '<button type="submit" class="btn btn-primary btn-save" id="saveTaskBtn">' +
      (c.mode === 'edit' ? '保存修改' : '创建任务') +
      '</button>' +
      '</footer>' +
      '</form>' +
      '</section>'
    );
  }

  function smartConfidenceText() {
    const c = state.composer;
    if (!c) return '';
    if (!c.raw.trim()) return '等待输入';
    if (c.parsed && !c.manualTouched) return '识别度 ' + Math.round((c.parsed.confidence || 0.6) * 100) + '%';
    if (c.manualTouched) return '已手动调整';
    return '可以识别';
  }

  function draftType() {
    const c = state.composer;
    if (!c) return 'normal';
    if (c.recurrence.freq !== 'none') return 'recurring';
    return c.type;
  }

  function draftRecurrenceObject() {
    const c = state.composer;
    if (!c || c.recurrence.freq === 'none') return null;
    const d = c.dueDate ? U.fromKey(c.dueDate) : state.now;
    const freq = c.recurrence.freq === 'weekdays' ? 'weekly' : c.recurrence.freq;
    let weekdays = [];
    if (c.recurrence.freq === 'weekdays') weekdays = [1, 2, 3, 4, 5];
    else if (c.recurrence.freq === 'weekly') {
      weekdays = c.recurrence.weekdays.length ? c.recurrence.weekdays.slice() : [d.getDay()];
    }
    return {
      freq: freq,
      interval: U.clamp(Number(c.recurrence.interval) || 1, 1, 52),
      weekdays: weekdays,
      monthDay: c.recurrence.freq === 'monthly' || c.recurrence.freq === 'yearly' ? d.getDate() : null,
      month: c.recurrence.freq === 'yearly' ? d.getMonth() + 1 : null,
      time: c.dueTime || '20:00',
      anchor: null,
    };
  }

  function draftDueLabel() {
    const c = state.composer;
    if (!c.dueDate) return '';
    const d = U.fromKey(c.dueDate);
    return U.formatDate(d, { now: state.now }) + (c.dueTime ? ' ' + c.dueTime : ' 当天截止');
  }

  function parsePreviewHTML() {
    const c = state.composer;
    if (!c) return '';
    const type = draftType();
    const meta = UI.typeMeta(type);
    const rec = draftRecurrenceObject();
    const tags = parseTagInput(c.tagsText);
    const chips = [];
    chips.push(
      '<span class="parse-chip type t-' +
        meta.key +
        '">' +
        UI.icon(meta.icon, '', 13) +
        meta.full +
        '</span>'
    );
    if (c.dueDate) chips.push('<span class="parse-chip">' + UI.icon('calendar', '', 13) + U.escapeHTML(draftDueLabel()) + '</span>');
    else if (type !== 'normal') chips.push('<span class="parse-chip muted">' + UI.icon('calendar', '', 13) + '未设时间</span>');
    if (c.priority !== 'medium') {
      chips.push(
        '<span class="parse-chip priority">' +
          UI.icon('flag', '', 13) +
          (c.priority === 'high' ? '高优先级' : '低优先级') +
          '</span>'
      );
    }
    if (rec) chips.push('<span class="parse-chip">' + UI.icon('repeat', '', 13) + U.escapeHTML(U.describeRecurrence(rec)) + '</span>');
    tags.slice(0, 3).forEach(function (t) {
      chips.push('<span class="parse-chip tag">#' + U.escapeHTML(t) + '</span>');
    });
    const warnings = c.parsed && !c.manualTouched ? (c.parsed.warnings || []) : [];
    return (
      '<section class="parse-card">' +
      '<div class="parse-head">' +
      '<span class="parse-title">' +
      UI.icon('sparkle', '', 14) +
      '识别结果</span>' +
      '<span class="parse-state">' +
      (c.manualTouched ? '已手动调整' : c.parsed ? '可继续修改' : '边写边识别') +
      '</span>' +
      '</div>' +
      '<div class="parse-chips">' +
      chips.join('') +
      '</div>' +
      (warnings.length
        ? '<div class="parse-warnings">' +
          warnings
            .slice(0, 3)
            .map(function (w) {
              return '<p>' + UI.icon('info', '', 13) + U.escapeHTML(w) + '</p>';
            })
            .join('') +
          '</div>'
        : '') +
      '</section>'
    );
  }

  function parseTagInput(text) {
    return String(text || '')
      .split(/[\s,，#]+/)
      .map(function (x) {
        return x.trim().replace(/^#/, '');
      })
      .filter(Boolean)
      .filter(function (x, i, arr) {
        return arr.indexOf(x) === i;
      })
      .slice(0, 8);
  }

  function applyParsed(parsed) {
    const c = state.composer;
    if (!c) return;
    c.title = parsed.title === '未命名任务' ? '' : parsed.title;
    c.type = parsed.type;
    c.priority = parsed.priority;
    if (parsed.dueAt) {
      c.dueDate = U.dateKey(parsed.dueAt);
      c.dueTime = parsed.hasTime ? U.formatTime(parsed.dueAt) : '';
    } else {
      c.dueDate = '';
      c.dueTime = '';
    }
    if (parsed.recurrence) {
      c.recurrence.freq = uiFreqFromRecurrence(parsed.recurrence);
      c.recurrence.interval = parsed.recurrence.interval || 1;
      c.recurrence.weekdays =
        parsed.recurrence.weekdays && parsed.recurrence.weekdays.length
          ? parsed.recurrence.weekdays.slice()
          : c.dueDate
            ? [U.fromKey(c.dueDate).getDay()]
            : [];
      c.recurrence.monthDay = parsed.recurrence.monthDay || null;
    } else {
      c.recurrence.freq = 'none';
      c.recurrence.weekdays = [];
      c.recurrence.monthDay = null;
    }
    c.tagsText = (parsed.tags || []).join(' ');
    c.parsed = parsed;
    c.manualTouched = false;
  }

  function parseRawNow(notifyUser) {
    const c = state.composer;
    if (!c) return;
    const el = $('#rawInput');
    const text = (el ? el.value : c.raw).trim();
    if (!text) {
      if (notifyUser) showToast('先写一句要做什么');
      return;
    }
    c.raw = text;
    const parsed = Parser.parse(text, new Date());
    applyParsed(parsed);
    syncComposerDom();
    if (notifyUser) {
      if (parsed.warnings && parsed.warnings.length) {
        showToast('识别完成，有一两处需要你确认', { tone: 'warn' });
      } else {
        showToast('识别完成，可以直接保存或继续修改');
      }
    }
  }

  const scheduleParse = U.debounce(function (rawValue) {
    const c = state.composer;
    if (!c) return;
    if (!$('#rawInput') || $('#rawInput').value.trim() !== rawValue) return;
    if (rawValue.length < 1) return;
    const parsed = Parser.parse(rawValue, new Date());
    applyParsed(parsed);
    syncComposerDom();
  }, 650);

  function syncComposerDom() {
    const c = state.composer;
    if (!c) return;
    const setValue = function (sel, value) {
      const el = $(sel);
      if (el && document.activeElement !== el && el.value !== value) el.value = value;
    };
    setValue('#titleInput', c.title);
    setValue('#dueDate', c.dueDate);
    setValue('#dueTime', c.dueTime);
    setValue('#tagsInput', c.tagsText);
    setValue('#repeatFreq', c.recurrence.freq);
    setValue('#repeatInterval', String(c.recurrence.interval || 1));
    const type = draftType();
    $$('.type-choice').forEach(function (btn) {
      const active = btn.dataset.type === type;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active);
    });
    $$('.priority-choice').forEach(function (btn) {
      const active = btn.dataset.priority === c.priority;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active);
    });
    $$('.weekday-chip').forEach(function (btn) {
      const active = c.recurrence.weekdays.indexOf(Number(btn.dataset.day)) > -1;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active);
    });
    const weekdayPanel = $('#weekdayPanel');
    if (weekdayPanel) weekdayPanel.classList.toggle('hidden', c.recurrence.freq !== 'weekly');
    const intervalWrap = $('#intervalWrap');
    if (intervalWrap) {
      intervalWrap.classList.toggle('hidden', c.recurrence.freq === 'none' || c.recurrence.freq === 'weekdays');
      const unit = $('#intervalUnit');
      if (unit) {
        const units = { daily: '天', weekly: '周', monthly: '月', yearly: '年' };
        unit.textContent = units[c.recurrence.freq] || '周';
      }
      const input = $('#repeatInterval');
      if (input) {
        input.max = c.recurrence.freq === 'daily' ? '365' : c.recurrence.freq === 'yearly' ? '10' : '52';
      }
    }
    const repeatHint = $('#repeatHint');
    if (repeatHint) repeatHint.innerHTML = repeatHintText(c);
    const typeHint = $('#typeHint');
    if (typeHint) typeHint.textContent = UI.TYPES[type] ? UI.TYPES[type].desc : '';
    const dueHint = $('#dueHint');
    if (dueHint) dueHint.textContent = type === 'longterm' ? '长期任务可以不设目标日' : '留空时间表示当天截止';
    const preview = $('#parsePreview');
    if (preview) preview.innerHTML = parsePreviewHTML();
    const conf = $('#smartConfidence');
    if (conf) conf.textContent = smartConfidenceText();
    $$('.quick-date').forEach(function (btn) {
      btn.classList.toggle('active', isQuickDateActive(btn.dataset.preset));
    });
    const saveBtn = $('#saveTaskBtn');
    if (saveBtn) saveBtn.textContent = c.mode === 'edit' ? '保存修改' : '创建任务';
  }

  function repeatHintText(c) {
    const freq = c.recurrence.freq;
    if (freq === 'none') return '不重复。选择周期后，完成本次会自动生成下一次。';
    if (!c.dueDate) return '先选一个日期，作为重复的起点。';
    if (freq === 'daily') return '每天按这个时间提醒，完成后顺延到下一天。';
    if (freq === 'weekdays') return '周一到周五重复，适合上课和打卡。';
    if (freq === 'weekly') return c.recurrence.weekdays.length ? '每周选中的星期重复。' : '还没选星期，默认按截止日期的星期重复。';
    if (freq === 'monthly') return '按截止日期的号数，每月重复。';
    if (freq === 'yearly') return '按截止日期的月日，每年重复。';
    return '';
  }

  function presetDate(preset) {
    const ref = state.now;
    if (preset === 'today') return U.dateKey(ref);
    if (preset === 'tomorrow') return U.dateKey(U.addDays(ref, 1));
    if (preset === 'nextmon') {
      const monday = U.startOfWeek(ref, 1);
      const next = U.addDays(monday, 7);
      return U.dateKey(next);
    }
    if (preset === 'tonight') return U.dateKey(ref);
    return U.dateKey(ref);
  }

  function applyPresetTime(preset) {
    if (preset === 'tonight') return '20:00';
    if (preset === 'nextmon') return '09:00';
    return '';
  }

  function hasDraftChanges() {
    const c = state.composer;
    if (!c) return false;
    return !!c.dirty;
  }

  function requestCloseComposer() {
    if (!state.composer) return;
    if (hasDraftChanges()) {
      showConfirm({
        title: '放弃这次编辑？',
        message: '还没有保存，关闭后刚才的修改会丢失。',
        confirmLabel: '放弃修改',
        cancelLabel: '继续编辑',
        danger: true,
        action: 'discard-composer',
        icon: 'edit',
      });
      return;
    }
    closeComposer(false);
  }

  function closeComposer(force) {
    state.composer = null;
    const root = $('#overlayRoot');
    if (root) root.innerHTML = '';
    document.body.classList.remove('sheet-open');
    if (force) render(false);
  }

  function buildRecurrenceForSave(dueDate, dueTime) {
    const c = state.composer;
    const d = U.fromKey(dueDate);
    const freq = c.recurrence.freq;
    if (freq === 'none') return null;
    const interval = U.clamp(Number(c.recurrence.interval) || 1, 1, 365);
    let weekdays = [];
    if (freq === 'weekdays') weekdays = [1, 2, 3, 4, 5];
    else if (freq === 'weekly') {
      weekdays = c.recurrence.weekdays.length ? c.recurrence.weekdays.slice() : [d.getDay()];
    }
    return {
      freq: freq === 'weekdays' ? 'weekly' : freq,
      interval: interval,
      weekdays: weekdays,
      monthDay: freq === 'monthly' || freq === 'yearly' ? d.getDate() : null,
      month: freq === 'yearly' ? d.getMonth() + 1 : null,
      time: dueTime || '20:00',
      anchor: null,
    };
  }

  function sameRecurrence(a, b) {
    if (!a || !b) return !a && !b;
    return (
      a.freq === b.freq &&
      (a.interval || 1) === (b.interval || 1) &&
      (a.time || '') === (b.time || '') &&
      (a.monthDay || null) === (b.monthDay || null) &&
      (a.month || null) === (b.month || null) &&
      (a.weekdays || []).slice().sort().join(',') === (b.weekdays || []).slice().sort().join(',')
    );
  }

  function saveTask(e) {
    if (e) e.preventDefault();
    const c = state.composer;
    if (!c) return;
    const rawEl = $('#rawInput');
    const titleEl = $('#titleInput');
    const notesEl = $('#notesInput');
    const tagsEl = $('#tagsInput');
    const dueDateEl = $('#dueDate');
    const dueTimeEl = $('#dueTime');
    const repeatEl = $('#repeatFreq');
    const intervalEl = $('#repeatInterval');
    const raw = rawEl ? rawEl.value.trim() : c.raw;
    let title = titleEl ? titleEl.value.trim() : c.title.trim();
    let notes = notesEl ? notesEl.value.trim() : c.notes;
    let tags = parseTagInput(tagsEl ? tagsEl.value : c.tagsText);
    let dueDate = dueDateEl ? dueDateEl.value : c.dueDate;
    let dueTime = dueTimeEl ? dueTimeEl.value : c.dueTime;
    const repeatFreq = repeatEl ? repeatEl.value : c.recurrence.freq;
    const interval = intervalEl ? Number(intervalEl.value) || 1 : c.recurrence.interval || 1;
    c.raw = raw;
    c.notes = notes;
    c.tagsText = tagsEl ? tagsEl.value : c.tagsText;
    c.dueDate = dueDate;
    c.dueTime = dueTime;
    c.recurrence.freq = repeatFreq;
    c.recurrence.interval = interval;

    if (!title && raw) {
      const p = Parser.parse(raw, new Date());
      if (p.title && p.title !== '未命名任务') title = p.title;
    }
    if (!title) {
      showToast('给这件事起个标题吧', { tone: 'warn' });
      if (titleEl) titleEl.focus();
      return;
    }
    let type = c.type;
    if (repeatFreq !== 'none') type = 'recurring';
    if (type === 'deadline' && !dueDate) {
      showToast('限时任务需要一个截止时间', { tone: 'warn' });
      if (dueDateEl) dueDateEl.focus();
      return;
    }
    if (type === 'recurring' && !dueDate) {
      dueDate = U.dateKey(state.now);
      dueTime = dueTime || '20:00';
    }
    if (type === 'recurring' && !dueTime) dueTime = '20:00';

    const existing = c.taskId ? Store.getTask(state.data, c.taskId) : null;
    const existingDueKey = existing && existing.dueAt ? U.dateKey(existing.dueAt) : '';
    const existingTime = existing && existing.dueAt && existing.hasTime ? U.formatTime(existing.dueAt) : '';
    const dueUnchanged = !!(existing && dueDate && existingDueKey === dueDate && existingTime === dueTime);

    let recurrence = null;
    let dueAt = null;
    let hasTime = false;
    if (type === 'recurring') {
      recurrence = buildRecurrenceForSave(dueDate, dueTime);
      const base = U.combine(dueDate, dueTime || '20:00');
      const reuse =
        existing &&
        dueUnchanged &&
        existing.recurrence &&
        sameRecurrence(existing.recurrence, recurrence);
      if (reuse) {
        dueAt = new Date(existing.dueAt);
        recurrence.anchor = existing.recurrence.anchor || existing.dueAt;
      } else {
        const first = U.nextOccurrence(recurrence, new Date(state.now.getTime() - 1000), base);
        if (!first) {
          showToast('重复规则没有算出下一次，检查一下星期或日期', { tone: 'danger' });
          return;
        }
        dueAt = first;
        recurrence.anchor = first.toISOString();
      }
      dueTime = U.formatTime(dueAt);
      hasTime = true;
    } else if (dueDate) {
      dueAt = U.combine(dueDate, dueTime || '23:59');
      hasTime = !!dueTime;
    }

    const dueChanged =
      !existing ||
      (dueAt ? !existing.dueAt || new Date(dueAt).getTime() !== new Date(existing.dueAt).getTime() : !!existing.dueAt) ||
      (recurrence && existing.recurrence ? !sameRecurrence(recurrence, existing.recurrence) : !!recurrence !== !!existing.recurrence);

    const task = Object.assign({}, existing || {}, {
      id: existing ? existing.id : U.uid('task'),
      title: title,
      notes: notes,
      type: recurrence ? 'recurring' : type,
      priority: c.priority,
      dueAt: dueAt ? dueAt.toISOString() : null,
      hasTime: hasTime,
      startAt: null,
      recurrence: recurrence,
      tags: tags,
      sourceText: raw || (existing && existing.sourceText) || title,
      remindersSent: dueChanged ? {} : (existing && existing.remindersSent) || {},
      updatedAt: new Date().toISOString(),
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      status: existing ? existing.status : 'active',
      completedAt: existing ? existing.completedAt : null,
      milestones: existing ? existing.milestones : [],
      progress: existing ? existing.progress : 0,
      seriesId: existing ? existing.seriesId : null,
      occurrenceIndex: existing ? existing.occurrenceIndex : 0,
      nextTaskId: existing ? existing.nextTaskId : null,
      demo: existing ? existing.demo : false,
      parseMeta: c.parsed
        ? {
            confidence: c.parsed.confidence,
            matches: c.parsed.matches,
            warnings: c.parsed.warnings,
            parsedAt: c.parsed.parsedAt,
          }
        : existing
          ? existing.parseMeta
          : null,
    });
    if (recurrence) task.type = 'recurring';
    const saved = Store.addOrUpdate(state.data, task);
    if (!saved) {
      showToast('保存失败，请再试一次', { tone: 'danger' });
      return;
    }
    const write = Store.save(state.data);
    if (!write.ok) {
      showToast(write.error || '本地存储写入失败', { tone: 'danger' });
      return;
    }
    closeComposer(false);
    render(false);
    if (c.mode === 'edit') {
      showToast('修改已保存');
    } else if (saved.type === 'recurring' && saved.dueAt) {
      showToast('已创建 · 下次 ' + U.formatDateWithWeek(saved.dueAt, state.now) + ' ' + U.formatTime(saved.dueAt));
    } else {
      showToast('已记下');
    }
  }

  /* ------------------------------------------------------------------ */
  /* 操作：完成、进度、阶段                                                */
  /* ------------------------------------------------------------------ */

  function persistData() {
    const res = Store.save(state.data);
    if (!res.ok) showToast(res.error || '保存失败', { tone: 'danger', duration: 5000 });
    return res.ok;
  }

  function toggleTask(id) {
    const task = Store.getTask(state.data, id);
    if (!task) return;
    let result;
    if (task.status === 'active') {
      result = Store.completeTask(state.data, id, new Date());
      if (result.changed) U.vibrate(18);
    } else {
      result = Store.reopenTask(state.data, id, new Date());
    }
    if (!result.changed) return;
    persistData();
    render(false);
    if (result.next && result.next.dueAt) {
      showToast('完成。下一次已生成：' + U.formatDateWithWeek(result.next.dueAt, state.now) + ' ' + U.formatTime(result.next.dueAt), {
        tone: 'success',
        action: 'open-task',
        taskId: result.next.id,
        actionLabel: '查看',
        duration: 5200,
      });
    } else if (task.status === 'done') {
      showToast('已完成，今天又轻了一点', { tone: 'success' });
    } else {
      showToast('已恢复任务');
    }
  }

  function updateProgress(id, delta) {
    const task = Store.getTask(state.data, id);
    if (!task || task.type !== 'longterm') return;
    const next = U.clamp((Number(task.progress) || 0) + delta, 0, 100);
    task.progress = next;
    task.updatedAt = new Date().toISOString();
    persistData();
    render(false);
  }

  function toggleMilestone(taskId, msId) {
    const task = Store.getTask(state.data, taskId);
    if (!task) return;
    const ms = (task.milestones || []).filter(function (m) {
      return m.id === msId;
    })[0];
    if (!ms) return;
    ms.done = !ms.done;
    ms.doneAt = ms.done ? new Date().toISOString() : null;
    task.progress = Store.computedProgress(task);
    task.updatedAt = new Date().toISOString();
    persistData();
    render(false);
    const total = task.milestones.length;
    const done = task.milestones.filter(function (m) {
      return m.done;
    }).length;
    if (total && done === total && task.status === 'active') {
      showToast('所有阶段都完成了，要结束这个长期任务吗？', {
        tone: 'success',
        action: 'complete-task',
        taskId: task.id,
        actionLabel: '完成',
        duration: 6000,
      });
    }
  }

  function saveMilestone(form) {
    const taskId = form.dataset.task;
    const task = Store.getTask(state.data, taskId);
    if (!task) return;
    const titleEl = $('#msTitle');
    const dateEl = $('#msDate');
    const timeEl = $('#msTime');
    const title = titleEl ? titleEl.value.trim() : '';
    if (!title) {
      showToast('给这个阶段起个名字');
      if (titleEl) titleEl.focus();
      return;
    }
    const date = dateEl ? dateEl.value : '';
    const time = timeEl ? timeEl.value : '';
    task.milestones = task.milestones || [];
    task.milestones.push({
      id: U.uid('ms'),
      title: title,
      dueAt: date ? U.combine(date, time || '20:00').toISOString() : null,
      done: false,
      doneAt: null,
    });
    task.progress = Store.computedProgress(task);
    task.updatedAt = new Date().toISOString();
    state.addingMilestone = false;
    persistData();
    render(false);
    showToast('阶段已添加');
  }

  function deleteMilestone(taskId, msId) {
    const task = Store.getTask(state.data, taskId);
    if (!task) return;
    const idx = (task.milestones || []).findIndex(function (m) {
      return m.id === msId;
    });
    if (idx < 0) return;
    task.milestones.splice(idx, 1);
    task.progress = Store.computedProgress(task);
    task.updatedAt = new Date().toISOString();
    persistData();
    render(false);
    showToast('阶段已删除');
  }

  /* ------------------------------------------------------------------ */
  /* 提醒、时钟与系统通知                                                  */
  /* ------------------------------------------------------------------ */

  async function checkReminders() {
    if (state.remindersBusy) return;
    if (!state.data.settings.notificationsAsked && Notify.permission() !== 'granted') return;
    state.remindersBusy = true;
    try {
      const nowDate = new Date();
      const events = Notify.collect(state.data.tasks, state.data.settings, nowDate).slice(0, 1);
      let changed = false;
      for (let i = 0; i < events.length; i++) {
        const evt = events[i];
        const delivered = await Notify.deliver(evt, {
          onEvent: function (event, info) {
            if (document.visibilityState !== 'visible') return;
            showToast(event.title, {
              tone: event.severity === 'overdue' ? 'danger' : 'reminder',
              body: event.body,
              action: event.taskId ? 'open-task' : null,
              taskId: event.taskId,
              actionLabel: event.taskId ? '查看' : '',
              duration: 9000,
            });
            if (event.severity === 'overdue') U.vibrate([120, 60, 120, 60, 220]);
          },
        });
        const visible = document.visibilityState === 'visible';
        if (!delivered && !visible) continue;
        if (evt.taskId) {
          const task = Store.getTask(state.data, evt.taskId);
          if (task) {
            Notify.markSent(task, evt, nowDate);
            task.updatedAt = nowDate.toISOString();
          }
        }
        changed = true;
      }
      const digest = Notify.digestEvent(state.data.tasks, state.data.settings, state.data.meta, nowDate);
      if (digest) {
        const digestDelivered = await Notify.deliver(digest, {
          onEvent: function (event) {
            if (document.visibilityState !== 'visible') return;
            showToast(event.title, { body: event.body, tone: 'reminder', duration: 7000 });
          },
        });
        if (digestDelivered || document.visibilityState === 'visible') {
          state.data.meta.digestDate = U.dateKey(nowDate);
          changed = true;
        }
      }
      if (changed) Store.save(state.data);
    } catch (e) {
      // 提醒失败不阻塞应用
      console.warn('reminder check failed', e);
    } finally {
      state.remindersBusy = false;
    }
  }

  function updateCountdowns() {
    const ref = state.now;
    $$('[data-countdown]').forEach(function (el) {
      const id = el.dataset.task;
      if (!id) return;
      const task = Store.getTask(state.data, id);
      if (!task) return;
      el.textContent = UI.shortCountdown(task, ref);
      const over = UI.isOverdue(task, ref);
      el.classList.toggle('danger', over);
      const card = el.closest('.task-card');
      if (card) card.classList.toggle('is-overdue', over);
    });
    $$('[data-focus-countdown]').forEach(function (el) {
      const due = el.dataset.due;
      if (!due) return;
      const diff = new Date(due).getTime() - ref.getTime();
      el.textContent = diff <= 0 ? U.formatOverdue(-diff) : U.formatRemaining(diff, 'short');
      const card = el.closest('.focus-card');
      if (card) card.classList.toggle('is-overdue', diff <= 0);
    });
    const detailValue = $('#detailCountdown');
    if (detailValue) {
      const panel = detailValue.closest('[data-detail-countdown]');
      const due = panel ? panel.dataset.due : '';
      const task = detailValue.closest('.detail-content')
        ? Store.getTask(state.data, (state.route && state.route.id) || '')
        : null;
      if (task && task.status === 'done') {
        detailValue.textContent = '已完成';
        if (panel) panel.classList.add('done');
      } else if (due) {
        const diff = new Date(due).getTime() - ref.getTime();
        detailValue.textContent = diff <= 0 ? U.formatOverdue(-diff) : U.formatRemaining(diff, 'full');
        if (panel) {
          panel.classList.toggle('overdue', diff <= 0);
          const label = panel.querySelector('.count-label');
          if (label) {
            label.textContent = diff <= 0 ? '已逾期' : task.recurrence ? '距离本次截止' : '距离截止';
          }
        }
      }
    }
  }

  function tickClock() {
    state.now = new Date();
    updateCountdowns();
    const todayKey = U.dateKey(state.now);
    if (todayKey !== state.lastDayKey) {
      state.lastDayKey = todayKey;
      if (['today', 'calendar', 'inbox'].indexOf(state.route.name) > -1) render(false);
    }
    if (state.composer || state.confirm) return;
    const sig = state.data.tasks
      .filter(function (t) {
        return t.status === 'active' && t.dueAt;
      })
      .map(function (t) {
        return t.id + (new Date(t.dueAt).getTime() <= state.now.getTime() ? '1' : '0');
      })
      .join('|');
    if (sig !== state.statusSignature) {
      state.statusSignature = sig;
      if (['today', 'inbox', 'calendar'].indexOf(state.route.name) > -1) {
        if (state.addingMilestone && document.activeElement && document.activeElement.id === 'msTitle') return;
        render(false);
      }
    }
  }

  function checkDayBoundary() {
    const key = U.dateKey(new Date());
    if (key !== state.lastDayKey) {
      state.lastDayKey = key;
      state.now = new Date();
      if (['today', 'calendar', 'inbox'].indexOf(state.route.name) > -1) render(false);
    }
  }

  async function enableNotifications() {
    state.data.settings.notificationsAsked = true;
    const p = await Notify.requestPermission();
    if (p === 'granted') {
      await Notify.registerSW();
      showToast('通知已开启，截止前会来提醒你', { tone: 'success' });
    } else if (p === 'denied') {
      showToast('通知被浏览器拒绝了，可以在浏览器设置里重新允许', { tone: 'danger', duration: 6000 });
    } else if (p === 'unsupported') {
      showToast('这个浏览器不支持系统通知，仍会显示应用内提醒', { tone: 'warn' });
    } else {
      showToast('通知还没有开启，可以稍后在设置里再试');
    }
    persistData();
    render(false);
  }

  function dismissNotifications() {
    state.data.settings.notificationsAsked = true;
    persistData();
    render(false);
  }

  async function testNotification() {
    const res = await Notify.test();
    if (res.ok) showToast('测试通知已发送');
    else if (res.permission === 'denied') showToast('通知被拦截，请到浏览器设置里允许', { tone: 'danger' });
    else showToast('还没拿到通知权限', { tone: 'warn' });
    if (state.route.name === 'settings') render(false);
  }

  /* ------------------------------------------------------------------ */
  /* 提示与确认                                                          */
  /* ------------------------------------------------------------------ */

  function showToast(message, opts) {
    const o = typeof opts === 'object' && opts ? opts : {};
    const toast = {
      id: U.uid('toast'),
      title: String(message || ''),
      body: o.body || '',
      tone: o.tone || 'default',
      action: o.action || '',
      actionLabel: o.actionLabel || '查看',
      taskId: o.taskId || '',
      duration: o.duration || 3600,
    };
    state.toasts.push(toast);
    if (state.toasts.length > 3) state.toasts.shift();
    renderToasts();
    setTimeout(function () {
      dismissToast(toast.id);
    }, toast.duration);
  }

  function dismissToast(id) {
    state.toasts = state.toasts.filter(function (t) {
      return t.id !== id;
    });
    renderToasts();
  }

  function renderToasts() {
    const root = $('#toastRoot');
    if (!root) return;
    root.innerHTML = state.toasts
      .map(function (t) {
        return (
          '<div class="toast tone-' +
          t.tone +
          '" role="status">' +
          '<div class="toast-copy"><strong>' +
          U.escapeHTML(t.title) +
          '</strong>' +
          (t.body ? '<p>' + U.escapeHTML(t.body) + '</p>' : '') +
          '</div>' +
          (t.action
            ? '<button class="toast-action" data-action="' +
              (t.action === 'open-task' ? 'toast-open' : t.action) +
              '" data-id="' +
              U.escapeHTML(t.taskId) +
              '" data-toast="' +
              t.id +
              '">' +
              U.escapeHTML(t.actionLabel) +
              '</button>'
            : '') +
          '<button class="toast-close" data-action="dismiss-toast" data-toast="' +
          t.id +
          '" aria-label="关闭提示">' +
          UI.icon('close', '', 13) +
          '</button>' +
          '</div>'
        );
      })
      .join('');
  }

  function showConfirm(opts) {
    state.confirm = Object.assign(
      {
        title: '确认操作',
        message: '',
        confirmLabel: '确认',
        cancelLabel: '取消',
        danger: false,
        action: '',
        icon: 'info',
      },
      opts || {}
    );
    const root = $('#confirmRoot');
    if (!root) return;
    root.innerHTML =
      '<div class="confirm-backdrop" data-action="confirm-cancel"></div>' +
      '<div class="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle">' +
      '<div class="confirm-icon ' +
      (state.confirm.danger ? 'danger' : '') +
      '">' +
      UI.icon(state.confirm.icon, '', 22) +
      '</div>' +
      '<h2 id="confirmTitle">' +
      U.escapeHTML(state.confirm.title) +
      '</h2>' +
      '<p>' +
      U.escapeHTML(state.confirm.message) +
      '</p>' +
      '<div class="confirm-actions">' +
      '<button class="btn btn-soft" data-action="confirm-cancel">' +
      U.escapeHTML(state.confirm.cancelLabel) +
      '</button>' +
      '<button class="btn ' +
      (state.confirm.danger ? 'btn-danger' : 'btn-primary') +
      '" data-action="confirm-run">' +
      U.escapeHTML(state.confirm.confirmLabel) +
      '</button>' +
      '</div></div>';
    setTimeout(function () {
      const btn = $('.confirm-card .btn-primary, .confirm-card .btn-danger');
      if (btn) btn.focus({ preventScroll: true });
    }, 60);
  }

  function closeConfirm() {
    state.confirm = null;
    const root = $('#confirmRoot');
    if (root) root.innerHTML = '';
  }

  function runConfirm() {
    const confirm = state.confirm;
    if (!confirm) return;
    closeConfirm();
    if (confirm.action === 'delete-task') {
      Store.removeTask(state.data, confirm.taskId);
      persistData();
      if (state.composer && state.composer.taskId === confirm.taskId) closeComposer(false);
      if (state.route.name === 'task' && state.route.id === confirm.taskId) {
        navigate(state.lastListRoute || '#/today');
      } else {
        render(false);
      }
      showToast('任务已删除');
      return;
    }
    if (confirm.action === 'discard-composer') {
      closeComposer(false);
      return;
    }
    if (confirm.action === 'clear-data') {
      state.data.tasks = [];
      state.data.meta.seeded = true;
      state.data.meta.demoBannerDismissed = true;
      persistData();
      render(false);
      showToast('所有任务已清空');
      return;
    }
    if (confirm.action === 'load-demo') {
      Store.resetDemo(state.data, new Date());
      persistData();
      render(false);
      showToast('示例任务已重新载入');
      return;
    }
    if (confirm.action === 'delete-milestone') {
      deleteMilestone(confirm.taskId, confirm.msId);
      return;
    }
    if (confirm.action === 'import-data') {
      if (!state.pendingImport) return;
      state.data.tasks = state.pendingImport.tasks;
      state.data.settings = Store.mergeSettings(state.pendingImport.settings);
      state.pendingImport = null;
      persistData();
      render(false);
      showToast('备份已导入');
    }
  }

  /* ------------------------------------------------------------------ */
  /* 事件                                                                */
  /* ------------------------------------------------------------------ */

  function bindGlobalEvents() {
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('hashchange', onRouteChange);
    window.addEventListener('banban:refresh', function () {
      if (!state.composer && !state.confirm) render(false);
    });
  }

  function onClick(e) {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    if (!action || action === 'noop') return;
    if (action !== 'toggle-task' || !actionEl.classList.contains('task-check')) {
      // 防止按钮默认提交表单；checkbox 完成按钮也需要阻止。
      if (actionEl.tagName === 'BUTTON' || actionEl.tagName === 'A') e.preventDefault();
    }
    const id = actionEl.dataset.id || '';
    switch (action) {
      case 'open-composer':
        openComposer({ date: actionEl.dataset.date || null, type: actionEl.dataset.type || null });
        break;
      case 'open-task':
        if (id) navigate('#/task/' + encodeURIComponent(id));
        break;
      case 'toggle-task':
        if (id) toggleTask(id);
        break;
      case 'open-search':
        state.searchReturn = state.route.name === 'inbox' ? '#/inbox' : '#/today';
        navigate('#/search');
        break;
      case 'back':
        goBack();
        break;
      case 'close-sheet':
        requestCloseComposer();
        break;
      case 'parse-now':
        parseRawNow(true);
        break;
      case 'type-select':
        selectComposerType(actionEl.dataset.type);
        break;
      case 'priority-select':
        selectComposerPriority(actionEl.dataset.priority);
        break;
      case 'quick-date':
        applyQuickDate(actionEl.dataset.preset);
        break;
      case 'clear-date':
        clearComposerDate();
        break;
      case 'weekday-toggle':
        toggleComposerWeekday(Number(actionEl.dataset.day));
        break;
      case 'add-milestone':
        state.addingMilestone = true;
        render(false);
        break;
      case 'cancel-milestone':
        state.addingMilestone = false;
        render(false);
        break;
      case 'delete-milestone':
        showConfirm({
          title: '删除这个阶段？',
          message: '阶段删除后不可恢复，任务本身不会被删除。',
          confirmLabel: '删除阶段',
          danger: true,
          action: 'delete-milestone',
          icon: 'target',
          taskId: actionEl.dataset.id,
          msId: actionEl.dataset.ms,
        });
        break;
      case 'progress-plus':
        updateProgress(id, 10);
        break;
      case 'progress-minus':
        updateProgress(id, -10);
        break;
      case 'toggle-milestone':
        if (id && actionEl.dataset.ms) toggleMilestone(id, actionEl.dataset.ms);
        break;
      case 'delete-task': {
        const task = Store.getTask(state.data, id);
        showConfirm({
          title: '删除这个任务？',
          message: task ? '“' + task.title + '”将被永久删除。' : '这个任务将被永久删除。',
          confirmLabel: '删除任务',
          danger: true,
          action: 'delete-task',
          icon: 'trash',
          taskId: id,
        });
        break;
      }
      case 'edit-task':
        openComposer({ taskId: id });
        break;
      case 'reparse-task':
        openComposer({ taskId: id, reparse: true });
        break;
      case 'enable-notifications':
        enableNotifications();
        break;
      case 'dismiss-notifications':
        dismissNotifications();
        break;
      case 'notify-test':
        testNotification();
        break;
      case 'toggle-reminder':
        toggleReminder(actionEl.dataset.key);
        break;
      case 'toggle-setting':
        toggleSetting(actionEl.dataset.key);
        break;
      case 'set-weekstart':
        state.data.settings.weekStart = Number(actionEl.dataset.value) === 0 ? 0 : 1;
        persistData();
        render(false);
        break;
      case 'export-data':
        exportData();
        break;
      case 'import-data':
        triggerImport();
        break;
      case 'clear-data':
        showConfirm({
          title: '清空所有任务？',
          message: '所有进行中和已完成的任务都会被删除，设置会保留。此操作不可撤销。',
          confirmLabel: '清空任务',
          danger: true,
          action: 'clear-data',
          icon: 'trash',
        });
        break;
      case 'load-demo':
        showConfirm({
          title: '重新载入示例？',
          message: '会先移除当前示例任务，再加入一组新的示例，你自己的任务不会受影响。',
          confirmLabel: '载入示例',
          action: 'load-demo',
          icon: 'sparkle',
        });
        break;
      case 'clear-demo': {
        const before = state.data.tasks.length;
        state.data.tasks = state.data.tasks.filter(function (t) {
          return !t.demo;
        });
        state.data.meta.demoBannerDismissed = true;
        persistData();
        render(false);
        showToast(before === state.data.tasks.length ? '没有示例任务了' : '示例任务已清空');
        break;
      }
      case 'dismiss-demo':
        state.data.meta.demoBannerDismissed = true;
        persistData();
        render(false);
        break;
      case 'confirm-cancel':
        closeConfirm();
        break;
      case 'confirm-run':
        runConfirm();
        break;
      case 'calendar-prev':
        moveCalendar(-1);
        break;
      case 'calendar-next':
        moveCalendar(1);
        break;
      case 'calendar-today':
        state.calendarCursor = new Date(state.now.getFullYear(), state.now.getMonth(), 1);
        state.selectedDate = U.dateKey(state.now);
        render(false);
        break;
      case 'calendar-select': {
        const key = actionEl.dataset.date;
        if (!key) break;
        state.selectedDate = key;
        const d = U.fromKey(key);
        if (d.getMonth() !== state.calendarCursor.getMonth() || d.getFullYear() !== state.calendarCursor.getFullYear()) {
          state.calendarCursor = new Date(d.getFullYear(), d.getMonth(), 1);
        }
        render(false);
        break;
      }
      case 'inbox-type':
        state.inbox.type = actionEl.dataset.value || 'all';
        render(false);
        break;
      case 'inbox-status':
        state.inbox.status = actionEl.dataset.value || 'active';
        render(false);
        break;
      case 'inbox-tag':
        state.inbox.tag = state.inbox.tag === actionEl.dataset.value ? '' : actionEl.dataset.value;
        render(false);
        break;
      case 'inbox-clear':
        state.inbox = { type: 'all', status: 'active', sort: 'due', tag: '' };
        render(false);
        break;
      case 'search-type':
        state.search.type = actionEl.dataset.value || 'all';
        render(false);
        break;
      case 'search-priority':
        state.search.priority = actionEl.dataset.value || 'all';
        render(false);
        break;
      case 'search-tag':
        state.search.tag = state.search.tag === actionEl.dataset.value ? '' : actionEl.dataset.value;
        render(false);
        break;
      case 'search-status':
        state.search.status = actionEl.dataset.value || 'active';
        render(false);
        break;
      case 'clear-search':
        state.search.q = '';
        updateSearchResults();
        {
          const input = $('#searchInput');
          if (input) {
            input.value = '';
            input.focus();
          }
        }
        break;
      case 'search-reset':
        state.search = { q: '', type: 'all', priority: 'all', tag: '', status: 'active' };
        render(false);
        break;
      case 'dismiss-toast':
        dismissToast(actionEl.dataset.toast);
        break;
      case 'toast-open': {
        const toastId = actionEl.dataset.toast;
        if (toastId) dismissToast(toastId);
        if (id) navigate('#/task/' + encodeURIComponent(id));
        else if (actionEl.dataset.action === 'open-task') navigate('#/today');
        break;
      }
      case 'complete-task':
        if (id) toggleTask(id);
        break;
      case 'install-app':
        installApp();
        break;
      default:
        break;
    }
  }

  function onSubmit(e) {
    if (e.target && e.target.id === 'taskForm') {
      e.preventDefault();
      saveTask(e);
      return;
    }
    if (e.target && e.target.id === 'milestoneForm') {
      e.preventDefault();
      saveMilestone(e.target);
    }
  }

  function onInput(e) {
    const t = e.target;
    if (!t) return;
    if (t.id === 'rawInput' && state.composer) {
      state.composer.raw = t.value;
      state.composer.dirty = true;
      state.composer.manualTouched = false;
      const conf = $('#smartConfidence');
      if (conf) conf.textContent = t.value.trim() ? '识别中…' : '等待输入';
      if (t.value.trim()) scheduleParse(t.value.trim());
      return;
    }
    if (t.id === 'titleInput' && state.composer) {
      state.composer.title = t.value;
      state.composer.dirty = true;
      state.composer.manualTouched = true;
      refreshComposerPreview();
      return;
    }
    if (t.id === 'tagsInput' && state.composer) {
      state.composer.tagsText = t.value;
      state.composer.dirty = true;
      state.composer.manualTouched = true;
      refreshComposerPreview();
      return;
    }
    if (t.id === 'notesInput' && state.composer) {
      state.composer.notes = t.value;
      state.composer.dirty = true;
      return;
    }
    if ((t.id === 'dueDate' || t.id === 'dueTime') && state.composer) {
      state.composer[t.id === 'dueDate' ? 'dueDate' : 'dueTime'] = t.value;
      state.composer.dirty = true;
      state.composer.manualTouched = true;
      refreshComposerPreview();
      return;
    }
    if (t.id === 'repeatInterval' && state.composer) {
      state.composer.recurrence.interval = U.clamp(Number(t.value) || 1, 1, 365);
      state.composer.dirty = true;
      state.composer.manualTouched = true;
      refreshComposerPreview();
      return;
    }
    if (t.id === 'searchInput') {
      state.search.q = t.value;
      updateSearchResults();
      return;
    }
    if (t.id === 'progressRange') {
      const val = U.clamp(Number(t.value) || 0, 0, 100);
      const valueEl = $('#progressValue');
      if (valueEl) valueEl.textContent = val + '%';
      const bar = $('#progressBar');
      if (bar) bar.style.width = val + '%';
    }
  }

  function onChange(e) {
    const t = e.target;
    if (!t) return;
    if (t.id === 'repeatFreq' && state.composer) {
      changeComposerRepeat(t.value);
      return;
    }
    if (t.id === 'inboxSort') {
      state.inbox.sort = t.value;
      render(false);
      return;
    }
    if (t.id === 'overdueRepeat') {
      state.data.settings.reminders.overdueRepeatMin = Number(t.value) || 10;
      persistData();
      return;
    }
    if (t.id === 'digestTime') {
      state.data.settings.digestTime = t.value || '08:00';
      persistData();
      return;
    }
    if (t.id === 'progressRange') {
      const task = Store.getTask(state.data, t.dataset.id);
      if (!task) return;
      task.progress = U.clamp(Number(t.value) || 0, 0, 100);
      task.updatedAt = new Date().toISOString();
      persistData();
      return;
    }
    if (t.id === 'importFile') {
      handleImportFile(t);
    }
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      if (state.confirm) {
        closeConfirm();
        return;
      }
      if (state.composer) {
        requestCloseComposer();
        return;
      }
    }
    const body = e.target.closest ? e.target.closest('.task-body[role="button"]') : null;
    if (body && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      navigate('#/task/' + encodeURIComponent(body.dataset.id));
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && e.target.id === 'rawInput') {
      e.preventDefault();
      parseRawNow(true);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 表单辅助操作                                                        */
  /* ------------------------------------------------------------------ */

  function refreshComposerPreview() {
    const preview = $('#parsePreview');
    if (preview) preview.innerHTML = parsePreviewHTML();
    const conf = $('#smartConfidence');
    if (conf && state.composer) {
      if (!state.composer.raw.trim()) conf.textContent = '等待输入';
      else if (state.composer.manualTouched) conf.textContent = '已手动调整';
      else if (state.composer.parsed) conf.textContent = '识别度 ' + Math.round((state.composer.parsed.confidence || 0.6) * 100) + '%';
    }
    $$('.quick-date').forEach(function (btn) {
      btn.classList.toggle('active', isQuickDateActive(btn.dataset.preset));
    });
  }

  function isQuickDateActive(preset) {
    const c = state.composer;
    if (!c || !c.dueDate) return false;
    if (preset === 'tonight') return c.dueDate === U.dateKey(state.now) && c.dueTime === '20:00';
    if (preset === 'today') return c.dueDate === U.dateKey(state.now) && c.dueTime !== '20:00';
    return c.dueDate === presetDate(preset);
  }

  function selectComposerType(type) {
    const c = state.composer;
    if (!c || !UI.TYPES[type]) return;
    c.type = type;
    c.dirty = true;
    c.manualTouched = true;
    if (type === 'recurring') {
      if (c.recurrence.freq === 'none') c.recurrence.freq = 'weekly';
      if (!c.dueDate) c.dueDate = U.dateKey(state.now);
      if (!c.dueTime) c.dueTime = '20:00';
      if (c.recurrence.freq === 'weekly' && !c.recurrence.weekdays.length) {
        c.recurrence.weekdays = [U.fromKey(c.dueDate).getDay()];
      }
    } else {
      c.recurrence.freq = 'none';
      c.recurrence.weekdays = [];
    }
    syncComposerDom();
  }

  function selectComposerPriority(priority) {
    const c = state.composer;
    if (!c) return;
    c.priority = priority;
    c.dirty = true;
    c.manualTouched = true;
    syncComposerDom();
  }

  function applyQuickDate(preset) {
    const c = state.composer;
    if (!c) return;
    c.dueDate = presetDate(preset);
    const time = applyPresetTime(preset);
    if (time) c.dueTime = time;
    c.dirty = true;
    c.manualTouched = true;
    if (c.recurrence.freq === 'weekly' && !c.recurrence.weekdays.length) {
      c.recurrence.weekdays = [U.fromKey(c.dueDate).getDay()];
    }
    syncComposerDom();
  }

  function clearComposerDate() {
    const c = state.composer;
    if (!c) return;
    c.dueDate = '';
    c.dueTime = '';
    c.dirty = true;
    c.manualTouched = true;
    syncComposerDom();
  }

  function toggleComposerWeekday(day) {
    const c = state.composer;
    if (!c) return;
    const idx = c.recurrence.weekdays.indexOf(day);
    if (idx > -1) {
      if (c.recurrence.weekdays.length === 1) {
        showToast('至少保留一个星期几', { tone: 'warn' });
        return;
      }
      c.recurrence.weekdays.splice(idx, 1);
    } else {
      c.recurrence.weekdays.push(day);
      c.recurrence.weekdays.sort(function (a, b) {
        return a - b;
      });
    }
    if (c.recurrence.freq === 'weekdays') c.recurrence.freq = 'weekly';
    c.dirty = true;
    c.manualTouched = true;
    syncComposerDom();
  }

  function changeComposerRepeat(freq) {
    const c = state.composer;
    if (!c) return;
    c.recurrence.freq = freq;
    c.dirty = true;
    c.manualTouched = true;
    if (freq === 'none') {
      c.type = c.dueDate ? 'deadline' : 'normal';
      c.recurrence.weekdays = [];
    } else {
      c.type = 'recurring';
      if (!c.dueDate) c.dueDate = U.dateKey(state.now);
      if (!c.dueTime) c.dueTime = '20:00';
      if (freq === 'weekdays') c.recurrence.weekdays = [1, 2, 3, 4, 5];
      if (freq === 'weekly' && !c.recurrence.weekdays.length) {
        c.recurrence.weekdays = [U.fromKey(c.dueDate).getDay()];
      }
    }
    syncComposerDom();
  }

  function toggleReminder(key) {
    const r = state.data.settings.reminders;
    if (!r || !(key in r)) return;
    r[key] = !r[key];
    persistData();
    render(false);
    showToast(key === 'h24' ? '24 小时提醒已' + (r[key] ? '开启' : '关闭') : key === 'h3' ? '3 小时提醒已' + (r[key] ? '开启' : '关闭') : '30 分钟提醒已' + (r[key] ? '开启' : '关闭'));
  }

  function toggleSetting(key) {
    if (key === 'digest') {
      state.data.settings.digest = !state.data.settings.digest;
      if (state.data.settings.digest && Notify.permission() !== 'granted') {
        showToast('每日简报需要通知权限，记得点上面的「开启」', { tone: 'warn', duration: 5000 });
      }
    } else if (key === 'reduceMotion') {
      state.data.settings.reduceMotion = !state.data.settings.reduceMotion;
      applyPreferences();
    }
    persistData();
    render(false);
  }

  /* ------------------------------------------------------------------ */
  /* 数据导入导出                                                        */
  /* ------------------------------------------------------------------ */

  function exportData() {
    const text = Store.exportData(state.data);
    U.downloadText('banban-backup-' + U.dateKey(new Date()) + '.json', text, 'application/json;charset=utf-8');
    showToast(window.BB && BB.native ? '备份已生成，选择保存或分享' : '备份已开始下载');
  }

  function triggerImport() {
    const input = $('#importFile');
    if (input) input.click();
  }

  async function handleImportFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = Store.importData(text, new Date());
      if (!res.ok) {
        showToast(res.error || '导入失败', { tone: 'danger' });
      } else {
        state.pendingImport = res;
        showConfirm({
          title: '导入这个备份？',
          message: '当前所有任务会被备份中的 ' + res.tasks.length + ' 条任务覆盖。设置也会一并恢复。',
          confirmLabel: '覆盖并导入',
          danger: true,
          action: 'import-data',
          icon: 'upload',
        });
      }
    } catch (e) {
      showToast('读取文件失败', { tone: 'danger' });
    } finally {
      input.value = '';
    }
  }

  async function installApp() {
    if (!state.installedPrompt) {
      showToast('用浏览器菜单里的“添加到主屏幕”即可安装');
      return;
    }
    state.installedPrompt.prompt();
    try {
      await state.installedPrompt.userChoice;
    } catch (e) {
      /* ignore */
    }
    state.installedPrompt = null;
    render(false);
  }

  /* ------------------------------------------------------------------ */
  /* 启动                                                                */
  /* ------------------------------------------------------------------ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
