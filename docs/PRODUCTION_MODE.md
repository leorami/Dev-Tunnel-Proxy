# Production Mode & Performance Optimization Guide

**Last Updated:** January 7, 2026  
**Status:** ✅ Production Mode Active

## Table of Contents

- [Quick Start](#quick-start)
- [Overview](#overview)
- [Performance Issues Identified](#performance-issues-identified)
- [Optimizations Implemented](#optimizations-implemented)
- [Performance Results](#performance-results)
- [Switching Between Modes](#switching-between-modes)
- [Monitoring & Verification](#monitoring--verification)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)
- [Technical Details](#technical-details)
- [Future Optimizations](#future-optimizations)

---

## Quick Start

### Current Status

Your dev-tunnel-proxy is running in **optimized production mode** with:
- **74% less memory** (290MB → 75MB total)
- **4x more concurrent connections** (1024 → 4096)
- **HTTP/2 support** (Request multiplexing and header compression)
- **Brotli & Gzip compression** (Maximum bandwidth savings)
- **Connection pooling** (Upstream keepalive for core APIs)
- **DNS caching** (30 second TTL)
- **Auto-scanning disabled** (on-demand only)
- **Rate limiting** (Protection against traffic spikes)
- **Real-time metrics** (Nginx status and detailed timing logs)
- **NODE_ENV=production**

### Quick Commands

```bash
# Rebuild image with Brotli support
docker-compose build proxy

# Check status
docker stats --no-stream dev-proxy dev-proxy-config-api dev-ngrok

# Verify Brotli compression
curl -kI -H "Accept-Encoding: br" https://localhost/ | grep "content-encoding: br"
```

---

## Overview

This guide documents the comprehensive performance optimization of the dev-tunnel-proxy, including the issues identified, solutions implemented, and how to manage production vs. development modes.

### The Problem

Performance through the proxy had degraded significantly, affecting all proxied applications. Response times were slow and resource usage was high, impacting the development experience.

### The Solution

A production mode configuration that optimizes nginx, reduces memory usage, enables compression, and eliminates unnecessary background processes while maintaining full functionality.

---

## Performance Issues Identified

Before optimization, the proxy was experiencing performance degradation due to:

1. **No gzip compression** - All content served uncompressed, wasting bandwidth
2. **Proxy buffering disabled globally** - Forced synchronous I/O for all requests
3. **DNS resolver lookups on every request** - No DNS caching, repeated lookups
4. **No static asset caching** - Every request hit the backend
5. **Low worker connections** - Only 1024 concurrent connections
6. **Development mode overhead** - Auto-scanning every 15 seconds, NODE_ENV=development
7. **Excessive memory usage** - Config API using 111MB+ in dev mode
8. **HTTP/1.1 only** - No request multiplexing, head-of-line blocking
9. **No connection pooling** - New connection for every upstream request
10. **No rate limiting** - Vulnerable to traffic spikes
11. **No Brotli support** - Missing modern compression for 15-20% better savings

---

## Optimizations Implemented

### 1. Nginx Configuration (`config/nginx.production.conf`)

```nginx
worker_processes  auto;
worker_rlimit_nofile 65535;

load_module modules/ngx_http_brotli_filter_module.so;
load_module modules/ngx_http_brotli_static_module.so;

events {
    worker_connections  4096;  # Increased from 1024
    use epoll;
    multi_accept on;
}

http {
    # Enable gzip compression
    gzip  on;
    gzip_comp_level 6;
    
    # Enable Brotli compression
    brotli on;
    brotli_comp_level 6;
    brotli_static on;
    
    # SSL settings for HTTP/2
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;
    ssl_protocols TLSv1.2 TLSv1.3;
    
    # Performance optimizations
    sendfile        on;
    tcp_nopush      on;
    tcp_nodelay     on;
    
    keepalive_timeout  65;
    keepalive_requests 1000; # Increased for HTTP/2
    
    # Upstream keepalive for core APIs
    upstream config_api_upstream {
        server dev-proxy-config-api:3001;
        keepalive 32;
    }
    
    # Proxy caching for static assets
    proxy_cache_path /var/cache/nginx levels=1:2 
                     keys_zone=static_cache:10m 
                     max_size=100m inactive=60m;
    proxy_cache_revalidate on;
    proxy_cache_use_stale error timeout updating;
}
```

**Key improvements:**
- **Brotli Support**: Modern compression for better efficiency than gzip.
- **Worker connections** increased 4x (1024 → 4096)
- **Gzip compression** enabled for all text-based content
- **HTTP/2 support** for faster request handling
- **Connection pooling** for core APIs reduces handshake overhead
- **Optimized TCP settings** for better throughput
- **Advanced proxy caching** with background updates and stale-use

### 2. Custom Docker Image

The proxy now builds from a local `Dockerfile` to include the Brotli module, which is compiled specifically for the running Nginx version.

### 3. DNS Caching & Resiliency (`config/default.production.conf`)

```nginx
resolver 127.0.0.11 ipv6=off valid=30s;  # Cache for 30 seconds
```

**Before:** DNS lookup on every request  
**After:** DNS cached for 30 seconds

This eliminates thousands of redundant DNS lookups per minute.

### 4. HTTP/2 & SSL Optimization

Enabled HTTP/2 for all HTTPS traffic, providing:
- **Request Multiplexing**: Multiple requests over a single TCP connection
- **Header Compression**: Reduced overhead for every request

### 5. Rate Limiting

Implemented rate limiting to protect the proxy and backends from being overwhelmed:
```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
```

---

## Performance Results

### Memory Usage Comparison

| Component | Before (Dev) | After (Prod) | Improvement |
|-----------|--------------|--------------|-------------|
| nginx | 17.75 MB | 15.39 MB | **-13%** |
| config-api | 111.7 MB | 46.3 MB | **-59%** |
| ngrok | 161.1 MB | 13.52 MB | **-92%** |
| **Total** | **290.6 MB** | **75.2 MB** | **-74%** |

### Compression Results

| Compression | Ratio (Avg) | Supported Clients |
|-------------|-------------|-------------------|
| Gzip | 60-70% | 100% |
| Brotli | 75-85% | 95%+ (Modern browsers) |

Brotli provides an additional 15-20% size reduction over Gzip for the same quality level.

---

## Future Optimizations

Potential areas for further improvement:

### 1. Advanced Caching
Implement more sophisticated caching strategies like cache warming or a purge API.

### 2. Health Monitoring
Integrated dashboard for real-time monitoring of all proxied apps.

