# Multi-stage build to keep the final image slim
FROM nginx:1.25-alpine AS builder

# Install build dependencies including brotli-dev
RUN apk add --no-cache \
    gcc \
    libc-dev \
    make \
    openssl-dev \
    pcre2-dev \
    zlib-dev \
    linux-headers \
    libtool \
    automake \
    autoconf \
    git \
    g++ \
    cmake \
    brotli-dev

# Download and compile ngx_brotli as a dynamic module
RUN git clone --recursive https://github.com/google/ngx_brotli.git \
    && wget https://nginx.org/download/nginx-$NGINX_VERSION.tar.gz -O nginx.tar.gz \
    && tar -zxvf nginx.tar.gz \
    && cd nginx-$NGINX_VERSION \
    && ./configure --with-compat --add-dynamic-module=../ngx_brotli \
    && make modules

# Final stage: Start from the clean official image
FROM nginx:1.25-alpine

# Install runtime brotli library
RUN apk add --no-cache brotli-libs

# Copy the compiled Brotli modules from the builder stage
COPY --from=builder /nginx-*/objs/ngx_http_brotli_filter_module.so /usr/lib/nginx/modules/
COPY --from=builder /nginx-*/objs/ngx_http_brotli_static_module.so /usr/lib/nginx/modules/

# Fix permissions
RUN chmod 644 /usr/lib/nginx/modules/ngx_http_brotli_filter_module.so \
    && chmod 644 /usr/lib/nginx/modules/ngx_http_brotli_static_module.so
