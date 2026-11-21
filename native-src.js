/* 伴办 · Android 原生通知桥
 * 由 esbuild 打包进 www/js/native.js，在 Capacitor WebView 中运行。
 * Web/PWA 版本不受影响。
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

if (Capacitor.isNativePlatform()) {
  const BB = window.BB;
  const U = BB && BB.util;
  const Store = BB && BB.store;

  const STATE_KEY = 'banban.state.v1';
  const SCHEDULED_KEY = 'banban.native.scheduled';
  const PERMISSION_KEY = 'banban.native.permission';
  const TEST_ID = 987654321;
  const MAX_NOTIFICATIONS = 180;
  const CHANNEL_REMINDER = 'banban-reminders';
  const CHANNEL_URGENT = 'banban-urgent';
  const platform = Capacitor.getPlatform();
  const isAndroid = platform === 'android';

  let nativePermission = localStorage.getItem(PERMISSION_KEY) || 'default';
  let exactAllowed = platform !== 'android';
  let scheduling = false;
  let pending = false;
  let scheduleTimer = null;

  const TYPE_LABEL = {
    deadline: '限时任务',
    recurring: '定期任务',
    longterm: '长期任务',
    normal: '普通任务',
  };

  function setPermission(value) {
    nativePermission = value === 'granted' ? 'granted' : value === 'denied' ? 'denied' : 'default';
    try {
      localStorage.setItem(PERMISSION_KEY, nativePermission);
    } catch (e) {
      /* ignore */
    }
  }

  function refreshUI() {
    window.dispatchEvent(new Event('banban:refresh'));
  }

  function readState() {
    try {
      return JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  function readScheduled() {
    try {
      const list = JSON.parse(localStorage.getItem(SCHEDULED_KEY) || '[]');
      return Array.isArray(list) ? list.filter((x) => x && Number.isFinite(x.id)) : [];
    } catch (e) {
      return [];
    }
  }

  function writeScheduled(list) {
    try {
      localStorage.setItem(
        SCHEDULED_KEY,
        JSON.stringify(
          list.map(function (n) {
            return { id: n.id, key: n.__key, at: n.schedule && n.schedule.at ? n.schedule.at.toISOString() : '' };
          })
        )
      );
    } catch (e) {
      /* ignore */
    }
  }

  function stableId(key) {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const id = (h >>> 0) % 2000000000;
    return id === 0 ? 1 : id;
  }

  function whenText(date) {
    if (!date) return '';
    return U.formatDateWithWeek(date, new Date()) + ' ' + U.formatTime(date);
  }

  function notificationBody(task, due) {
    return '截止 ' + whenText(due) + ' · ' + (TYPE_LABEL[task.type] || '任务');
  }

  function makeNotification(key, at, title, body, options) {
    const opt = options || {};
    return {
      __key: key,
      id: stableId(key),
      title: title,
      body: body,
      largeBody: opt.notes ? String(opt.notes).slice(0, 500) : undefined,
      schedule: {
        at: at,
        allowWhileIdle: true,
      },
      isExactNotification: exactAllowed,
      channelId: opt.urgent ? CHANNEL_URGENT : CHANNEL_REMINDER,
      sound: 'default',
      smallIcon: 'ic_stat_banban',
      iconColor: '#173F35',
      autoCancel: true,
      foreground: !!opt.headsUp,
      extra: {
        taskId: opt.taskId || null,
        url: opt.taskId ? '#/task/' + opt.taskId : '#/today',
      },
    };
  }

  function buildNotifications(state) {
    const now = Date.now();
    const settings = state.settings || {};
    const reminders = settings.reminders || {};
    const repeatMin = Math.max(5, Number(reminders.overdueRepeatMin) || 10);
    const repeatMs = repeatMin * 60000;
    const out = [];

    (state.tasks || []).forEach(function (task) {
      if (!task || task.status !== 'active') return;
      const due = task.dueAt ? new Date(task.dueAt) : null;
      if (due && Number.isFinite(due.getTime())) {
        const dueMs = due.getTime();
        const when = whenText(due);

        // 截止前 24h / 3h / 30min
        const leads = [];
        if (reminders.h24) leads.push([1440, '24 小时', false]);
        if (reminders.h3) leads.push([180, '3 小时', false]);
        if (reminders.m30) leads.push([30, '30 分钟', true]);
        leads.forEach(function (item) {
          const at = new Date(dueMs - item[0] * 60000);
          if (at.getTime() < now + 5000) return;
          out.push(
            makeNotification(
              'lead:' + item[0] + ':' + task.id + ':' + task.dueAt,
              at,
              '距离截止 ' + item[1] + ' · ' + task.title,
              notificationBody(task, due),
              {
                taskId: task.id,
                notes: task.notes,
                headsUp: item[2],
                urgent: false,
              }
            )
          );
        });

        // 逾期：到期时一条，之后按设置间隔重复 8 次
        if (dueMs > now - 7 * 86400000) {
          let start;
          if (dueMs > now) {
            start = dueMs;
          } else {
            const next = dueMs + Math.ceil((now - dueMs + 30000) / repeatMs) * repeatMs;
            start = Math.max(next, now + 30000);
          }
          for (let i = 0; i < 8; i++) {
            const at = new Date(start + i * repeatMs);
            if (at.getTime() < now + 5000) continue;
            out.push(
              makeNotification(
                'overdue:' + task.id + ':' + task.dueAt + ':' + i,
                at,
                '已逾期 · ' + task.title,
                '原定 ' + when + ' 截止，点开处理。',
                { taskId: task.id, notes: task.notes, headsUp: true, urgent: true }
              )
            );
          }
        }
      }

      // 长期阶段：提前 24h + 到期时
      if (task.type === 'longterm' && Array.isArray(task.milestones)) {
        task.milestones.forEach(function (ms) {
          if (!ms || ms.done || !ms.dueAt) return;
          const msDue = new Date(ms.dueAt);
          if (!Number.isFinite(msDue.getTime())) return;
          const progress = Store.computedProgress(task);
          const before = new Date(msDue.getTime() - 24 * 3600000);
          if (before.getTime() > now + 5000) {
            out.push(
              makeNotification(
                'ms24:' + task.id + ':' + ms.id + ':' + ms.dueAt,
                before,
                '阶段即将到期 · ' + task.title,
                '“' + ms.title + '”将在 ' + whenText(msDue) + ' 到期 · 当前进度 ' + progress + '%',
                { taskId: task.id, headsUp: false, urgent: false }
              )
            );
          }
          if (msDue.getTime() > now + 5000) {
            out.push(
              makeNotification(
                'msdue:' + task.id + ':' + ms.id + ':' + ms.dueAt,
                msDue,
                '阶段到期 · ' + task.title,
                '“' + ms.title + '”今天到期 · 当前进度 ' + progress + '%',
                { taskId: task.id, headsUp: true, urgent: false }
              )
            );
          }
        });
      }
    });

    // 可选：每天固定时间的简报
    if (settings.digest && settings.digestTime) {
      const parts = String(settings.digestTime).split(':').map(Number);
      if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
        out.push({
          __key: 'digest:daily',
          id: stableId('digest:daily'),
          title: '伴办 · 今日简报',
          body: '打开伴办看看今天要做什么。',
          schedule: {
            on: { hour: parts[0], minute: parts[1] },
            repeats: true,
            allowWhileIdle: true,
          },
          isExactNotification: exactAllowed,
          channelId: CHANNEL_REMINDER,
          sound: 'default',
          smallIcon: 'ic_stat_banban',
          iconColor: '#173F35',
          autoCancel: true,
          extra: { url: '#/today' },
        });
      }
    }

    out.sort(function (a, b) {
      return (a.schedule.at ? a.schedule.at.getTime() : Number.MAX_SAFE_INTEGER) -
        (b.schedule.at ? b.schedule.at.getTime() : Number.MAX_SAFE_INTEGER);
    });
    return out.slice(0, MAX_NOTIFICATIONS);
  }

  function cleanForPlugin(n) {
    const copy = Object.assign({}, n);
    delete copy.__key;
    return copy;
  }

  async function ensureChannels() {
    try {
      await LocalNotifications.createChannel({
        id: CHANNEL_REMINDER,
        name: '伴办 · 截止提醒',
        description: '任务截止前与长期阶段提醒',
        importance: 5,
        visibility: 1,
        lights: true,
        lightColor: '#173F35',
        vibration: true,
        sound: 'banban_notify.wav',
      });
    } catch (e) {
      /* channel may already exist */
    }
    try {
      await LocalNotifications.createChannel({
        id: CHANNEL_URGENT,
        name: '伴办 · 逾期强提醒',
        description: '任务逾期后的重复提醒',
        importance: 5,
        visibility: 1,
        lights: true,
        lightColor: '#D9553F',
        vibration: true,
        sound: 'banban_urgent.wav',
      });
    } catch (e) {
      /* channel may already exist */
    }
  }

  async function checkPermission() {
    try {
      const status = await LocalNotifications.checkPermissions();
      const display = status && status.display;
      setPermission(display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'default');
      if (nativePermission === 'granted') {
        await ensureChannels();
        if (isAndroid) {
          try {
            const exact = await LocalNotifications.checkExactNotificationSetting();
            exactAllowed = exact && exact.exact_alarm === 'granted';
          } catch (e) {
            exactAllowed = false;
          }
        } else {
          exactAllowed = true;
        }
        scheduleSoon(300);
      }
    } catch (e) {
      setPermission('default');
    }
    refreshUI();
  }

  async function requestPermission() {
    try {
      const status = await LocalNotifications.requestPermissions();
      const display = status && status.display;
      setPermission(display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'default');
      if (nativePermission === 'granted') {
        await ensureChannels();
        if (isAndroid) {
          try {
            const exact = await LocalNotifications.checkExactNotificationSetting();
            exactAllowed = exact && exact.exact_alarm === 'granted';
          } catch (e) {
            exactAllowed = false;
          }
        } else {
          exactAllowed = true;
        }
        scheduleSoon(250);
      }
    } catch (e) {
      setPermission('denied');
    }
    refreshUI();
    return nativePermission;
  }

  async function reschedule() {
    if (nativePermission !== 'granted') return;
    if (scheduling) {
      pending = true;
      return;
    }
    scheduling = true;
    try {
      const state = readState();
      if (!state) return;
      await ensureChannels();
      const previous = readScheduled();
      if (previous.length) {
        try {
          await LocalNotifications.cancel({ notifications: previous.map((x) => ({ id: x.id })) });
        } catch (e) {
          /* ignore stale ids */
        }
      }
      const list = buildNotifications(state);
      if (list.length) {
        const main = list.filter((n) => n.__key !== 'digest:daily').map(cleanForPlugin);
        if (main.length) {
          try {
            await LocalNotifications.schedule({ notifications: main });
          } catch (e) {
            console.warn('native schedule failed', e);
          }
        }
        const digest = list.find((n) => n.__key === 'digest:daily');
        if (digest) {
          try {
            await LocalNotifications.schedule({ notifications: [cleanForPlugin(digest)] });
          } catch (e) {
            /* daily digest unsupported, ignore */
          }
        }
        writeScheduled(list);
      } else {
        writeScheduled([]);
      }
    } finally {
      scheduling = false;
      if (pending) {
        pending = false;
        setTimeout(reschedule, 400);
      }
    }
  }

  function scheduleSoon(delay) {
    clearTimeout(scheduleTimer);
    scheduleTimer = setTimeout(function () {
      reschedule();
    }, delay == null ? 800 : delay);
  }

  async function testNotification() {
    let p = nativePermission;
    if (p === 'default') p = await requestPermission();
    if (p !== 'granted') return { ok: false, permission: p };
    await ensureChannels();
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: TEST_ID,
            title: '伴办 · 通知测试',
            body: '如果你看到这条消息，截止前 24h / 3h / 30min 的提醒已经准备好了。',
            schedule: { at: new Date(Date.now() + 1500), allowWhileIdle: true },
            isExactNotification: exactAllowed,
            channelId: CHANNEL_REMINDER,
            sound: 'default',
            smallIcon: 'ic_stat_banban',
            iconColor: '#173F35',
            autoCancel: true,
            extra: { url: '#/settings' },
          },
        ],
      });
      return { ok: true, permission: p };
    } catch (e) {
      return { ok: false, permission: p, error: String(e) };
    }
  }

  // 接管 Web 通知能力，让应用设置页/权限提示走原生。
  if (BB && BB.notify) {
    BB.notify.isSupported = function () {
      return true;
    };    BB.notify.permission = function () {
      return nativePermission;
    };
    BB.notify.requestPermission = requestPermission;
    BB.notify.registerSW = function () {
      return Promise.resolve(null);
    };
    BB.notify.test = testNotification;
    BB.notify.sendSystem = function () {
      return Promise.resolve(false);
    };
    BB.notify.deliver = async function (event, options) {
      // 原生系统通知已提前排程，无需再用应用内 Toast 重复提醒。
      // 未授权时才降级为可见页面的应用内提醒。
      if (nativePermission === 'granted') return true;
      if (document.visibilityState === 'visible' && options && options.onEvent) {
        options.onEvent(event, { system: false });
      }
      return false;
    };
    BB.native = {
      isAndroid: isAndroid,
      schedule: function () {
        scheduleSoon(300);
      },
      requestExactAlarm: async function () {
        if (!isAndroid) return true;
        try {
          const result = await LocalNotifications.changeExactNotificationSetting();
          exactAllowed = result && result.exact_alarm === 'granted';
          if (exactAllowed) scheduleSoon(300);
          return exactAllowed;
        } catch (e) {
          return false;
        }
      },
      permission: function () {
        return nativePermission;
      },
      exactAllowed: function () {
        return exactAllowed;
      },
    };
  }

  if (U && U.downloadText) {
    U.downloadText = async function (filename, text) {
      try {
        const file = await Filesystem.writeFile({
          path: 'exports/' + filename,
          data: text,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
          recursive: true,
        });
        await Share.share({
          title: '伴办备份',
          text: '伴办任务备份，可在「设置 → 导入备份」中恢复。',
          url: file.uri,
          dialogTitle: '保存或分享备份',
        });
      } catch (e) {
        console.warn('native export failed', e);
      }
    };
  }

  LocalNotifications.addListener('localNotificationActionPerformed', function (action) {
    const extra = action && action.notification && action.notification.extra;
    const target =
      extra && extra.taskId
        ? '#/task/' + extra.taskId
        : extra && extra.url
          ? extra.url
          : '#/today';
    setTimeout(function () {
      if (location.hash !== target) location.hash = target;
    }, 40);
  });

  if (typeof App !== 'undefined' && App.addListener) {
    App.addListener('backButton', function (info) {
      const confirm = document.querySelector('.confirm-card');
      if (confirm) {
        const btn = document.querySelector('[data-action="confirm-cancel"]');
        if (btn) btn.click();
        return;
      }
      const sheet = document.querySelector('.composer-sheet');
      if (sheet) {
        const btn = document.querySelector('[data-action="close-sheet"]');
        if (btn) btn.click();
        return;
      }
      if (info && info.canGoBack) history.back();
      else App.exitApp();
    });

    App.addListener('appStateChange', function (state) {
      if (state.isActive) {
        checkPermission();
      } else {
        scheduleSoon(200);
      }
    });
  }

  document.addEventListener(
    'click',
    function (event) {
      const el = event.target && event.target.closest ? event.target.closest('[data-action]') : null;
      if (!el) return;
      const action = el.dataset.action;
      if (action === 'request-exact-alarm') {
        event.preventDefault();
        if (BB.native && BB.native.requestExactAlarm) {
          BB.native.requestExactAlarm().then(function (allowed) {
            refreshUI();
            if (!allowed && U) {
              /* 用户从系统设置返回后仍可能未允许，交给设置页状态展示 */
            }
          });
        }
        return;
      }
      if (
        [
          'toggle-task',
          'complete-task',
          'confirm-run',
          'toggle-reminder',
          'toggle-setting',
          'set-weekstart',
          'clear-data',
          'load-demo',
          'clear-demo',
          'delete-milestone',
          'toggle-milestone',
          'enable-notifications',
        ].indexOf(action) > -1
      ) {
        scheduleSoon(900);
      }
    },
    true
  );

  document.addEventListener(
    'submit',
    function () {
      scheduleSoon(900);
    },
    true
  );

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') scheduleSoon(200);
  });

  checkPermission();
  setTimeout(function () {
    if (nativePermission === 'granted') scheduleSoon(800);
  }, 1200);
}
