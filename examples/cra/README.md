CRA under a subpath (/myapp/)

Key Nginx rules:

1) Base route serves upstream index (strip prefix only here)
```
location = /myapp { rewrite ^ /myapp/ last; }
location = /myapp/ { proxy_pass http://MY_CRA_DEV:3000/; }
```

2) App routes preserve prefix; assets/HMR map to upstream root
```
location ^~ /myapp/ { proxy_pass http://MY_CRA_DEV:3000; }
location ^~ /myapp/static/ { proxy_pass http://MY_CRA_DEV:3000/static/; }
location ^~ /sockjs-node {
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_pass http://MY_CRA_DEV:3000/sockjs-node;
}
location = /asset-manifest.json { proxy_pass http://MY_CRA_DEV:3000/asset-manifest.json; }
location = /favicon.ico { proxy_pass http://MY_CRA_DEV:3000/favicon.ico; }
```

Notes
- Keep API calls as absolute-origin paths (/api/..); set X-Forwarded-* headers and disable proxy_redirect for /api/ if upstream issues redirects.
- Don’t special-case hash routes in app code; the base route mapping handles them.

