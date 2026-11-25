#!/usr/bin/env node
'use strict';
module.exports = require('./dist/cli.cjs');
if (require.main === module) module.exports.main().then(code => { process.exitCode = code; }, error => { console.error(error.message); process.exitCode = 1; });
