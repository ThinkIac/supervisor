/** Public LogosModule contract; lifecycle operations are supplied by the host. */
/** Supervisor registration is ordinary package data; recovery is a host port. */
var __assign, __read, __spreadArray, __values, _a, atomic, createRuntimeModule, fs, notifyReady, path, policy, provideSupervisor, read, request;

createRuntimeModule = function(_a) {
  var _b, activeController, recoverIsolatedPackage, root;
  _b = (_a == void 0 ? {} : _a);
  recoverIsolatedPackage = _b.recoverIsolatedPackage;
  root = _b.root;
  activeController = null;
  return {
    name: 'supervisor',
    phase: 'boot',
    swappable: false,
    close: function() {
      (activeController == null || activeController == void 0 ? void 0 : activeController.close());
    },
    install: function(container) {
      var bootBlock, cancel, closed, controller, dir, file, get, intent, records, schedule, timers, wantsRunning;
      dir = path.join(container.workspace, '.logos', 'supervisor');
      bootBlock = function(pkg, visiting) {
        var _a;
        var _b;
        var __caught, _c, _d, _loop_1, e_1, e_1_1, name, state_1;
        e_1 = void 0;
        _a = void 0;
        _b = void 0;
        if (visiting == void 0) {
          visiting = new Set();
        }
        if (!wantsRunning(pkg.folder)) {
          return 'stopped';
        }
        if (visiting.has(pkg.folder)) {
          return 'Dependency cycle';
        }
        visiting.add(pkg.folder);
        _loop_1 = function(name) {
          var dependency;
          if (name.endsWith('?')) {
            return 'continue';
          }
          dependency = container.registry.discover().find(function(p) {
            return p.name == name || p.folder == name || p.folder == name.replace(/^@[^/]+\//, '');
          });
          if (dependency && bootBlock(dependency, new Set(visiting))) {
            return {
              value: 'Dependency stopped: '.concat(name)
            };
          }
        };
        try {
          _c = __values(Object.keys(((_b = pkg.logosDependencies) != null && _b != void 0 ? _b : {})));
          _d = _c.next();
          while (!_d.done) {
            name = _d.value;
            state_1 = _loop_1(name);
            if (typeof state_1 == 'object') {
              return state_1.value;
            }
            _d = _c.next();
          }
        } catch (error1) {
          e_1_1 = error1;
          e_1 = {
            error: e_1_1
          };
        } finally {
          try {
            if (_d && !_d.done && (_a = _c.return)) {
              _a.call(_c);
            }
          } catch (error1) {
            __caught = error1;
            throw __caught;
          } finally {
            if (e_1) {
              throw e_1.error;
            }
          }
        }
        return null;
      };
      cancel = function(folder) {
        clearTimeout(timers.get(folder));
        timers.delete(folder);
      };
      schedule = async function(folder, recover, exit) {
        var _a;
        var _b;
        var now, p, pkg, r, wait;
        _a = void 0;
        _b = void 0;
        if (false) {
          await void 0;
        }
        if (!wantsRunning(folder) || timers.has(folder)) {
          return;
        }
        pkg = container.registry.getPackage(folder);
        r = get(folder);
        p = policy(((_b = (_a = pkg === null || pkg === void 0 ? void 0 : pkg.runtime) === null || _a === void 0 ? void 0 : _a.supervision) != null && _b != void 0 ? _b : {}));
        if (p.restart == 'never' || p.restart == 'on-failure' && (exit === null || exit === void 0 ? void 0 : exit.code) == 0 && !(exit == null || exit == void 0 ? void 0 : exit.signal)) {
          r.state = 'failed';
          return;
        }
        now = Date.now();
        r.failures = (r.readyAt && now - r.readyAt >= p.minUptimeMs ? [] : r.failures.filter((function(t) {
          return now - t < p.windowMs;
        })));
        if (r.failures.length >= p.maxRestarts) {
          r.state = 'failed';
          r.error = 'Restart limit reached';
          return;
        }
        r.failures.push(now);
        r.restarts++;
        r.state = 'backoff';
        r.health = 'unhealthy';
        wait = Math.min(p.maxDelayMs, p.delayMs * 2 ** Math.min(r.failures.length - 1, 30));
        timers.set(folder, setTimeout((async function() {
          var _a;
          var _b;
          var e, result;
          _a = void 0;
          _b = void 0;
          if (false) {
            await void 0;
          }
          timers.delete(folder);
          if (!wantsRunning(folder)) {
            return;
          }
          try {
            r.state = 'starting';
            result = (await (recover()));
            if ((result === null || result === void 0 ? void 0 : result.ok) == false) {
              throw new Error(((_a = result.error) != null && _a != void 0 ? _a : 'Recovery rejected'));
            }
            if (!wantsRunning(folder)) {
              return;
            }
            r.state = 'running';
            r.health = ((_b = result === null || result === void 0 ? void 0 : result.health) != null && _b != void 0 ? _b : 'ready');
            r.readyAt = Date.now();
            r.error = null;
          } catch (error1) {
            e = error1;
            r.error = e.message;
            await schedule(folder, recover);
          }
        }), wait));
      };
      fs.mkdirSync(dir, {
        recursive: true,
        mode: 448
      });
      file = path.join(dir, 'packages.json');
      intent = read(file, {
        version: 1,
        packages: {}
      });
      if ((intent === null || intent === void 0 ? void 0 : intent.version) != 1 || !intent.packages || Object.values(intent.packages).some((function(x) {
        return !['running', 'stopped'].includes(x);
      }))) {
        throw new Error('Invalid package supervisor intent');
      }
      records = new Map();
      timers = new Map();
      closed = false;
      wantsRunning = function(folder) {
        return !closed && intent.packages[folder] != 'stopped';
      };
      get = function(folder) {
        var _a;
        _a = void 0;
        if (!records.has(folder)) {
          records.set(folder, {
            desired: ((_a = intent.packages[folder]) != null && _a != void 0 ? _a : 'running'),
            restarts: 0,
            failures: [],
            state: 'running',
            health: 'unknown',
            error: null
          });
        }
        return records.get(folder);
      };
      controller = {
        wantsRunning: wantsRunning,
        bootBlock: bootBlock,
        beforeStop: async function(folder) {
          var _a;
          var next;
          _a = void 0;
          if (false) {
            await void 0;
          }
          if (!container.registry.getPackage(folder)) {
            throw new Error('Unknown package: '.concat(folder));
          }
          next = __assign(__assign({}, intent), {
            packages: __assign(__assign({}, intent.packages), (function() {
              _a = {};
              _a[folder] = 'stopped';
              return _a;
            }).call(this))
          });
          atomic(file, next);
          intent.packages = next.packages;
          cancel(folder);
          Object.assign(get(folder), {
            desired: 'stopped',
            state: 'stopped',
            health: 'unknown'
          });
        },
        beforeStart: async function(folder) {
          var blocked, error, old, pkg;
          if (false) {
            await void 0;
          }
          pkg = container.registry.getPackage(folder);
          if (!pkg) {
            throw new Error('Unknown package: '.concat(folder));
          }
          old = intent.packages[folder];
          intent.packages[folder] = 'running';
          blocked = bootBlock(pkg);
          if (blocked) {
            if (old == undefined) {
              delete intent.packages[folder];
            } else {
              intent.packages[folder] = old;
            }
            throw new Error(blocked);
          }
          try {
            atomic(file, intent);
          } catch (error1) {
            error = error1;
            if (old == undefined) {
              delete intent.packages[folder];
            } else {
              intent.packages[folder] = old;
            }
            throw error;
          }
          cancel(folder);
          Object.assign(get(folder), {
            desired: 'running',
            failures: [],
            state: 'starting'
          });
        },
        snapshot: function(folder) {
          var _a;
          var _b;
          var _c, observed, proc, r, runner, state;
          _a = void 0;
          _b = void 0;
          _c = void 0;
          r = get(folder);
          runner = container.state('isolated').get(folder);
          proc = container.state('proc').get(folder);
          observed = ((_a = container.registry.getState(folder)) == null || _a == void 0 ? void 0 : _a.state);
          state = (['backoff', 'failed'].includes(r.state) ? r.state : (observed == 'active' ? 'running' : (observed != null && observed != void 0 ? observed : r.state)));
          return {
            desired: r.desired,
            state: state,
            health: ((runner == null || runner == void 0 ? void 0 : runner.running) ? 'ready' : r.health),
            restarts: r.restarts,
            error: r.error,
            pid: ((_c = (_b = runner === null || runner === void 0 ? void 0 : runner.pid) !== null && _b !== void 0 ? _b : proc === null || proc === void 0 ? void 0 : proc.pid) != null && _c != void 0 ? _c : null),
            owner: (proc ? 'proc' : (runner ? 'isolated' : 'runtime'))
          };
        },
        scheduleProc: function(folder, recover, exit) {
          return schedule(folder, recover, exit);
        },
        cancel: cancel,
        external: async function() {
          var e;
          if (false) {
            await void 0;
          }
          if (!process.env.LOGOS_SUPERVISOR_ROOT && !root) {
            return {
              available: false
            };
          }
          try {
            return __assign({
              available: true
            }, (await (request((root != null && root != void 0 ? root : process.env.LOGOS_SUPERVISOR_ROOT), 'status'))));
          } catch (error1) {
            e = error1;
            return {
              available: false,
              error: e.message
            };
          }
        },
        close: function() {
          var _a;
          var _b;
          var __caught, _c, e_2, e_2_1, folder;
          e_2 = void 0;
          _a = void 0;
          closed = true;
          try {
            _b = __values(timers.keys());
            _c = _b.next();
            while (!_c.done) {
              folder = _c.value;
              cancel(folder);
              _c = _b.next();
            }
          } catch (error1) {
            e_2_1 = error1;
            e_2 = {
              error: e_2_1
            };
          } finally {
            try {
              if (_c && !_c.done && (_a = _b.return)) {
                _a.call(_b);
              }
            } catch (error1) {
              __caught = error1;
              throw __caught;
            } finally {
              if (e_2) {
                throw e_2.error;
              }
            }
          }
        }
      };
      container.state('supervisor').set('controller', controller);
      activeController = controller;
      container.bus.on('isolated:exit', (async function(event) {
        var _a;
        var _b;
        var _c, _d, p, r;
        _a = void 0;
        _b = void 0;
        _c = void 0;
        _d = void 0;
        if (false) {
          await void 0;
        }
        if (event.expected || !wantsRunning(event.pkg)) {
          return;
        }
        r = get(event.pkg);
        r.error = 'Exit '.concat(((_a = event.code) != null && _a != void 0 ? _a : event.signal));
        r.health = 'unhealthy';
        container.registry.setState(event.pkg, 'failed', r.error);
        p = policy(((_d = (_c = (_b = container.registry.getPackage(event.pkg)) === null || _b === void 0 ? void 0 : _b.runtime) === null || _c === void 0 ? void 0 : _c.supervision) != null && _d != void 0 ? _d : {}));
        if (p.restart == 'on-failure' && event.code == 0 && !event.signal) {
          r.state = 'stopped';
          return;
        }
        await schedule(event.pkg, function() {
          return recoverIsolatedPackage(container, event.pkg);
        });
      }), {
        owner: 'system'
      });
      container.bus.on('reload:swapped', (function(event) {
        var r;
        r = get(event.pkg);
        if (wantsRunning(event.pkg)) {
          Object.assign(r, {
            state: 'running',
            readyAt: Date.now(),
            error: null
          });
        }
      }), {
        owner: 'system'
      });
      container.bus.on('shutdown', (function() {
        return controller.close();
      }), {
        owner: 'system',
        priority: -1000
      });
      container.bus.on('logos:stopping', (function() {
        return controller.close();
      }), {
        owner: 'system',
        priority: -1000
      });
    }
  };
};

notifyReady = function() {
  var send, timer;
  if (!process.env.LOGOS_SUPERVISOR_SERVICE || !process.send) {
    return function() {};
  }
  send = function(type) {
    if (process.connected) {
      process.send({
        type: type
      }, function() {});
    }
  };
  send('logos:ready');
  timer = setInterval((function() {
    return send('logos:heartbeat');
  }), 1000);
  timer.unref();
  return function() {
    return clearInterval(timer);
  };
};

provideSupervisor = function(host) {
  /**
   * @register module supervisor
   * @context capability
   */
  return createRuntimeModule({
    root: host.applicationRoot(),
    recoverIsolatedPackage: function(_container, folder) {
      return host.process.recoverIsolatedPackage(folder);
    }
  });
};

'use strict';

__assign = this && this.__assign || function() {
  __assign = Object.assign || function(t) {
    var i, n, p, s;
    s = void 0;
    i = 1;
    n = arguments.length;
    while (i < n) {
      s = arguments[i];
      for (p in s) {
        if (Object.prototype.hasOwnProperty.call(s, p)) {
          t[p] = s[p];
        }
      }
      i++;
    }
    return t;
  };
  return __assign.apply(this, arguments);
};

__values = this && this.__values || function(o) {
  var i, m, s;
  s = typeof Symbol == 'function' && Symbol.iterator;
  m = s && o[s];
  i = 0;
  if (m) {
    return m.call(o);
  }
  if (o && typeof o.length == 'number') {
    return {
      next: function() {
        if (o && i >= o.length) {
          o = void 0;
        }
        return {
          value: o && o[i++],
          done: !o
        };
      }
    };
  }
  throw new TypeError((s ? 'Object is not iterable.' : 'Symbol.iterator is not defined.'));
};

__read = this && this.__read || function(o, n) {
  var __caught, ar, e, error, i, m, r;
  m = typeof Symbol == 'function' && o[Symbol.iterator];
  if (!m) {
    return o;
  }
  i = m.call(o);
  r = void 0;
  ar = [];
  e = void 0;
  try {
    while ((n == void 0 || n-- > 0) && !(r = i.next()).done) {
      ar.push(r.value);
    }
  } catch (error1) {
    error = error1;
    e = {
      error: error
    };
  } finally {
    try {
      if (r && !r.done && (m = i['return'])) {
        m.call(i);
      }
    } catch (error1) {
      __caught = error1;
      throw __caught;
    } finally {
      if (e) {
        throw e.error;
      }
    }
  }
  return ar;
};

__spreadArray = this && this.__spreadArray || function(to, from, pack) {
  var ar, i, l;
  if (pack || arguments.length == 2) {
    i = 0;
    l = from.length;
    ar = void 0;
    while (i < l) {
      if (ar || !(i in from)) {
        if (!ar) {
          ar = Array.prototype.slice.call(from, 0, i);
        }
        ar[i] = from[i];
      }
      i++;
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
};

fs = require('node:fs');

path = require('node:path');

_a = require('./common.cjs');

atomic = _a.atomic;

read = _a.read;

policy = _a.policy;

request = _a.request;

module.exports = {
  provideSupervisor: provideSupervisor,
  createRuntimeModule: createRuntimeModule,
  notifyReady: notifyReady
};

module.exports.createHost = function() {
  var _a;
  var _i, args;
  _a = void 0;
  args = [];
  _i = 0;
  while (_i < arguments.length) {
    args[_i] = arguments[_i];
    _i++;
  }
  return (_a = require('@thinkiac/module-runtime-compat')).createHost.apply(_a, __spreadArray([], __read(args), false));
};
