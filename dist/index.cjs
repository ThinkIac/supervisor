var Supervisor, _a, alive, atomic, configuration, conflictingProcess, fork, fs, identity, memory, net, path, paths, read, request, sleep;

memory = function(pid) {
  var _a, rss, status;
  if (!pid) {
    return null;
  }
  try {
    status = fs.readFileSync('/proc/'.concat(pid, '/status'), 'utf8');
    rss = status.match(/^VmRSS:\s+(\d+) kB/m);
    return (rss ? {
      rssBytes: Number(rss[1]) * 1024
    } : null);
  } catch (error1) {
    _a = error1;
    return null;
  }
};

'use strict';

fs = require('node:fs');

path = require('node:path');

net = require('node:net');

fork = require('node:child_process').fork;

_a = require('./common.cjs');

atomic = _a.atomic;

read = _a.read;

paths = _a.paths;

configuration = _a.configuration;

identity = _a.identity;

alive = _a.alive;

sleep = _a.sleep;

request = _a.request;

conflictingProcess = _a.conflictingProcess;

Supervisor = class Supervisor {
  constructor(root) {
    var __caught, __values, _b, _c, _d, _e, _f, e_1, e_1_1, name;
    __values = function(o) {
      var i, m, s;
      s = typeof Symbol === 'function' && Symbol.iterator;
      m = s && o[s];
      i = 0;
      if (m) {
        return m.call(o);
      }
      if (o && typeof o.length === 'number') {
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
    e_1 = void 0;
    _a = void 0;
    _b = void 0;
    _c = void 0;
    _d = void 0;
    this.paths = paths(root);
    this.config = configuration(this.paths.root);
    this.intent = read(this.paths.state, {
      version: 1,
      services: {}
    });
    if (((_b = this.intent) === null || _b === void 0 ? void 0 : _b.version) !== 1 || !this.intent.services || Object.values(this.intent.services).some((function(v) {
      return !['running', 'stopped'].includes(v);
    }))) {
      throw new Error('Invalid supervisor intent; restore a valid snapshot before starting');
    }
    this.states = new Map();
    this.closing = false;
    this.queue = Promise.resolve();
    this.sockets = new Set();
    try {
      _e = __values(this.config.order);
      _f = _e.next();
      while (!_f.done) {
        name = _f.value;
        ((_c = (_d = this.intent.services)[name]) !== null && _c !== void 0 ? _c : (_d[name] = (this.config.services[name].autostart === false ? 'stopped' : 'running')));
        this.states.set(name, {
          name: name,
          state: 'stopped',
          health: 'unknown',
          generation: 0,
          restarts: 0,
          failures: [],
          pid: null,
          startedAt: null,
          lastExit: null,
          error: null
        });
        _f = _e.next();
      }
    } catch (error1) {
      e_1_1 = error1;
      e_1 = {
        error: e_1_1
      };
    } finally {
      try {
        if (_f && !_f.done && (_a = _e.return)) {
          _a.call(_e);
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
    return;
  }

  persist() {
    atomic(this.paths.state, this.intent);
  }

  serialize(fn) {
    var next;
    next = this.queue.catch(function() {}).then(fn);
    this.queue = next;
    return next;
  }

  snapshot() {
    var __read, __spreadArray, _this;
    __read = function(o, n) {
      var __caught, ar, e, error, i, m, r;
      m = typeof Symbol === 'function' && o[Symbol.iterator];
      if (!m) {
        return o;
      }
      i = m.call(o);
      r = void 0;
      ar = [];
      e = void 0;
      try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) {
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
    __spreadArray = function(to, from, pack) {
      var ar, i, l;
      if (pack || arguments.length === 2) {
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
    _this = this;
    return {
      version: 1,
      pid: process.pid,
      root: this.paths.root,
      services: __spreadArray([], __read(this.states.values()), false).map(function(s) {
        _a = void 0;
        return {
          name: s.name,
          desired: _this.intent.services[s.name],
          state: s.state,
          health: s.health,
          pid: s.pid,
          generation: s.generation,
          restarts: s.restarts,
          startedAt: s.startedAt,
          lastExit: s.lastExit,
          error: s.error,
          logError: ((_a = s.logError) !== null && _a !== void 0 ? _a : null),
          memory: memory(s.pid),
          uptimeMs: (s.pid ? Date.now() - s.startedAt : 0)
        };
      })
    };
  }

  log(name, text) {
    var chunk, e, file, i, src;
    _a = void 0;
    file = path.join(this.paths.dir, ''.concat(name, '.log'));
    try {
      // Three files, at most 1 MiB each, without an unbounded write queue.
      chunk = Buffer.from(text).subarray(0, 32768);
      if ((fs.existsSync(file) ? fs.statSync(file).size : 0) + chunk.length > 1024 * 1024) {
        i = 2;
        while (i >= 1) {
          src = (i === 1 ? file : ''.concat(file, '.').concat(i - 1));
          if (fs.existsSync(src)) {
            fs.renameSync(src, ''.concat(file, '.').concat(i));
          }
          i--;
        }
      }
      fs.appendFileSync(file, chunk, {
        mode: 384
      });
    } catch (error1) {
      e = error1;
      this.states.get(name).logError = ((_a = e.code) != null && _a != undefined ? _a : e.message);
    }
  }

  event(s, event, detail) {
    var __assign;
    __assign = function() {
      __assign = Object.assign || function(t) {
        var i, n, p;
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
    if (detail === void 0) {
      detail = {};
    }
    this.log(s.name, JSON.stringify(__assign({
      version: 1,
      at: (new Date()).toISOString(),
      event: event,
      name: s.name,
      generation: s.generation
    }, detail)) + '\n');
  }

  async recoverOrphans() {
    var __caught, __values, _b, _c, deadline, e, e_1, e_1_1, file, i, owner, record;
    __values = function(o) {
      var i, m, s;
      s = typeof Symbol === 'function' && Symbol.iterator;
      m = s && o[s];
      i = 0;
      if (m) {
        return m.call(o);
      }
      if (o && typeof o.length === 'number') {
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
    e_1 = void 0;
    _a = void 0;
    if (false) {
      await void 0;
    }
    try {
      _b = __values(fs.readdirSync(this.paths.dir).filter(function(f) {
        return f.endsWith('.owner.json');
      }));
      _c = _b.next();
      while (!_c.done) {
        file = _c.value;
        record = path.join(this.paths.dir, file);
        owner = read(record);
        if (alive(owner.guardian)) {
          process.kill(owner.guardian.pid, 'SIGTERM');
          deadline = Date.now() + 35000;
          while (alive(owner.guardian) && Date.now() < deadline) {
            await sleep(25);
          }
          if (alive(owner.guardian)) {
            throw new Error('Previous guardian did not stop: '.concat(file));
          }
        }
        // Birth time + boot ID prevent signaling a recycled PID.
        if (alive(owner.child)) {
          process.kill(-owner.child.pid, 'SIGKILL');
          i = 0;
          while (i < 100 && alive(owner.child)) {
            await sleep(20);
            i++;
          }
          if (alive(owner.child)) {
            throw new Error('Previous service did not stop: '.concat(file));
          }
        }
        try {
          fs.unlinkSync(record);
        } catch (error1) {
          e = error1;
          if (e.code != 'ENOENT') {
            throw e;
          }
        }
        _c = _b.next();
      }
    } catch (error1) {
      e_1_1 = error1;
      e_1 = {
        error: e_1_1
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
        if (e_1) {
          throw e_1.error;
        }
      }
    }
  }

  async listen() {
    var __caught, __values, _b, _c, _this, e, e_1, e_1_1, name;
    __values = function(o) {
      var i, m, s;
      s = typeof Symbol === 'function' && Symbol.iterator;
      m = s && o[s];
      i = 0;
      if (m) {
        return m.call(o);
      }
      if (o && typeof o.length === 'number') {
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
    e_1 = void 0;
    _a = void 0;
    _this = this;
    if (false) {
      await void 0;
    }
    // Caller must hold the OS flock for the entire daemon lifetime.
    await this.recoverOrphans();
    this.persist();
    try {
      fs.unlinkSync(this.paths.socket);
    } catch (error1) {
      e = error1;
      if (e.code != 'ENOENT') {
        throw e;
      }
    }
    this.server = net.createServer(function(socket) {
      var data, handled;
      _this.sockets.add(socket);
      socket.once('close', function() {
        return _this.sockets.delete(socket);
      });
      socket.on('error', function() {});
      socket.setTimeout(5000, function() {
        return socket.destroy();
      });
      data = '';
      handled = false;
      socket.on('data', function(bytes) {
        var msg;
        if (handled) {
          return;
        }
        data += bytes;
        if (data.length > 8192) {
          return socket.destroy();
        }
        if (!data.includes('\n')) {
          return;
        }
        handled = true;
        socket.setTimeout(60000, function() {
          return socket.destroy();
        });
        msg = void 0;
        try {
          msg = JSON.parse(data.split('\n')[0]);
        } catch (error1) {
          _a = error1;
          return socket.end('{"ok":false,"error":"Invalid JSON"}\n');
        }
        _this.serialize(function() {
          return _this.command(msg);
        }).then((function(result) {
          return socket.end(JSON.stringify({
            ok: true,
            result: result
          }) + '\n');
        }), function(e) {
          return socket.end(JSON.stringify({
            ok: false,
            error: e.message
          }) + '\n');
        });
      });
    });
    await new Promise(function(resolve, reject) {
      _this.server.once('error', reject);
      _this.server.listen(_this.paths.socket, resolve);
    });
    fs.chmodSync(this.paths.socket, 384);
    try {
      _b = __values(this.config.order);
      _c = _b.next();
      while (!_c.done) {
        name = _c.value;
        this.launch(name);
        _c = _b.next();
      }
    } catch (error1) {
      e_1_1 = error1;
      e_1 = {
        error: e_1_1
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
        if (e_1) {
          throw e_1.error;
        }
      }
    }
  }

  launch(name) {
    var __assign, _this, blocked, child, conflict, generation, result, s, service;
    __assign = function() {
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
    _this = this;
    s = this.states.get(name);
    service = this.config.services[name];
    if (this.closing || s.child || s.timer || this.intent.services[name] !== 'running') {
      return;
    }
    blocked = service.dependsOn.find(function(d) {
      return _this.states.get(d).state !== 'running';
    });
    if (blocked) {
      s.state = 'blocked';
      s.error = 'Dependency not running: '.concat(blocked);
      return;
    }
    conflict = conflictingProcess(service);
    if (conflict) {
      s.state = 'failed';
      s.error = 'Service already running outside this supervisor (PID '.concat(conflict, '); migrate its owner first');
      return;
    }
    generation = ++s.generation;
    s.state = 'starting';
    s.health = 'unknown';
    s.error = null;
    s.startedAt = Date.now();
    s.lastHeartbeat = Date.now();
    child = fork(path.join(__dirname, 'guardian.cjs'), [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: []
    });
    s.child = child;
    this.event(s, 'starting');
    result = {
      code: 1,
      signal: null
    };
    child.on('message', function(msg) {
      if (s.generation !== generation || s.child !== child) {
        return;
      }
      if (msg.op === 'spawn') {
        s.pid = msg.pid;
        if (service.ready === 'process') {
          _this.ready(s, false);
        }
      }
      if (msg.op === 'logos:ready') {
        _this.ready(s, true);
      }
      if (msg.op === 'logos:heartbeat') {
        s.lastHeartbeat = Date.now();
      }
      if (msg.op === 'diagnostic') {
        s.error = msg.error;
      }
      if (msg.op === 'log') {
        _this.log(name, msg.text);
      }
      if (msg.op === 'exit') {
        result = {
          code: msg.code,
          signal: msg.signal
        };
      }
    });
    child.once('error', function(e) {
      s.error = e.message;
    });
    s.done = new Promise(function(resolve) {
      return child.once('exit', function() {
        _a = void 0;
        if (s.child === child) {
          clearInterval(s.monitor);
          s.child = null;
          s.pid = null;
          s.health = 'unknown';
          s.lastExit = __assign(__assign({}, result), {
            at: Date.now(),
            cause: ((_a = s.stopCause) !== null && _a !== void 0 ? _a : 'exit')
          });
          _this.event(s, 'exit', s.lastExit);
          s.state = 'stopped';
          if (!s.stopCause && !_this.closing && _this.intent.services[name] === 'running') {
            _this.retry(s, result.code !== 0 || !!result.signal);
          }
          s.stopCause = null;
        }
        resolve();
      });
    });
    child.send({
      op: 'start',
      root: this.paths.root,
      name: name,
      service: service,
      record: path.join(this.paths.dir, ''.concat(name, '.owner.json'))
    }, function(e) {
      if (e) {
        s.error = e.message;
      }
    });
    s.monitor = setInterval((function() {
      var now, p;
      if (s.child !== child || s.stopCause) {
        return;
      }
      now = Date.now();
      p = service.policy;
      if (s.state === 'starting' && now - s.startedAt > p.bootTimeoutMs || s.health === 'ready' && p.heartbeatMs && now - s.lastHeartbeat > p.heartbeatMs) {
        s.health = 'unhealthy';
        s.error = 'Readiness/heartbeat timeout';
        child.send({
          op: 'stop'
        }, function() {});
      }
    }), 100);
  }

  ready(s, verified) {
    var __caught, __values, _b, _c, e_1, e_1_1, name;
    __values = function(o) {
      var i, m;
      s = typeof Symbol === 'function' && Symbol.iterator;
      m = s && o[s];
      i = 0;
      if (m) {
        return m.call(o);
      }
      if (o && typeof o.length === 'number') {
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
    e_1 = void 0;
    _a = void 0;
    if (s.state !== 'starting') {
      return;
    }
    s.state = 'running';
    s.health = (verified ? 'ready' : 'unknown');
    s.lastHeartbeat = Date.now();
    this.event(s, 'running', {
      health: s.health
    });
    try {
      _b = __values(this.config.order);
      _c = _b.next();
      while (!_c.done) {
        name = _c.value;
        if (this.states.get(name).state === 'blocked') {
          this.launch(name);
        }
        _c = _b.next();
      }
    } catch (error1) {
      e_1_1 = error1;
      e_1 = {
        error: e_1_1
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
        if (e_1) {
          throw e_1.error;
        }
      }
    }
  }

  retry(s, failed) {
    var _this, delay, now, p;
    _this = this;
    _a = void 0;
    p = this.config.services[s.name].policy;
    now = Date.now();
    if (p.restart === 'never' || p.restart === 'on-failure' && !failed && !s.error) {
      return;
    }
    s.failures = (now - s.startedAt >= p.minUptimeMs && !s.error ? [] : s.failures.filter((function(t) {
      return now - t < p.windowMs;
    })));
    if (s.failures.length >= p.maxRestarts) {
      s.state = 'failed';
      ((_a = s.error) !== null && _a !== void 0 ? _a : (s.error = 'Restart limit reached'));
      this.event(s, 'failed');
      return;
    }
    s.failures.push(now);
    s.restarts++;
    delay = Math.min(p.maxDelayMs, p.delayMs * 2 ** Math.min(s.failures.length - 1, 30));
    s.state = 'backoff';
    this.event(s, 'backoff', {
      delayMs: delay
    });
    s.timer = setTimeout((function() {
      s.timer = null;
      _this.launch(s.name);
    }), delay);
  }

  async halt(name, cause) {
    var s;
    if (false) {
      await void 0;
    }
    s = this.states.get(name);
    clearTimeout(s.timer);
    s.timer = null;
    if (!s.child) {
      s.state = 'stopped';
      return;
    }
    s.stopCause = cause;
    s.state = 'stopping';
    s.child.send({
      op: 'stop'
    }, function() {});
    await s.done;
  }

  async command(msg) {
    var __assign, __caught, _this, b, command, dependents, fd, file, next, s, size, target;
    __assign = function() {
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
    _a = void 0;
    _this = this;
    if (false) {
      await void 0;
    }
    if (msg.version !== 1) {
      throw new Error('Unsupported protocol version');
    }
    command = msg.command;
    target = msg.target;
    if (command === 'status') {
      return this.snapshot();
    }
    if (this.closing) {
      throw new Error('Supervisor is shutting down');
    }
    if (command === 'shutdown') {
      setImmediate(function() {
        return _this.close();
      });
      return {
        shuttingDown: true
      };
    }
    if (!this.states.has(target)) {
      throw new Error('Unknown service: '.concat(target));
    }
    if (command === 'logs') {
      file = path.join(this.paths.dir, ''.concat(target, '.log'));
      if (!fs.existsSync(file)) {
        return '';
      }
      fd = fs.openSync(file, 'r');
      try {
        size = fs.fstatSync(fd).size;
        b = Buffer.alloc(Math.min(size, 65536));
        fs.readSync(fd, b, 0, b.length, size - b.length);
        return b.toString();
      } catch (error1) {
        __caught = error1;
        throw __caught;
      } finally {
        fs.closeSync(fd);
      }
    }
    if (!['start', 'stop', 'restart'].includes(command)) {
      throw new Error('Unknown command: '.concat(command));
    }
    s = this.states.get(target);
    if (command === 'stop') {
      dependents = this.config.order.filter(function(n) {
        return _this.config.services[n].dependsOn.includes(target) && _this.intent.services[n] === 'running';
      });
      if (dependents.length) {
        throw new Error('Stop dependents first: '.concat(dependents.join(', ')));
      }
    }
    next = __assign(__assign({}, this.intent), {
      services: __assign(__assign({}, this.intent.services), (function() {
        _a = {};
        _a[target] = (command === 'stop' ? 'stopped' : 'running');
        return _a;
      }).call(this))
    });
    atomic(this.paths.state, next);
    this.intent = next;
    if (command !== 'start') {
      await this.halt(target, command);
    }
    if (command !== 'stop') {
      s.failures = [];
      clearTimeout(s.timer);
      s.timer = null;
      this.launch(target);
    }
    return this.snapshot();
  }

  async close() {
    var __read, __spreadArray, __values, _this;
    __read = function(o, n) {
      var __caught, ar, e, error, i, m, r;
      m = typeof Symbol === 'function' && o[Symbol.iterator];
      if (!m) {
        return o;
      }
      i = m.call(o);
      r = void 0;
      ar = [];
      e = void 0;
      try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) {
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
    __spreadArray = function(to, from, pack) {
      var ar, i, l;
      if (pack || arguments.length === 2) {
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
    __values = function(o) {
      var i, m, s;
      s = typeof Symbol === 'function' && Symbol.iterator;
      m = s && o[s];
      i = 0;
      if (m) {
        return m.call(o);
      }
      if (o && typeof o.length === 'number') {
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
    _this = this;
    if (false) {
      await void 0;
    }
    if (this.closing) {
      return this.closed;
    }
    this.closing = true;
    this.closed = this.serialize(async function() {
      var __caught, _b, _c, _d, _e, _f, e_1, e_1_1, e_2, e_2_1, name, socket;
      e_1 = void 0;
      _a = void 0;
      e_2 = void 0;
      _b = void 0;
      if (false) {
        await void 0;
      }
      try {
        _c = __values(__spreadArray([], __read(_this.config.order), false).reverse());
        _d = _c.next();
        while (!_d.done) {
          name = _d.value;
          await _this.halt(name, 'supervisor-shutdown');
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
      try {
        _e = __values(_this.sockets);
        _f = _e.next();
        while (!_f.done) {
          socket = _f.value;
          socket.destroy();
          _f = _e.next();
        }
      } catch (error1) {
        e_2_1 = error1;
        e_2 = {
          error: e_2_1
        };
      } finally {
        try {
          if (_f && !_f.done && (_b = _e.return)) {
            _b.call(_e);
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
      await new Promise(function(r) {
        return _this.server.close(r);
      });
    });
    return this.closed;
  }

};

module.exports = {
  Supervisor: Supervisor,
  request: request
};
