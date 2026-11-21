/* 伴办 · 基础工具（无依赖，浏览器 / Node 均可用） */
(function (global) {
  'use strict';
  const BB = (global.BB = global.BB || {});
  const DAY = 86400000;
  const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六'];

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function uid(prefix) {
    const p = prefix || 'id';
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return p + '_' + global.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    }
    return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function endOfDay(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function addMonths(d, n) {
    const x = new Date(d);
    const day = x.getDate();
    x.setDate(1);
    x.setMonth(x.getMonth() + n);
    x.setDate(Math.min(day, daysInMonth(x.getFullYear(), x.getMonth())));
    return x;
  }

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function atTime(d, h, m) {
    const x = new Date(d);
    x.setHours(h, m || 0, 0, 0);
    return x;
  }

  function combine(dateKey, timeStr) {
    const [y, mo, da] = String(dateKey).split('-').map(Number);
    const [h, mi] = String(timeStr || '23:59').split(':').map(Number);
    return new Date(y, mo - 1, da, h || 0, mi || 0, 0, 0);
  }

  function dateKey(d) {
    const x = new Date(d);
    return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
  }

  function monthKey(d) {
    const x = new Date(d);
    return x.getFullYear() + '-' + pad(x.getMonth() + 1);
  }

  function fromKey(key) {
    const [y, m, d] = String(key).split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  function sameDay(a, b) {
    if (!a || !b) return false;
    const x = new Date(a);
    const y = new Date(b);
    return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
  }

  function startOfWeek(d, weekStart) {
    const start = weekStart == null ? 1 : weekStart;
    const x = startOfDay(d);
    const diff = (x.getDay() - start + 7) % 7;
    x.setDate(x.getDate() - diff);
    return x;
  }

  function weekdayCn(d, short) {
    return (short ? '周' : '星期') + WEEKDAY_CN[new Date(d).getDay()];
  }

  function monthMatrix(year, month, weekStart) {
    const start = weekStart == null ? 1 : weekStart;
    const first = new Date(year, month, 1);
    const gridStart = startOfWeek(first, start);
    const days = [];
    for (let i = 0; i < 42; i++) {
      days.push(addDays(gridStart, i));
    }
    return days;
  }

  function relativeDay(d, now) {
    const base = startOfDay(now || new Date());
    const target = startOfDay(d);
    const diff = Math.round((target - base) / DAY);
    if (diff === 0) return '今天';
    if (diff === 1) return '明天';
    if (diff === 2) return '后天';
    if (diff === -1) return '昨天';
    if (diff === -2) return '前天';
    return '';
  }

  function formatDate(d, opts) {
    if (!d) return '';
    const options = opts || {};
    const x = new Date(d);
    const now = options.now || new Date();
    const rel = relativeDay(x, now);
    if (options.relative !== false && rel) return rel;
    const includeYear = options.year != null ? options.year : x.getFullYear() !== now.getFullYear();
    return (includeYear ? x.getFullYear() + '年' : '') + (x.getMonth() + 1) + '月' + x.getDate() + '日';
  }

  function formatDateWithWeek(d, now) {
    return formatDate(d, { now }) + ' ' + weekdayCn(d, true);
  }

  function formatTime(d) {
    if (!d) return '';
    const x = new Date(d);
    return pad(x.getHours()) + ':' + pad(x.getMinutes());
  }

  function formatDateTime(d, hasTime, now) {
    if (!d) return '无日期';
    return formatDate(d, { now }) + (hasTime ? ' ' + formatTime(d) : '');
  }

  function formatMonthTitle(d) {
    return new Date(d).getFullYear() + '年' + (new Date(d).getMonth() + 1) + '月';
  }

  function formatRemaining(ms, style) {
    const short = style === 'short';
    const total = Math.max(0, Math.floor(ms / 1000));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (short) {
      if (days > 0) return days + ' 天 ' + hours + ' 小时';
      if (hours > 0) return hours + ' 小时 ' + mins + ' 分';
      if (mins > 0) return mins + ' 分钟';
      return secs + ' 秒';
    }
    if (days > 0) return days + ' 天 ' + pad(hours) + ':' + pad(mins) + ':' + pad(secs);
    return pad(hours) + ':' + pad(mins) + ':' + pad(secs);
  }

  function formatOverdue(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const mins = Math.floor((total % 3600) / 60);
    if (days > 0) return days + ' 天 ' + hours + ' 小时';
    if (hours > 0) return hours + ' 小时 ' + mins + ' 分';
    return Math.max(1, mins) + ' 分钟';
  }

  function formatDurationShort(ms) {
    const mins = Math.round(ms / 60000);
    if (mins < 60) return mins + ' 分钟';
    if (mins < 1440) return Math.round(mins / 60) + ' 小时';
    return Math.round(mins / 1440) + ' 天';
  }

  function formatRelativeTime(d, now) {
    if (!d) return '';
    const diff = (now || new Date()).getTime() - new Date(d).getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < DAY) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 7 * DAY) return Math.floor(diff / DAY) + ' 天前';
    return formatDate(d, { now, relative: false });
  }

  function parseTimeToMinutes(s) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  function timeFromMinutes(n) {
    return pad(Math.floor(n / 60)) + ':' + pad(n % 60);
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function truncate(str, max) {
    const s = String(str || '');
    return s.length > max ? s.slice(0, Math.max(0, max - 1)) + '…' : s;
  }

  function debounce(fn, wait) {
    let timer = null;
    return function () {
      const args = arguments;
      const ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(ctx, args);
      }, wait);
    };
  }

  function getRecurrenceTime(rec) {
    const mins = parseTimeToMinutes(rec && rec.time);
    return mins == null ? 20 * 60 : mins;
  }

  function weekdayOffsets(weekdays) {
    const list = Array.isArray(weekdays) && weekdays.length ? weekdays.slice() : [];
    return list
      .map(function (d) {
        return Number(d);
      })
      .filter(function (d) {
        return d >= 0 && d <= 6;
      })
      .sort(function (a, b) {
        return a - b;
      });
  }

  /**
   * Next occurrence strictly after `after`.
   * `anchor` fixes the phase for interval > 1 (defaults to after).
   */
  function nextOccurrence(rec, after, anchor) {
    if (!rec) return null;
    const interval = Math.max(1, Number(rec.interval) || 1);
    const afterDate = after ? new Date(after) : new Date();
    const anchorDate = anchor ? new Date(anchor) : new Date(afterDate);
    const mins = getRecurrenceTime(rec);
    const h = Math.floor(mins / 60);
    const mi = mins % 60;
    const freq = rec.freq || 'daily';

    if (freq === 'daily') {
      let d = atTime(startOfDay(anchorDate), h, mi);
      let guard = 0;
      while (d <= afterDate && guard < 4000) {
        d = addDays(d, interval);
        guard++;
      }
      return d;
    }

    if (freq === 'weekly') {
      let days = weekdayOffsets(rec.weekdays);
      if (!days.length) days = [anchorDate.getDay()];
      const anchorWeek = startOfWeek(anchorDate, 1);
      for (let week = 0; week < 260; week += interval) {
        for (let i = 0; i < days.length; i++) {
          const offset = (days[i] + 6) % 7; // Monday = 0
          const candidate = atTime(addDays(anchorWeek, week * 7 + offset), h, mi);
          if (candidate > afterDate) return candidate;
        }
      }
      return null;
    }

    if (freq === 'monthly') {
      const day = clamp(Number(rec.monthDay) || anchorDate.getDate(), 1, 31);
      let y = anchorDate.getFullYear();
      let m = anchorDate.getMonth();
      for (let i = 0; i < 240; i++) {
        const dim = daysInMonth(y, m);
        const candidate = atTime(new Date(y, m, Math.min(day, dim)), h, mi);
        if (candidate > afterDate) return candidate;
        m += interval;
        while (m > 11) {
          m -= 12;
          y += 1;
        }
      }
      return null;
    }

    if (freq === 'yearly') {
      const month = clamp(Number(rec.month) || anchorDate.getMonth() + 1, 1, 12) - 1;
      const day = clamp(Number(rec.monthDay) || anchorDate.getDate(), 1, 31);
      let y = anchorDate.getFullYear();
      for (let i = 0; i < 120; i++) {
        const dim = daysInMonth(y, month);
        const candidate = atTime(new Date(y, month, Math.min(day, dim)), h, mi);
        if (candidate > afterDate) return candidate;
        y += interval;
      }
      return null;
    }

    return null;
  }

  function describeRecurrence(rec) {
    if (!rec) return '';
    const interval = Math.max(1, Number(rec.interval) || 1);
    const time = rec.time || '20:00';
    const days = weekdayOffsets(rec.weekdays);
    const names = days.map(function (d) {
      return WEEKDAY_CN[d];
    });
    let text = '';
    if (rec.freq === 'daily') {
      text = interval === 1 ? '每天' : '每 ' + interval + ' 天';
    } else if (rec.freq === 'weekly') {
      if (days.length === 5 && days.join(',') === '1,2,3,4,5') {
        text = interval === 1 ? '每个工作日' : '每 ' + interval + ' 周的工作日';
      } else if (days.length === 1) {
        text = (interval === 1 ? '每周' : '每 ' + interval + ' 周的周') + names[0];
      } else if (days.length > 1) {
        text =
          interval === 1
            ? '每周' + names.join('、')
            : '每 ' + interval + ' 周的' + names.map(function (n) { return '周' + n; }).join('、');
      } else {
        text = interval === 1 ? '每周' : '每 ' + interval + ' 周';
      }
    } else if (rec.freq === 'monthly') {
      text = (interval === 1 ? '每月' : '每 ' + interval + ' 个月') + (rec.monthDay ? rec.monthDay + ' 日' : '');
    } else if (rec.freq === 'yearly') {
      text =
        (interval === 1 ? '每年' : '每 ' + interval + ' 年') +
        (rec.month ? rec.month + ' 月' : '') +
        (rec.monthDay ? rec.monthDay + ' 日' : '');
    }
    return (text + ' · ' + time).trim();
  }

  function dueLabel(task, now) {
    if (!task || !task.dueAt) return '无日期';
    return formatDate(task.dueAt, { now }) + (task.hasTime ? ' ' + formatTime(task.dueAt) : '');
  }

  function hhmmToParts(str) {
    const mins = parseTimeToMinutes(str);
    if (mins == null) return null;
    return { h: Math.floor(mins / 60), m: mins % 60 };
  }

  function downloadText(filename, text, mime) {
    if (typeof document === 'undefined') return;
    const blob = new Blob([text], { type: mime || 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function vibrate(pattern) {
    try {
      if (global.navigator && typeof global.navigator.vibrate === 'function') {
        global.navigator.vibrate(pattern || 30);
      }
    } catch (e) {
      /* ignore */
    }
  }

  BB.util = {
    DAY: DAY,
    WEEKDAY_CN: WEEKDAY_CN,
    pad: pad,
    uid: uid,
    startOfDay: startOfDay,
    endOfDay: endOfDay,
    addDays: addDays,
    addMonths: addMonths,
    daysInMonth: daysInMonth,
    atTime: atTime,
    combine: combine,
    dateKey: dateKey,
    monthKey: monthKey,
    fromKey: fromKey,
    sameDay: sameDay,
    startOfWeek: startOfWeek,
    weekdayCn: weekdayCn,
    monthMatrix: monthMatrix,
    relativeDay: relativeDay,
    formatDate: formatDate,
    formatDateWithWeek: formatDateWithWeek,
    formatTime: formatTime,
    formatDateTime: formatDateTime,
    formatMonthTitle: formatMonthTitle,
    formatRemaining: formatRemaining,
    formatOverdue: formatOverdue,
    formatDurationShort: formatDurationShort,
    formatRelativeTime: formatRelativeTime,
    parseTimeToMinutes: parseTimeToMinutes,
    timeFromMinutes: timeFromMinutes,
    clamp: clamp,
    escapeHTML: escapeHTML,
    truncate: truncate,
    debounce: debounce,
    nextOccurrence: nextOccurrence,
    describeRecurrence: describeRecurrence,
    dueLabel: dueLabel,
    downloadText: downloadText,
    vibrate: vibrate,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
