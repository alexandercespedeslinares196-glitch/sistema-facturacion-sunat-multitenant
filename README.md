# Guía de Arquitectura, Pruebas Unitarias y Despliegue en GitHub, Supabase y Vercel

Esta guía documenta el **Producto Mínimo Viable (MVP)** del Sistema de Facturación Electrónica Multiempresa adaptado a [SUNAT](https://www.sunat.gob.pe/) bajo el [Estándar UBL 2.1](https://www.sunat.gob.pe/legislacion/superin/2017/anexoIX-117-2017.pdf), incluyendo los resultados de las **14 pruebas unitarias**, la estructura lista para subir a **GitHub**, la migración SQL con **Row-Level Security (RLS)** para **Supabase** y el despliegue en **Vercel**.

## 1. Arquitectura de los Dos Componentes y Reglas de Negocio

| Componente | Alcance Funcional | Regla de Aislamiento y Envío SUNAT |
| :--- | :--- | :--- |
| **1. Aplicación Web Cliente + Descarga APK** | Emisión de **Facturas (`01`)**, **Boletas (`03`)**, **Notas de Crédito (`07`)**, **Notas de Débito (`08`)** y **Notas de Venta (`NV`)**, más botón de descarga directa de `FacturadorSUNAT-Cliente-v2.4.0.apk`. | Filtra estrictamente cada consulta y correlativo por `empresa_id`. Las **Notas de Venta (`NV`)** son de uso interno exclusivo (`enviar_a_sunat = False`, `estado_sunat = NO_APLICA_INTERNO`) y jamás se envían a SUNAT. |
| **2. Panel Administrador Multiempresa** | Acceso centralizado a todas las empresas asociadas para cargar el **CDT (`.pfx`/`.p12`)**, configurar el **Usuario SOL Secundario**, alternar entre [Beta](https://orientacion.sunat.gob.pe/12-pautas-servicio-beta) y [Producción](https://orientacion.sunat.gob.pe/01-servicios-web-disponibles), y monitorear el **estado/salud global, por empresa y por cada usuario**. | Permite administrar credenciales tributarias y ver métricas de salud de todas las empresas sin mezclar sus comprobantes, series ni clientes. |

## 2. Suite de 14 Pruebas Unitarias y de Integración (`test_sistema_facturacion_sunat.py`)

El proyecto incluye 14 pruebas automatizadas verificadas con `unittest` que comprueban de extremo a extremo la lógica tributaria y de seguridad:

* **`test_01` y `test_02` (Seguridad Multi-Tenant):** Verifican que un usuario de `empresa_id=1` reciba `HTTP 403 Forbidden` al intentar acceder a `empresa_id=2` o al Panel Superadministrador.
* **`test_03` a `test_07` (Comprobantes Tributarios UBL 2.1):** Validan la generación de XML UBL 2.1, cálculo de IGV (18%), firma digital `XMLDSig (RSA-SHA256)` con el CDT y recepción de CDR para Facturas (`01`), Boletas (`03`), Notas de Crédito (`07` - Catálogo 09) y Notas de Débito (`08` - Catálogo 10), conforme a las [Guías y Manuales UBL 2.1 de SUNAT](https://orientacion.sunat.gob.pe/11-guias-y-manuales).
* **`test_08` (Regla de Notas de Venta Internas):** Comprueba que al emitir una Nota de Venta (`NV01`), el sistema marque `es_uso_interno = True`, `enviado_a_sunat = False` y `xml_firmado_base64 = NULL`.
* **`test_09` a `test_14` (Series, CDT `.pfx`, Salud por Usuario y APK):** Verifican prefijos de serie (`F`, `B`, `NV`), independencia de listados entre empresas, apertura criptográfica de certificados `.pfx`/`.p12`, monitoreo de salud por usuario y descarga del `.apk`.

## 3. Paso a Paso Rápido para Desplegar en Supabase, GitHub y Vercel

### Paso 1: Crear las Tablas y Políticas RLS en Supabase
1. Ingresa a tu proyecto en **Supabase** y abre la sección **SQL Editor**.
2. Copia el contenido del archivo `supabase_migration_rls.sql` (incluido también en `supabase/migrations/20261014000001_init_multitenant_sunat_rls.sql` dentro del ZIP) y haz clic en **Run**.
3. Esto creará en una sola base de datos las tablas `empresas`, `configuraciones_sunat_empresa`, `usuarios`, `series_empresa`, `comprobantes` y `comprobante_items`, activará las políticas `ROW LEVEL SECURITY` filtradas por `empresa_id` y cargará las 3 empresas y 6 usuarios de prueba.

### Paso 2: Subir el Proyecto a tu Repositorio de GitHub
1. Descomprime el archivo `sistema_facturacion_sunat_fullstack.zip` en una carpeta local.
2. Ejecuta el script automatizado `bash deploy_github_supabase_vercel.sh` o sube la carpeta a un nuevo repositorio llamado `sistema-facturacion-sunat-multitenant`:

```bash
git init
git branch -M main
git add .
git commit -m "feat: MVP Sistema Facturacion SUNAT UBL 2.1 Multiempresa + 14 Unit Tests"
gh repo create sistema-facturacion-sunat-multitenant --public --source=. --remote=origin --push
```

### Paso 3: Desplegar en Vercel Conectado a GitHub y Supabase
1. En tu panel de **Vercel**, haz clic en **Add New -> Project** e importa el repositorio `sistema-facturacion-sunat-multitenant` desde GitHub.
2. El archivo `vercel.json` en la raíz del proyecto configurará automáticamente tanto las rutas serverless de Python (`/api/*` hacia `api/index.py`) como la aplicación web interactiva (`/public/index.html` y `src/App.jsx`).
3. En la sección **Environment Variables** de Vercel, agrega la cadena de conexión `DATABASE_URL` de tu proyecto de Supabase y haz clic en **Deploy**.