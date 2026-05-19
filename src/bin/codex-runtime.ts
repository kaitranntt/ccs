import { main } from './codex-runtime-router';
// -1 means CCS has taken over the process lifecycle; do not exit.
main(process.argv).then((code) => {
  if (code >= 0) process.exit(code);
});
