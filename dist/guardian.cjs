var __assign, _a, atomic, child, config, finish, fs, identity, pendingLogs, record, send, signal, spawn, stop, stopping, timer;

send = function(value) {
  if (!process.connected) {
    return;
  }
  if (value.op === 'log') {
    if (pendingLogs >= 8) {
      return;
    }
    // fixed memory bound when the daemon cannot drain output
    pendingLogs++;
    process.send(value, function() {
      pendingLogs--;
    });
  } else {
    process.send(value, function() {});
  }
};

signal = function(value) {
  var e;
  if ((child === null || child === void 0 ? void 0 : child.pid)) {
    try {
      process.kill(-child.pid, value);
    } catch (error) {
      e = error;
      if (e.code != 'ESRCH') {
        send({
          op: 'diagnostic',
          error: e.message
        });
      }
    }
  }
};

finish = function(code, sig) {
  var _a;
  clearTimeout(timer);
  signal('SIGKILL');
  // descendants must not survive even a clean leader exit
  send({
    op: 'exit',
    code: code,
    signal: sig
  });
  if (record) {
    try {
      fs.unlinkSync(record);
    } catch (error) {
      _a = error;
    }
  }
  process.exit(0);
};

stop = function() {
  if (stopping) {
    return;
  }
  stopping = true;
  if (!child) {
    return finish(null, 'SIGTERM');
  }
  signal('SIGTERM');
  timer = setTimeout(function () {
  return signal('SIGKILL');
}, config.policy.stopTimeoutMs);
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

// This process owns one process group. IPC loss always tears that group down.
spawn = require('node:child_process').spawn;

fs = require('node:fs');

_a = require('./common.cjs');

atomic = _a.atomic;

identity = _a.identity;

child = void 0;

stopping = false;

timer = void 0;

record = void 0;

config = void 0;

pendingLogs = 0;

process.on('disconnect', stop);

process.on('SIGTERM', stop);

process.on('SIGINT', stop);

process.on('message', function(msg) {
  if (msg.op === 'stop') {
    return stop();
  }
  if (msg.op !== 'start' || config || stopping) {
    return;
  }
  config = msg.service;
  record = msg.record;
  atomic(record, {
    guardian: identity(process.pid)
  });
  child = spawn((config.command === 'node' ? process.execPath : config.command), config.args, {
    cwd: config.cwd,
    env: __assign(__assign(__assign({}, process.env), config.env), {
      LOGOS_SUPERVISOR_ROOT: msg.root,
      LOGOS_SUPERVISOR_SERVICE: msg.name
    }),
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  child.once('spawn', function() {
    atomic(record, {
      guardian: identity(process.pid),
      child: identity(child.pid)
    });
    send({
      op: 'spawn',
      pid: child.pid
    });
  });
  child.stdout.on('data', function(d) {
    return send({
      op: 'log',
      stream: 'stdout',
      text: d.toString().slice(0, 32768)
    });
  });
  child.stderr.on('data', function(d) {
    return send({
      op: 'log',
      stream: 'stderr',
      text: d.toString().slice(0, 32768)
    });
  });
  child.on('message', function(m) {
    if ((m === null || m === void 0 ? void 0 : m.type) === 'logos:ready' || (m === null || m === void 0 ? void 0 : m.type) === 'logos:heartbeat') {
      send({
        op: m.type
      });
    }
  });
  child.once('error', function(e) {
    send({
      op: 'diagnostic',
      error: e.message
    });
    finish(1, null);
  });
  child.once('exit', finish);
});
