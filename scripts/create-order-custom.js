/*eslint-disable */
/**
 *
 * This script creates a new order tied to the advertiser you specify.
 *
 * Usage:
 *
 *   $ node scripts/create-order.js --advertiser Prebid --name ros
 *
 */
/*eslint-enable */
'use strict';

var Bluebird = require('bluebird');
var argv = require('minimist')(process.argv.slice(2));

var DFP_CREDS = require('../local/application-creds');
var config = require('../local/config');
var formatter = require('../lib/formatter');

var Dfp = require('node-google-dfp-wrapper');

var credentials = {
  clientId: DFP_CREDS.installed.client_id,
  clientSecret: DFP_CREDS.installed.client_secret,
  redirectUrl: DFP_CREDS.installed.redirect_uris[0]
};

var dfp = new Dfp(credentials, config, config.refreshToken);

var advertiser = argv.advertiser;

// This is the id of a DFP user that will be listed as trafficker.
var traffickerId = '244654568';

// Examples: PREBID_O_00001, PREBID_O_00401
/*
var name = [
  advertiser,
  'O',
  formatter.pad(offset, 5)
].join('_').toUpperCase();
*/
var name = `${advertiser}_${argv.name}`;

// Print out arguments so we can know which script is executing
console.log(process.argv.slice(2).join(' '));

function formatOrder() {
  var order = formatter.formatOrder(name, traffickerId, advertiser);
  return order;
}

function prepareOrder(order) {
  return dfp.prepareOrder(order);
}

function createOrder(order) {
  return dfp.createOrder(order);
}

function logSuccess(results) {
  if (results) {
    console.log('successfully created order', results.id, results.name);
  }
}

function handleError(err) {
  console.log('creating order failed');
  console.log('because', err.stack);
}

// MAIN
Bluebird.resolve(formatOrder())
  .then(prepareOrder)
  .then(createOrder)
  .then(logSuccess)
  .catch(handleError);
