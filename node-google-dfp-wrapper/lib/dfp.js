'use strict';

var nodeGoogleDfp = require('node-google-dfp');
var Bluebird = require('bluebird');
var path = require('path');
var _ = require('lodash');
var levelup = require('level');
var moment = require('moment');

var DfpUser = require('./user').DfpUser;

var CONCURRENCY = {
  concurrency: 1
};

/**
 * These leveldb stores are used to cache lookups to DFP so that anything that
 * has already been queried before does not require a call over the network. If
 * the cache becomes invalid, delete the directories created in local/
 */
var criteriaKeyPath = path.resolve(__dirname, '../local/criteriaKeyStore');
var criteriaValuePath = path.resolve(__dirname, '../local/criteriaValueStore');
var adUnitPath = path.resolve(__dirname, '../local/adUnitStore');
var orderPath = path.resolve(__dirname, '../local/orderStore');
var labelPath = path.resolve(__dirname, '../local/labelStore');

var LINE_ITEM_FIELDS = [
  'costType',
  'creationDateTime',
  'deliveryRateType',
  'endDateTime',
  'externalId',
  'id',
  'isMissingCreatives',
  'isSetTopBoxEnabled',
  'lastModifiedDateTime',
  'lineItemType',
  'name',
  'orderId',
  'startDateTime',
  'status',
  'targeting',
  'unitsBought',
];

var CRITERIA_VALUE_FIELDS = [
  'id',
  'customTargetingKeyId',
  'name',
  'displayName',
  'matchType',
];

var CRITERIA_KEY_FIELDS = [
  'id',
  'name',
  'displayName',
  'type',
];

var AD_UNIT_FIELDS = [
  'adUnitCode',
  'id',
  'name',
  'parentId',
  'status',
  'lastModifiedDateTime',
];

var ORDER_FIELDS = [
  'advertiserId',
  'endDateTime',
  'id',
  'name',
  'salespersonId',
  'startDateTime',
  'status',
  'traffickerId',
  'lastModifiedDateTime',
];

var ADVERTISER_FIELDS = [
  'id',
  'name',
  'type',
  'lastModifiedDateTime',
];

var LABEL_FIELDS = [
  'id',
  'type',
  'name',
  'description',
  'isActive',
];

var CREATIVE_FIELDS = [
  'id',
  'name',
  'advertiserId',
  'width',
  'height',
  'lastModifiedDateTime',
];

var ASSOCIATION_FIELDS = [
  'creativeId',
  'manualCreativeRotationWeight',
  'destinationUrl',
  'lineItemId',
  'status',
  'lastModifiedDateTime',
];

var criteriaKeyStore = levelup(criteriaKeyPath);
var criteriaValueStore = levelup(criteriaValuePath);
var adUnitStore = levelup(adUnitPath);
var orderStore = levelup(orderPath);
var labelStore = levelup(labelPath);

Bluebird.promisifyAll(criteriaKeyStore);
Bluebird.promisifyAll(criteriaValueStore);
Bluebird.promisifyAll(adUnitStore);
Bluebird.promisifyAll(orderStore);
Bluebird.promisifyAll(labelStore);

/**
 * Calling this constructor instantiates the client to the DFP api.
 * @class
 *
 * @param {Object} credentials  Credentials generated by DFP. Instructions in
 *                              the README.
 * @param {[type]} config       Configuration object. Instructions in the
 *                              README.
 * @param {[type]} refreshToken Refresh token to resume a session with DFP, as
 *                              opposed to obraining a new one. Instructions
 *                              in the README.
 */
function Dfp(credentials, config, refreshToken) {

  this.dfpUser = new DfpUser(
    config.networkCode,
    config.appName,
    config.version
  );

  this.dfpUser.setSettings({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: refreshToken,
    redirect_url: credentials.redirectUrl,
  });
}

/**
 * Converts an object of conditions and possible query fields into a
 * node-google-dfp statement to query DFP.
 *
 * @param  {Object} conditions An object of the properties you'd like to query
 *                             and the values you'd like them to contain.
 * @param  {Array} fields      All the fields it is possible to query, as
 *                             detailed in the DFP api.
 * @return {Object}            node-google-dfp statement.
 */
