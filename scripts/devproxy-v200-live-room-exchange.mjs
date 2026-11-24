// Historical diagnostic is retained in the immutable V200 return; it was not a Room integration.
// Do not run a credential-copying, one-shot pilot or write directly into Room exchange files.
process.stderr.write('V200_DIAGNOSTIC_RETIRED: use the authenticated canonical Room integration.\n');
process.exitCode=2;
