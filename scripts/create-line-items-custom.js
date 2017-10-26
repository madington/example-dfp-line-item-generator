/*eslint-disable */
/**
 *
 * Creates a line item for each cent between a starting CPM and ending CPM.
 *
 * Usage:
 *
 *   $ node scripts/create-line-items.js --order ORDER_NAME --start 1 --end 1
 *
 */
/*eslint-enable */
'use strict';

var Bluebird = require('bluebird');
var ProgressBar = require('progress');
var progressBar;

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

//var orderName = argv.order;
var startInCents = argv.start;
var endInCents = argv.end;

var pricePoints = formatter.generatePricePoints(startInCents, endInCents);

var CONCURRENCY = {
  concurrency: 3
};

//console.log(orderName);
//console.log(process.argv.slice(2).join(' '));

function getCombinations() {
  var combinations = [];

  pricePoints.forEach(function(cpm) {
    var lineItem = formatter.formatLineItem({
      cpm: cpm,
      orderName: 'yo_first_order',
      customCriteriaKVPairs: {
        "hb_pb": (cpm.toString())
      },
      date: "10-26-2017, 15:00:00",
      adUnitName: 'TV2no'
    });
    //console.log(lineItem);
    combinations.push(lineItem);
  });

  progressBar = new ProgressBar('Progress [:bar] :percent :elapsed', {
    total: combinations.length + 1
  });
  //console.log('returning combos');
  return combinations;
}

function prepareLineItem(lineItem) {
  //console.log('prepare:', lineItem);
  //console.log('prepare');
  return dfp.prepareLineItem(lineItem)
    .tap(advanceProgress);
}

function createLineItems(lineItems) {
  //console.log(lineItems);
  //console.log('create');
  return dfp.createLineItems(lineItems);
}

function logSuccess(results) {
  if (results) {
    advanceProgress();
    console.log('successfully created lineItems');
  }
}

function handleError(err) {
  // So that we get an update on time elapsed after an error
  progressBar.tick();
  console.log('creating line items failed');
  console.log('because', err.stack);
}

function advanceProgress() {
  progressBar.tick();
}

Bluebird.resolve(getCombinations())
  .map(prepareLineItem, CONCURRENCY)
  .then(createLineItems)
  .then(logSuccess)
  .catch(handleError);