function _makeQuery(conditions, fields) {
  // build up 'Where' string
  var query = fields.reduce(function(condition, field) {
    var addition = '';
    if (conditions[field]) {
      addition += field;
      addition += ' like \'';
      addition += conditions[field];
      addition += '\' and ';
    }
    return condition + addition;
  }, 'Where ');

  // remove final 'and'
  query = query.replace(/ and $/, '');
  //query = 'Where name like \'Liner\'';
  return new nodeGoogleDfp.Statement(query);
}

/**
 * Updates line items in DFP. Caution: archived line items cannot be updated and
 * attempting to do so will throw an error. It is best to filter out archived
 * line items before calling this method.
 *
 * @param  {Array} lineItems The line items with any updates already made.
 * @return {Array}           Updated line items. Should be the same as what was
 *                           passed it, with the addition of any fields created
 *                           by DFP
 */
Dfp.prototype.updateLineItems = function(lineItems) {
  var input = {
    'lineItems': lineItems
  };

  return this.dfpUser.executeAPIFunction(
    'LineItemService',
    'updateLineItems',
    input
  );
};

/**
 * Updates creatives in DFP. Caution: archived creatives cannot be updated and
 * attempting to do so will throw an error. It is best to filter out archived
 * creatives before calling this method.
 *
 * @param  {Array} creatives The creatives with any updates already made.
 * @return {Array}           Updated creatives. Should be the same as what was
 *                           passed it, with the addition of any fields created
 *                           by DFP
 */
Dfp.prototype.updateCreatives = function(creatives) {

  var input = {
    'creatives': creatives
  };

  return this.dfpUser.executeAPIFunction(
    'CreativeService',
    'updateCreatives',
    input
  );
};

/**
 * Extracts the results from a response passed in and throws an error if it does
 * not exist.
 * @param  {Object} response A response from the DFP API.
 * @return {Object}          The results.
 */
function extractResults(response) {
  //console.log('response', response);
  if (!response.results) {
    throw new Error('Expected to find results, but there were none');
  } else {
    return response.results;
  }
}

function extractFirstId(results) {
  if (!results[0] || !results[0].id) {
    throw new Error('expected to find an id, but didnt');
  } else {
    return results[0].id;
  }
}

/**
 * Queries DFP to get all line items that match the string passed in.
 *
 * @param  {Object} conditions Properties used for querying. This object can
 *                             include any properties that are valid PQL filters
 *                             in DFP.
 * @return {Array}             All matching line items found in DFP
 */
Dfp.prototype.getLineItems = function(conditions) {
  var service = 'LineItemService';
  var method = 'getLineItemsByStatement';

  var query = _makeQuery(conditions, LINE_ITEM_FIELDS);

  return this.dfpUser.executeAPIFunction(service, method, query)
    .then(extractResults);
};

/**
 * Gets the system assigned id of a given criteria key in DFP.
 *
 * @param  {Object} conditions Properties that the key in DFP should match.
 * @return {String}            The system assigned id of the passed in key.
 */
Dfp.prototype.getCriteriaKey = function(conditions) {
  //console.log('getCriteriaKey: ', conditions);
  var service = 'CustomTargetingService';
  var method = 'getCustomTargetingKeysByStatement';

  var query = _makeQuery(conditions, CRITERIA_KEY_FIELDS);
  //console.log('query::: ', query);
  return this.dfpUser.executeAPIFunction(service, method, query)
    .then(extractResults)
    .then(extractFirstId);
};

/**
 * Checks the local store for a criteria key matching the conditions passed in.
 * If it isn't found there, queries DFP and stores the results in the local
 * store.
 * @param  {String} name The name of the criteria key in DFP.
 * @return {String}      The system assigned id of the passed in key.
 */
Dfp.prototype.lookupCriteriaKey = function(name) {
  return criteriaKeyStore.getAsync(name)
    .bind(this)
    .catch(function() {
      // not found in store, look up instead
      var conditions = {
        name: name
      };

      return this.getCriteriaKey(conditions)
        .tap(function(id) {
          return criteriaKeyStore.putAsync(name, id)
            .catch(function(e) {
              console.log('locally storing criteria key failed', e);
              throw e;
            });
        });
    });
};

