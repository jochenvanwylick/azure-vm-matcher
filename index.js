const csvtojsonV2 = require("csvtojson");
const fetch = require("node-fetch");
const csvFilePath = 'input.csv';

/**
 * Reads the server information that need to be mapped onto Azure VMs as array of JSON objects.
 * Each object should contain:
 * - VM Name
 * - Cores
 * - Memory
 * - Storage
 * - RequiresSSD
 * - PreferRI
 * - RIDuration
 * @param {filename} csvFile
 */
var readServersFromCSV = async function (csvFile) {
    var result = await csvtojsonV2().fromFile(csvFile);
    result.forEach(server => {
        server.Cores = Number.parseInt(server.Cores);
        server.Memory = Number.parseInt(server.Memory);
        server.Storage = Number.parseInt(server.Storage);
        server.RIDuration = Number.parseInt(server.RIDuration);
        server.RequiresSSD = server.RequiresSSD === 'true';
        server.PreferRI = server.PreferRI === 'true';
    });

    return result;
};

var getDataFromComputeAPIV3 = async function () {
    const url = 'https://azure.microsoft.com/api/v3/pricing/virtual-machines/calculator/';
    var response = await fetch(url);
    var rawData = await response.json();
    var offers = rawData.offers;

    var SKUs = [];
    Object.keys(offers).forEach(prop => {
        var sku = offers[prop];
        sku.name = prop;
        SKUs.push(sku);
    });
    return SKUs;
};

var match = async function (servers, SKUs, region) {
    servers.forEach(server => {
        var serverCores = server.Cores;
        var serverMemory = server.Memory;
        var candidates = SKUs
            .filter(SKU => SKU.cores >= serverCores)            // Ensure Azure VM has eq or more cores
            .filter(SKU => SKU.ram >= serverMemory)             // Ensure Azure VM has eq or more cores
            .filter(SKU => !SKU.series.startsWith('A'))         // Ensure Azure VM is not an A series
            .filter(SKU => !SKU.series.startsWith('N'))         // or N-series ( GPU )
            .filter(SKU => !SKU.name.includes('lowpriority'))   // or Low Priority SKU
            .filter(SKU => server.RequiresSSD == 'true' ? SKU.series.includes('s') : !SKU.series.includes('s'));

        if (server.PreferRI === true) {
            candidates.forEach(SKU => {
                switch (server.RIDuration) {
                    case 1:
                        SKU.price = SKU.prices.perhouroneyearreserved && SKU.prices.perhouroneyearreserved[region] ?
                            SKU.prices.perhouroneyearreserved[region].value :
                            !!SKU.prices.perhour[region] ? SKU.prices.perhour[region].value : null;
                        break;
                    case 3:
                        SKU.price = SKU.prices.perhourthreeyearreserved && SKU.prices.perhourthreeyearreserved[region] ?
                            SKU.prices.perhourthreeyearreserved[region].value :
                            !!SKU.prices.perhour[region] ? SKU.prices.perhour[region].value : null;
                        break;
                }
            });
        };
        candidates.filter(SKU => !!SKU.price);
        candidates.sort((first, second) => (first.price > second.price) ? 1 : -1);
        server.Match = candidates[0];
    });
    return servers;
};

var main = async function () {
    var servers = await readServersFromCSV(csvFilePath);
    var azureInstances = await getDataFromComputeAPIV3();

    var matches = await match(servers, azureInstances, 'europe-west');
    console.log(matches);
    //console.log(matches[6]);

}();