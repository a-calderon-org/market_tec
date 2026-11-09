'use strict';
const { handle, configFromEnv } = require('../lib/catalog-proxy');

module.exports = async function (context, req) {
  context.res = await handle(req, configFromEnv(process.env));
};
