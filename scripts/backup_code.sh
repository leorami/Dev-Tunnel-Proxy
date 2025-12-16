#!/usr/bin/env bash
set -euo pipefail

# Usage: backup_code.sh <path_to_directory>
if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <path_to_directory>" >&2
  exit 1
fi

ROOT_DIR=$1
TS=$(date +%Y%m%d_%H%M%S)

pushd "$ROOT_DIR" >/dev/null
BASE=$(basename "$PWD")
ZIPNAME="${BASE}_${TS}.zip"

# ─── Directories to exclude ────────────────────────────────
EXCLUDE_DIRS=(
  "*/venv*" "*/.venv*" "*/env*"
  "*/node_modules" "*/.git" "*/__pycache__"
  "*/staticfiles" "*/coverage" "*/build"
  "*/dist" "*/public" "*/vendor" "*/migrations"
  "*/htmlcov" "*/.next" "*/out" "*/cache"
  "*/tmp" "*/temp" "*/logs" "*/uploads"
)

# ─── Specific large files to exclude ───────────────────────
EXCLUDE_PATHS=(
  "./seed/seed.json"
  "./app2-api/scripts/docker/seed/fixed_seed.json"
  "./seed/archive/clean_legacy_data.sql"
)

# ─── Extensions to include ─────────────────────────────────
INCLUDE_EXT=(
  "*.py" "*.js" "*.ts" "*.tsx"
  "*.html" "*.css" "*.json"
  "*.yml" "*.yaml" "*.md"
  "*.sql" "*.tpl" "*.jsx"
  "*.sh" "*.mjs" "*.scss"
  "*.xml" "*.cjs" "*.env*"
)

# ─── Important config files to include (including invisible ones) ──
CONFIG_FILES=(
  ".gitignore" ".dockerignore" ".env*"
  ".storybook" ".storybookrc*" ".storybookrc.js"
  ".eslintrc*" ".prettierrc*" ".babelrc*"
  ".browserslistrc" ".editorconfig" ".npmrc"
  ".nvmrc" ".node-version" ".ruby-version"
  ".python-version" ".tool-versions"
  "tsconfig.json" "tsconfig.*.json"
  "next.config.js" "next.config.mjs"
  "tailwind.config.js" "tailwind.config.ts"
  "postcss.config.js" "postcss.config.cjs"
  "webpack.config.js" "vite.config.js" "vite.config.ts"
  "rollup.config.js" "jest.config.js" "jest.config.ts"
  "cypress.config.js" "cypress.config.ts"
  "playwright.config.js" "playwright.config.ts"
  "docker-compose*.yml" "docker-compose*.yaml"
  "Dockerfile*" ".dockerignore"
  "package.json" "package-lock.json" "yarn.lock" "pnpm-lock.yaml"
  "requirements.txt" "requirements/*.txt" "Pipfile" "Pipfile.lock"
  "poetry.lock" "pyproject.toml" "setup.py" "setup.cfg"
  "composer.json" "composer.lock" "Gemfile" "Gemfile.lock"
  "Cargo.toml" "Cargo.lock" "go.mod" "go.sum"
  "pom.xml" "build.gradle" "build.sbt"
  ".github/workflows/*.yml" ".github/workflows/*.yaml"
  ".gitlab-ci.yml" ".travis.yml" ".circleci/config.yml"
  "Makefile" "makefile" "Rakefile"
  "Procfile" "app.json" "app.yaml"
  ".vercelignore" ".netlify.toml" "netlify.toml"
  "vercel.json" "now.json" "firebase.json"
  ".firebaserc" "firestore.rules" "firestore.indexes.json"
  "angular.json" "angular-cli.json" "ionic.config.json"
  "capacitor.config.json" "capacitor.config.ts"
  "electron-builder.json" "electron-builder.yml"
  "nuxt.config.js" "nuxt.config.ts"
  "svelte.config.js" "svelte.config.cjs"
  "vite.config.js" "vite.config.ts"
  "astro.config.js" "astro.config.mjs"
  "remix.config.js" "remix.config.ts"
  "gatsby-config.js" "gatsby-config.ts"
  "gatsby-node.js" "gatsby-node.ts"
  "gridsome.config.js" "gridsome.config.ts"
  "quasar.config.js" "quasar.config.ts"
  "vue.config.js" "vue.config.ts"
  "nuxt.config.js" "nuxt.config.ts"
  "sapper.config.js" "sapper.config.ts"
  "svelte.config.js" "svelte.config.cjs"
  "rollup.config.js" "rollup.config.mjs"
  "webpack.config.js" "webpack.config.mjs"
  "parcel.config.js" "parcel.config.json"
  "esbuild.config.js" "esbuild.config.mjs"
  "swc.config.js" "swc.config.json"
  "babel.config.js" "babel.config.json"
  ".babelrc" ".babelrc.js" ".babelrc.json"
  ".eslintrc" ".eslintrc.js" ".eslintrc.json" ".eslintrc.yml"
  ".prettierrc" ".prettierrc.js" ".prettierrc.json" ".prettierrc.yml"
  ".stylelintrc" ".stylelintrc.js" ".stylelintrc.json"
  ".postcssrc" ".postcssrc.js" ".postcssrc.json"
  ".browserslistrc" ".browserslist"
  ".editorconfig" ".npmrc" ".yarnrc" ".yarnrc.yml"
  ".nvmrc" ".node-version" ".ruby-version" ".python-version"
  ".tool-versions" ".terraform-version"
  "terraform.tf" "terraform.tfvars" "*.tf" "*.tfvars"
  "ansible.cfg" "inventory" "playbook.yml" "*.yml"
  "docker-compose.yml" "docker-compose.yaml" "docker-compose.*.yml"
  "Dockerfile" "Dockerfile.*" ".dockerignore"
  "kubernetes/*.yml" "kubernetes/*.yaml" "k8s/*.yml" "k8s/*.yaml"
  "helm/*.yml" "helm/*.yaml" "Chart.yaml" "values.yaml"
  "skaffold.yaml" "skaffold.yml"
  ".env" ".env.local" ".env.development" ".env.production"
  ".env.test" ".env.staging" ".env.example"
  "config/*.yml" "config/*.yaml" "config/*.json"
  "scripts/*.sh" "scripts/*.js" "scripts/*.ts"
  "tools/*.js" "tools/*.ts" "tools/*.sh"
  "bin/*" "bin/*.sh" "bin/*.js"
  "middleware.ts" "middleware.js"
  "app/*" "pages/*" "src/*" "lib/*" "components/*"
  "public/*" "static/*" "assets/*"
  "types/*.ts" "types/*.d.ts"
  "*.d.ts" "*.types.ts"
)

