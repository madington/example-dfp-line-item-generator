# Workflow

## Create order
```bash
$ node scripts/create-order-custom.js --advertiser Prebid --name ros
```

The name of the order will be a concatinated word of `[advertiser]_[name]`

## Create line-items
```bash
$ node scripts/create-line-items-custom.js --order 000000 --start 0 --end 250
```
Where `--start` and `--end` is the price range and `--order` is the newly created order id.

## Create creatives (optional)
```bash
$ node scripts/create-creatives-custom.js --advertiser Prebid
```
Creates creatives by all sizes in the file `/scripts/sizes_tv2.js` and for the specified advertiser name.

Note the returned creatives IDs in the output. Use it in the file `/scripts/create-associations-custom.js` to make the association in the next step.

## Associate creatives (optional)
```bash
$ node scripts/create-associations-custom.js --order 12345
```
All line-items for `--orderid` will be associated with the creatives ids in the `creatives` variable
