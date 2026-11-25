var Supervisor, __assign, __read, __spreadArray, _a, configuration, fs, main, path, paths, request, rootFrom, sleep, spawn;

rootFrom = function(start) {
  var parent, root;
  root = path.resolve(start);
  while (!fs.existsSync(path.join(root, 'logos.supervisor.json'))) {
    parent = path.dirname(root);
    if (root === parent) {
      throw new Error('logos.supervisor.json not found');
    }
    root = parent;
  }
  return fs.realpathSync(root);
};

main = async function(argv, context) {
  var child;
  var connected;
  var n;
  var __caught, _a, _b, _c, args, c, child, child_1, close, command, connected, daemon_1, e, err, i, int, n, p, q, result, root, service, status, target, term;
  _a = void 0;
  if (argv === void 0) {
    argv = process.argv.slice(2);
  }
  if (context === void 0) {
    context = {};
  }
  if (false) {
    await void 0;
  }
  args = __spreadArray([], __read(argv), false);
  root = ((_a = context.root) !== null && _a !== void 0 ? _a : process.cwd());
  i = args.indexOf('--root');
  if (i !== -1) {
    if (!args[i + 1]) {
      throw new Error('--root requires a path');
    }
    root = args[i + 1];
    args.splice(i, 2);
  }
  _b = __read(args, 2);
  _c = _b[0];
  command = (_c === void 0 ? 'help' : _c);
  target = _b[1];
  if (command === 'help' || command === '--help') {
    console.log('logos supervisor run|start|stop|restart|status|pid|logs|shutdown|validate|systemd [service] [--root workspace]');
    return 0;
  }
  if (args.length > 2) {
    throw new Error('Unexpected arguments');
  }
  root = rootFrom(root);
  p = paths(root);
  if (command === 'validate') {
    c = configuration(root);
    console.log(JSON.stringify({
      valid: true,
      services: c.order
    }));
    return 0;
  }
  if (command === 'systemd') {
    q = function(value) {
      return '"' + value.replaceAll('%', '%%').replaceAll('\\', '\\\\').replaceAll('"', '\"').replaceAll('$', '$$') + '"';
    };
    console.log('[Unit]\nDescription=Logos workspace supervisor\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\nWorkingDirectory='.concat(q(root), '\nExecStart=').concat(q(process.execPath), ' ').concat(q(path.join(__dirname, 'systemd-entry.cjs')), ' --root ').concat(q(root), '\nRestart=on-failure\nRestartSec=2\nKillMode=control-group\nTimeoutStopSec=180\nUMask=0077\n\n[Install]\nWantedBy=multi-user.target'));
    return 0;
  }
  if (command === '--serve') {
    if (process.env.LOGOS_SUPERVISOR_LOCK !== p.lock) {
      throw new Error('Use run to acquire the supervisor lock');
    }
    daemon_1 = new Supervisor(root);
    await daemon_1.listen();
    close = function() {
      return daemon_1.close().catch(function(e) {
        console.error(e.message);
        process.exitCode = 1;
      });
    };
    process.once('SIGTERM', close);
    process.once('SIGINT', close);
    return 0;
  }
  if (command === 'run') {
    configuration(root);
    // flock holds an OS lock across exec, released on process death, no stale-PID guessing.
    child_1 = spawn('flock', ['--nonblock', '--no-fork', p.lock, process.execPath, __filename, '--serve', '--root', root], {
      stdio: 'inherit',
      env: __assign(__assign({}, process.env), {
        LOGOS_SUPERVISOR_LOCK: p.lock
      })
    });
    term = function() {
      return child_1.kill('SIGTERM');
    };
    int = function() {
      return child_1.kill('SIGINT');
    };
    process.once('SIGTERM', term);
    process.once('SIGINT', int);
    try {
      return (await (new Promise(function(resolve, reject) {
        child_1.once('error', reject);
        child_1.once('exit', function(code, signal) {
          return resolve((code !== null && code !== void 0 ? code : (signal ? 1 : 0)));
        });
      })));
    } catch (error1) {
      __caught = error1;
      throw __caught;
    } finally {
      process.removeListener('SIGTERM', term);
      process.removeListener('SIGINT', int);
    }
  }
  if (command === 'pid') {
    status = (await (request(root, 'status')));
    service = status.services.find(function(s) {
      return s.name === target;
    });
    if (!service) {
      throw new Error('Unknown service: '.concat(target));
    }
    if (!service.pid) {
      throw new Error('Service not running: '.concat(target));
    }
    console.log(service.pid);
    return 0;
  }
  if (command === 'start') {
    configuration(root);
    try {
      await request(root, 'status');
    } catch (error1) {
      e = error1;
      if (!['ENOENT', 'ECONNREFUSED'].includes(e.code)) {
        throw e;
      }
      child = spawn(process.execPath, [__filename, 'run', '--root', root], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      connected = false;
      n = 0;
      while (n < 400) {
        await sleep(100);
        try {
          await request(root, 'status');
          connected = true;
          break;
        } catch (error1) {
          err = error1;
          if (!['ENOENT', 'ECONNREFUSED'].includes(err.code)) {
            throw err;
          }
        }
        n++;
      }
      if (!connected) {
        throw new Error('Supervisor did not start; run in foreground for diagnostics');
      }
    }
  }
  result = (await (request(root, (command === 'start' && !target ? 'status' : command), target)));
  console.log((typeof result === 'string' ? result : JSON.stringify(result, null, 2)));
  return 0;
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

__spreadArray = this && this.__spreadArray || function(to, from, pack) {
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

fs = require('node:fs');

path = require('node:path');

spawn = require('node:child_process').spawn;

_a = require('./common.cjs');

paths = _a.paths;

configuration = _a.configuration;

sleep = _a.sleep;

request = _a.request;

Supervisor = require('./index.cjs').Supervisor;

module.exports = {
  main: main,
  rootFrom: rootFrom
};

if (require.main === module) {
  main().then((function(code) {
    process.exitCode = code;
  }), function(e) {
    console.error('[supervisor] '.concat(e.message));
    process.exitCode = 1;
  });
}
