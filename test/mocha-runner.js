const Mocha = require('mocha');
const path = require('path');
const glob = require('glob');

function run() {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 30000, // 30 seconds for process tests
  });

  const testsRoot = __dirname;

  return new Promise((c, e) => {
    try {
      // Add files to the test suite
      const files = glob.sync('**/**.test.js', { cwd: testsRoot });
      
      files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

      // Run the mocha test
      mocha.run(failures => {
        if (failures > 0) {
          e(new Error(`${failures} tests failed.`));
        } else {
          c();
        }
      });
    } catch (err) {
      console.error(err);
      e(err);
    }
  });
}

module.exports = { run };