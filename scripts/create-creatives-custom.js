/*eslint-disable */
/**
 *
 * This script creates a creative for each price point specified in
 * ./price-points.json.
 *
 * Usage:
 *
 *   $ node scripts/create-creatives.js --advertiser Prebid
 *
 */
/*eslint-enable */
'use strict';

var Bluebird = require('bluebird');
var _ = require('lodash');
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

// read command line arguments
var advertiser = argv.advertiser;
/*
var channel = argv.channel;
var region = argv.region;
var position = argv.position;
var platform = argv.platform;
*/


// use arguments to determine any other variables
/*
var sizes = require('./sizes')(platform);
var size = sizes[position];
*/
//var sizes = require('./sizes_tv2');
var sizes = [
  '_1',
  '_2',
  '_3',
  '_4',
  '_5'
]
var creatives;

var CONCURRENCY = {
  concurrency: 1
};

//console.log(process.argv.slice(2).join(' '));

function getCombinations() {
  var combinations = [];

  _.forEach(sizes, function(size) {

    var creative = formatter.formatCreative({
      size: '1x1',
      advertiser: advertiser,
      customName: 'autogen'+size
    });

    combinations.push(creative);

  });

  progressBar = new ProgressBar('Progress [:bar] :percent :elapsed', {
    total: combinations.length + 1
  });

  return combinations;
}

function prepareCreative(creative) {
  return dfp.prepareCreative(creative)
    .tap(advanceProgress);
}

function createCreatives(creatives) {
  return dfp.createCreatives(creatives);
}

function logSuccess(results) {
  if (results) {
    advanceProgress();
    console.log('sucessfully created creatives');
    console.log('Use this ids to make associations');
    console.log(results.map(function (item) {
      return item.id;
    }));
  }
}

function handleError(err) {
  console.log('creating creatives failed');
  console.log('because', err.stack);
}

function advanceProgress() {
  progressBar.tick();
}

Bluebird.resolve(getCombinations())
  .map(prepareCreative, CONCURRENCY)
  .then(createCreatives)
  .then(logSuccess)
  .catch(handleError);
