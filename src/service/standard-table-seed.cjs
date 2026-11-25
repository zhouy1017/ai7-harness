/** Read only on install or historical replay. Literal imports let standalone test-tool bundles carry their own data. */
exports.readSeedRows = function readSeedRows(key) {
  switch (key) {
    case 'tgh-2013': return require('./standard-tables/seed/tgh-2013.json');
    case 'tgh-2013-annex-1': return require('./standard-tables/seed/tgh-2013-annex-1.json');
    case 'gf-1001-2001': return require('./standard-tables/seed/gf-1001-2001.json');
    case 'cycb-2': return require('./standard-tables/seed/cycb-2.json');
  }
};
