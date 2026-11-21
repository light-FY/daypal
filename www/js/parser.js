/* 伴办 · 中文自然语言待办解析器
 * 纯规则、零依赖、可离线。解析结果只是“草稿”，保存前永远可以手动修改。
 */
(function (global) {
  'use strict';
  const BB = (global.BB = global.BB || {});
  const U = BB.util;

  const CN_DIGIT = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };

  function cnToInt(input) {
    const s = String(input == null ? '' : input).trim();
    if (!s) return NaN;
    if (/^\d+$/.test(s)) return Number(s);
    if (s === '十') return 10;
    if (s.indexOf('十') > -1) {
      const parts = s.split('十');
      const tens = parts[0] ? CN_DIGIT[parts[0]] : 1;
      const ones = parts[1] ? CN_DIGIT[parts[1]] : 0;
      if (tens == null || ones == null) return NaN;
      return tens * 10 + ones;
    }
    if (s.length === 1 && CN_DIGIT[s] != null) return CN_DIGIT[s];
    return NaN;
  }

  const NUM = '(?:\\d{1,2}|[一二三四五六七八九十两]{1,3})';
  const PERIOD = '(?:凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里|夜间)';
  const WEEKDAY = '(?:[一二三四五六日天])';

  function blank(text, match) {
    return text.slice(0, match.index) + ' '.repeat(match[0].length) + text.slice(match.index + match[0].length);
  }

  function cleanSpaces(s) {
    return String(s || '')
      .replace(/[\u3000\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function parseMinuteToken(token) {
    if (!token) return 0;
    const t = String(token).replace(/\s|分/g, '');
    if (!t) return 0;
    if (t === '半') return 30;
    if (t === '一刻') return 15;
    if (t === '三刻') return 45;
    const n = cnToInt(t);
    return Number.isFinite(n) ? n : NaN;
  }

  function applyPeriod(hour, period) {
    let h = hour;
    let addDay = false;
    const p = period || '';
    const pm = ['下午', '傍晚', '晚上', '夜里', '夜间'].indexOf(p) > -1;
    const am = ['凌晨', '早上', '早晨', '上午'].indexOf(p) > -1;
    if (pm) {
      if (h === 12) {
        h = 0;
        addDay = true;
      } else if (h < 12) {
        h += 12;
      }
    } else if (p === '中午') {
      if (h < 11) h += 12;
    } else if (am) {
      if (h === 12) h = 0;
    } else {
      // 没有时段词时：1–6 点按下午理解，7–12 点按上午/中午理解。
      if (h >= 1 && h <= 6) h += 12;
    }
    return { h: h, addDay: addDay };
  }

  function validDate(y, m, d) {
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function extractTags(text, tags) {
    let t = text;
    let m;
    const hashRe = /#([\u4e00-\u9fa5A-Za-z0-9_\-]{1,16})/g;
    while ((m = hashRe.exec(t))) {
      const tag = m[1].trim();
      if (tag && tags.indexOf(tag) < 0) tags.push(tag);
      t = blank(t, m);
      hashRe.lastIndex = 0;
    }
    const bracketRe = /【([^】\n]{1,16})】/g;
    while ((m = bracketRe.exec(t))) {
      const tag = m[1].trim();
      if (tag && tags.indexOf(tag) < 0) tags.push(tag);
      t = blank(t, m);
      bracketRe.lastIndex = 0;
    }
    const labelRe = /(?:标签|分类|tag)\s*[:：]\s*([^\s，,。；;]{1,16}(?:[、,，/][^\s，,。；;]{1,16})*)/i;
    m = labelRe.exec(t);
    if (m) {
      String(m[1])
        .split(/[、,，/#\s]+/)
        .map(function (x) {
          return x.trim();
        })
        .filter(Boolean)
        .slice(0, 6)
        .forEach(function (tag) {
          if (tags.indexOf(tag) < 0) tags.push(tag);
        });
      t = blank(t, m);
    }
    return t;
  }

  function extractPriority(text, result) {
    let t = text;
    let m;
    const lowFirst = /(不重要|不紧急|不着急|不急|低优先级|低优|有空再|有空|闲时|可选|随便|顺路|顺便)/;
    const highFirst = /(高优先级|高优|最高优先级|优先级\s*[:：]?\s*高|重要程度\s*[:：]?\s*高)/;
    const high = /(非常紧急|特别紧急|紧急|加急|急事|很急|着急|急|重要|优先|必须|务必|尽快|马上|立刻|赶紧|别拖|不能拖)/;
    const low = /(低优先级|低优|不急|不重要|不紧急|有空|可选)/;

    m = lowFirst.exec(t);
    if (m && /(不重要|不紧急|不着急|不急)/.test(m[0])) {
      result.priority = 'low';
      result.priorityText = m[0];
      return blank(t, m);
    }
    m = highFirst.exec(t);
    if (m) {
      result.priority = 'high';
      result.priorityText = m[0];
      return blank(t, m);
    }
    m = low.exec(t);
    if (m) {
      result.priority = 'low';
      result.priorityText = m[0];
      return blank(t, m);
    }
    m = high.exec(t);
    if (m) {
      result.priority = 'high';
      result.priorityText = m[0];
      return blank(t, m);
    }
    return t;
  }

  function extractRecurrence(text) {
    let t = text;
    let m;
    const make = function (freq, extra) {
      const rec = {
        freq: freq,
        interval: 1,
        weekdays: [],
        monthDay: null,
        month: null,
        time: null,
      };
      return Object.assign(rec, extra || {});
    };

    // 每周末
    m = /每(?:个)?周末/.exec(t);
    if (m) return { text: blank(t, m), rec: make('weekly', { weekdays: [6, 0] }), matched: m[0] };

    // 每个工作日 / 周一到周五（必须带“每”）
    m = /每(?:个)?(?:周|星期|礼拜)\s*([一二三四五六日天])\s*(?:到|至|-|—|~|～)\s*(?:周|星期|礼拜)?\s*([一二三四五六日天])/.exec(t);
    if (m) {
      const a = m[1] === '日' || m[1] === '天' ? 0 : '一二三四五六'.indexOf(m[1]) + 1;
      const b = m[2] === '日' || m[2] === '天' ? 0 : '一二三四五六'.indexOf(m[2]) + 1;
      const days = [];
      if (a <= b) {
        for (let d = a; d <= b; d++) days.push(d);
      } else {
        for (let d = a; d <= 6; d++) days.push(d);
        for (let d = 0; d <= b; d++) days.push(d);
      }
      return { text: blank(t, m), rec: make('weekly', { weekdays: days }), matched: m[0] };
    }
    m = /每(?:个)?工作日/.exec(t);
    if (m) return { text: blank(t, m), rec: make('weekly', { weekdays: [1, 2, 3, 4, 5] }), matched: m[0] };

    // 每周一、三、五
    m = /每(?:个)?(?:周|星期|礼拜)\s*([一二三四五六日天](?:\s*[、,，和及]\s*[一二三四五六日天])+)/.exec(t);
    if (m) {
      const days = [];
      String(m[1])
        .split(/[、,，和及\s]+/)
        .filter(Boolean)
        .forEach(function (c) {
          const d = c === '日' || c === '天' ? 0 : '一二三四五六'.indexOf(c) + 1;
          if (d >= 0 && days.indexOf(d) < 0) days.push(d);
        });
      if (days.length) {
        return { text: blank(t, m), rec: make('weekly', { weekdays: days }), matched: m[0] };
      }
    }

    // 每周一三五
    m = /每(?:个)?(?:周|星期|礼拜)\s*([一二三四五六日天]{1,7})(?![次回遍])/.exec(t);
    if (m) {
      const days = [];
      String(m[1])
        .split('')
        .forEach(function (c) {
          const d = c === '日' || c === '天' ? 0 : '一二三四五六'.indexOf(c) + 1;
          if (d >= 0 && days.indexOf(d) < 0) days.push(d);
        });
      if (days.length) {
        return { text: blank(t, m), rec: make('weekly', { weekdays: days }), matched: m[0] };
      }
    }

    // 每两周周一 / 每3个星期
    m = new RegExp(
      '每\\s*(' + NUM + ')\\s*个?\\s*(?:周|星期|礼拜)\\s*(?:周|星期|礼拜)?\\s*(' + WEEKDAY + ')?(?![次回遍])'
    ).exec(t);
    if (m) {
      const n = cnToInt(m[1]);
      if (Number.isFinite(n) && n >= 1) {
        const days = [];
        if (m[2]) {
          const d = m[2] === '日' || m[2] === '天' ? 0 : '一二三四五六'.indexOf(m[2]) + 1;
          if (d >= 0) days.push(d);
        }
        return {
          text: blank(t, m),
          rec: make('weekly', { interval: Math.min(52, n), weekdays: days }),
          matched: m[0],
        };
      }
    }

    // 每年3月5日
    m = new RegExp('每(?:一)?年(?:的)?\\s*(' + NUM + ')\\s*月\\s*(' + NUM + ')\\s*[日号]?').exec(t);
    if (m) {
      const mon = cnToInt(m[1]);
      const day = cnToInt(m[2]);
      if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
        return { text: blank(t, m), rec: make('yearly', { month: mon, monthDay: day }), matched: m[0] };
      }
    }

    // 每月5号
    m = new RegExp('每(?:个)?月(?:的)?\\s*(' + NUM + ')\\s*[号日]').exec(t);
    if (m) {
      const day = cnToInt(m[1]);
      if (day >= 1 && day <= 31) {
        return { text: blank(t, m), rec: make('monthly', { monthDay: day }), matched: m[0] };
      }
    }

    // 每两个月
    m = new RegExp('每\\s*(' + NUM + ')\\s*个?\\s*月').exec(t);
    if (m) {
      const n = cnToInt(m[1]);
      if (Number.isFinite(n) && n >= 1) {
        return { text: blank(t, m), rec: make('monthly', { interval: Math.min(24, n) }), matched: m[0] };
      }
    }

    // 每两天 / 每隔一天
    m = new RegExp('每(?:隔)?\\s*(' + NUM + ')\\s*天').exec(t);
    if (m) {
      const n = cnToInt(m[1]);
      if (Number.isFinite(n) && n >= 1) {
        return { text: blank(t, m), rec: make('daily', { interval: Math.min(365, n) }), matched: m[0] };
      }
    }
    m = /隔天|隔日/.exec(t);
    if (m) return { text: blank(t, m), rec: make('daily', { interval: 2 }), matched: m[0] };

    // 每天
    m = /每天|每日|天天/.exec(t);
    if (m) return { text: blank(t, m), rec: make('daily'), matched: m[0] };

    // 每周 / 每月 / 每年（无具体星期或日期）
    m = /每(?:个)?(?:周|星期|礼拜)/.exec(t);
    if (m) return { text: blank(t, m), rec: make('weekly'), matched: m[0] };
    m = /每(?:个)?月/.exec(t);
    if (m) return { text: blank(t, m), rec: make('monthly'), matched: m[0] };
    m = /每年/.exec(t);
    if (m) return { text: blank(t, m), rec: make('yearly'), matched: m[0] };

    return { text: t, rec: null, matched: '' };
  }

  function extractDate(text, now) {
    let t = text;
    let m;
    const result = {
      date: null,
      matched: '',
      defaultTime: null,
      defaultPeriod: '',
      explicit: false,
      weekdayImplicit: false,
      note: '',
    };
    const y0 = now.getFullYear();
    const m0 = now.getMonth();
    const d0 = now.getDate();

    function setDate(y, mo, da, raw) {
      if (!validDate(y, mo, da)) return false;
      result.date = new Date(y, mo - 1, da, 0, 0, 0, 0);
      result.matched = raw;
      result.explicit = true;
      return true;
    }

    // 2026年11月20日 / 2026-11-20
    m = /(\d{4})\s*[年\/\-.]\s*(\d{1,2})\s*[月\/\-.]\s*(\d{1,2})\s*[日号]?/.exec(t);
    if (m) {
      const raw = m[0];
      if (setDate(Number(m[1]), Number(m[2]), Number(m[3]), raw)) return { text: blank(t, m), date: result };
    }

    // 11月20日
    m = /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/.exec(t);
    if (m) {
      const raw = m[0];
      const mo = Number(m[1]);
      const da = Number(m[2]);
      let y = y0;
      if (!validDate(y, mo, da)) return { text: t, date: result };
      // 没写年份且日期已过去很多，按明年处理（如 1 月 3 日在 12 月说）
      const candidate = new Date(y, mo - 1, da);
      if (candidate.getTime() < new Date(y0, m0, d0).getTime() - 180 * 86400000) y += 1;
      if (setDate(y, mo, da, raw)) return { text: blank(t, m), date: result };
    }

    // 3/5
    m = /(\d{1,2})\/(\d{1,2})(?!\d)/.exec(t);
    if (m) {
      const raw = m[0];
      const mo = Number(m[1]);
      const da = Number(m[2]);
      let y = y0;
      if (validDate(y, mo, da) && setDate(y, mo, da, raw)) return { text: blank(t, m), date: result };
    }

    // 相对日 / 今晚明早
    m = /(大后天|大前天|后天|明天|明日|今天|今日|今晚|明晚|今早|明早)/.exec(t);
    if (m) {
      const word = m[1];
      let offset = 0;
      if (word === '明天' || word === '明日' || word === '明晚' || word === '明早') offset = 1;
      if (word === '后天') offset = 2;
      if (word === '大后天') offset = 3;
      result.date = U.addDays(U.startOfDay(now), offset);
      result.matched = word;
      result.explicit = true;
      if (word === '今晚' || word === '明晚') {
        result.defaultTime = '20:00';
        result.defaultPeriod = '晚上';
      }
      if (word === '今早' || word === '明早') {
        result.defaultTime = '08:00';
        result.defaultPeriod = '早上';
      }
      return { text: blank(t, m), date: result };
    }

    // N 天后 / N 周后 / N 个月后
    m = new RegExp('(' + NUM + ')\\s*(天|周|个?月)\\s*(?:之?后|以后)').exec(t);
    if (m) {
      const n = cnToInt(m[1]);
      const unit = m[2];
      if (Number.isFinite(n)) {
        let d = U.startOfDay(now);
        if (unit === '天') d = U.addDays(d, n);
        else if (unit === '周') d = U.addDays(d, n * 7);
        else d = U.addMonths(d, n);
        result.date = d;
        result.matched = m[0];
        result.explicit = true;
        return { text: blank(t, m), date: result };
      }
    }

    // 下个月5号
    m = new RegExp('下(?:个)?月(?:的)?\\s*(' + NUM + ')\\s*[号日]').exec(t);
    if (m) {
      const day = cnToInt(m[1]);
      if (day >= 1 && day <= 31) {
        const nextMonth = new Date(y0, m0 + 1, 1);
        const dim = U.daysInMonth(nextMonth.getFullYear(), nextMonth.getMonth());
        result.date = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(day, dim));
        result.matched = m[0];
        result.explicit = true;
        return { text: blank(t, m), date: result };
      }
    }

    // 月底 / 月末
    m = /(下个?月|这个月|本月)?\s*(?:月底|月末)/.exec(t);
    if (m) {
      let monthOffset = 0;
      if (m[1] && m[1].indexOf('下') === 0) monthOffset = 1;
      const base = new Date(y0, m0 + monthOffset, 1);
      result.date = new Date(base.getFullYear(), base.getMonth(), U.daysInMonth(base.getFullYear(), base.getMonth()));
      result.matched = m[0];
      result.explicit = true;
      return { text: blank(t, m), date: result };
    }

    // 周末
    m = /周末/.exec(t);
    if (m) {
      let d = U.startOfDay(now);
      const diff = (6 - d.getDay() + 7) % 7;
      d = U.addDays(d, diff);
      result.date = d;
      result.matched = '周末';
      result.explicit = true;
      result.note = '“周末”按周六处理';
      return { text: blank(t, m), date: result };
    }

    // 下周三 / 这周五 / 周一
    m = /(?:(下下|下个|下|这个|这|本)(?:个)?)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/.exec(t);
    if (m) {
      const prefix = m[1] || '';
      const wd = m[2] === '日' || m[2] === '天' ? 0 : '一二三四五六'.indexOf(m[2]) + 1;
      const monday = U.startOfWeek(now, 1);
      let target;
      if (prefix === '下' || prefix === '下个') {
        target = U.addDays(monday, 7 + ((wd + 6) % 7));
      } else if (prefix === '下下') {
        target = U.addDays(monday, 14 + ((wd + 6) % 7));
      } else if (prefix === '这' || prefix === '这个' || prefix === '本') {
        target = U.addDays(monday, (wd + 6) % 7);
        if (U.startOfDay(now).getTime() > target.getTime()) target = U.addDays(target, 7);
      } else {
        target = U.addDays(monday, (wd + 6) % 7);
        if (target.getTime() < U.startOfDay(now).getTime()) target = U.addDays(target, 7);
        result.weekdayImplicit = true;
      }
      result.date = U.startOfDay(target);
      result.matched = m[0];
      result.explicit = true;
      return { text: blank(t, m), date: result };
    }

    // 20号（未写月份）
    m = new RegExp('(?:^|[\\s，,、])\\s*(' + NUM + ')\\s*[号日](?!内|后|之前)').exec(t);
    if (m) {
      const day = cnToInt(m[1]);
      if (day >= 1 && day <= 31) {
        let target = new Date(y0, m0, Math.min(day, U.daysInMonth(y0, m0)));
        if (day > U.daysInMonth(y0, m0)) {
          target = new Date(y0, m0 + 1, Math.min(day, U.daysInMonth(y0, m0 + 1)));
        } else if (U.startOfDay(target).getTime() < U.startOfDay(now).getTime()) {
          target = new Date(y0, m0 + 1, Math.min(day, U.daysInMonth(y0, m0 + 1)));
        }
        result.date = U.startOfDay(target);
        result.matched = m[0].trim();
        result.explicit = true;
        return { text: blank(t, m), date: result };
      }
    }

    return { text: t, date: result };
  }

  function clockRegex(range) {
    const token =
      '(' +
      PERIOD +
      ')?\\s*(' +
      NUM +
      ')\\s*(?::|：|点|时)\\s*(半|一刻|三刻|(?:\\d{1,2}|[一二三四五六七八九十]{1,3})\\s*分?)?';
    if (range) {
      return new RegExp(
        token + '\\s*(?:到|至|-|—|~|～)\\s*(' + PERIOD + ')?\\s*(' + NUM + ')\\s*(?::|：|点|时)\\s*(半|一刻|三刻|(?:\\d{1,2}|[一二三四五六七八九十]{1,3})\\s*分?)?'
      );
    }
    return new RegExp(token);
  }

  function parseClock(hourText, minuteText, period) {
    let h = cnToInt(hourText);
    const min = parseMinuteToken(minuteText);
    if (!Number.isFinite(h) || !Number.isFinite(min) || min > 59) return null;
    if (h > 24) return null;
    if (h === 24) {
      if (min !== 0) return null;
      return { h: 0, m: 0, addDay: true };
    }
    const adjusted = applyPeriod(h, period);
    if (adjusted.h > 23) return null;
    return { h: adjusted.h, m: min, addDay: adjusted.addDay };
  }

  function extractTime(text, now, dateResult) {
    let t = text;
    let m;
    const periodHint = dateResult && dateResult.defaultPeriod ? dateResult.defaultPeriod : '';
    const res = {
      time: null,
      start: null,
      matched: '',
      periodOnly: false,
      relativeMs: null,
      range: false,
      addDay: false,
    };

    // 9:00-11:00 / 下午2点到4点
    m = clockRegex(true).exec(t);
    if (m) {
      const a = parseClock(m[2], m[3], m[1] || periodHint);
      const b = parseClock(m[5], m[6], m[4] || m[1] || periodHint);
      if (a && b) {
        res.range = true;
        res.start = a;
        res.time = b;
        res.matched = m[0];
        res.addDay = !!b.addDay;
        return { text: blank(t, m), time: res };
      }
    }

    // 30分钟后 / 2小时之后 / 半小时后
    m = /(\d{1,3}|[一二三四五六七八九十两]{1,3})\s*个?\s*(分钟|分|小时|钟头)\s*(?:之?后|以后|内)/.exec(t);
    if (m) {
      const n = cnToInt(m[1]);
      if (Number.isFinite(n) && n > 0) {
        const mins = /小时|钟头/.test(m[2]) ? n * 60 : n;
        res.relativeMs = mins * 60000;
        res.matched = m[0];
        return { text: blank(t, m), time: res };
      }
    }
    m = /(半|一|两|三)?\s*个?半小时\s*(?:之?后|以后|内)/.exec(t);
    if (m) {
      const prefix = m[1];
      const isHalfHour = prefix === '半' || /^半/.test(m[0].trim());
      const mins = isHalfHour ? 30 : (prefix ? cnToInt(prefix) : 1) * 90;
      res.relativeMs = (Number.isFinite(mins) ? mins : 90) * 60000;
      res.matched = m[0];
      return { text: blank(t, m), time: res };
    }

    // 单个时间
    m = clockRegex(false).exec(t);
    if (m) {
      const parsed = parseClock(m[2], m[3], m[1] || periodHint);
      if (parsed) {
        res.time = parsed;
        res.matched = m[0];
        res.addDay = !!parsed.addDay;
        return { text: blank(t, m), time: res };
      }
    }

    // 只有时段：下午 / 晚上
    m = new RegExp(PERIOD).exec(t);
    if (m) {
      const defaults = {
        凌晨: 5,
        早上: 6,
        早晨: 6,
        上午: 9,
        中午: 12,
        下午: 15,
        傍晚: 18,
        晚上: 20,
        夜里: 21,
        夜间: 21,
      };
      res.time = { h: defaults[m[1]], m: 0, addDay: false };
      res.periodOnly = true;
      res.matched = m[1];
      return { text: blank(t, m), time: res };
    }

    return { text: t, time: res };
  }

  function cleanupTitle(text) {
    let t = cleanSpaces(text);
    t = t.replace(/^[\s,，。;；:：、·•\-—~～]+/, '');
    t = t.replace(/^(?:从)\s*/, '');
    t = t.replace(/截止(?:时间|日期)?/g, ' ');
    t = t.replace(/\s*(?:进度)\s*$/g, ' ');
    t = t.replace(/^(?:在|于)(?=\s)/, ' ');
    let guard = 0;
    const lead =
      /^(?:请|麻烦|帮我|帮忙|提醒我|记得|别忘了|不要忘了|我要|我需要|我想|需要|要|安排|添加|加个|新增|创建|新建|记一下|记下)(?:一下)?\s*/;
    while (lead.test(t) && guard < 6) {
      t = t.replace(lead, '');
      guard++;
    }
    t = t.replace(/^(?:前|之前|以前)\s*/, '');
    t = t.replace(/(?:之前|以前)\s*$/, '');
    t = t.replace(/(?:截止时间|截止日期|截止|ddl|DDL|due|deadline)\s*$/i, '');
    t = t.replace(/\s*(?:开始)\s*$/, '');
    t = t.replace(/[，,。；;：:\s]+$/, '');
    t = t.replace(/(?:吧|呀|哦|啊|呢|哈|啦)+$/, '');
    t = cleanSpaces(t);
    return t;
  }

  function extractLongterm(text) {
    const explicit = /长期/.test(text);
    const strong =
      /(毕业设计|毕设|项目|课程设计|课题|作品集|大作业|备考|考研|复习计划|论文|自学|读完|学完|坚持)/.exec(text);
    const progress = /(进度|阶段|里程碑|计划|目标|坚持|自学|读完|学完)/.test(text);
    return {
      word: explicit ? '长期' : strong ? strong[0] : progress ? '计划' : '',
      explicit: explicit,
      strong: !!strong,
      progress: progress,
    };
  }

  function describeDate(date, hasTime) {
    const d = new Date(date);
    const label = U.formatDateWithWeek(d, new Date());
    return label + (hasTime ? ' ' + U.formatTime(d) : '');
  }

  /**
   * 主解析入口。
   * @param {string} input 用户原话
   * @param {Date} [now] 参考时间，便于测试
   */
  function parse(input, now) {
    const ref = now ? new Date(now) : new Date();
    const raw = String(input == null ? '' : input).trim();
    const warnings = [];
    const matches = [];
    const tags = [];
    let text = raw;

    if (!raw) {
      return {
        raw: '',
        title: '',
        type: 'normal',
        priority: 'medium',
        dueAt: null,
        hasTime: false,
        startAt: null,
        recurrence: null,
        tags: [],
        matches: [],
        warnings: ['还没有输入内容'],
        confidence: 0,
        parsedAt: new Date().toISOString(),
      };
    }

    text = extractTags(text, tags);
    if (tags.length) {
      tags.slice(0, 6).forEach(function (tag) {
        matches.push({ field: 'tags', text: '#' + tag, label: '标签 · ' + tag });
      });
    }

    const pr = { priority: 'medium', priorityText: '' };
    text = extractPriority(text, pr);
    if (pr.priority !== 'medium') {
      matches.push({
        field: 'priority',
        text: pr.priorityText,
        label: '优先级 · ' + (pr.priority === 'high' ? '高' : '低'),
      });
    }

    const recResult = extractRecurrence(text);
    text = recResult.text;
    let recurrence = recResult.rec;

    const dtResult = extractDate(text, ref);
    text = dtResult.text;
    const dateInfo = dtResult.date;
    if (dateInfo.note) warnings.push(dateInfo.note);

    const timeResult = extractTime(text, ref, dateInfo);
    text = timeResult.text;
    const ti = timeResult.time;

    const longterm = extractLongterm(raw);
    if (longterm.explicit) {
      text = text.replace(/长期(?:任务|项目)?/g, ' ');
    }

    let dueAt = null;
    let startAt = null;
    let hasTime = false;
    let type = 'normal';

    if (recurrence) {
      if (ti && ti.time) {
        recurrence.time = U.pad(ti.time.h) + ':' + U.pad(ti.time.m);
        hasTime = true;
      } else {
        recurrence.time = '20:00';
        hasTime = true;
        warnings.push('没有识别到具体时间，定期任务默认按 20:00 提醒');
      }
      let anchor = dateInfo.date ? new Date(dateInfo.date) : new Date(ref);
      // 用于周期的锚点：优先用户给出的日期，其次当前时间
      recurrence.anchor = anchor.toISOString();
      dueAt = U.nextOccurrence(recurrence, new Date(ref.getTime() - 1000), anchor);
      if (!dueAt) {
        warnings.push('重复规则暂时无法计算下一次时间，请手动确认');
        recurrence = null;
      } else {
        type = 'recurring';
        matches.push({
          field: 'recurrence',
          text: recResult.matched,
          label: '重复 · ' + U.describeRecurrence(recurrence),
        });
      }
    } else {
      if (ti && ti.relativeMs != null) {
        dueAt = new Date(ref.getTime() + ti.relativeMs);
        hasTime = true;
      } else if (ti && ti.time) {
        const base = dateInfo.date ? new Date(dateInfo.date) : U.startOfDay(ref);
        const candidate = U.atTime(base, ti.time.h, ti.time.m);
        if (ti.time.addDay) candidate.setDate(candidate.getDate() + 1);
        dueAt = candidate;
        hasTime = true;
        if (!dateInfo.date && dueAt.getTime() <= ref.getTime() + 30000) {
          dueAt = U.addDays(dueAt, 1);
          warnings.push('这个时间今天已经过了，已顺延到明天同一时间');
        }
        if (ti.range && ti.start) {
          const dueDay = U.startOfDay(dueAt);
          const dayDiff = Math.round((dueDay.getTime() - U.startOfDay(base).getTime()) / 86400000);
          let s = U.atTime(base, ti.start.h, ti.start.m);
          if (ti.start.addDay) s = U.addDays(s, 1);
          s = U.addDays(s, dayDiff);
          while (s.getTime() >= dueAt.getTime()) s = U.addDays(s, -1);
          startAt = s;
        }
      } else if (dateInfo.date) {
        const defaultTime = dateInfo.defaultTime || '23:59';
        const parts = defaultTime.split(':').map(Number);
        dueAt = U.atTime(dateInfo.date, parts[0], parts[1]);
        hasTime = !!dateInfo.defaultTime;
      }

      if (dueAt) {
        let rolled = false;
        if (
          !recurrence &&
          dateInfo.weekdayImplicit &&
          U.sameDay(dueAt, ref) &&
          dueAt.getTime() <= ref.getTime() + 30000
        ) {
          dueAt = U.addDays(dueAt, 7);
          if (startAt) startAt = U.addDays(startAt, 7);
          rolled = true;
          warnings.push('本周这个时间已经过了，已排到下个星期同一时间');
        }
        if (!rolled && dateInfo.explicit && dueAt.getTime() < ref.getTime() - 60000) {
          warnings.push('这个时间已经过去，任务会立即显示为逾期');
        }
      }

      if (longterm.explicit) {
        type = 'longterm';
      } else if (longterm.strong || longterm.progress) {
        const farEnough = dueAt ? dueAt.getTime() - ref.getTime() > 7 * U.DAY : true;
        if (longterm.progress || farEnough) type = 'longterm';
      }
      if (type === 'normal' && dueAt) type = 'deadline';
      if (dueAt && type !== 'longterm') type = 'deadline';
      if (type === 'longterm' && longterm.word) {
        matches.push({ field: 'type', text: longterm.word, label: '长期任务 · 关键词“' + longterm.word + '”' });
      }
    }

    if (dueAt) {
      matches.push({
        field: 'due',
        text: dateInfo.matched || timeResult.matched || '',
        label:
          (type === 'longterm' ? '目标日 · ' : '时间 · ') +
          describeDate(dueAt, hasTime) +
          (hasTime ? '' : '（当天截止）'),
      });
    }
    if (startAt) {
      matches.push({ field: 'start', text: '', label: '开始 · ' + U.formatTime(startAt) });
    }

    let title = cleanupTitle(text);
    if (!title || title.length < 1) {
      title = '未命名任务';
      warnings.push('没有提取到明确标题，可以手动修改');
    }
    if (title.length > 120) title = title.slice(0, 120);

    if (recurrence) {
      matches.push({ field: 'type', text: '', label: '类型 · 定期任务' });
    } else if (type === 'longterm') {
      matches.push({ field: 'type', text: '', label: '类型 · 长期任务' });
    } else if (type === 'deadline') {
      matches.push({ field: 'type', text: '', label: '类型 · 限时任务' });
    } else {
      matches.push({ field: 'type', text: '', label: '类型 · 普通任务' });
    }

    let confidence = 0.42;
    if (title !== '未命名任务') confidence += 0.18;
    if (dueAt) confidence += 0.16;
    if (recurrence) confidence += 0.1;
    if (pr.priority !== 'medium') confidence += 0.05;
    if (tags.length) confidence += 0.04;
    confidence -= warnings.length * 0.06;
    confidence = Math.max(0.28, Math.min(0.97, confidence));

    return {
      raw: raw,
      title: title,
      type: recurrence ? 'recurring' : type,
      priority: pr.priority,
      dueAt: dueAt ? dueAt.toISOString() : null,
      hasTime: !!hasTime,
      startAt: startAt ? startAt.toISOString() : null,
      recurrence: recurrence,
      tags: tags.slice(0, 6),
      matches: matches,
      warnings: warnings,
      confidence: Math.round(confidence * 100) / 100,
      parsedAt: new Date().toISOString(),
    };
  }

  BB.parser = {
    parse: parse,
    cnToInt: cnToInt,
    _internal: {
      cleanupTitle: cleanupTitle,
      parseClock: parseClock,
      extractRecurrence: extractRecurrence,
    },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = BB.parser;
})(typeof globalThis !== 'undefined' ? globalThis : this);