# ─── Top-level doc files to include ────────────────────────
DOC_FILES=(
  "README" "README.md" "README.rst"
  "LICENSE" "LICENSE.md" "CHANGELOG" "CHANGELOG.md"
  "CONTRIBUTING" "CONTRIBUTING.md" "CONTRIBUTORS" "CONTRIBUTORS.md"
  "CODE_OF_CONDUCT" "CODE_OF_CONDUCT.md"
)

FILELIST=$(mktemp)
trap 'rm -f "$FILELIST"' EXIT

# ─── Construct find expression ─────────────────────────────
PRUNE_EXPR=()
for d in "${EXCLUDE_DIRS[@]}"; do
  PRUNE_EXPR+=( -path "$d" -prune -o )
done
unset 'PRUNE_EXPR[${#PRUNE_EXPR[@]}-1]'

INCLUDE_EXPR=()
for ext in "${INCLUDE_EXT[@]}"; do
  INCLUDE_EXPR+=( -iname "$ext" -o )
done
unset 'INCLUDE_EXPR[${#INCLUDE_EXPR[@]}-1]'

EXCLUDE_EXPR=()
for path in "${EXCLUDE_PATHS[@]}"; do
  EXCLUDE_EXPR+=( ! -path "$path" )
done

# ─── Run find with all filters ─────────────────────────────
find . \
  \( "${PRUNE_EXPR[@]}" \) -prune -o \
  \( -type f \( "${INCLUDE_EXPR[@]}" \) -a ! -name '.*' "${EXCLUDE_EXPR[@]}" \) \
  -print > "$FILELIST"

# ─── Add config files (including invisible ones) ───────────
for config_file in "${CONFIG_FILES[@]}"; do
  if [[ -f "$config_file" ]]; then
    echo "./$config_file" >> "$FILELIST"
  fi
  # Also check for config files in subdirectories
  find . -maxdepth 3 -name "$config_file" -type f 2>/dev/null | grep -v node_modules | grep -v .git >> "$FILELIST" || true
done

# ─── Add top-level doc files if present ─────────────────
for f in "${DOC_FILES[@]}"; do
  [[ -f "$f" ]] && echo "./$f" >> "$FILELIST"
done

# ─── Remove duplicates and sort ───────────────────────────
sort -u "$FILELIST" -o "$FILELIST"

# ─── Zip the filtered list ─────────────────────────────────
echo "📦 Zipping files into ../$ZIPNAME..."
zip -q "../$ZIPNAME" -@ < "$FILELIST"

FILE_COUNT=$(wc -l < "$FILELIST")
popd >/dev/null
echo "✅ Packed $FILE_COUNT files into $ZIPNAME"

