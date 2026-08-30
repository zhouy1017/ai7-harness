const args = process.argv.slice(2);
if (args[0] === '--') args.shift();

if (args.length !== 2 || args[0] !== '--journey' || !['J-01', 'J-02', 'J-08', 'J-12'].includes(args[1])) {
  console.error('E2E/cli');
  process.exitCode = 1;
} else {
  await import(
    args[1] === 'J-01'
      ? './run-j01.mjs'
      : args[1] === 'J-02'
        ? './run-j02.mjs'
        : args[1] === 'J-08'
          ? './run-j08.mjs'
          : './run-j12.mjs'
  );
}
