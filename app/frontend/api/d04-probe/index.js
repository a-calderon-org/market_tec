'use strict';
const { probe } = require('../lib/proxy');

// Browser check of the same-origin cookie path (D-04). Disabled unless MTEC_D04_PROBE=enabled.
module.exports = async function (context, req) {
  context.res = probe(req, process.env);
};
