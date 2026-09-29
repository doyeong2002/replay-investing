import { spawn } from 'node:child_process';

const children = [
  spawn('node',['scripts/toss-local-proxy.mjs'],{stdio:'inherit'}),
  spawn('vinext',['dev'],{stdio:'inherit'}),
];

let stopping = false;
function stop(signal='SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill(signal);
}

process.on('SIGINT',()=>stop('SIGINT'));
process.on('SIGTERM',()=>stop('SIGTERM'));
for (const child of children) child.on('exit',code=>{
  if (!stopping && code) {
    stop();
    process.exitCode=code;
  }
});
