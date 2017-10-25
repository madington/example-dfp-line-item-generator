/**
 * Generate a range of price points.
 * @param  {Number} start       Starting price point.
 * @param  {Number} end         Ending price point.
 * @return {Array}              Price points.
 */
var generatePricePoints = function(start, end) {
  var points = [];

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

var array = generatePricePoints(0, 250);

array.forEach((price)=>{
  console.log(price);
});
