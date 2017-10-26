/*eslint-disable */
/**
 *
 * This script queries DFP for all line item for the partner you provide. It
 * then queries for all creatives for that partner. It matches the all line
 * items and creatives by name and creates a line-item-creative-association
 * for each pair.
 *
 * Usage:
 *
 *   $ node scripts/create-associations.js --partner PREBID
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

var CONCURRENCY = {
  concurrency: 1
};

var Dfp = require('node-google-dfp-wrapper');

var credentials = {
  clientId: DFP_CREDS.installed.client_id,
  clientSecret: DFP_CREDS.installed.client_secret,
  redirectUrl: DFP_CREDS.installed.redirect_uris[0]
};

var dfp = new Dfp(credentials, config, config.refreshToken);

var sizes_tv2 = require('./sizes_tv2');

// SET THE ORDER ID HERE


var creatives;

var sizes = sizes_tv2.map((size)=>{
  return {
    "width": size.split('x')[0],
    "height": size.split('x')[1],
    "isAspectRatio": false
  }
});

//console.log(process.argv.slice(2).join(' '));
//const id = '4463413328';
var query = {
  orderId: '2172772969'
};
/* Custom by Pontus */
const advertiserName = 'yo';
const creativesThatStartsWith = 'gen_'
/* Custom by Pontus */
// Get the advertiser ID
function getAdvertiserByName(name){
  return dfp.getAdvertiserByName(name)
}
/* Custom by Pontus */
function getCreatives(id){
  console.log('Advertiser id: ', id);
  return dfp.getCreativesForAdvertiserWithIdThatStartsWith(id, creativesThatStartsWith);
}
/* Custom by Pontus */
function getCreativeIds(creatives){
  return creatives.map((creative)=>{
    console.log(creative.name);
    return creative.id;
  })
}
/* Custom by Pontus */
function saveCreativeIds(creativeIds) {
  console.log(creativeIds);
  creatives = creativeIds;
}
/*
function getLineItems(query){
  return dfp.getLineItems(query);
}
*/
/* Custom by Pontus */
function getLineItems(){
  return dfp.getLineItems(query);
}

function prepareAssociations(lineItems) {
  var associations  = lineItems.map(function(lineItem) {
    return creatives.map(function(creativeId){
      return {
        lineItemId: lineItem.id,
        creativeId: creativeId,
        sizes: sizes
      };
    });
  });

  return associations;
}

function handleError(err) {
  console.log('creating all associations failed');
  console.log('because', err.stack);
}

function splitBatches(lineItems) {
  var batches = _.chunk(lineItems, 100);
  progressBar = new ProgressBar('Progress [:bar] :percent :elapseds', {
    total: batches.length + 1
  });
  return batches;
}

function createAssociations(associations) {
  return dfp.createAssociations(associations)
    .tap(advanceProgress);
}

function logSuccess(results) {
  if (results) {
    console.log('sucessfully created associations', results);
  }
}

function advanceProgress() {
  progressBar.tick();
}

function logFlattened(flattened){
  console.log('flattened length: ', flattened.length);
  /*
  flattened.forEach((item)=>{
    console.log(item);
  })
  */
}

// this function is to help debugging
/* eslint-disable */
function log(x){
  console.log(x);
}
/*eslint-enable */
/*
Bluebird.resolve(query)
  .then(getLineItems)
  .then(prepareAssociations)
  .then(_.flatten)
  .then(splitBatches)
  .map(createAssociations, CONCURRENCY)
  .then(logSuccess)
  .catch(handleError);
  */

Bluebird.resolve(advertiserName)
  .then(getAdvertiserByName)
  .then(getCreatives)
  .then(getCreativeIds)
  .then(saveCreativeIds)
  .then(getLineItems)
  .then(prepareAssociations)
  .then(_.flatten)
  .then(splitBatches)
  .map(createAssociations, CONCURRENCY)
  .then(logSuccess)
  .catch(handleError);
