'use strict';

var fs = require('fs');
var path = require('path');

var channelCriteria = require('../input/channel-criteria');
var geoCriteria = require('../input/geo-criteria');

/**
 * A mapping of what we call the position of an ad unit to how it is actually
 * named in our DFP inventory.
 * @type {Object}
 */
var desktopAdMappings = {
  SIDEBAR: 'SIDEBAR',
  SIDERAIL: 'SIDEBAR',
  SIDEBAR2: 'SIDEBAR_2',
  CONTENT: 'CONTENT',
  FOOTER: 'FOOTER',
  HEADER: 'HEADER'
};

/**
 * A mapping of what we call the position of an ad unit to how it is actually
 * named in our DFP inventory.
 * @type {Object}
 */
var mobileAdMappings = {
  CONTENT: 'CONTENT',
  HEADER: 'HEADER',
  MIDDLE: 'MIDDLE',
  ADHESION: 'NEW_ADHESION'
};

/**
 * A mapping of sizes.
 * @type {Array}
 */
 var SIZES = require('../scripts/sizes_tv2');

/**
 * Gets the geo targeting criteria as it it represented in DFP.
 * Caution: this is specific to Curiosity Media.
 *
 * @param  {String} region Either USA or INT
 * @return {Object}        The geo targeting criteria as represented in DFP.
 */
function pickGeoCriteria(region) {
  return geoCriteria[region];
}

/**
 * Gets the channel criteria as it it represented in DFP.
 * Caution: this is specific to Curiosity Media.
 *
 * @param  {String} channel Either A or B
 * @return {Object}         The channel criteria as represented in DFP.
 */
function formatChannel(channel) {
  return channelCriteria[channel];
}

/**
 * Convert a number from 1.75 to 0175
 *
 * @param  {Number} num  A number to convert
 * @param  {Number} size Number of digits of the desired number.
 * @return {String}      The number passed with periods removed and enough
 *                       leading zeroes to match the desired size.
 */
function pad(num, size) {
  var numString;
  var s;

  numString = num.toString();
  numString = numString.replace('.', '');

  s = "000000000" + numString;
  return s.substr(s.length - size);
}

/**
 * Formats a creativePlaceholder.
 *
 * @param  {Number} width
 * @param  {Number} height
 * @return {Object}         The creativePlaceholder as represented in DFP.
 */
function formatSize(width, height) {
  return {
    size: {
      width: width,
      height: height,
      isAspectRatio: 'false'
    },
    expectedCreativeCount: '1',
    creativeSizeType: 'PIXEL',
  }
}

/**
 * Formats creativePlaceholders.
 *
 * @param  {Array} sizes   Array of sizes.
 * @return {Array}         The creativePlaceholders as represented in DFP.
 */
function formatSizes(sizes) {
  return sizes.map(function(size){
    var wh = size.split('x');
    return formatSize(wh[0], wh[1])
  })
}

/**
 * Converts the details passed in into the object expected by the DFP api.
 * Calculates the line item name following the A/B testing framework convention.
 *
 * Caution: this is specific to Curiosity Media, you will need to change the
 * properties to match the line items you want to create.
 *
 * @param  {Object} lineItem The details used to calculate the line item.
 * @return {Object}          The line item as it should be represented in DFP.
 */
function formatLineItem(lineItem) {

  var cpm = lineItem.cpm;
  var date = lineItem.date;
  var customCriteriaKVPairs = lineItem.customCriteriaKVPairs;
  var orderName = lineItem.orderName;

  var lineItemName = [
    'PREBID',
    cpm
    /*pad(cpm, 5)*/
  ].join('_');

  return {
    orderId: lineItem.orderId,
    name: lineItemName,
    externalId: {},
    startDateTime: null,
    startDateTimeType: 'USE_START_DATE_TIME',
    autoExtensionDays: '0',
    unlimitedEndDateTime: 'true',
    creativeRotationType: 'EVEN',
    deliveryRateType: 'EVENLY',
    roadblockingType: 'ONE_OR_MORE',
    lineItemType: 'PRICE_PRIORITY',
    priority: '12',
    costPerUnit: {
      currencyCode: 'NOK',
      microAmount: (parseFloat(cpm) * 1000000).toFixed(0),
    },
    valueCostPerUnit: {
      currencyCode: 'NOK',
      microAmount: '0'
    },
    costType: 'CPM',
    discountType: 'PERCENTAGE',
    discount: '0.0',
    contractedUnitsBought: '0',
    creativePlaceholders: formatSizes(SIZES),
    environmentType: 'BROWSER',
    companionDeliveryOption: 'UNKNOWN',
    creativePersistenceType: 'NOT_PERSISTENT',
    allowOverbook: 'false',
    skipInventoryCheck: 'false',
    skipCrossSellingRuleWarningChecks: 'false',
    reserveAtCreation: 'false',
    stats: {
      impressionsDelivered: '0',
      clicksDelivered: '0',
      videoCompletionsDelivered: '0',
      videoStartsDelivered: '0'
    },
    deliveryData: {},
    budget: {
      currencyCode: 'NOK',
      microAmount: '0'
    },
    status: 'PAUSED',
    reservationStatus: 'UNRESERVED',
    isArchived: 'false',
    webPropertyCode: {},
    disableSameAdvertiserCompetitiveExclusion: 'true',
    lastModifiedByApp: 'Goog_DFPUI',
    lastModifiedDateTime: {},
    creationDateTime: {},
    isPrioritizedPreferredDealsEnabled: 'false',
    adExchangeAuctionOpeningPriority: '0',
    isSetTopBoxEnabled: 'false',
    isMissingCreatives: 'false',
    primaryGoal: {
      goalType: 'NONE',
      unitType: 'IMPRESSIONS',
      units: '-1'
    },
    targeting: {
      inventoryTargeting: {
        targetedAdUnits: [
          {
              "adUnitId": "21661848134",
              "includeDescendants": true
          }
        ]
      },
      customTargeting: {
        logicalOperator: "OR",
        children: [{
          attributes: {
            "xsi:type": "CustomCriteriaSet"
          },
          logicalOperator: "AND",
          children: []
        }]
      }
    },
    customCriteriaKVPairs: customCriteriaKVPairs,
    //orderName: orderName,
    date: date,
    adUnitName: lineItem.adUnitName
  };
}