/**
 * Queries DFP to get all values that match the conditions passed in.
 *
 * @param  {Object} conditions Properties that the key in DFP should match.
 * @return {String}            The id the matching criteria value.
 */
Dfp.prototype.getCriteriaValues = function(conditions) {
  console.log('GET CRITERIAS CONDITIONS: ', conditions);
  var service = 'CustomTargetingService';
  var method = 'getCustomTargetingValuesByStatement';

  var query = _makeQuery(conditions, CRITERIA_VALUE_FIELDS);

  return this.dfpUser.executeAPIFunction(service, method, query)
    .then(extractResults);
};

/**
 * Gets the system assigned id of a given criteria value in DFP. Uses a local
 * store for caching.
 *
 * @param  {Object} conditions Properties that the key in DFP should match.
 * @return {String}            The id the matching criteria value.
 */
Dfp.prototype.getCriteriaValueId = function(conditions) {
  return this.getCriteriaValues(conditions)
    .then(extractFirstId);
};

/**
 * Sets up an alias to getCriteriaValueId to avoid breaking the API.
 * @deprecated
 */
Dfp.prototype.getCriteriaValue = Dfp.prototype.getCriteriaValueId;


/**
 * Gets the system assigned id of a given criteria value in DFP. Uses a local
 * store for caching.
 *
 * @param  {Object} conditions Properties that the key in DFP should match.
 * @return {String}            The id the matching criteria value.
 */
Dfp.prototype.getCriteriaValue = function(conditions) {

  var service = 'CustomTargetingService';
  var method = 'getCustomTargetingValuesByStatement';
  //var query = _makeQuery(conditions, CRITERIA_VALUE_FIELDS);
  var nQ = 'Where customTargetingKeyId = \'' + conditions.customTargetingKeyId + '\' and name like \'' + conditions.name + '\'';
  var newQuery = new nodeGoogleDfp.Statement(nQ)
  //var newQuery = query.replace(/like/i, '=');//query = '{ filterStatement: { query: \'Where customTargetingKeyId = \'' + conditions.customTargetingKeyId + '\' and name like \'' + conditions.name + '\'\' } }';
  console.log('query 2: ', newQuery);
  return this.dfpUser.executeAPIFunction(service, method, newQuery)
    .then(extractResults)
    .then(extractFirstId);
};

/**
 * Checks the local store for a criteria value matching the conditions passed
 * in. If it isn't found there, queries DFP and stores the results in the local
 * store.
 * @param  {String} value The name of the criteria value in DFP.
 * @param  {String} keyId The id of the criteria key in DFP that contains the
 *                        value you are looking up.
 * @return {String}       The system assigned id of the passed in key.
 */
Dfp.prototype.lookupCriteriaValues = function(value, keyId) {
  var lookupKey = keyId + ':' + value;

  return criteriaValueStore.getAsync(lookupKey)
    .bind(this)
    .catch(function() {
      // not found in store, look up in DFP instead
      var conditions = {
        name: value,
        customTargetingKeyId: keyId
      };

      return this.getCriteriaValue(conditions)
        .tap(function(valueId) {
          return criteriaValueStore.putAsync(lookupKey, valueId);
        })
        .catch(function(e) {
          console.log('locally storing criteria value failed', e);
          throw e;
        });
    })
    .then(function(id) {
      return [id];
    });
};

/**
 * Query DFP for the key id of a key value pair.
 *
 * @param  {Array} pair [0] The name of a key.
 *                      [1] The name of a value.
 * @return {Promise}    Resolves with an Array
 *                      [0] The dfp id of the key passed in.
 *                      [1] The name of value passed in (unchanged).
 */
function _lookupKeyInPair(pair) {
  var key = pair[0];
  var value = pair[1];
  return Bluebird.all([
    this.lookupCriteriaKey(key),
    value
  ]);
}

/**
 * Query DFP for the value id of a key value pair.
 *
 * @param  {Array} pair [0] The id of a key.
 *                      [1] The name of a value.
 * @return {Promise}    Resolves with an Array
 *                      [0] The dfp id of the key passed in (unchanged).
 *                      [1] The dfp id of value passed in.
 */
