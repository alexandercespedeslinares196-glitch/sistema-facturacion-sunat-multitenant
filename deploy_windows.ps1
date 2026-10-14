# ==============================================================================
# SCRIPT DE DESPLIEGUE AUTOMATIZADO EN WINDOWS (POWERSHELL)
# GitHub + Supabase (PostgreSQL RLS) + Vercel
# ==============================================================================
param(
    [string]$RepoName = "sistema-facturacion-sunat-multitenant",
    [string]$GitHubUser = ""
)

$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "1. EJECUTANDO LAS 14 PRUEBAS UNITARIAS Y DE INTEGRACION (SUNAT UBL 2.1)" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
if (Get-Command python -ErrorAction SilentlyContinue) {
    if (Test-Path "tests/test_sistema_facturacion_sunat.py") {
        python tests/test_sistema_facturacion_sunat.py
    } elseif (Test-Path "test_sistema_facturacion_sunat.py") {
        python test_sistema_facturacion_sunat.py
    }
}

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "2. INICIALIZANDO REPOSITORIO GIT Y SUBIENDO A GITHUB ($RepoName)" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
if (-not (Test-Path ".git")) {
    git init
    git branch -M main
}

git add .
git commit -m "feat(sunat): MVP Facturacion Electronica UBL 2.1 Multiempresa + 14 Unit Tests" 2>$null

if (Get-Command gh -ErrorAction SilentlyContinue) {
    gh repo create $RepoName --public --source=. --remote=origin --push
    Write-Host "[OK] Repositorio creado y subido a GitHub automaticamente." -ForegroundColor Green
} elseif ($GitHubUser -ne "") {
    git remote remove origin 2>$null
    git remote add origin "https://github.com/$GitHubUser/$RepoName.git"
    git push -u origin main
    Write-Host "[OK] Codigo subido a https://github.com/$GitHubUser/$RepoName" -ForegroundColor Green
} else {
    Write-Host "[INFO] Crea un repositorio vacio en https://github.com/new llamado '$RepoName' y ejecuta:" -ForegroundColor Yellow
    Write-Host "       git remote add origin https://github.com/<TU_USUARIO>/$RepoName.git" -ForegroundColor Yellow
    Write-Host "       git push -u origin main" -ForegroundColor Yellow
}

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "3. DESPLEGANDO PROYECTO EN VERCEL (PRODUCCION)" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
if (Get-Command npx -ErrorAction SilentlyContinue) {
    npx vercel --prod --yes
} else {
    Write-Host "[INFO] Importa tu repositorio de GitHub en 1 clic desde: https://vercel.com/new" -ForegroundColor Yellow
}
