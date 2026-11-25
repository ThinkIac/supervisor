
/* preserve the original failure */
var __assign, __read, __values, alive, atomic, configuration, conflictingProcess, crypto, fs, identity, net, path, paths, policy, read, request, sleep, waitForReady;

atomic = function(file, value) {
  var __caught, _a, _b, dir, fd, renamed, tmp;
  tmp = ''.concat(file, '.').concat(process.pid, '.').concat(crypto.randomUUID(), '.tmp');
  fd = void 0;
  renamed = false;
  try {
    fd = fs.openSync(tmp, 'wx', 384);
    fs.writeFileSync(fd, JSON.stringify(value));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, file);
    renamed = true;
    dir = fs.openSync(path.dirname(file), 'r');
    try {
      fs.fsyncSync(dir);
    } catch (error1) {
      __caught = error1;
      throw __caught;
    } finally {
      fs.closeSync(dir);
    }
  } catch (error1) {
    __caught = error1;
    throw __caught;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch (error1) {
        _a = error1;
      }
    }
    if (!renamed) {
      try {
        fs.unlinkSync(tmp);
      } catch (error1) {
        _b = error1;
      }
    }
  }
};

read = function(file, fallback) {
  var e;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error1) {
    e = error1;
    if (e.code == 'ENOENT') {
      return fallback;
    }
    throw new Error('Invalid state '.concat(file, ': ').concat(e.message));
  }
};

paths = function(root) {
  var dir, socket, stat;
  root = fs.realpathSync(root);
  dir = path.join(root, '.logos', 'supervisor');
  fs.mkdirSync(dir, {
    recursive: true,
    mode: 448
  });
  stat = fs.lstatSync(dir);
  if (!stat.isDirectory() || stat.uid !== process.getuid() || stat.mode & 63) {
    throw new Error('Supervisor directory must be private and owned by this user');
  }
  socket = path.join(dir, 'control.sock');
  if (Buffer.byteLength(socket) > 103) {
    throw new Error('Workspace path too long for supervisor socket');
  }
  return {
    root: root,
    dir: dir,
    socket: socket,
    lock: path.join(dir, 'owner.lock'),
    state: path.join(dir, 'intent.json')
  };
};

identity = function(pid) {
  var e, fields, s;
  try {
    s = fs.readFileSync('/proc/'.concat(pid, '/stat'), 'utf8');
    fields = s.slice(s.lastIndexOf(')') + 2).split(' ');
    if (fields[0] === 'Z') {
      return null;
    }
    return {
      pid: pid,
      birth: fields[19],
      boot: fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()
    };
  } catch (error1) {
    e = error1;
    if (['ENOENT', 'ESRCH'].includes(e.code)) {
      return null;
    }
    throw e;
  }
};

alive = function(id) {
  var now;
  now = id && identity(id.pid);
  return !!now && now.birth === id.birth && now.boot === id.boot;
};