function _lookupValueInPair(pair) {
  var keyId = pair[0];
  var value = pair[1];
  return Bluebird.all([
    keyId,
    this.lookupCriteriaValues(value, keyId)
  ]);
}

/**
 * Convert an array of DFP key and value ids to an object.
 *
 * @param  {Array} pair [0] The id of a key.
 *                      [1] The id of a value.
 * @return {Object}     An object of the ids.
 */
function _convertPairToObject(pair) {
  var keyId = pair[0];
  var valueIds = pair[1];
  return {
    keyId: keyId,
    valueIds: valueIds
  };
}

/**
 * Find the DFP ids of the key value pairs passed in.
 * @param  {Object} criteria The key value pairs to look up.
 * @return {Array}           Objects containing the ids of the keys and values
 *                           passed in.
 */
Dfp.prototype.getCriteria = function(criteria) {
  return Bluebird.resolve(_.pairs(criteria))
    .bind(this)
    .map(_lookupKeyInPair, CONCURRENCY)
    .map(_lookupValueInPair, CONCURRENCY)
    .map(_convertPairToObject);
};

/**
 * Gets the system assigned id of the ad unit corresponding to the details
 * passed in. NOTE: the logic used to determine an ad unit name are specific to
 * Curiosity Media.
 *
 * @param  {Object} conditions Properties used for querying. This object can
 *                             include any properties that are valid PQL filters
 *                             in DFP.
 * @return {String}            The id of the ad unit matching the details passed
 *                             in.
 */
Dfp.prototype.getAdUnit = function(conditions) {
  //console.log('getAdUnit: ', conditions);
  var service = 'InventoryService';
  var method = 'getAdUnitsByStatement';

  var query = _makeQuery(conditions, AD_UNIT_FIELDS);

  return adUnitStore.getAsync(query)
    .bind(this)
    .catch(function() {
      return this.dfpUser.executeAPIFunction(service, method, query)
        .then(extractResults)
        .then(extractFirstId)
        .tap(function(id) {
          return adUnitStore.putAsync(conditions.name, id);
        });
    });
};

/**
 * Find the DFP id of the order passed in.
 *
 * @param  {Object} conditions Properties used for querying. This object can
 *                             include any properties that are valid PQL filters
 *                             in DFP.
 * @return {String}            The id of the order corresponding to the name
 *                             passed in.
 */
Dfp.prototype.getOrder = function(conditions) {
  //console.log('getOrder, conditions: ', conditions);
  var service = 'OrderService';
  var method = 'getOrdersByStatement';

  var query = _makeQuery(conditions, ORDER_FIELDS);

  return orderStore.getAsync(conditions.name)
    .bind(this)
    .catch(function() {
      return this.dfpUser.executeAPIFunction(service, method, query)
        .then(extractResults)
        .then(extractFirstId)
        .tap(function(id) {
          return orderStore.putAsync(conditions.name, id);
        })
        .catch(function(e) {
          console.log('locally storing order failed', e);
          throw e;
        });
    });
};

/**
 * Removes orderName in the passed in line item and adds the order id that
 * corresponds with that name.
 * @param  {Object} _lineItem A line item to be passed to DFP.
 * @return {Object}           A line item to be passed to DFP.
 */
Dfp.prototype.replaceOrderName = function(_lineItem) {

  var lineItem = _.cloneDeep(_lineItem);
  //console.log('replaceOrderName', lineItem);
  var conditions = {
    name: lineItem.orderName
  };

  return this.getOrder(conditions)
    .then(function(orderId) {
      lineItem.orderId = orderId;
      delete lineItem.orderName;
      return lineItem;
    });
};

/**
 * Removes adUnitName in the passed in line item and adds the ad unit id that
 * corresponds with that name.
 * @param  {Object} _lineItem A line item to be passed to DFP.
 * @return {Object}           A line item to be passed to DFP.
 */
