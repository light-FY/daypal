/* 伴办 · 本地数据层（localStorage，单用户，离线可用） */
(function (global) {
  'use strict';
  const BB = (global.BB = global.BB || {});
  const U = BB.util;
  const KEY = 'banban.state.v1';
  const SCHEMA = 1;
  const TYPES = ['deadline', 'recurring', 'longterm', 'normal'];
  const PRIORITIES = ['high', 'medium', 'low'];

  function iso(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }

  function defaultSettings() {
    return {
      weekStart: 1,
      reminders: {
        h24: true,
        h3: true,
        m30: true,
        overdueRepeatMin: 10,
      },
      digest: false,
      digestTime: '08:00',
      reduceMotion: false,
      notificationsAsked: false,
      defaultTime: '20:00',
    };
  }

  function defaultMeta() {
    return {
      createdAt: new Date().toISOString(),
      seeded: false,
      digestDate: '',
      demoBannerDismissed: false,
    };
  }

  function normalizeMilestone(raw, now) {
    if (!raw || typeof raw !== 'object') return null;
    const title = String(raw.title || '').trim().slice(0, 80);
    if (!title) return null;
    return {
      id: raw.id || U.uid('ms'),
      title: title,
      dueAt: iso(raw.dueAt),
      done: !!raw.done,
      doneAt: iso(raw.doneAt),
    };
  }

  function normalizeRecurrence(raw) {
    if (!raw || !raw.freq) return null;
    const freq = ['daily', 'weekly', 'monthly', 'yearly'].indexOf(raw.freq) > -1 ? raw.freq : 'daily';
    const interval = U.clamp(Number(raw.interval) || 1, 1, 365);
    const weekdays = Array.isArray(raw.weekdays)
      ? raw.weekdays
          .map(Number)
          .filter(function (d) {
            return d >= 0 && d <= 6;
          })
          .filter(function (d, i, arr) {
            return arr.indexOf(d) === i;
          })
          .sort()
      : [];
    const time = /^\d{2}:\d{2}$/.test(String(raw.time || '')) ? String(raw.time) : '20:00';
    const monthDay = raw.monthDay ? U.clamp(Number(raw.monthDay), 1, 31) : null;
    const month = raw.month ? U.clamp(Number(raw.month), 1, 12) : null;
    return {
      freq: freq,
      interval: interval,
      weekdays: weekdays,
      monthDay: monthDay,
      month: month,
      time: time,
      anchor: iso(raw.anchor) || null,
    };
  }

  function computedProgress(task) {
    if (!task) return 0;
    if (task.status === 'done') return 100;
    const ms = Array.isArray(task.milestones) ? task.milestones : [];
    if (ms.length) {
      return Math.round((ms.filter(function (x) {
        return x.done;
      }).length /
        ms.length) *
        100);
    }
    return U.clamp(Number(task.progress) || 0, 0, 100);
  }

  function normalizeTask(raw, now) {
    if (!raw || typeof raw !== 'object') return null;
    const ref = now ? new Date(now) : new Date();
    let type = TYPES.indexOf(raw.type) > -1 ? raw.type : 'normal';
    const recurrence = normalizeRecurrence(raw.recurrence);
    if (recurrence) type = 'recurring';
    const dueAt = iso(raw.dueAt);
    const startAt = iso(raw.startAt);
    const status = raw.status === 'done' ? 'done' : 'active';
    const milestones = Array.isArray(raw.milestones)
      ? raw.milestones.map(function (m) {
          return normalizeMilestone(m, ref);
        }).filter(Boolean)
      : [];
    const tags = Array.isArray(raw.tags)
      ? raw.tags
          .map(function (t) {
            return String(t).replace(/^#/, '').trim().slice(0, 16);
          })
          .filter(Boolean)
          .filter(function (t, i, arr) {
            return arr.indexOf(t) === i;
          })
          .slice(0, 8)
      : [];
    let task = {
      id: raw.id || U.uid('task'),
      title: String(raw.title || '未命名任务').trim().slice(0, 120) || '未命名任务',
      notes: String(raw.notes || '').slice(0, 2000),
      type: type,
      status: status,
      priority: PRIORITIES.indexOf(raw.priority) > -1 ? raw.priority : 'medium',
      dueAt: dueAt,
      hasTime: !!raw.hasTime,
      startAt: startAt,
      recurrence: recurrence,
      seriesId: raw.seriesId || (recurrence ? U.uid('series') : null),
      occurrenceIndex: Number(raw.occurrenceIndex) || 0,
      progress: U.clamp(Number(raw.progress) || 0, 0, 100),
      milestones: milestones,
      tags: tags,
      sourceText: String(raw.sourceText || '').slice(0, 500),
      parseMeta: raw.parseMeta && typeof raw.parseMeta === 'object' ? raw.parseMeta : null,
      remindersSent: raw.remindersSent && typeof raw.remindersSent === 'object' ? raw.remindersSent : {},
      nextTaskId: raw.nextTaskId || null,
      demo: !!raw.demo,
      createdAt: iso(raw.createdAt) || ref.toISOString(),
      updatedAt: iso(raw.updatedAt) || ref.toISOString(),
      completedAt: iso(raw.completedAt),
    };
    if (task.type === 'recurring' && !task.recurrence) {
      task.recurrence = normalizeRecurrence({ freq: 'daily', interval: 1, time: '20:00' });
      task.seriesId = task.seriesId || U.uid('series');
    }
    if (task.type === 'recurring') {
      if (!task.recurrence.anchor) {
        task.recurrence.anchor = task.dueAt || ref.toISOString();
      }
      if (!task.dueAt) {
        const next = U.nextOccurrence(task.recurrence, new Date(ref.getTime() - 1000), new Date(task.recurrence.anchor));
        task.dueAt = next ? next.toISOString() : null;
      }
    }
    if (task.type !== 'longterm') {
      task.progress = task.milestones.length ? computedProgress(task) : task.progress;
    } else {
      task.progress = computedProgress(task);
      if (task.status === 'done') task.progress = 100;
    }
    if (task.status === 'done' && !task.completedAt) task.completedAt = ref.toISOString();
    return task;
  }

  function createTask(draft, now) {
    return normalizeTask(
      Object.assign({}, draft, {
        id: draft.id || U.uid('task'),
        createdAt: draft.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      now
    );
  }

  function mergeSettings(raw) {
    const defaults = defaultSettings();
    if (!raw || typeof raw !== 'object') return defaults;
    const out = Object.assign({}, defaults, raw);
    out.weekStart = raw.weekStart === 0 ? 0 : 1;
    out.reminders = Object.assign({}, defaults.reminders, raw.reminders || {});
    out.reminders.h24 = raw.reminders && raw.reminders.h24 != null ? !!raw.reminders.h24 : defaults.reminders.h24;
    out.reminders.h3 = raw.reminders && raw.reminders.h3 != null ? !!raw.reminders.h3 : defaults.reminders.h3;
    out.reminders.m30 = raw.reminders && raw.reminders.m30 != null ? !!raw.reminders.m30 : defaults.reminders.m30;
    const rep = Number(raw.reminders?.overdueRepeatMin);
    out.reminders.overdueRepeatMin = [5, 10, 30, 60].indexOf(rep) > -1 ? rep : defaults.reminders.overdueRepeatMin;
    out.digest = !!raw.digest;
    out.digestTime = /^\d{2}:\d{2}$/.test(String(raw.digestTime || '')) ? raw.digestTime : defaults.digestTime;
    out.reduceMotion = !!raw.reduceMotion;
    out.notificationsAsked = !!raw.notificationsAsked;
    return out;
  }

  function seedTasks(now) {
    const ref = new Date(now);
    const today = U.startOfDay(ref);
    const dueToday = U.atTime(today, 23, 0);
    const dueSoon = U.atTime(today, Math.min(23, Math.max(ref.getHours() + 3, 20)), 30);
    const tomorrow = U.addDays(today, 1);
    const recFirst = U.nextOccurrence(
      { freq: 'daily', interval: 1, time: '07:30' },
      ref,
      ref
    );
    const longDue = U.atTime(U.addDays(today, 30), 23, 59);
    const ms1 = U.addDays(today, 2);
    const ms2 = U.addDays(today, 9);
    const ms3 = U.addDays(today, 20);

    const raws = [
      {
        title: '高数第三章作业',
        notes: 'P78 习题 3.1–3.18，写完拍照上传学习通。',
        type: 'deadline',
        priority: 'high',
        dueAt: dueToday.toISOString(),
        hasTime: true,
        tags: ['课程', '作业'],
        sourceText: '今天 23 点前交高数第三章作业 #作业 紧急',
        demo: true,
      },
      {
        title: '给导师发选题邮件',
        notes: '附上三个备选方向和一页调研。',
        type: 'deadline',
        priority: 'high',
        dueAt: dueSoon.toISOString(),
        hasTime: true,
        tags: ['毕设'],
        sourceText: '今晚给导师发选题邮件 重要',
        demo: true,
      },
      {
        title: '小组汇报 PPT 收尾',
        notes: '把第 4 部分的数据图换成新版，约组员过一遍。',
        type: 'deadline',
        priority: 'medium',
        dueAt: U.atTime(tomorrow, 14, 0).toISOString(),
        hasTime: true,
        tags: ['课程', '小组'],
        sourceText: '明天下午两点小组汇报 PPT 收尾 #小组',
        demo: true,
      },
      {
        title: '背 50 个单词',
        notes: '用词根表过一遍，错的记进生词本。',
        type: 'recurring',
        priority: 'medium',
        dueAt: recFirst.toISOString(),
        hasTime: true,
        recurrence: {
          freq: 'daily',
          interval: 1,
          weekdays: [],
          monthDay: null,
          month: null,
          time: '07:30',
          anchor: recFirst.toISOString(),
        },
        tags: ['英语'],
        sourceText: '每天早上七点半背 50 个单词 #英语',
        demo: true,
      },
      {
        title: '毕业设计开题报告',
        notes: '先完成文献综述，再和导师确认框架。',
        type: 'longterm',
        priority: 'high',
        dueAt: longDue.toISOString(),
        hasTime: false,
        tags: ['毕设'],
        progress: 25,
        milestones: [
          { id: U.uid('ms'), title: '选题与资料收集', dueAt: U.atTime(today, 20, 0).toISOString(), done: true, doneAt: new Date(ref.getTime() - 3600000).toISOString() },
          { id: U.uid('ms'), title: '文献综述', dueAt: U.atTime(ms1, 20, 0).toISOString(), done: false },
          { id: U.uid('ms'), title: '开题报告初稿', dueAt: U.atTime(ms2, 20, 0).toISOString(), done: false },
          { id: U.uid('ms'), title: '定稿并提交', dueAt: U.atTime(ms3, 20, 0).toISOString(), done: false },
        ],
        sourceText: '毕业设计开题报告，长期任务，12月20日截止',
        demo: true,
      },
      {
        title: '去图书馆还书',
        notes: '两本《传播学概论》，逾期前还掉。',
        type: 'normal',
        priority: 'low',
        tags: ['生活'],
        sourceText: '有空去图书馆还书',
        demo: true,
      },
      {
        title: '买咖啡豆',
        notes: '',
        type: 'normal',
        priority: 'low',
        tags: ['生活'],
        sourceText: '买咖啡豆',
        demo: true,
      },
      {
        title: '英语听力打卡',
        notes: '',
        type: 'normal',
        priority: 'medium',
        status: 'done',
        dueAt: U.atTime(U.addDays(today, -1), 21, 0).toISOString(),
        hasTime: true,
        tags: ['英语'],
        completedAt: U.atTime(U.addDays(today, -1), 21, 20).toISOString(),
        sourceText: '昨晚英语听力打卡',
        demo: true,
      },
    ];
    return raws.map(function (r) {
      return normalizeTask(r, now);
    });
  }

  function initialState(now) {
    const ref = now ? new Date(now) : new Date();
    const state = {
      version: SCHEMA,
      tasks: seedTasks(ref),
      settings: defaultSettings(),
      meta: defaultMeta(),
    };
    state.meta.seeded = true;
    return state;
  }

  function migrate(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const state = {
      version: SCHEMA,
      tasks: Array.isArray(raw.tasks)
        ? raw.tasks.map(function (t) {
            return normalizeTask(t);
          }).filter(Boolean)
        : [],
      settings: mergeSettings(raw.settings),
      meta: Object.assign(defaultMeta(), raw.meta || {}),
    };
    if (!raw.meta || !raw.meta.seeded) state.meta.seeded = true;
    return state;
  }

  function load() {
    if (typeof localStorage === 'undefined') return initialState();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        const state = initialState();
        save(state);
        return state;
      }
      const parsed = JSON.parse(raw);
      const state = migrate(parsed);
      if (!state) throw new Error('invalid state');
      return state;
    } catch (e) {
      // 数据损坏时保留一份可导出的备份，然后回到示例数据
      try {
        const broken = localStorage.getItem(KEY);
        if (broken) localStorage.setItem(KEY + '.broken', broken);
      } catch (err) {
        /* ignore */
      }
      const state = initialState();
      save(state);
      return state;
    }
  }

  function save(state) {
    if (typeof localStorage === 'undefined') return { ok: false, error: '当前环境不支持本地存储' };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: '本地存储空间不足，建议先导出备份' };
    }
  }

  function getTask(state, id) {
    return state.tasks.filter(function (t) {
      return t.id === id;
    })[0] || null;
  }

  function addOrUpdate(state, task) {
    const t = normalizeTask(task);
    if (!t) return null;
    const idx = state.tasks.findIndex(function (x) {
      return x.id === t.id;
    });
    if (idx > -1) state.tasks[idx] = t;
    else state.tasks.push(t);
    return t;
  }

  function stats(state, now) {
    const ref = now ? new Date(now) : new Date();
    const active = state.tasks.filter(function (t) {
      return t.status === 'active';
    });
    const overdue = active.filter(function (t) {
      return t.dueAt && new Date(t.dueAt).getTime() < ref.getTime();
    });
    const today = active.filter(function (t) {
      return t.dueAt && U.sameDay(t.dueAt, ref);
    });
    const completedToday = state.tasks.filter(function (t) {
      return t.status === 'done' && t.completedAt && U.sameDay(t.completedAt, ref);
    });
    const longterm = active.filter(function (t) {
      return t.type === 'longterm';
    });
    const recurring = active.filter(function (t) {
      return t.type === 'recurring';
    });
    return {
      active: active.length,
      overdue: overdue.length,
      today: today.length,
      completedToday: completedToday.length,
      longterm: longterm.length,
      recurring: recurring.length,
    };
  }

  function completeTask(state, id, now) {
    const ref = now ? new Date(now) : new Date();
    const task = getTask(state, id);
    if (!task || task.status === 'done') return { task: task, next: null, changed: false };
    task.status = 'done';
    task.completedAt = ref.toISOString();
    task.updatedAt = ref.toISOString();
    if (task.type === 'longterm') {
      task.progress = 100;
      (task.milestones || []).forEach(function (m) {
        if (!m.done) {
          m.done = true;
          m.doneAt = ref.toISOString();
        }
      });
    }
    let next = null;
    if (task.recurrence) {
      const afterBase = task.dueAt && new Date(task.dueAt).getTime() > ref.getTime() - 60000
        ? new Date(task.dueAt)
        : new Date(ref.getTime() - 60000);
      const anchor = task.recurrence.anchor ? new Date(task.recurrence.anchor) : afterBase;
      const nextDue = U.nextOccurrence(task.recurrence, afterBase, anchor);
      if (nextDue) {
        next = normalizeTask(
          Object.assign({}, task, {
            id: U.uid('task'),
            status: 'active',
            dueAt: nextDue.toISOString(),
            startAt: null,
            completedAt: null,
            createdAt: ref.toISOString(),
            updatedAt: ref.toISOString(),
            remindersSent: {},
            nextTaskId: null,
            occurrenceIndex: (task.occurrenceIndex || 0) + 1,
            seriesId: task.seriesId || U.uid('series'),
            demo: false,
          }),
          ref
        );
        task.nextTaskId = next.id;
        state.tasks.push(next);
      }
    }
    return { task: task, next: next, changed: true };
  }

  function reopenTask(state, id, now) {
    const ref = now ? new Date(now) : new Date();
    const task = getTask(state, id);
    if (!task || task.status !== 'done') return { task: task, removedNext: null, changed: false };
    let removed = null;
    if (task.nextTaskId) {
      const nextId = task.nextTaskId;
      const idx = state.tasks.findIndex(function (t) {
        return t.id === nextId && t.status === 'active';
      });
      if (idx > -1) {
        removed = state.tasks[idx];
        state.tasks.splice(idx, 1);
      }
      task.nextTaskId = null;
    }
    task.status = 'active';
    task.completedAt = null;
    task.updatedAt = ref.toISOString();
    if (task.type === 'longterm') {
      if (task.milestones && task.milestones.length) {
        const lastDone = task.milestones
          .slice()
          .reverse()
          .filter(function (m) {
            return m.done;
          })[0];
        if (lastDone) {
          lastDone.done = false;
          lastDone.doneAt = null;
        }
        task.progress = computedProgress(task);
      } else if (task.progress >= 100) {
        task.progress = 90;
      }
    }
    return { task: task, removedNext: removed, changed: true };
  }

  function removeTask(state, id) {
    const idx = state.tasks.findIndex(function (t) {
      return t.id === id;
    });
    if (idx < 0) return null;
    const [task] = state.tasks.splice(idx, 1);
    return task;
  }

  function exportData(state) {
    return JSON.stringify(
      {
        app: '伴办',
        schema: SCHEMA,
        exportedAt: new Date().toISOString(),
        tasks: state.tasks,
        settings: state.settings,
      },
      null,
      2
    );
  }

  function importData(text, now) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: '文件不是有效的 JSON' };
    }
    if (!data || !Array.isArray(data.tasks)) {
      return { ok: false, error: '没有找到任务数据，请使用伴办导出的备份文件' };
    }
    const tasks = data.tasks.map(function (t) {
      return normalizeTask(t, now);
    }).filter(Boolean);
    if (!tasks.length && data.tasks.length) {
      return { ok: false, error: '备份里的任务格式无法识别' };
    }
    return {
      ok: true,
      tasks: tasks,
      settings: mergeSettings(data.settings),
    };
  }

  function resetDemo(state, now) {
    state.tasks = state.tasks.filter(function (t) {
      return !t.demo;
    });
    const seeded = seedTasks(now);
    state.tasks = seeded.concat(state.tasks);
    state.meta.demoBannerDismissed = false;
  }

  BB.store = {
    KEY: KEY,
    SCHEMA: SCHEMA,
    TYPES: TYPES,
    PRIORITIES: PRIORITIES,
    load: load,
    save: save,
    initialState: initialState,
    defaultSettings: defaultSettings,
    defaultMeta: defaultMeta,
    normalizeTask: normalizeTask,
    normalizeMilestone: normalizeMilestone,
    normalizeRecurrence: normalizeRecurrence,
    createTask: createTask,
    getTask: getTask,
    addOrUpdate: addOrUpdate,
    stats: stats,
    completeTask: completeTask,
    reopenTask: reopenTask,
    removeTask: removeTask,
    computedProgress: computedProgress,
    exportData: exportData,
    importData: importData,
    mergeSettings: mergeSettings,
    seedTasks: seedTasks,
    resetDemo: resetDemo,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = BB.store;
})(typeof globalThis !== 'undefined' ? globalThis : this);
