'use strict';
/**
 * V171 — four auth-prefix ^~ correction (Issue #177).
 * Source contract + disposable nginx:1.26.3-alpine fixture.
 * Models nested JSON vs ordinary/regex precedence; no live proxy mutation.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const net=require('node:net');
const {spawn,spawnSync}=require('node:child_process');

const ROOT=path.resolve(__dirname,'../..');
const DEFAULT_CONF=path.join(ROOT,'config/default.conf');
const IMAGE='nginx:1.26.3-alpine';
const PREFIXES=['/status','/reports','/health','/dashboard'];

const dockerOk=spawnSync('docker',['image','inspect',IMAGE],{encoding:'utf8',timeout:15000}).status===0;

function readDefault(){
  return fs.readFileSync(DEFAULT_CONF,'utf8');
}

function freePort(){
  return new Promise((resolve,reject)=>{
    const s=net.createServer();
    s.once('error',reject);
    s.listen(0,'127.0.0.1',()=>{
      const {port}=s.address();
      s.close(err=>err?reject(err):resolve(port));
    });
  });
}

function request(port,url,{cookie}={}){
  return new Promise((resolve,reject)=>{
    const req=http.get({
      hostname:'127.0.0.1',
      port,
      path:url,
      headers:cookie?{Cookie:cookie}:{},
      timeout:4000,
    },res=>{
      const chunks=[];
      res.on('data',c=>chunks.push(c));
      res.on('end',()=>resolve({
        status:res.statusCode,
        headers:res.headers,
        body:Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error',reject);
    req.on('timeout',()=>req.destroy(new Error('request timeout')));
  });
}

function buildServerBlock({caret}){
  const loc=p=>caret?`^~ ${p}`:p;
  return `
events { worker_connections 64; }
http {
  default_type text/plain;
  server {
    listen 8080;
    server_name _;

    location = /admin/check {
      internal;
      if ($http_cookie ~* "(^|;\\\\s*)dp_owner=1(;|$)") { return 200; }
      return 401;
    }
    location @login_redirect {
      default_type text/plain;
      return 401 'login-required';
    }

    location /status/assets/ {
      alias /usr/share/nginx/html/status/assets/;
      add_header Cache-Control "public, immutable";
    }

    location ${loc('/status')} {
      auth_request /admin/check;
      error_page 401 = @login_redirect;
      alias /usr/share/nginx/html/status;
    }

    location ${loc('/reports')} {
      auth_request /admin/check;
      error_page 401 = @login_redirect;
      alias /usr/share/nginx/html/status;
    }

    location ${loc('/health')} {
      auth_request /admin/check;
      error_page 401 = @login_redirect;
      alias /usr/share/nginx/html/status;
    }

    location ${loc('/dashboard')} {
      auth_request /admin/check;
      error_page 401 = @login_redirect;
      alias /usr/share/nginx/html/dashboard;
      location ~* \\\\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1h;
        add_header Cache-Control "public, immutable";
      }
    }

    location = /health.json {
      default_type application/json;
      add_header Cache-Control "no-store" always;
      return 200 '{"status":"ok"}';
    }

    location = /status.json {
      auth_request /admin/check;
      error_page 401 = @login_redirect;
      alias /usr/share/nginx/html/.artifacts/reports/health-latest.json;
      add_header Content-Type application/json;
    }

    location = /routes.json {
      auth_request /admin/check;
      error_page 401 = @login_redirect;
      alias /usr/share/nginx/html/.artifacts/reports/scan-apps-latest.json;
      add_header Content-Type application/json;
    }

    location ~* \\\\.(json)$ {
      root /usr/share/nginx/html;
      add_header Content-Type application/json;
      add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
  }
}
`;
}

async function withFixture({caret},fn){
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'devproxy-v171-ngx-'));
  const html=path.join(root,'html');
  const port=await freePort();
  const name=`devproxy-v171-${process.pid}-${port}`;
  try{
    await fsp.mkdir(path.join(html,'status','assets'),{recursive:true});
    await fsp.mkdir(path.join(html,'reports'),{recursive:true});
    await fsp.mkdir(path.join(html,'health'),{recursive:true});
    await fsp.mkdir(path.join(html,'dashboard'),{recursive:true});
    await fsp.mkdir(path.join(html,'.artifacts','reports'),{recursive:true});
    // Regex location uses root+URI; status/dashboard aliases coincide with that path.
    await fsp.writeFile(path.join(html,'status','private.json'),'{"leak":"status"}');
    await fsp.writeFile(path.join(html,'reports','private.json'),'{"leak":"reports"}');
    await fsp.writeFile(path.join(html,'health','private.json'),'{"leak":"health"}');
    await fsp.writeFile(path.join(html,'dashboard','private.json'),'{"leak":"dashboard"}');
    // Real source aliases /reports and /health onto the status tree; keep matching targets.
    await fsp.writeFile(path.join(html,'status','private-via-reports.json'),'{"leak":"reports-alias"}');
    await fsp.writeFile(path.join(html,'status','private-via-health.json'),'{"leak":"health-alias"}');
    await fsp.writeFile(path.join(html,'status','assets','logo.svg'),'<svg xmlns="http://www.w3.org/2000/svg"/>');
    await fsp.writeFile(path.join(html,'dashboard','app.js'),'console.log(1)');
    await fsp.writeFile(path.join(html,'dashboard','app.css'),'body{}');
    await fsp.writeFile(path.join(html,'.artifacts','reports','health-latest.json'),'{"detailed":true}');
    await fsp.writeFile(path.join(html,'.artifacts','reports','scan-apps-latest.json'),'{"routes":[]}');
    await fsp.writeFile(path.join(html,'other.json'),'{"public":true}');
    await fsp.writeFile(path.join(root,'nginx.conf'),buildServerBlock({caret}),{mode:0o600});

    const run=spawn('docker',[
      'run','--rm','--name',name,
      '--entrypoint','nginx',
      '-p',`127.0.0.1:${port}:8080`,
      '-v',`${path.join(root,'nginx.conf')}:/etc/nginx/nginx.conf:ro`,
      '-v',`${html}:/usr/share/nginx/html:ro`,
      IMAGE,'-g','daemon off;',
    ],{stdio:['ignore','pipe','pipe']});
    let stderr='';
    run.stderr.on('data',d=>{stderr+=String(d).slice(0,2000);});
    run.stdout.on('data',d=>{stderr+=String(d).slice(0,500);});

    let ready=false;
    for(let i=0;i<50;i++){
      try{
        const r=await request(port,'/health.json');
        if(r.status===200){ready=true;break;}
      }catch{}
      if(run.exitCode!=null)break;
      await new Promise(r=>setTimeout(r,100));
    }
    assert.equal(ready,true,`fixture nginx not ready: ${stderr.slice(0,400)}`);

    const get=(url,opts)=>request(port,url,opts);
    await fn({get,port});
    spawnSync('docker',['rm','-f',name],{encoding:'utf8',timeout:10000});
    await Promise.race([
      new Promise(resolve=>run.once('exit',resolve)),
      new Promise(resolve=>setTimeout(resolve,3000)),
    ]);
  }finally{
    spawnSync('docker',['rm','-f',name],{encoding:'utf8',timeout:5000});
    await fsp.rm(root,{recursive:true,force:true}).catch(()=>{});
  }
}

test('source: config/default.conf uses ^~ for all four auth UI prefixes',()=>{
  const src=readDefault();
  for(const p of PREFIXES){
    const caret=new RegExp(`^\\s*location \\^~ ${p.replace(/\//g,'\\/')} \\{`,'m');
    const ordinary=new RegExp(`^\\s*location ${p.replace(/\//g,'\\/')} \\{`,'m');
    assert.match(src,caret,`missing location ^~ ${p}`);
    assert.doesNotMatch(src,ordinary,`ordinary location ${p} must be removed`);
  }
  assert.match(src,/location\s+\/status\/assets\/\s*\{/);
  assert.match(src,/location\s+=\s+\/health\.json\s*\{/);
  assert.match(src,/location\s+=\s+\/status\.json\s*\{/);
  assert.match(src,/location\s+=\s+\/routes\.json\s*\{/);
  assert.match(src,/location\s+~\*\s+\\\.\(json\)\$\s*\{/);
});

test('model RED: ordinary prefixes allow anonymous nested JSON via late regex',{skip:!dockerOk,timeout:60000},async()=>{
  await withFixture({caret:false},async({get})=>{
    for(const [url,needle] of [
      ['/status/private.json','status'],
      ['/reports/private.json','reports'],
      ['/health/private.json','health'],
      ['/dashboard/private.json','dashboard'],
    ]){
      const anon=await get(url);
      assert.equal(anon.status,200,`baseline must expose ${url} without auth`);
      assert.match(anon.body,new RegExp(needle));
    }
  });
});

test('model GREEN: ^~ prefixes deny anonymous nested JSON on all four roots',{skip:!dockerOk,timeout:60000},async()=>{
  await withFixture({caret:true},async({get})=>{
    // status/dashboard: alias path == root+URI. reports/health: deny anonymous on prefix,
    // owner reads via real alias onto the status tree.
    const cases=[
      ['/status/private.json','status'],
      ['/reports/private-via-reports.json','reports-alias'],
      ['/health/private-via-health.json','health-alias'],
      ['/dashboard/private.json','dashboard'],
    ];
    for(const [url,needle] of cases){
      const anon=await get(url);
      assert.equal(anon.status,401,`anonymous ${url}`);
      const authed=await get(url,{cookie:'dp_owner=1'});
      assert.equal(authed.status,200,`owner ${url}`);
      assert.match(authed.body,new RegExp(needle));
    }

    assert.equal((await get('/status.json')).status,401);
    assert.equal((await get('/routes.json')).status,401);
    assert.equal((await get('/status.json',{cookie:'dp_owner=1'})).status,200);
    assert.equal((await get('/routes.json',{cookie:'dp_owner=1'})).status,200);

    const health=await get('/health.json');
    assert.equal(health.status,200);
    assert.equal(health.body,'{"status":"ok"}');

    const asset=await get('/status/assets/logo.svg');
    assert.equal(asset.status,200);
    assert.match(asset.body,/svg/i);

    assert.equal((await get('/dashboard/app.js')).status,401);
    assert.equal((await get('/dashboard/app.css')).status,401);
    const js=await get('/dashboard/app.js',{cookie:'dp_owner=1'});
    assert.equal(js.status,200);
    assert.match(String(js.headers['cache-control']||''),/public,\s*immutable/i);
    const css=await get('/dashboard/app.css',{cookie:'dp_owner=1'});
    assert.equal(css.status,200);
    assert.match(String(css.headers['cache-control']||''),/public,\s*immutable/i);

    const unrelated=await get('/other.json');
    assert.equal(unrelated.status,200);
    assert.match(unrelated.body,/public/);
  });
});