Dfp.prototype.replaceAdUnitName = function(_lineItem) {
  var lineItem = _.cloneDeep(_lineItem);
  var conditions = {
    name: lineItem.adUnitName
  };

  return this.getAdUnit(conditions)
    .then(function(adUnitId) {
      lineItem.targeting.inventoryTargeting.targetedAdUnits = [{
        adUnitId: adUnitId,
        includeDescendants: true
      }];
      delete lineItem.adUnitName;
      return lineItem;
    });
};

/**
 * Removes customCriteriaKVPairs in the passed in line item and adds the keyId
 * and valueIds that correspond with that kvp to the line items custom
 * targeting.
 * @param  {Object} _lineItem A line item to be passed to DFP.
 * @return {Object}           A line item to be passed to DFP.
 */
Dfp.prototype.addCriteria = function(_lineItem) {
  var lineItem = _.cloneDeep(_lineItem);
  /*
  delete lineItem.customCriteriaKVPairs;
  return lineItem;
  */
  return this.getCriteria(lineItem.customCriteriaKVPairs)
    .then(function(criteria) {
      _.forEach(criteria, function(condition) {
        lineItem.targeting.customTargeting.children[0].children.push({
          "attributes": {
            "xsi:type": "CustomCriteria"
          },
          "keyId": condition.keyId,
          "valueIds": condition.valueIds,
          "operator": "IS"
        });
      });
      delete lineItem.customCriteriaKVPairs;
      return lineItem;
    });

};

/**
 * Removes date in the passed in line item and adds a startDateTime object that
 * corresponds with that date.
 * @param  {Object} _lineItem A line item to be passed to DFP.
 * @return {Object}           A line item to be passed to DFP.
 */
Dfp.prototype.replaceStartDate = function(_lineItem) {
  var lineItem = _.cloneDeep(_lineItem);
  var date = moment(lineItem.date, 'MM-DD-YYYY, H:mm:ss');
  lineItem.startDateTime = {
    date: {
      year: '' + date.year(),
      month: '' + (date.month() + 1),
      day: '' + date.date(),
    },
    hour: date.hour(),
    minute: date.minute(),
    second: '0',
    timeZoneID: 'Europe/Oslo'
  };
  delete lineItem.date;
  return lineItem;
};

/**
 * Modifies the line item passed in so that has the correct order id, ad unit
 * id, and criteria key and value ids, which are required in DFP. Prepares the
 * line item object for actually creating a line item in DFP.
 *
 * @param  {Object} lineItem Object representation of a line item.
 * @return {Object}          The original line item with additions. Ready  to be
 *                           passed to the method for creating a line item.
 */
Dfp.prototype.prepareLineItem = function(lineItem) {
  console.log('prepareLineItem')
  return Bluebird.resolve(lineItem)
    .bind(this)
    .then(this.replaceStartDate)
    .then(this.replaceOrderName)
    .then(this.replaceAdUnitName)
    .then(this.addCriteria);

};

/**
 * Creates a line item in DFP.
 *
 * @param  {Array} lineItems Line items to be created in DFP
 * @return {Object}          Response from the DFP api, containing the line
 *                           items if the creation succeeded or an error if
 *                           it failed.
 */
Dfp.prototype.createLineItems = function(lineItems) {
  console.log('createLineItems');
  var service = 'LineItemService';
  var method = 'createLineItems';
  var input = {
    lineItems: lineItems
  };
  //console.log('input: ', input);
  return this.dfpUser.executeAPIFunction(
    service,
    method,
    input
  );
};

/**
 * Find the DFP id of the advertiser passed in.
 *
 * @param  {Object} conditions Properties used for querying. This object can
 *                             include any properties that are valid PQL filters
 *                             in DFP.
 * @return {String}            The id of the advertiser corresponding to the
 *                             name passed in.
 */
Dfp.prototype.getAdvertiser = function(conditions) {
  var service = 'CompanyService';
  var method = 'getCompaniesByStatement';
  var query = _makeQuery(conditions, ADVERTISER_FIELDS);
  console.log('getAdv query: ', query);
  return this.dfpUser.executeAPIFunction(service, method, query)
    .then(extractResults)
    .then(extractFirstId);
};

