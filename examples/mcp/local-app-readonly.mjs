/**
 * Reference only: expose a SINGLE already-running app's non-sensitive health
 * through the shared, local-only MCP Gateway. No auto-start, no tunnel, no
 * system shell, no database, no user impersonation and no writes.
 *
 * Supply DEVPROXY_MCP_LOCAL_TOKEN and DEVPROXY_SAMPLE_APP_PORT from private
 * local environment management. Do not paste tokens into prompts or commit
 * them to configuration. The sample is NOT installed by the proxy at startup.
 */
import { createDevProxy, createLoopbackHealthApp } from '../../packages/dev-proxy-mcp/gateway.mjs';

const token=process.env.DEVPROXY_MCP_LOCAL_TOKEN;
const appPort=Number(process.env.DEVPROXY_SAMPLE_APP_PORT);
const listenPort=Number(process.env.DEVPROXY_MCP_PORT||5927);
if(typeof token!=='string'||token.length<32||!Number.isSafeInteger(appPort)||appPort<1||appPort>65535){
  process.stderr.write('Provide private DEVPROXY_MCP_LOCAL_TOKEN (32+ chars) and a pinned DEVPROXY_SAMPLE_APP_PORT. No listener started.\n');
  process.exitCode=1;
}else{
  const gateway=createDevProxy({
    token,
    apps:{sampleapp:createLoopbackHealthApp({label:'Opt-in local app health',port:appPort})},
  });
  const listener=await gateway.start({port:listenPort});
  process.stdout.write(`Local-only MCP read endpoint ready on 127.0.0.1:${listener.port}/mcp. No tunnel or public endpoint configured.\n`);
  const shutdown=()=>{void listener.close().then(()=>{process.exitCode=0;});};
  process.once('SIGINT',shutdown);
  process.once('SIGTERM',shutdown);
}
