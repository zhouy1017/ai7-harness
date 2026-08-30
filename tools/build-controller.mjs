try {
  const implementation = await import('./build.mjs');
  if (typeof implementation.runBuild !== 'function') throw new TypeError('Build owner is absent.');
  await implementation.runBuild();
} catch {
  console.error('BUILD/unclassified');
  process.exitCode = 1;
}