/**
 * Gets the system assigned id of the label passed in.
 *
 * @param  {Object} conditions Properties used for querying. This object can
 *                             include any properties that are valid PQL filters
 *                             in DFP.
 * @return {String}            The system assigned id of the passed in label.
 */
Dfp.prototype.getLabel = function(conditions) {
  var service = 'LabelService';
  var method = 'getLabelsByStatement';

  var query = _makeQuery(conditions, LABEL_FIELDS);

  return this.dfpUser.executeAPIFunction(service, method, query)
    .then(extractResults)
    .then(extractFirstId);
};

/**
 * Gets the system assigned id of the label passed in. Uses a local store for
 * caching.
 *
 * @param  {Object} name The name of the label in DFP.
 * @return {String}      The system assigned id of the passed in label.
 */
Dfp.prototype.lookupLabel = function(name) {

  return labelStore.getAsync(name)
    .bind(this)
    .catch(function() {
      // not found in store, look up instead
      var conditions = {
        name: name
      };

      return this.getLabel(conditions)
        .tap(function(id) {
          return labelStore.putAsync(name, id)
            .catch(function(e) {
              console.log('locally storing label failed', e);
              throw e;
            });
        });
    });
};

/**
 * Gets the full creative matching the name passed in.
 *
 * @param  {Object} conditions Properties used for querying. This object can
 *                             include any properties that are valid PQL filters
 *                             in DFP.
 * @return {String}            The system assigned id of the passed in key.
 */
Dfp.prototype.getCreatives = function(conditions) {
  var ctx = this;
  var service = 'CreativeService';
  var method = 'getCreativesByStatement';

  var query = _makeQuery(conditions, CREATIVE_FIELDS);

  return ctx.dfpUser.executeAPIFunction(service, method, query)
    .then(extractResults);
};

Dfp.prototype.prepareCreative = function(creative) {

  return Bluebird.resolve(creative)
    .bind(this)
    .then(this.replacePartnerName);

};

/**
 * Gets the full creative matching the name passed in.
 *
 * @param  {Object} conditions Properties used for querying. This object can
 *                             include any properties that are valid PQL filters
 *                             in DFP.
 * @return {String}            The system assigned id of the passed in key.
 */
Dfp.prototype.getCreativesForAdvertiserId = function(advertiserId) {
  var ctx = this;
  var service = 'CreativeService';
  var method = 'getCreativesByStatement';
  var queryString = `WHERE advertiserId = \'${advertiserId}\'`;
  var query = new nodeGoogleDfp.Statement(query);//_makeQuery(conditions, CREATIVE_FIELDS);

  return ctx.dfpUser.executeAPIFunction(service, method, query)
    .then(extractResults);
};

Dfp.prototype.prepareCreative = function(creative) {

  return Bluebird.resolve(creative)
    .bind(this)
    .then(this.replacePartnerName);

};

/**
 * Creates a creatives in DFP.
 *
 * @param  {Array}  creatives Creatives to be created in DFP
 * @param  {String} partner   The name of the advertiser to associate this
 *                            creative with.
 * @return {Object}           Response from the DFP api, containing the
 *                            creatives if the creation succeeded or an error
 *                            if it failed.
 */
Dfp.prototype.createCreatives = function(creatives, partner) {
  var service = 'CreativeService';
  var method = 'createCreatives';

  var input = {
    creatives: creatives
  };

  return this.dfpUser.executeAPIFunction(
    service,
    method,
    input
  );
};

/**
 * Removes partner in the passed in line item and adds the advertiser id that
 * corresponds with that name.
 * @param  {Object} _item An order or creative to be passed to DFP.
 * @return {Object}       An order or creative to be passed to DFP.
 */
Dfp.prototype.replacePartnerName = function(_item) {
  var item = _.cloneDeep(_item);
  var conditions = {
    name: item.partner
  };

  return this.getAdvertiser(conditions)
    .then(function(advertiserId) {
      item.advertiserId = advertiserId;
      delete item.partner;
      return item;
    });
};

/**
 * Modifies the order passed in so that has the correct advertiser id, which is
 * required in DFP. Prepares the order object for actually creating an order
 * in DFP.
 *
 * @param  {Object} order Object representation of an order.
 * @return {Object}       The original order with additions. Ready to be passed
 *                        to the method for creating an order.
 */