/**
 * Reads a snippet html from local storage.
 *
 * @param  {String} partner Name of a partner
 * @return {String}         HTML snippet
 */
function loadSnippet(partner) {
  var fileName = '../input/snippets/' + partner + '_SNIPPET.html';
  var snippetPath = path.resolve(__dirname, fileName);
  var snippet = fs.readFileSync(snippetPath, 'utf8');
  return snippet;
}

/**
 * Converts the details passed in into the object expected by the DFP api.
 * Calculates the creative name following the A/B testing framework convention.
 * Note that advertiserId is null because it requires a lookup in DFP.
 *
 * Caution: this is specific to Curiosity Media, you will need to change the
 * properties to match the creative you want to create.
 *
 * @param  {Object} params The details used to calculate the creative.
 * @return {Object}        The creative as it should be represented in DFP.
 */
function formatCreative(params) {
  /*
  var channel = params.channel;
  var platform = params.platform;
  var size = params.size;
  var position = params.position;
  var region = params.region;
  var partner = params.partner;
  var number = params.number
  */
  const partner = params.advertiser;
  const size = params.size;
  const customName = params.customName;
  /*
  var name = [
    channel,
    platform + size + position,
    region,
    partner,
    number
  ].join('_').toUpperCase();
  */
  var name = `${customName}_${partner}_${size}`;
  //var snippet = loadSnippet(params.partner);
  var snippet = loadSnippet('EXAMPLE');

  return {
    attributes: {
      'xsi:type': 'ThirdPartyCreative'
    },
    advertiserId: null,
    name: name,
    size: {
      width: size.split('x')[0],
      height: size.split('x')[1],
      isAspectRatio: false
    },
    snippet: snippet,
    isSafeFrameCompatible: false,
    partner: partner
  };

}

/**
 * Creates an order in the format expected by the DFP API.
 *
 * @param  {String} name         The name of the order.
 * @param  {String} traffickerId The id of the user to be assigned as trafficker
 * @param  {String} partner      The name of the partner to assign the order to.
 * @return {Object}              The order as it should be represented in DFP.
 */
function formatOrder(name, traffickerId, partner) {

  return {
    name: name,
    unlimitedEndDateTime: true,
    status: 'DRAFT',
    currencyCode: 'NOK',
    advertiserId: null,
    traffickerId: traffickerId,
    appliedLabels: null,
    isProgrammatic: false,
    partner: partner
  };
}

/**
 * Generate a range of price points.
 * @param  {Number} start       Starting price point.
 * @param  {Number} end         Ending price point.
 * @return {Array}              Price points.
 */
var generatePricePoints = function(start, end) {
  var points = [];
  var lowInterval = 0.5;
  var highInterval = 1

  for (var i=start; i<=end; i++) {
    //points.push((i/100).toFixed(2));
    var iF = parseFloat(i);
    if(i < 100) {
      if(i === 0){
        points.push('0.50');
      } else {
        points.push(iF.toFixed(2))
        points.push((iF + 0.5).toFixed(2));
      }
    } else {
      points.push(iF.toFixed(2));
    }
  }

  return points;
}

module.exports = {
  formatLineItem: formatLineItem,
  formatChannel: formatChannel,
  formatCreative: formatCreative,
  formatOrder: formatOrder,
  generatePricePoints: generatePricePoints,
  pad: pad
};
