'use strict';
const { handle, configV2FromEnv } = require('../lib/catalog-proxy');

module.exports = async function (context, req) {
  context.res = await handle(req, configV2FromEnv(process.env));
};
