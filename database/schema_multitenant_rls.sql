-- =============================================================================
-- ESQUEMA DE BASE DE DATOS ÚNICA MULTI-TENANT (AISLAMIENTO POR `empresa_id` / RUC)
-- Motor: PostgreSQL 15+ con Row-Level Security (RLS) Estricto
-- =============================================================================

CREATE TABLE empresas (
    id SERIAL PRIMARY KEY,
    ruc VARCHAR(11) NOT NULL UNIQUE,
    razon_social VARCHAR(250) NOT NULL,
    nombre_comercial VARCHAR(250),
    direccion_fiscal VARCHAR(350) NOT NULL,
    ubigeo VARCHAR(6) NOT NULL DEFAULT '060101',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE configuraciones_sunat_empresa (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL UNIQUE REFERENCES empresas(id) ON DELETE CASCADE,
    entorno VARCHAR(15) NOT NULL DEFAULT 'BETA' CHECK (entorno IN ('BETA', 'PRODUCCION')),
    envio_automatico_sunat BOOLEAN NOT NULL DEFAULT TRUE,
    timeout_soap_segundos INTEGER NOT NULL DEFAULT 30,
    max_reintentos_cola INTEGER NOT NULL DEFAULT 3,
    usuario_sol_secundario VARCHAR(60) NOT NULL,
    clave_sol_secundario_cifrada TEXT NOT NULL,
    cdt_nombre_archivo VARCHAR(200),
    cdt_pfx_base64_cifrado TEXT,
    cdt_password_cifrada TEXT,
    cdt_pem_certificado TEXT,
    cdt_pem_llave_privada_cifrada TEXT,
    cdt_titular_subject VARCHAR(300),
    cdt_emisor_issuer VARCHAR(300),
    cdt_numero_serie VARCHAR(120),
    cdt_valido_desde TIMESTAMP,
    cdt_valido_hasta TIMESTAMP,
    codigo_establecimiento_anexo VARCHAR(4) NOT NULL DEFAULT '0000',
    porcentaje_igv_default NUMERIC(5,2) NOT NULL DEFAULT 18.00,
    afectacion_igv_default VARCHAR(2) NOT NULL DEFAULT '10',
    cuenta_detraccion_bn VARCHAR(30),
    porcentaje_detraccion_default NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE, -- NULL solo para SUPERADMIN
    username VARCHAR(80) NOT NULL UNIQUE,
    nombre_completo VARCHAR(180) NOT NULL,
    email VARCHAR(150) NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    rol VARCHAR(30) NOT NULL CHECK (rol IN ('SUPERADMIN', 'ADMIN_EMPRESA', 'OPERADOR_CAJA')),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_acceso TIMESTAMP,
    dispositivo_actual VARCHAR(80) DEFAULT 'Web App',
    latencia_promedio_ms INTEGER DEFAULT 45,
    comprobantes_emitidos_hoy INTEGER DEFAULT 0,
    errores_sesion_24h INTEGER DEFAULT 0
);

CREATE TABLE series_empresa (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    tipo_comprobante VARCHAR(4) NOT NULL CHECK (tipo_comprobante IN ('01', '03', '07', '08', 'NV')),
    serie VARCHAR(4) NOT NULL,
    correlativo_actual INTEGER NOT NULL DEFAULT 0,
    UNIQUE (empresa_id, tipo_comprobante, serie)
);

CREATE TABLE comprobantes (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    usuario_emisor_id INTEGER NOT NULL REFERENCES usuarios(id),
    tipo_comprobante VARCHAR(4) NOT NULL CHECK (tipo_comprobante IN ('01', '03', '07', '08', 'NV')),
    serie VARCHAR(4) NOT NULL,
    correlativo INTEGER NOT NULL,
    numero_formato VARCHAR(20) NOT NULL,
    fecha_emision TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    moneda VARCHAR(3) NOT NULL DEFAULT 'PEN',
    tipo_operacion VARCHAR(4) NOT NULL DEFAULT '0101',
    cliente_tipo_doc VARCHAR(1) NOT NULL,
    cliente_num_doc VARCHAR(20) NOT NULL,
    cliente_razon_social VARCHAR(250) NOT NULL,
    cliente_direccion VARCHAR(300),
    doc_afectado_tipo VARCHAR(2),
    doc_afectado_numero VARCHAR(20),
    cod_motivo_nota VARCHAR(2),
    sustento_motivo_nota VARCHAR(250),
    total_gravadas NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_exoneradas NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_inafectas NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_igv NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    importe_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    es_uso_interno BOOLEAN NOT NULL DEFAULT FALSE,
    enviar_a_sunat BOOLEAN NOT NULL DEFAULT TRUE,
    estado_sunat VARCHAR(30) NOT NULL,
    codigo_respuesta_sunat VARCHAR(10),
    mensaje_respuesta_sunat TEXT,
    hash_cpe VARCHAR(120),
    xml_firmado_base64 TEXT,
    cdr_sunat_base64 TEXT,
    tiempo_respuesta_sunat_ms INTEGER DEFAULT 0,
    UNIQUE (empresa_id, tipo_comprobante, serie, correlativo)
);

CREATE TABLE comprobante_items (
    id SERIAL PRIMARY KEY,
    comprobante_id INTEGER NOT NULL REFERENCES comprobantes(id) ON DELETE CASCADE,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    orden INTEGER NOT NULL,
    codigo_producto VARCHAR(50) NOT NULL,
    descripcion VARCHAR(300) NOT NULL,
    unidad_medida VARCHAR(5) NOT NULL DEFAULT 'NIU',
    cantidad NUMERIC(12,4) NOT NULL,
    valor_unitario NUMERIC(12,4) NOT NULL,
    precio_unitario NUMERIC(12,4) NOT NULL,
    cod_afectacion_igv VARCHAR(2) NOT NULL DEFAULT '10',
    subtotal_valor_venta NUMERIC(12,2) NOT NULL,
    monto_igv NUMERIC(12,2) NOT NULL,
    total_item NUMERIC(12,2) NOT NULL
);

-- =============================================================================
-- POLÍTICAS DE AISLAMIENTO ESTRICTO (ROW-LEVEL SECURITY POR `empresa_id`)
-- =============================================================================
ALTER TABLE series_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE comprobantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comprobante_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_aislamiento_series ON series_empresa
    USING (empresa_id = current_setting('app.current_empresa_id', true)::integer);

CREATE POLICY rls_aislamiento_comprobantes ON comprobantes
    USING (empresa_id = current_setting('app.current_empresa_id', true)::integer);

CREATE POLICY rls_aislamiento_items ON comprobante_items
    USING (empresa_id = current_setting('app.current_empresa_id', true)::integer);
