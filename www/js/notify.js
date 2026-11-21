/* 伴办 · 提醒计划与系统通知
 * 说明：Web 端提醒在页面/已安装 PWA 存活时由前台定时器检查；
 * 浏览器完全退出后无法保证本地定时通知，详见 docs/技术方案。
 */
(function (global) {
  'use strict';
  const BB = (global.BB = global.BB || {});
  const U = BB.util;
  const TYPE_LABEL = {
    deadline: '限时任务',
    recurring: '定期任务',
    longterm: '长期任务',
    normal: '普通任务',
  };
  let swReg = null;

  function isSupported() {
    return typeof global.Notification !== 'undefined';
  }

  function permission() {
    if (!isSupported()) return 'unsupported';
    return global.Notification.permission;
  }

  function isSecureContext() {
    if (typeof location === 'undefined') return false;
    return location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  }

  async function requestPermission() {
    if (!isSupported()) return 'unsupported';
    if (global.Notification.permission === 'granted') return 'granted';
    if (global.Notification.permission === 'denied') return 'denied';
    try {
      return await global.Notification.requestPermission();
    } catch (e) {
      return 'denied';
    }
  }

  async function registerSW() {
    if (!('serviceWorker' in navigator) || !isSecureContext()) return null;
    try {
      swReg = await navigator.serviceWorker.register('./sw.js');
      return swReg;
    } catch (e) {
      return null;
    }
  }

  function whenLabel(d) {
    return U.formatDateTime(d, true, new Date());
  }

  function leadEvent(task, kind, due, now) {
    const remain = new Date(due).getTime() - now.getTime();
    const key = 'lead:' + kind + ':' + new Date(due).toISOString();
    const remainText = U.formatRemaining(Math.max(0, remain), 'short');
    return {
      key: key,
      taskId: task.id,
      kind: 'lead',
      ledgerKey: key,
      severity: remain <= 30 * 60000 ? 'urgent' : 'normal',
      title: '还剩 ' + remainText + ' · ' + task.title,
      body: '截止 ' + whenLabel(due) + ' · ' + (TYPE_LABEL[task.type] || '任务'),
      tag: 'banban-' + task.id,
      requireInteraction: remain <= 30 * 60000,
      url: './index.html#/task/' + task.id,
      type: task.type,
    };
  }

  function overdueEvent(task, due, now, repeatMin) {
    const late = now.getTime() - new Date(due).getTime();
    const bucket = Math.floor(late / (Math.max(5, repeatMin) * 60000));
    const key = 'overdue:' + new Date(due).toISOString() + ':' + bucket;
    return {
      key: key,
      taskId: task.id,
      kind: 'overdue',
      ledgerKey: key,
      severity: 'overdue',
      title: '已逾期 ' + U.formatOverdue(late) + ' · ' + task.title,
      body: '原定 ' + whenLabel(due) + ' 截止。先处理它，或把时间改到一个能完成的点。',
      tag: 'banban-overdue-' + task.id,
      requireInteraction: true,
      url: './index.html#/task/' + task.id,
      type: task.type,
    };
  }

  function milestoneEvent(task, milestone, now, atDue) {
    const due = new Date(milestone.dueAt);
    const key = (atDue ? 'ms-now:' : 'ms-24h:') + milestone.id + ':' + due.toISOString();
    let body;
    if (atDue) {
      const late = now.getTime() - due.getTime();
      body = late > 60000 ? '阶段“' + milestone.title + '”已超时 ' + U.formatOverdue(late) : '阶段“' + milestone.title + '”今天到期';
    } else {
      body = '阶段“' + milestone.title + '”将在 ' + whenLabel(due) + ' 到期';
    }
    return {
      key: key,
      taskId: task.id,
      kind: atDue ? 'milestone-due' : 'milestone-soon',
      ledgerKey: key,
      severity: atDue ? 'urgent' : 'normal',
      title: '阶段提醒 · ' + task.title,
      body: body + ' · 当前进度 ' + BB.store.computedProgress(task) + '%',
      tag: 'banban-ms-' + task.id + '-' + milestone.id,
      requireInteraction: false,
      url: './index.html#/task/' + task.id,
      type: 'longterm',
    };
  }

  function isSent(task, key) {
    return !!(task.remindersSent && task.remindersSent[key]);
  }

  /**
   * 计算此刻应触发的提醒。每个任务一次最多返回一条，避免叠加轰炸。
   */
  function collect(tasks, settings, now) {
    const ref = now ? new Date(now) : new Date();
    const reminders = (settings && settings.reminders) || {};
    const repeatMin = reminders.overdueRepeatMin || 10;
    const events = [];
    (tasks || []).forEach(function (task) {
      if (!task || task.status !== 'active') return;
      const dueAt = task.dueAt ? new Date(task.dueAt) : null;
      if (dueAt) {
        const remain = dueAt.getTime() - ref.getTime();
        if (remain <= 0) {
          const evt = overdueEvent(task, dueAt, ref, repeatMin);
          if (!isSent(task, evt.key)) events.push(evt);
          return;
        }
        // 长期任务优先提醒阶段
        if (task.type === 'longterm' && Array.isArray(task.milestones)) {
          const ms = task.milestones
            .filter(function (m) {
              return m && !m.done && m.dueAt;
            })
            .sort(function (a, b) {
              return new Date(a.dueAt) - new Date(b.dueAt);
            })[0];
          if (ms) {
            const msRemain = new Date(ms.dueAt).getTime() - ref.getTime();
            if (msRemain <= 0) {
              const evt = milestoneEvent(task, ms, ref, true);
              if (!isSent(task, evt.key)) {
                events.push(evt);
                return;
              }
            } else if (msRemain <= 24 * 3600000) {
              const evt = milestoneEvent(task, ms, ref, false);
              if (!isSent(task, evt.key)) {
                events.push(evt);
                return;
              }
            }
          }
        }
        // 限时/定期/长期的目标日提醒
        var thresholds = [];
        if (reminders.m30 && remain <= 30 * 60000) thresholds.push(['m30', 30 * 60000]);
        if (reminders.h3 && remain <= 3 * 3600000) thresholds.push(['h3', 3 * 3600000]);
        if (reminders.h24 && remain <= 24 * 3600000) thresholds.push(['h24', 24 * 3600000]);
        for (let i = 0; i < thresholds.length; i++) {
          const evt = leadEvent(task, thresholds[i][0], dueAt, ref);
          if (!isSent(task, evt.key)) {
            events.push(evt);
          }
          // 只取当前最紧迫的一档；更早的档不再补发，避免一次弹多条。
          return;
        }
      }
      // 没有目标日，但仍可提醒长期任务的阶段
      if (task.type === 'longterm' && Array.isArray(task.milestones)) {
        const ms = task.milestones
          .filter(function (m) {
            return m && !m.done && m.dueAt;
          })
          .sort(function (a, b) {
            return new Date(a.dueAt) - new Date(b.dueAt);
          })[0];
        if (!ms) return;
        const msRemain = new Date(ms.dueAt).getTime() - ref.getTime();
        if (msRemain <= 0) {
          const evt = milestoneEvent(task, ms, ref, true);
          if (!isSent(task, evt.key)) events.push(evt);
        } else if (msRemain <= 24 * 3600000) {
          const evt = milestoneEvent(task, ms, ref, false);
          if (!isSent(task, evt.key)) events.push(evt);
        }
      }
    });
    return events;
  }

  function nextLeadFor(task, settings, now) {
    if (!task || !task.dueAt || task.status !== 'active') return null;
    const due = new Date(task.dueAt);
    if (due.getTime() <= now.getTime()) return null;
    const rem = (settings && settings.reminders) || {};
    const offsets = [];
    if (rem.m30) offsets.push(30 * 60000);
    if (rem.h3) offsets.push(3 * 3600000);
    if (rem.h24) offsets.push(24 * 3600000);
    const future = offsets
      .map(function (offset) {
        return new Date(due.getTime() - offset);
      })
      .filter(function (d) {
        return d.getTime() > now.getTime();
      })
      .sort(function (a, b) {
        return a - b;
      });
    return future[0] || null;
  }

  function digestEvent(tasks, settings, meta, now) {
    if (!settings || !settings.digest) return null;
    const ref = now ? new Date(now) : new Date();
    const [h, m] = String(settings.digestTime || '08:00').split(':').map(Number);
    const trigger = U.atTime(ref, h || 8, m || 0);
    if (ref.getTime() < trigger.getTime() || ref.getTime() - trigger.getTime() > 2 * 3600000) return null;
    const key = 'digest:' + U.dateKey(ref);
    if (meta && meta.digestDate === U.dateKey(ref)) return null;
    const active = (tasks || []).filter(function (t) {
      return t.status === 'active';
    });
    const overdue = active.filter(function (t) {
      return t.dueAt && new Date(t.dueAt).getTime() < ref.getTime();
    });
    const today = active.filter(function (t) {
      return t.dueAt && U.sameDay(t.dueAt, ref);
    });
    if (!today.length && !overdue.length) return null;
    return {
      key: key,
      kind: 'digest',
      ledgerKey: key,
      severity: 'normal',
      title: '伴办 · 今日简报',
      body:
        '今天有 ' +
        today.length +
        ' 件事' +
        (overdue.length ? '，其中 ' + overdue.length + ' 件已逾期' : '') +
        '。先从最要紧的一件开始。',
      tag: 'banban-digest',
      requireInteraction: false,
      url: './index.html#/today',
    };
  }

  async function sendSystem(event) {
    if (!isSupported() || global.Notification.permission !== 'granted') return false;
    const options = {
      body: event.body,
      icon: './assets/icons/icon-192.png',
      badge: './assets/icons/icon-192.png',
      tag: event.tag || 'banban',
      renotify: true,
      requireInteraction: !!event.requireInteraction,
      data: { url: event.url, taskId: event.taskId || null },
      vibrate: event.severity === 'overdue' ? [120, 60, 120, 60, 220] : [40],
    };
    try {
      if (swReg && swReg.showNotification) {
        await swReg.showNotification(event.title, options);
        return true;
      }
      if (typeof global.Notification === 'function') {
        const n = new global.Notification(event.title, options);
        n.onclick = function () {
          try {
            global.focus();
            if (event.url) location.hash = String(event.url).replace(/^.*#/, '#');
            n.close();
          } catch (e) {
            /* ignore */
          }
        };
        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  async function deliver(event, options) {
    const opts = options || {};
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const shouldSystem = permission() === 'granted' && (opts.forceSystem || hidden);
    let system = false;
    if (shouldSystem) system = await sendSystem(event);
    if (opts.onEvent) opts.onEvent(event, { system: system });
    return system;
  }

  function markSent(task, event, now) {
    if (!task) return;
    if (!task.remindersSent) task.remindersSent = {};
    task.remindersSent[event.ledgerKey || event.key] = (now ? new Date(now) : new Date()).toISOString();
    const keys = Object.keys(task.remindersSent);
    if (keys.length > 120) {
      keys
        .sort(function (a, b) {
          return new Date(task.remindersSent[a]) - new Date(task.remindersSent[b]);
        })
        .slice(0, keys.length - 80)
        .forEach(function (k) {
          delete task.remindersSent[k];
        });
    }
  }

  async function test() {
    let p = permission();
    if (p === 'default') p = await requestPermission();
    if (p !== 'granted') return { ok: false, permission: p };
    const ok = await sendSystem({
      title: '伴办 · 通知测试',
      body: '如果你看到这条消息，提醒已经准备好了。截止前 24 小时 / 3 小时 / 30 分钟会分级提醒你。',
      tag: 'banban-test',
      severity: 'normal',
      requireInteraction: false,
      url: './index.html#/settings',
    });
    return { ok: ok, permission: p };
  }

  BB.notify = {
    isSupported: isSupported,
    permission: permission,
    requestPermission: requestPermission,
    registerSW: registerSW,
    collect: collect,
    digestEvent: digestEvent,
    nextLeadFor: nextLeadFor,
    deliver: deliver,
    sendSystem: sendSystem,
    markSent: markSent,
    test: test,
    TYPE_LABEL: TYPE_LABEL,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = BB.notify;
})(typeof globalThis !== 'undefined' ? globalThis : this);
