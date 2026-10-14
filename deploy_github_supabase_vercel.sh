#!/usr/bin/env bash
# ==============================================================================
# SCRIPT DE DESPLIEGUE AUTOMATIZADO: GITHUB + SUPABASE (POSTGRESQL RLS) + VERCEL
# Sistema de Facturación Electrónica Multiempresa SUNAT (UBL 2.1)
# ==============================================================================
set -euo pipefail

REPO_NAME="${1:-sistema-facturacion-sunat-multitenant}"

echo "======================================================================"
echo "1. EJECUTANDO SUITE DE 14 PRUEBAS UNITARIAS Y DE INTEGRACIÓN (SUNAT)"
echo "======================================================================"
if command -v python3 >/dev/null 2>&1; then
  python3 tests/test_sistema_facturacion_sunat.py || python3 test_sistema_facturacion_sunat.py
fi

echo "======================================================================"
echo "2. APLICANDO ESQUEMA MULTI-TENANT (empresa_id) Y RLS EN SUPABASE"
echo "======================================================================"
if [ -n "${SUPABASE_DB_URL:-}" ]; then
  psql "$SUPABASE_DB_URL" -f supabase/migrations/20261014000001_init_multitenant_sunat_rls.sql
  echo "[OK] Tablas Multi-Tenant, políticas RLS y empresas semilla creadas en Supabase."
else
  echo "[INFO] Variable SUPABASE_DB_URL no definida en consola."
  echo "       Puedes copiar y ejecutar el archivo 'supabase_migration_rls.sql'"
  echo "       directamente en el SQL Editor de tu panel de Supabase."
fi

echo "======================================================================"
echo "3. INICIALIZANDO GIT Y SUBIENDO REPOSITORIO A GITHUB ($REPO_NAME)"
echo "======================================================================"
if [ ! -d ".git" ]; then
  git init
  git branch -M main
fi

git add .
git commit -m "feat(sunat): MVP Facturacion Electronica UBL 2.1 Multiempresa (Web + APK + Admin CDT/SOL + 14 Unit Tests)" || true

if command -v gh >/dev/null 2>&1; then
  gh repo create "$REPO_NAME" --public --source=. --remote=origin --push
  echo "[OK] Repositorio creado y subido a GitHub con GitHub CLI."
elif [ -n "${GITHUB_REMOTE_URL:-}" ]; then
  git remote remove origin 2>/dev/null || true
  git remote add origin "$GITHUB_REMOTE_URL"
  git push -u origin main
  echo "[OK] Código subido a $GITHUB_REMOTE_URL"
else
  echo "[INFO] Para subir a tu cuenta de GitHub sin CLI, ejecuta:"
  echo "       git remote add origin https://github.com/<TU_USUARIO>/$REPO_NAME.git"
  echo "       git push -u origin main"
fi

echo "======================================================================"
echo "4. DESPLEGANDO APLICACIÓN FULL-STACK EN VERCEL (PRODUCCIÓN)"
echo "======================================================================"
if command -v npx >/dev/null 2>&1; then
  npx vercel --prod --yes
else
  echo "[INFO] También puedes importar el repositorio '$REPO_NAME' en 1 clic desde:"
  echo "       https://vercel.com/new"
fi