Dfp.prototype.prepareOrder = function(order) {

  return Bluebird.resolve(order)
    .bind(this)
    .then(this.replacePartnerName);

};

/**
 * Creates an order in DFP.
 *
 * @param  {Object} order Order to be created in DFP
 * @return {Object}       Response from the DFP api, containing the order if the
 *                        creation succeeded or an error if it failed.
 */
Dfp.prototype.createOrder = function(order) {
  var service = 'OrderService';
  var method = 'createOrders';
  var input = {
    orders: order
  };

  return this.dfpUser.executeAPIFunction(
    service,
    method,
    input
  );
};

/**
 * Creates a line item creative association in DFP.
 *
 * @param  {Object} associations The ids of the line item and creative to
 *                               create an association for
 * @return {Object}              Response from the DFP api, containing the
 *                               line item associations if the creation
 *                               succeeded or an error if it failed.
 */
Dfp.prototype.createAssociations = function(associations) {

  var service = 'LineItemCreativeAssociationService';
  var method = 'createLineItemCreativeAssociations';
  var input = {
    lineItemCreativeAssociations: associations
  };

  return this.dfpUser.executeAPIFunction(
    service,
    method,
    input
  );
};

Dfp.prototype.updateAssociations = function(associations) {

  var service = 'LineItemCreativeAssociationService';
  var method = 'updateLineItemCreativeAssociations';

  var input = {
    'lineItemCreativeAssociations': associations
  };

  return this.dfpUser.executeAPIFunction(
    service,
    method,
    input
  );
};

Dfp.prototype.getAssociations = function(conditions) {

  var service = 'LineItemCreativeAssociationService';
  var method = 'getLineItemCreativeAssociationsByStatement';

  var query = _makeQuery(conditions, ASSOCIATION_FIELDS);

  return this.dfpUser.executeAPIFunction(service, method, query)
    .then(extractResults);
};

/**
 * Creates a new report job in DFP
 * @param  {Object} reportJob An object representation of the job you would like
 *                            to create.
 * @return {String}           The id of the report job you've created.
 */
Dfp.prototype.runReportJob = function(reportJob) {
  var service = 'ReportService';
  var method = 'runReportJob';
  var input = {
    reportJob: reportJob
  };

  return this.dfpUser.executeAPIFunction(
    service,
    method,
    input
  );
};

/**
 * Gets the status of a report in DFP
 * @param  {String} id The id of a report in DFP.
 * @return {String}    The status of the report in DFP.
 */
Dfp.prototype.getReportJobStatus = function(id) {
  var service = 'ReportService';
  var method = 'getReportJobStatus';
  var input = {
    reportJobId: id
  };

  return this.dfpUser.executeAPIFunction(
    service,
    method,
    input
  );
};

/**
 * Gets the url to download the results of a report job.
 * @param  {String} id           The id of a report in DFP.
 * @param  {String} exportFormat The format to export the report in.
 * @return {String}              The url to download the report
 */
Dfp.prototype.getReportDownloadURL = function(id, exportFormat) {
  var service = 'ReportService';
  var method = 'getReportDownloadURL';
  var input = {
    reportJobId: id,
    exportFormat: exportFormat
  };

  return this.dfpUser.executeAPIFunction(
    service,
    method,
    input
  );
};

/**
 * Creates a line item in DFP.
 *
 * @return {Object}          Response from the DFP api, containing the line
 *                           items if the creation succeeded or an error if
 *                           it failed.
 */
Dfp.prototype.getAllNetworks = function() {
  var service = 'NetworkService';
  var method = 'getAllNetworks';

  return this.dfpUser.executeAPIFunction(
    service,
    method,
    {}
  );
};

/**
 * Creates a line item in DFP.
 *
 * @return {Object}          Response from the DFP api, containing the line
 *                           items if the creation succeeded or an error if
 *                           it failed.
 */
Dfp.prototype.makeTestNetwork = function() {
  var service = 'NetworkService';
  var method = 'makeTestNetwork';

  return this.dfpUser.executeAPIFunction(
    service,
    method,
    {}
  );
};

module.exports = Dfp;