const csvtojsonV2 = require("csvtojson");
const fetch = require("node-fetch");
const csvFilePath = 'input_large.csv';

var readServersFromCSV = async function(csvFile) {
    return csvtojsonV2().fromFile(csvFile);
};

var getDataFromComputeAPIV3 = async function() {
    const url = 'https://azure.microsoft.com/api/v3/pricing/virtual-machines/calculator/';
    var response = await fetch(url);
    var rawData = await response.json();
    var offers = rawData.offers;

    var SKUs = [];
    Object.keys(offers).forEach(e => {
        var sku = offers[e];
        sku.name = e;
        SKUs.push(sku);
    });
    return SKUs;
};

var match = async function(servers, SKUs, region) {
    servers.forEach(server => {
        var serverCores = server.Cores;
        var serverMemory = server.Memory;
        var candidates = SKUs
            .filter(SKU => SKU.cores >= serverCores)
            .filter(SKU => SKU.ram >= serverMemory)
            .filter(SKU => !SKU.series.startsWith('A'))
            .filter(SKU => !SKU.series.startsWith('N'))
            .filter(SKU => (server.UseRI == 'false' && !!SKU.prices.perhour && !!SKU.prices.perhour[region]) |
                            server.UseRI == 'true' && !!SKU.prices.perhourreservedoneyear || )
            .filter(SKU => server.RequiresSSD == 'true' ? SKU.series.includes('s') : !SKU.series.includes('s'))
            .filter(SKU => !SKU.name.includes('lowpriority'))
            .sort((first,second) => (first.prices.perhour[region].value > second.prices.perhour[region].value) ? 1 : -1);

        candidates.forEach(SKU => {
            SKU.price = SKU.prices.perhour[region].value;
        });

        server.Match = candidates[0];
    });
    return servers;
};

var main = async function() {
    var servers = await readServersFromCSV(csvFilePath);
    var azureInstances = await getDataFromComputeAPIV3();

    var matches = await match(servers, azureInstances, 'europe-west');
    console.log(matches);
    //console.log(matches[6]);

}();