conflictingProcess = function(service) {
  var __caught, _a, _b, _c, _d, argv, cwd, e, e_1, e_1_1, pid, script;
  e_1 = void 0;
  _a = void 0;
  _b = void 0;
  if (service.command !== 'node' || !service.args.length) {
    return null;
  }
  script = path.resolve(service.cwd, service.args[0]);
  try {
    _c = __values(fs.readdirSync('/proc').filter(function(p) {
      return /^\d+$/.test(p);
    }).map(Number));
    _d = _c.next();
    while (!_d.done) {
      pid = _d.value;
      if (pid === process.pid) {
        _d = _c.next();
        continue;
      }
      try {
        cwd = fs.readlinkSync('/proc/'.concat(pid, '/cwd'));
        argv = fs.readFileSync('/proc/'.concat(pid, '/cmdline'), 'utf8').split('\u0000').filter(Boolean);
        // PM2 changes argv[0] to its process title; compare that title too.
        if (cwd === service.cwd && (argv.some((function(arg) {
          return arg === script || arg === service.args[0];
        })) || ((_b = argv[0]) === null || _b === void 0 ? void 0 : _b.includes('('.concat(script, ')'))))) {
          return pid;
        }
      } catch (error1) {
        e = error1;
        if (!['ENOENT', 'ESRCH', 'EACCES'].includes(e.code)) {
          throw e;
        }
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

policy = function(raw) {
  var __caught, _a, _b, _c, e_2, e_2_1, k, p;
  e_2 = void 0;
  _a = void 0;
  if (raw === void 0) {
    raw = {};
  }
  p = __assign({
    restart: 'always',
    maxRestarts: 10,
    windowMs: 60000,
    minUptimeMs: 30000,
    delayMs: 500,
    maxDelayMs: 30000,
    stopTimeoutMs: 10000,
    bootTimeoutMs: 120000,
    heartbeatMs: 0
  }, raw);
  if (!['always', 'on-failure', 'never'].includes(p.restart)) {
    throw new Error('Invalid restart policy');
  }
  try {
    _b = __values(Object.keys(p));
    _c = _b.next();
    while (!_c.done) {
      k = _c.value;
      if (k === 'restart') {
        _c = _b.next();
        continue;
      }
      if (!['maxRestarts', 'windowMs', 'minUptimeMs', 'delayMs', 'maxDelayMs', 'stopTimeoutMs', 'bootTimeoutMs', 'heartbeatMs'].includes(k)) {
        throw new Error('Unknown policy field: '.concat(k));
      }
      if (!Number.isSafeInteger(p[k]) || p[k] < 0 || p[k] > 2147483647) {
        throw new Error('Invalid policy: '.concat(k));
      }
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
  if (!p.stopTimeoutMs || !p.bootTimeoutMs || !p.windowMs || p.maxDelayMs < p.delayMs) {
    throw new Error('Invalid policy interval');
  }
  return p;
};

configuration = function(root) {
  var __caught, _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, e_3, e_3_1, name, order, raw, s, services, visit, visited, visiting;
  e_3 = void 0;
  _a = void 0;
  _b = void 0;
  _c = void 0;
  _d = void 0;
  _e = void 0;
  _f = void 0;
  _g = void 0;
  _h = void 0;
  _j = void 0;
  raw = read(path.join(root, 'logos.supervisor.json'));
  visit = function(name) {
    if (!services[name]) {
      throw new Error('Unknown dependency: '.concat(name));
    }
    if (visiting.has(name)) {
      throw new Error('Service dependency cycle: '.concat(name));
    }
    if (visited.has(name)) {
      return;
    }
    visiting.add(name);
    services[name].dependsOn.forEach(visit);
    visiting.delete(name);
    visited.add(name);
    order.push(name);
  };
  if (!raw || raw.version !== 1 || !raw.services || Array.isArray(raw.services) || typeof raw.services !== 'object') {
    throw new Error('Expected logos.supervisor.json version 1 with services');
  }
  services = {};
  try {
    _k = __values(Object.entries(raw.services));
    _l = _k.next();
    while (!_l.done) {
      _m = __read(_l.value, 2);
      name = _m[0];
      s = _m[1];
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name)) {
        throw new Error('Invalid service name: '.concat(name));
      }
      if (!s || typeof s.command !== 'string' || !s.command || !Array.isArray(((_b = s.args) !== null && _b !== void 0 ? _b : [])) || ((_c = s.args) !== null && _c !== void 0 ? _c : []).some((function(a) {
        return typeof a !== 'string';
      }))) {
        throw new Error('Invalid command: '.concat(name));
      }
      if (s.ready !== undefined && !['ipc', 'process'].includes(s.ready)) {
        throw new Error('Invalid readiness: '.concat(name));
      }
      if (s.autostart !== undefined && typeof s.autostart !== 'boolean') {
        throw new Error('Invalid autostart: '.concat(name));
      }
      if (s.env && (typeof s.env !== 'object' || Object.entries(s.env).some((function(_a) {
        var _b;
        var k, v;
        _b = __read(_a, 2);
        k = _b[0];
        v = _b[1];
        return !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || typeof v !== 'string';
      })))) {
        throw new Error('Invalid environment: '.concat(name));
      }
      if (!Array.isArray(((_d = s.dependsOn) !== null && _d !== void 0 ? _d : [])) || ((_e = s.dependsOn) !== null && _e !== void 0 ? _e : []).some((function(d) {
        return typeof d !== 'string';
      }))) {
        throw new Error('Invalid dependencies');
      }
      services[name] = __assign(__assign({}, s), {
        args: ((_f = s.args) !== null && _f !== void 0 ? _f : []),
        cwd: fs.realpathSync(path.resolve(root, ((_g = s.cwd) !== null && _g !== void 0 ? _g : '.'))),
        ready: ((_h = s.ready) !== null && _h !== void 0 ? _h : 'process'),
        policy: policy(s.policy),
        dependsOn: ((_j = s.dependsOn) !== null && _j !== void 0 ? _j : [])
      });
      _l = _k.next();
    }
  } catch (error1) {
    e_3_1 = error1;
    e_3 = {
      error: e_3_1
    };
  } finally {
    try {
      if (_l && !_l.done && (_a = _k.return)) {
        _a.call(_k);
      }
    } catch (error1) {
      __caught = error1;
      throw __caught;
    } finally {
      if (e_3) {
        throw e_3.error;
      }
    }
  }
  order = [];
  visiting = new Set();
  visited = new Set();
  Object.keys(services).forEach(visit);
  return {
    services: services,
    order: order
  };
};

request = function(root, command, target, extra) {
  var p;
  if (extra === void 0) {
    extra = {};
  }
  p = paths(root);
  return new Promise(function(resolve, reject) {
    var buffer, socket;
    socket = net.createConnection(p.socket);
    buffer = '';
    socket.setTimeout(45000, function() {
      return socket.destroy(new Error('Supervisor request timed out'));
    });
    socket.on('connect', function() {
      return socket.write(JSON.stringify(__assign({
        version: 1,
        command: command,
        target: target
      }, extra)) + '\n');
    });
    socket.on('error', reject);
    socket.on('data', function(data) {
      var e, result;
      buffer += data;
      if (buffer.length > 2 * 1024 * 1024) {
        return socket.destroy(new Error('Response too large'));
      }
      if (!buffer.includes('\n')) {
        return;
      }
      socket.end();
      try {
        result = JSON.parse(buffer.split('\n')[0]);
        if (!result.ok) {
          reject(new Error(result.error));
        } else {
          resolve(result.result);
        }
      } catch (error1) {
        e = error1;
        reject(e);
      }
    });
    socket.on('end', function() {
      if (!buffer.includes('\n')) {
        reject(new Error('Supervisor disconnected'));
      }
    });
  });
};

waitForReady = async function(root, target, timeoutMs) {
  var deadline, last, service, snapshot;
  if (timeoutMs === void 0) {
    timeoutMs = 120000;
  }
  if (false) {
    await void 0;
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) {
    throw new Error('Invalid readiness timeout');
  }
  deadline = Date.now() + timeoutMs;
  last = void 0;
  while (Date.now() < deadline) {
    snapshot = (await (request(root, 'status')));
    service = snapshot.services.find(function(item) {
      return item.name === target;
    });
    if (!service) {
      throw new Error('Unknown service: '.concat(target));
    }
    last = service;
    if (service.state === 'running' && (service.health === 'ready' || service.health === 'unknown')) {
      return service;
    }
    if (service.state === 'failed' || service.state === 'blocked') {
      throw new Error(service.error || 'Service '.concat(target, ' did not start'));
    }
    await sleep(100);
  }
  throw new Error('Service '.concat(target, ' did not become ready within ').concat(timeoutMs, 'ms').concat(((last === null || last === void 0 ? void 0 : last.error) ? ': '.concat(last.error) : '')));
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

__read = this && this.__read || function(o, n) {
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

fs = require('node:fs');

path = require('node:path');

net = require('node:net');

crypto = require('node:crypto');

sleep = function(ms) {
  return new Promise(function(r) {
    return setTimeout(r, ms);
  });
};

module.exports = {
  atomic: atomic,
  read: read,
  paths: paths,
  identity: identity,
  alive: alive,
  sleep: sleep,
  policy: policy,
  configuration: configuration,
  request: request,
  waitForReady: waitForReady,
  conflictingProcess: conflictingProcess
};
