const args = process.argv.slice(2);
if (args[0] === '--') args.shift();

if (args.length !== 2 || args[0] !== '--journey' || (args[1] !== 'J-01' && args[1] !== 'J-02')) {
  console.error('E2E/cli');
  process.exitCode = 1;
} else {
  await import(args[1] === 'J-01' ? './run-j01.mjs' : './run-j02.mjs');
}
