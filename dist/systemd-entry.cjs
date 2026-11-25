var __read, fail, fs, main, path;

fail = function(message) {
  console.error('[logos-supervisor] '.concat(message));
  process.exitCode = 1;
};

main = async function(argv) {
  var Supervisor, daemon, envFile, error, root, rootIndex, stat, values;
  if (argv === void 0) {
    argv = process.argv.slice(2);
  }
  if (false) {
    await void 0;
  }
  rootIndex = argv.indexOf('--root');
  if (rootIndex === -1 || !argv[rootIndex + 1] || argv.length !== 2) {
    return fail('usage: systemd-entry --root <workspace>');
  }
  root = path.resolve(argv[rootIndex + 1]);
  envFile = process.env.LOGOS_SUPERVISOR_ENV_JSON;
  if (envFile) {
    stat = void 0;
    try {
      stat = fs.statSync(envFile);
    } catch (error1) {
      error = error1;
      return fail('cannot read environment file: '.concat(error.message));
    }
    if (stat.uid !== process.getuid() || stat.mode & 63) {
      return fail('environment file must be private and owned by the service user');
    }
    values = void 0;
    try {
      values = JSON.parse(fs.readFileSync(envFile, 'utf8'));
    } catch (error1) {
      error = error1;
      return fail('invalid environment file: '.concat(error.message));
    }
    if (!values || typeof values !== 'object' || Array.isArray(values) || Object.entries(values).some((function(_a) {
      var _b, key, value;
      _b = __read(_a, 2);
      key = _b[0];
      value = _b[1];
      return !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== 'string';
    }))) {
      return fail('invalid environment entries');
    }
    Object.assign(process.env, values);
  }
  process.env.LOGOS_SUPERVISOR_ROOT = root;
  // systemd is already the exclusive process owner.  Running the daemon in
  // this process gives the unit a stable MainPID and avoids an intermediate
  // CLI/flock process being mistaken for a clean supervisor shutdown.
  Supervisor = require('./index.cjs').Supervisor;
  daemon = new Supervisor(root);
  await daemon.listen();
  await new Promise(function(resolve) {
    var close, closing;
    closing = false;
    close = function() {
      if (closing) {
        return;
      }
      closing = true;
      daemon.close().catch(function(error) {
        console.error('[logos-supervisor] shutdown failed: '.concat(error.message));
        process.exitCode = 1;
      }).finally(resolve);
    };
    process.once('SIGTERM', close);
    process.once('SIGINT', close);
  });
};

'use strict';

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

// Auditable systemd entrypoint. It keeps secrets out of the unit and replaces
// the migration-only Python launcher without introducing PM2 as a dependency.
fs = require('node:fs');

path = require('node:path');

main().catch(function(error) {
  return fail(error.message);
});
