/* 伴办 · 视觉组件（纯函数，输出 HTML 字符串） */
(function (global) {
  'use strict';
  const BB = (global.BB = global.BB || {});
  const U = BB.util;

  const TYPES = {
    deadline: {
      key: 'deadline',
      label: '限时',
      full: '限时任务',
      color: '#D9553F',
      soft: '#FBE9E4',
      icon: 'timer',
      desc: '有截止时间，倒计时 + 分级提醒',
    },
    recurring: {
      key: 'recurring',
      label: '定期',
      full: '定期任务',
      color: '#3568D4',
      soft: '#E8EEFB',
      icon: 'repeat',
      desc: '完成后自动生成下一次',
    },
    longterm: {
      key: 'longterm',
      label: '长期',
      full: '长期任务',
      color: '#7151C9',
      soft: '#EEE9FA',
      icon: 'target',
      desc: '跟踪进度，按阶段提醒',
    },
    normal: {
      key: 'normal',
      label: '普通',
      full: '普通任务',
      color: '#2F7D63',
      soft: '#E5F2EC',
      icon: 'checkSquare',
      desc: '没有截止压力，随时可做',
    },
  };

  const PATHS = {
    today:
      '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><path d="M4 9h16M8 3v3M16 3v3"/><path d="M9 14.6l2 2 4-4"/>',
    calendar:
      '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5"/><path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01"/>',
    inbox:
      '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 13.5h4l1.5 2h5l1.5-2h4M8 8.5h8"/>',
    settings:
      '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.4"/><circle cx="9" cy="17" r="2.4"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    timer:
      '<path d="M7 3h10M7 21h10"/><path d="M8 3c0 4 2.4 5.2 4 6.2 1.6-1 4-2.2 4-6.2"/><path d="M8 21c0-4 2.4-5.2 4-6.2 1.6 1 4 2.2 4 6.2"/><path d="M12 12v.01"/>',
    repeat:
      '<path d="M17 3.5l3 3-3 3"/><path d="M4 11V9.5a3 3 0 0 1 3-3h13"/><path d="M7 20.5l-3-3 3-3"/><path d="M20 13v1.5a3 3 0 0 1-3 3H4"/>',
    target:
      '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
    checkSquare:
      '<rect x="4" y="4" width="16" height="16" rx="5"/><path d="M8.5 12.2l2.4 2.4 4.8-5.1"/>',
    check: '<path d="M5 12.5l4.2 4.2L19 6.8"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.6 2.6 5.5-5.8"/>',
    chevronRight: '<path d="M9 5l7 7-7 7"/>',
    chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
    arrowLeft: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    sparkle:
      '<path d="M12 3l1.7 4.9L18.5 9.6l-4.8 1.7L12 16l-1.7-4.7L5.5 9.6l4.8-1.7z"/><path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    bell:
      '<path d="M18 9a6 6 0 0 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9"/><path d="M10 20a2.3 2.3 0 0 0 4 0"/>',
    bellOff:
      '<path d="M18 9a6 6 0 0 0-9.5-4.9M6 9c0 6-2.5 7-2.5 7h12"/><path d="M10 20a2.3 2.3 0 0 0 4 0M3 3l18 18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.3l3.4 2"/>',
    tag: '<path d="M20 13l-7 7-9-9V4h7l9 9z"/><circle cx="8.2" cy="8.2" r="1.2"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    trash: '<path d="M4 7h16M9 7V4.5h6V7M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
    edit: '<path d="M4 20h4.5L20 8.5a2.1 2.1 0 0 0-3-3L5.5 17 4 20z"/><path d="M14.5 6.5l3 3"/>',
    more: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
    trend: '<path d="M4 16l5-5 3.5 3.5L20 7"/><path d="M15 7h5v5"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5M3 16l9 5 9-5"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.2 7.4-8 9-4.8-1.6-8-4.5-8-9V6l8-3z"/><path d="M8.5 12l2.4 2.4 4.6-4.9"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    filter: '<path d="M4 5h16l-6 7v6l-4 2v-8L4 5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
    rotate: '<path d="M4 4v5h5"/><path d="M4.8 9A8 8 0 1 1 4 12"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    lock: '<rect x="4.5" y="10" width="15" height="10.5" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    phone: '<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10 18.5h4"/>',
  };

  function icon(name, cls, size) {
    const path = PATHS[name] || PATHS.info;
    return (
      '<svg class="ico ' +
      (cls || '') +
      '" viewBox="0 0 24 24" width="' +
      (size || 20) +
      '" height="' +
      (size || 20) +
      '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      path +
      '</svg>'
    );
  }

  function typeMeta(type) {
    return TYPES[type] || TYPES.normal;
  }

  function typeIcon(type, cls) {
    const m = typeMeta(type);
    return icon(m.icon, 'type-ico ' + (cls || ''));
  }

  function typeBadge(type, withIcon) {
    const m = typeMeta(type);
    return (
      '<span class="type-badge t-' +
      m.key +
      '">' +
      (withIcon === false ? '' : icon(m.icon, '', 13)) +
      '<span>' +
      m.label +
      '</span></span>'
    );
  }

  function priorityFlag(priority) {
    if (priority === 'high') return '<span class="prio high" title="高优先级">高优</span>';
    if (priority === 'low') return '<span class="prio low" title="低优先级">低优</span>';
    return '';
  }

  function whenText(task, now) {
    if (!task.dueAt) return task.type === 'longterm' ? '未设目标日' : '无日期';
    const d = new Date(task.dueAt);
    const ref = now || new Date();
    const rel = U.relativeDay(d, ref);
    const time = task.hasTime ? ' ' + U.formatTime(d) : '';
    if (rel) return rel + time;
    const year = d.getFullYear() !== ref.getFullYear() ? d.getFullYear() + '年' : '';
    return year + (d.getMonth() + 1) + '月' + d.getDate() + '日' + (task.hasTime ? time : '');
  }

  function shortCountdown(task, now) {
    if (task.status === 'done') return '已完成';
    if (!task.dueAt) {
      if (task.type === 'longterm') {
        const t = task.milestones || [];
        return t.length ? '阶段 ' + t.filter(function (m) { return m.done; }).length + '/' + t.length : '进度 ' + (task.progress || 0) + '%';
      }
      return '随时可做';
    }
    const diff = new Date(task.dueAt).getTime() - (now || new Date()).getTime();
    if (diff <= 0) return '逾期 ' + U.formatOverdue(-diff);
    if (diff < 3600000) return '剩 ' + Math.max(1, Math.ceil(diff / 60000)) + ' 分钟';
    if (diff < 86400000) return '剩 ' + U.formatRemaining(diff, 'short').replace(' 分钟', ' 分');
    if (diff < 7 * 86400000) return '剩 ' + U.formatRemaining(diff, 'short');
    return '剩 ' + Math.ceil(diff / 86400000) + ' 天';
  }

  function isOverdue(task, now) {
    return !!(task.status === 'active' && task.dueAt && new Date(task.dueAt).getTime() < (now || new Date()).getTime());
  }

  function progressOf(task) {
    if (!task) return 0;
    if (task.status === 'done') return 100;
    const ms = task.milestones || [];
    if (ms.length) {
      return Math.round((ms.filter(function (m) { return m.done; }).length / ms.length) * 100);
    }
    return U.clamp(Number(task.progress) || 0, 0, 100);
  }

  function progressMarkup(task) {
    if (task.type !== 'longterm') return '';
    const p = progressOf(task);
    const ms = task.milestones || [];
    const done = ms.filter(function (m) { return m.done; }).length;
    return (
      '<div class="mini-progress">' +
      '<div class="mini-track"><span style="width:' + p + '%"></span></div>' +
      '<span class="mini-label">' + (ms.length ? done + '/' + ms.length + ' 阶段' : p + '%') + '</span>' +
      '</div>'
    );
  }

  function taskCard(task, now, opts) {
    const ref = now || new Date();
    const meta = typeMeta(task.type);
    const done = task.status === 'done';
    const overdue = isOverdue(task, ref);
    const options = opts || {};
    const showNotes = options.notes !== false && task.notes && task.notes.trim();
    const recLabel = task.recurrence ? U.describeRecurrence(task.recurrence) : '';
    const tagHtml = (task.tags || [])
      .slice(0, options.maxTags || 2)
      .map(function (t) {
        return '<span class="tag">#' + U.escapeHTML(t) + '</span>';
      })
      .join('');
    const countdown = done ? '已完成' : shortCountdown(task, ref);
    const titleHtml = options.highlight ? searchHighlight(task.title, options.highlight) : U.escapeHTML(task.title);
    return (
      '<article class="task-card t-' +
      meta.key +
      (done ? ' is-done' : '') +
      (overdue ? ' is-overdue' : '') +
      '" data-task-id="' +
      U.escapeHTML(task.id) +
      '">' +
      '<button class="task-check ' +
      (done ? 'checked' : '') +
      '" data-action="toggle-task" data-id="' +
      U.escapeHTML(task.id) +
      '" aria-label="' +
      (done ? '恢复任务' : '完成任务') +
      '" aria-pressed="' +
      done +
      '">' +
      icon('check', '', 14) +
      '</button>' +
      '<div class="task-body" data-action="open-task" data-id="' +
      U.escapeHTML(task.id) +
      '" role="button" tabindex="0" aria-label="打开任务：' +
      U.escapeHTML(task.title) +
      '">' +
      '<div class="task-topline">' +
      '<span class="type-badge t-' +
      meta.key +
      '">' +
      icon(meta.icon, '', 13) +
      '<span>' +
      meta.label +
      '</span></span>' +
      priorityFlag(task.priority) +
      '<span class="task-when' +
      (overdue ? ' danger' : '') +
      '">' +
      U.escapeHTML(whenText(task, ref)) +
      '</span>' +
      '</div>' +
      '<h3 class="task-title">' +
      titleHtml +
      '</h3>' +
      (showNotes ? '<p class="task-notes">' + U.escapeHTML(U.truncate(task.notes.replace(/\s+/g, ' '), 72)) + '</p>' : '') +
      '<div class="task-bottom">' +
      '<span class="countdown' +
      (overdue ? ' danger' : '') +
      (done ? ' done' : '') +
      '" data-countdown data-due="' +
      (task.dueAt || '') +
      '" data-task="' +
      U.escapeHTML(task.id) +
      '">' +
      U.escapeHTML(countdown) +
      '</span>' +
      (task.type === 'recurring' && recLabel
        ? '<span class="rec-label">' + icon('repeat', '', 12) + U.escapeHTML(recLabel.replace(' · ' + (task.recurrence.time || ''), '')) + '</span>'
        : '') +
      tagHtml +
      '<span class="task-arrow">' +
      icon('chevronRight', '', 16) +
      '</span>' +
      '</div>' +
      progressMarkup(task) +
      '</div>' +
      '</article>'
    );
  }

  function emptyState(opts) {
    const o = opts || {};
    return (
      '<div class="empty-state">' +
      '<div class="empty-art">' +
      '<span class="empty-orbit"></span>' +
      icon(o.icon || 'sparkle', '', 28) +
      '</div>' +
      '<h3>' +
      U.escapeHTML(o.title || '这里还空着') +
      '</h3>' +
      '<p>' +
      U.escapeHTML(o.text || '') +
      '</p>' +
      (o.action && o.actionLabel
        ? '<button class="btn btn-soft btn-sm" data-action="' +
          U.escapeHTML(o.action) +
          '">' +
          U.escapeHTML(o.actionLabel || '去看看') +
          '</button>'
        : '') +
      '</div>'
    );
  }

  function sectionHead(title, count, extra) {
    return (
      '<div class="section-head">' +
      '<div class="section-title-wrap"><h2>' +
      U.escapeHTML(title) +
      '</h2>' +
      (count != null ? '<span class="section-count">' + count + '</span>' : '') +
      '</div>' +
      (extra || '') +
      '</div>'
    );
  }

  function segmented(options, current, action) {
    return (
      '<div class="segmented">' +
      options
        .map(function (o) {
          return (
            '<button class="' +
            (o.value === current ? 'active' : '') +
            '" data-action="' +
            action +
            '" data-value="' +
            U.escapeHTML(o.value) +
            '">' +
            U.escapeHTML(o.label) +
            '</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function typeFilters(current, action) {
    const items = [{ value: 'all', label: '全部' }].concat(
      Object.keys(TYPES).map(function (k) {
        return { value: k, label: TYPES[k].label };
      })
    );
    return (
      '<div class="filter-chips" role="group" aria-label="按任务类型筛选">' +
      items
        .map(function (o) {
          return (
            '<button class="filter-chip' +
            (o.value === current ? ' active' : '') +
            (o.value !== 'all' ? ' c-' + o.value : '') +
            '" data-action="' +
            action +
            '" data-value="' +
            o.value +
            '">' +
            (o.value !== 'all' ? icon(TYPES[o.value].icon, '', 14) : '') +
            '<span>' +
            o.label +
            '</span></button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function tagChips(tags, current, action) {
    if (!tags || !tags.length) return '';
    return (
      '<div class="tag-row">' +
      tags
        .map(function (t) {
          return (
            '<button class="tag-chip' +
            (current === t ? ' active' : '') +
            '" data-action="' +
            action +
            '" data-value="' +
            U.escapeHTML(t) +
            '">#' +
            U.escapeHTML(t) +
            '</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function searchHighlight(text, query) {
    const raw = String(text || '');
    const escaped = U.escapeHTML(raw);
    const q = String(query || '').trim();
    if (!q) return escaped;
    try {
      const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      return escaped.replace(re, '<mark>$1</mark>');
    } catch (e) {
      return escaped;
    }
  }

  BB.ui = {
    TYPES: TYPES,
    icon: icon,
    typeMeta: typeMeta,
    typeBadge: typeBadge,
    typeIcon: typeIcon,
    taskCard: taskCard,
    emptyState: emptyState,
    sectionHead: sectionHead,
    segmented: segmented,
    typeFilters: typeFilters,
    tagChips: tagChips,
    whenText: whenText,
    shortCountdown: shortCountdown,
    isOverdue: isOverdue,
    progressOf: progressOf,
    progressMarkup: progressMarkup,
    priorityFlag: priorityFlag,
    searchHighlight: searchHighlight,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
