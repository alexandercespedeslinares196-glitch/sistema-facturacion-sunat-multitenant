/**
 * ============================================================================
 * SISTEMA DE FACTURACIÓN ELECTRÓNICA MULTIEMPRESA (SUNAT UBL 2.1 - SEE CONTRIBUYENTE)
 * Frontend Completo: React 18 + Tailwind CSS (`frontend_react_sunat.jsx`)
 * ============================================================================
 * Arquitectura de Dos Componentes en la misma Aplicación Web:
 *
 * 1. PORTAL DEL CLIENTE (`VistaPortalCliente`):
 *    - Aislamiento estricto de datos por `empresa_id` (RUC) sobre una única BD.
 *    - Emisión de Comprobantes Tributarios enviados directo a Web Services SUNAT:
 *      * 01: Factura Electrónica (Serie F001)
 *      * 03: Boleta de Venta Electrónica (Serie B001)
 *      * 07: Nota de Crédito Electrónica (Serie FC01 / BC01 - Catálogo 09)
 *      * 08: Nota de Débito Electrónica (Serie FD01 / BD01 - Catálogo 10)
 *    - Emisión de Notas de Venta Internas (`NV`, Serie NV01):
 *      * Uso exclusivamente interno: genera correlativo propio y ticket/PDF,
 *        pero NO genera XML UBL 2.1 ni se envía a SUNAT (`enviar_a_sunat = false`).
 *    - Opción integrada para descargar el APK Android (`FacturadorSUNAT-Cliente-v2.4.0.apk`).
 *
 * 2. PANEL DE ADMINISTRACIÓN (`VistaPanelAdministrador`):
 *    - Gestión centralizada de todas las empresas asociadas manteniendo su
 *      información transaccional completamente independiente.
 *    - Carga de Certificado Digital Tributario (CDT en formato `.pfx` / `.p12`),
 *      configuración de Usuario SOL Secundario y parámetros adicionales SUNAT
 *      (Entorno Beta/Producción, Código Anexo, IGV, Cuenta Detracciones BN, Timeouts SOAP).
 *    - Monitor en vivo de Estado/Salud del Sistema Global, por Empresa y por cada Usuario.
 * ============================================================================
 */

import React, { useState, useMemo } from "react";

// Configuración del cliente HTTP hacia el Backend FastAPI (`backend_fastapi_sunat.py`)
const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api/v1";

export const sunatApiClient = {
  async emitirComprobante(empresaId, userId, payload) {
    const res = await fetch(`${API_BASE_URL}/cliente/comprobantes/emitir`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": String(userId),
        "X-Empresa-Id": String(empresaId),
        "X-Dispositivo": "Web App React",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).detail || "Error al emitir comprobante");
    return res.json();
  },

  async guardarConfiguracionSunat(empresaId, payload) {
    const res = await fetch(`${API_BASE_URL}/admin/empresas/${empresaId}/configuracion-sunat`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": "1", // SuperAdmin ID
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).detail || "Error al guardar configuración SUNAT");
    return res.json();
  },

  async subirCertificadoCdtPfx(empresaId, archivoPfx, passwordCdt) {
    const formData = new FormData();
    formData.append("archivo_cdt", archivoPfx);
    formData.append("password_cdt", passwordCdt);
    const res = await fetch(`${API_BASE_URL}/admin/empresas/${empresaId}/certificado-cdt`, {
      method: "POST",
      headers: { "X-User-Id": "1" },
      body: formData,
    });
    if (!res.ok) throw new Error((await res.json()).detail || "Error al validar CDT .pfx/.p12");
    return res.json();
  },
};

// Catálogo de tipos de comprobante (4 electrónicos SUNAT + 1 Nota de Venta Interna)
export const TIPOS_COMPROBANTE = [
  {
    codigo: "01",
    nombre: "Factura Electrónica",
    serieDefault: "F001",
    esInterno: false,
    enviaSunat: true,
    docClienteDefault: "6",
    docLabel: "RUC (11 dígitos)",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-300",
    descripcion: "UBL 2.1 Invoice — Firmado con CDT (.pfx) y enviado directo al Web Service SOAP de SUNAT.",
  },
  {
    codigo: "03",
    nombre: "Boleta de Venta",
    serieDefault: "B001",
    esInterno: false,
    enviaSunat: true,
    docClienteDefault: "1",
    docLabel: "DNI (8 dígitos) / RUC",
    badgeClass: "bg-indigo-100 text-indigo-800 border-indigo-300",
    descripcion: "UBL 2.1 Invoice — Comprobante para consumidor final enviado a SUNAT.",
  },
  {
    codigo: "07",
    nombre: "Nota de Crédito",
    serieDefault: "FC01",
    esInterno: false,
    enviaSunat: true,
    docClienteDefault: "6",
    docLabel: "RUC / DNI del Documento Afectado",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-300",
    descripcion: "UBL 2.1 CreditNote (Catálogo 09) — Anulación, descuento o devolución sobre Factura o Boleta.",
  },
  {
    codigo: "08",
    nombre: "Nota de Débito",
    serieDefault: "FD01",
    esInterno: false,
    enviaSunat: true,
    docClienteDefault: "6",
    docLabel: "RUC / DNI del Documento Afectado",
    badgeClass: "bg-orange-100 text-orange-800 border-orange-300",
    descripcion: "UBL 2.1 DebitNote (Catálogo 10) — Incremento de valor, intereses o penalidades.",
  },
  {
    codigo: "NV",
    nombre: "Nota de Venta (Interna)",
    serieDefault: "NV01",
    esInterno: true,
    enviaSunat: false,
    docClienteDefault: "0",
    docLabel: "DNI / RUC / Sin Documento",
    badgeClass: "bg-purple-100 text-purple-900 border-purple-300",
    descripcion: "USO INTERNO EXCLUSIVO — Genera correlativo y ticket para control interno; NO se envía a SUNAT.",
  },
];

const MOTIVOS_NOTA_CREDITO = [
  { codigo: "01", descripcion: "01 - Anulación de la operación" },
  { codigo: "02", descripcion: "02 - Anulación por error en el RUC" },
  { codigo: "04", descripcion: "04 - Descuento global" },
  { codigo: "06", descripcion: "06 - Devolución total" },
  { codigo: "07", descripcion: "07 - Devolución por ítem" },
];

const MOTIVOS_NOTA_DEBITO = [
  { codigo: "01", descripcion: "01 - Intereses por mora" },
  { codigo: "02", descripcion: "02 - Aumento en el valor" },
  { codigo: "03", descripcion: "03 - Penalidades / otros conceptos" },
];

// Estado inicial con 3 empresas independientes en la misma BD discriminadas por `empresa_id`
const EMPRESAS_DEMO = [
  {
    id: 1,
    ruc: "20608945123",
    razonSocial: "CORPORACIÓN LÁCTEA Y AGROINDUSTRIAL CAJAMARCA S.A.C.",
    nombreComercial: "AGROCAJAMARCA",
    direccionFiscal: "Av. Hoyos Rubio 1240 - Cajamarca",
    ubigeo: "060101",
    entorno: "PRODUCCION",
    usuarioSolSecundario: "FACTSOL01",
    claveSolMascara: "••••••••••••",
    cdtNombreArchivo: "cdt_20608945123_agrocajamarca.pfx",
    cdtTitular: "CN=CORPORACIÓN LÁCTEA Y AGROINDUSTRIAL CAJAMARCA S.A.C., O=SUNAT",
    cdtEmisor: "Autoridad Certificadora Tributaria SUNAT",
    cdtNumeroSerie: "4F9A82C1D0E3771B",
    cdtValidoHasta: "2027-06-16",
    cdtDiasRestantes: 245,
    codigoAnexo: "0000",
    igvPorcentaje: 18.0,
    cuentaDetraccionBn: "00-061-045892",
    porcentajeDetraccion: 10.0,
    timeoutSoapSegundos: 30,
    maxReintentosCola: 3,
    envioAutomaticoSunat: true,
    estadoSalud: "OPTIMO",
    latenciaSoapMs: 134,
    tasaAceptacionCdr: 99.7,
  },
  {
    id: 2,
    ruc: "20547812369",
    razonSocial: "SERVICIOS MINEROS Y CONSTRUCCIÓN DEL NORTE E.I.R.L.",
    nombreComercial: "SERMINCON NORTE",
    direccionFiscal: "Jr. Del Comercio 680 - Cajamarca",
    ubigeo: "060101",
    entorno: "BETA",
    usuarioSolSecundario: "MODDATOS",
    claveSolMascara: "••••••••",
    cdtNombreArchivo: "cdt_20547812369_sermincon.p12",
    cdtTitular: "CN=SERVICIOS MINEROS Y CONSTRUCCIÓN DEL NORTE E.I.R.L.",
    cdtEmisor: "Llama.pe S.A.C. - Entidad de Certificación Digital",
    cdtNumeroSerie: "8B12E45FA90112C3",
    cdtValidoHasta: "2026-11-02",
    cdtDiasRestantes: 19,
    codigoAnexo: "0001",
    igvPorcentaje: 18.0,
    cuentaDetraccionBn: "00-061-099124",
    porcentajeDetraccion: 12.0,
    timeoutSoapSegundos: 45,
    maxReintentosCola: 5,
    envioAutomaticoSunat: true,
    estadoSalud: "ADVERTENCIA",
    latenciaSoapMs: 188,
    tasaAceptacionCdr: 97.4,
  },
  {
    id: 3,
    ruc: "20610459812",
    razonSocial: "DISTRIBUIDORA FARMACÉUTICA Y EQUIPAMIENTO MÉDICO S.R.L.",
    nombreComercial: "DIFARMED PERÚ",
    direccionFiscal: "Av. Vía de Evitamiento Norte 890 - Cajamarca",
    ubigeo: "060101",
    entorno: "PRODUCCION",
    usuarioSolSecundario: "VENTASWS",
    claveSolMascara: "••••••••••",
    cdtNombreArchivo: "cdt_20610459812_difarmed.pfx",
    cdtTitular: "CN=DISTRIBUIDORA FARMACÉUTICA Y EQUIPAMIENTO MÉDICO S.R.L.",
    cdtEmisor: "Autoridad Certificadora Tributaria SUNAT",
    cdtNumeroSerie: "9E01A4B77C8231D9",
    cdtValidoHasta: "2027-09-28",
    cdtDiasRestantes: 349,
    codigoAnexo: "0000",
    igvPorcentaje: 18.0,
    cuentaDetraccionBn: "00-061-118340",
    porcentajeDetraccion: 4.0,
    timeoutSoapSegundos: 25,
    maxReintentosCola: 3,
    envioAutomaticoSunat: true,
    estadoSalud: "OPTIMO",
    latenciaSoapMs: 118,
    tasaAceptacionCdr: 99.9,
  },
];

// Comprobantes iniciales aislados estrictamente por `empresaId`
const COMPROBANTES_INICIALES = [
  // Empresa 1 (AGROCAJAMARCA)
  {
    id: 101,
    empresaId: 1,
    tipoComprobante: "01",
    numeroFormato: "F001-00000142",
    fechaEmision: "2026-10-14 08:15",
    clienteDoc: "20100128218",
    clienteNombre: "SUPERMERCADOS PERUANOS S.A.",
    gravadas: 2450.0,
    igv: 441.0,
    total: 2891.0,
    moneda: "PEN",
    esUsoInterno: false,
    enviadoSunat: true,
    estadoSunat: "ACEPTADO",
    mensajeSunat: "La FACTURA numero F001-00000142, ha sido aceptada (CDR 0)",
    hashCpe: "r8K2m9P4xL1vQ7zN3bW5cT8yF0hJ6dG2sA4eU9iO1pM=",
  },
  {
    id: 102,
    empresaId: 1,
    tipoComprobante: "03",
    numeroFormato: "B001-00000819",
    fechaEmision: "2026-10-14 09:05",
    clienteDoc: "45891230",
    clienteNombre: "MARÍA ELENA QUISPE ROJAS",
    gravadas: 110.17,
    igv: 19.83,
    total: 130.0,
    moneda: "PEN",
    esUsoInterno: false,
    enviadoSunat: true,
    estadoSunat: "ACEPTADO",
    mensajeSunat: "La BOLETA numero B001-00000819, ha sido aceptada (CDR 0)",
    hashCpe: "k3N7p1Q8wZ4xR9mC2vB6nT0yL5jH8fG4dS1aE3uI7oP=",
  },
  {
    id: 103,
    empresaId: 1,
    tipoComprobante: "NV",
    numeroFormato: "NV01-00000054",
    fechaEmision: "2026-10-14 09:40",
    clienteDoc: "00000000",
    clienteNombre: "VENTA DIRECTA MOSTRADOR PLANTA",
    gravadas: 72.03,
    igv: 12.97,
    total: 85.0,
    moneda: "PEN",
    esUsoInterno: true,
    enviadoSunat: false,
    estadoSunat: "NO_APLICA_INTERNO",
    mensajeSunat: "Nota de Venta de uso interno registrada. Excluida de envío a SUNAT.",
    hashCpe: null,
  },
  // Empresa 2 (SERMINCON NORTE) — Datos 100% independientes de Empresa 1
  {
    id: 201,
    empresaId: 2,
    tipoComprobante: "01",
    numeroFormato: "F001-00000089",
    fechaEmision: "2026-10-14 07:50",
    clienteDoc: "20133023978",
    clienteNombre: "MINERA YANACOCHA S.R.L.",
    gravadas: 15800.0,
    igv: 2844.0,
    total: 18644.0,
    moneda: "PEN",
    esUsoInterno: false,
    enviadoSunat: true,
    estadoSunat: "ACEPTADO",
    mensajeSunat: "La FACTURA numero F001-00000089, ha sido aceptada (BETA CDR 0)",
    hashCpe: "m9X4v2B7nQ1wE8rT5yU3iO0pA6sD8fG1hJ4kL7zX9cV=",
  },
  {
    id: 202,
    empresaId: 2,
    tipoComprobante: "07",
    numeroFormato: "FC01-00000012",
    fechaEmision: "2026-10-14 10:12",
    clienteDoc: "20133023978",
    clienteNombre: "MINERA YANACOCHA S.R.L.",
    gravadas: 1200.0,
    igv: 216.0,
    total: 1416.0,
    moneda: "PEN",
    esUsoInterno: false,
    enviadoSunat: true,
    estadoSunat: "ACEPTADO",
    mensajeSunat: "La NOTA_CREDITO numero FC01-00000012 (Afecta F001-00000089), ha sido aceptada",
    hashCpe: "p4L9k2J7hG1fD8sA5qW3eR0tY6uI9oP2zX4cV7bN1mQ=",
  },
  {
    id: 203,
    empresaId: 2,
    tipoComprobante: "NV",
    numeroFormato: "NV01-00000019",
    fechaEmision: "2026-10-14 10:35",
    clienteDoc: "41257896",
    clienteNombre: "ALQUILER MENOR DE EQUIPO TOPOGRÁFICO",
    gravadas: 381.36,
    igv: 68.64,
    total: 450.0,
    moneda: "PEN",
    esUsoInterno: true,
    enviadoSunat: false,
    estadoSunat: "NO_APLICA_INTERNO",
    mensajeSunat: "Nota de Venta de uso interno registrada. Excluida de envío a SUNAT.",
    hashCpe: null,
  },
  // Empresa 3 (DIFARMED PERÚ) — Datos 100% independientes
  {
    id: 301,
    empresaId: 3,
    tipoComprobante: "01",
    numeroFormato: "F001-00000410",
    fechaEmision: "2026-10-14 08:30",
    clienteDoc: "20451239874",
    clienteNombre: "CLÍNICA SAN FRANCISCO DE ASÍS S.A.C.",
    gravadas: 4200.0,
    igv: 756.0,
    total: 4956.0,
    moneda: "PEN",
    esUsoInterno: false,
    enviadoSunat: true,
    estadoSunat: "ACEPTADO",
    mensajeSunat: "La FACTURA numero F001-00000410, ha sido aceptada (CDR 0)",
    hashCpe: "w2E5r8T1yU4iO7pA0sD3fG6hJ9kL2zX5cV8bN1mQ4wE=",
  },
];

// Telemetría de estado/salud por cada usuario del sistema
const USUARIOS_SISTEMA_INICIALES = [
  {
    id: 1,
    empresaId: null,
    empresaNombre: "Administración Global (Multi-Tenant)",
    empresaRuc: "GLOBAL",
    username: "superadmin",
    nombreCompleto: "Ing. Valeria Castañeda (SuperAdmin)",
    rol: "SUPERADMIN",
    dispositivo: "Web Console Admin",
    estadoSesion: "ACTIVO",
    ultimoAcceso: "Hace 1 min",
    latenciaMs: 31,
    emitidosHoy: 0,
    errores24h: 0,
    saludUsuario: "OPTIMO",
  },
  {
    id: 2,
    empresaId: 1,
    empresaNombre: "AGROCAJAMARCA",
    empresaRuc: "20608945123",
    username: "carlos.cajamarca",
    nombreCompleto: "Carlos Mendoza (Admin Empresa)",
    rol: "ADMIN_EMPRESA",
    dispositivo: "Web App (Chrome)",
    estadoSesion: "ACTIVO",
    ultimoAcceso: "Hace 2 min",
    latenciaMs: 46,
    emitidosHoy: 18,
    errores24h: 0,
    saludUsuario: "OPTIMO",
  },
  {
    id: 3,
    empresaId: 1,
    empresaNombre: "AGROCAJAMARCA",
    empresaRuc: "20608945123",
    username: "lucia.caja1",
    nombreCompleto: "Lucía Vargas (Cajera Turno Mañana)",
    rol: "OPERADOR_CAJA",
    dispositivo: "Android APK v2.4.0 (POS Sunmi)",
    estadoSesion: "ACTIVO",
    ultimoAcceso: "Hace 30 seg",
    latenciaMs: 58,
    emitidosHoy: 34,
    errores24h: 0,
    saludUsuario: "OPTIMO",
  },
  {
    id: 4,
    empresaId: 2,
    empresaNombre: "SERMINCON NORTE",
    empresaRuc: "20547812369",
    username: "jorge.sermincon",
    nombreCompleto: "Jorge Salazar (Admin Empresa)",
    rol: "ADMIN_EMPRESA",
    dispositivo: "Web App (Edge)",
    estadoSesion: "ACTIVO",
    ultimoAcceso: "Hace 8 min",
    latenciaMs: 52,
    emitidosHoy: 9,
    errores24h: 0,
    saludUsuario: "OPTIMO",
  },
  {
    id: 5,
    empresaId: 2,
    empresaNombre: "SERMINCON NORTE",
    empresaRuc: "20547812369",
    username: "pedro.logistica",
    nombreCompleto: "Pedro Rojas (Operador Facturación)",
    rol: "OPERADOR_CAJA",
    dispositivo: "Android APK v2.4.0",
    estadoSesion: "CON_ALERTA",
    ultimoAcceso: "Hace 4 min",
    latenciaMs: 245,
    emitidosHoy: 12,
    errores24h: 3,
    saludUsuario: "ADVERTENCIA",
  },
  {
    id: 6,
    empresaId: 3,
    empresaNombre: "DIFARMED PERÚ",
    empresaRuc: "20610459812",
    username: "elena.difarmed",
    nombreCompleto: "Dra. Elena Villanueva (Admin Empresa)",
    rol: "ADMIN_EMPRESA",
    dispositivo: "Web App (Safari)",
    estadoSesion: "ACTIVO",
    ultimoAcceso: "Hace 3 min",
    latenciaMs: 41,
    emitidosHoy: 27,
    errores24h: 0,
    saludUsuario: "OPTIMO",
  },
];

export default function SistemaFacturacionSunatApp() {
  const [componenteActivo, setComponenteActivo] = useState("CLIENTE"); // "CLIENTE" | "ADMIN"
  const [empresas, setEmpresas] = useState(EMPRESAS_DEMO);
  const [empresaClienteActivaId, setEmpresaClienteActivaId] = useState(1);
  const [empresaAdminSeleccionadaId, setEmpresaAdminSeleccionadaId] = useState(1);
  const [comprobantes, setComprobantes] = useState(COMPROBANTES_INICIALES);
  const [usuariosSistema, setUsuariosSistema] = useState(USUARIOS_SISTEMA_INICIALES);
  const [modalApkAbierto, setModalApkAbierto] = useState(false);

  // Estado del formulario de emisión en el Portal Cliente
  const [tipoComp, setTipoComp] = useState("01");
  const [serieComp, setSerieComp] = useState("F001");
  const [clienteDoc, setClienteDoc] = useState("20518963214");
  const [clienteNombre, setClienteNombre] = useState("CONSTRUCTORA Y SERVICIOS ANDINOS S.A.C.");
  const [docAfectadoNumero, setDocAfectadoNumero] = useState("F001-00000142");
  const [codMotivoNota, setCodMotivoNota] = useState("01");
  const [sustentoNota, setSustentoNota] = useState("Descuento comercial acordado post-facturación");
  const [itemsVenta, setItemsVenta] = useState([
    { codigo: "SRV-101", descripcion: "Suministro de Lote Industrial / Servicio Especializado", cantidad: 2, precioConIgv: 590.0 },
  ]);
  const [notificacion, setNotificacion] = useState(null);

  const empresaCliente = useMemo(
    () => empresas.find((e) => e.id === empresaClienteActivaId) || empresas[0],
    [empresas, empresaClienteActivaId]
  );

  const empresaAdmin = useMemo(
    () => empresas.find((e) => e.id === empresaAdminSeleccionadaId) || empresas[0],
    [empresas, empresaAdminSeleccionadaId]
  );

  // Filtro estricto Multi-Tenant: el Portal Cliente SOLO ve los comprobantes de su `empresaId`
  const comprobantesAisladosCliente = useMemo(
    () => comprobantes.filter((c) => c.empresaId === empresaCliente.id),
    [comprobantes, empresaCliente.id]
  );

  const totalesCalculados = useMemo(() => {
    const total = itemsVenta.reduce((acc, it) => acc + Number(it.cantidad || 0) * Number(it.precioConIgv || 0), 0);
    const gravadas = total / 1.18;
    const igv = total - gravadas;
    return {
      gravadas: gravadas.toFixed(2),
      igv: igv.toFixed(2),
      total: total.toFixed(2),
    };
  }, [itemsVenta]);

  const handleSeleccionarTipoComprobante = (nuevoTipo) => {
    setTipoComp(nuevoTipo);
    const meta = TIPOS_COMPROBANTE.find((t) => t.codigo === nuevoTipo);
    if (meta) setSerieComp(meta.serieDefault);
  };

  const handleEmitirComprobante = (e) => {
    e.preventDefault();
    const esInterno = tipoComp === "NV";
    const correlativo = comprobantesAisladosCliente.filter((c) => c.tipoComprobante === tipoComp).length + 150;
    const numeroFormato = `${serieComp}-${String(correlativo).padStart(8, "0")}`;

    const nuevoRegistro = {
      id: Date.now(),
      empresaId: empresaCliente.id,
      tipoComprobante: tipoComp,
      numeroFormato,
      fechaEmision: "2026-10-14 " + new Date().toTimeString().slice(0, 5),
      clienteDoc,
      clienteNombre,
      gravadas: Number(totalesCalculados.gravadas),
      igv: Number(totalesCalculados.igv),
      total: Number(totalesCalculados.total),
      moneda: "PEN",
      esUsoInterno: esInterno,
      enviadoSunat: !esInterno,
      estadoSunat: esInterno ? "NO_APLICA_INTERNO" : "ACEPTADO",
      mensajeSunat: esInterno
        ? "Nota de Venta de uso interno generada. No se firma con CDT ni se envía a SUNAT."
        : `Comprobante ${numeroFormato} firmado con CDT (${empresaCliente.cdtNombreArchivo}) y ACEPTADO en SUNAT (${empresaCliente.entorno}).`,
      hashCpe: esInterno ? null : btoa(`${empresaCliente.ruc}-${numeroFormato}-${Date.now()}`).slice(0, 44),
    };

    setComprobantes([nuevoRegistro, ...comprobantes]);
    setNotificacion({
      tipo: esInterno ? "interno" : "sunat",
      titulo: esInterno
        ? `Nota de Venta Interna ${numeroFormato} generada (Sin envío a SUNAT)`
        : `Comprobante Electrónico ${numeroFormato} aceptado por SUNAT`,
      detalle: nuevoRegistro.mensajeSunat,
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Navegación principal entre los 2 componentes solicitados */}
      <header className="bg-slate-900 text-white px-6 py-4 shadow-md flex flex-wrap justify-between items-center gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
            Arquitectura Multi-Tenant (`empresa_id`) • UBL 2.1 Directo SUNAT
          </span>
          <h1 className="text-lg md:text-xl font-bold">
            Sistema de Facturación Electrónica Web + APK & Consola SuperAdmin
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setComponenteActivo("CLIENTE")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${
              componenteActivo === "CLIENTE" ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-200"
            }`}
          >
            1. Aplicación Web Cliente + Descarga APK
          </button>
          <button
            onClick={() => setComponenteActivo("ADMIN")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${
              componenteActivo === "ADMIN" ? "bg-amber-400 text-slate-950" : "bg-slate-800 text-slate-200"
            }`}
          >
            2. Panel Administrador (CDT, Usuario SOL y Salud)
          </button>
        </div>
      </header>

      {notificacion && (
        <div className="max-w-7xl mx-auto mt-4 px-6">
          <div className="p-4 rounded-xl bg-emerald-900 text-white flex justify-between items-center">
            <div>
              <p className="font-bold text-sm">{notificacion.titulo}</p>
              <p className="text-xs text-emerald-200 mt-0.5">{notificacion.detalle}</p>
            </div>
            <button onClick={() => setNotificacion(null)} className="text-xs underline">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Renderizado condicional del Componente 1 (Portal Cliente) o Componente 2 (Panel Admin) */}
      <main className="max-w-7xl mx-auto p-6">
        {componenteActivo === "CLIENTE" ? (
          <div>
            {/* Selector de sesión de empresa para comprobar el aislamiento estricto de datos */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase text-slate-500">
                  Sesión de Empresa Cliente Activa (Datos Aislados por `empresa_id`)
                </span>
                <div className="flex items-center gap-3 mt-1">
                  <select
                    value={empresaClienteActivaId}
                    onChange={(e) => setEmpresaClienteActivaId(Number(e.target.value))}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold bg-slate-50"
                  >
                    {empresas.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        [empresa_id={emp.id}] RUC {emp.ruc} — {emp.razonSocial}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={() => setModalApkAbierto(true)}
                className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shadow"
              >
                <span>📲 Descargar APK Android (v2.4.0)</span>
              </button>
            </div>

            {/* Formulario de Emisión de Facturas (01), Boletas (03), NC (07), ND (08) y Notas de Venta (NV) */}
            <form onSubmit={handleEmitirComprobante} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
              <h2 className="text-base font-bold mb-4">
                Emitir Comprobante en {empresaCliente.nombreComercial} (RUC {empresaCliente.ruc})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-4">
                {TIPOS_COMPROBANTE.map((t) => (
                  <button
                    type="button"
                    key={t.codigo}
                    onClick={() => handleSeleccionarTipoComprobante(t.codigo)}
                    className={`p-3 rounded-lg border text-left transition ${
                      tipoComp === t.codigo
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                    }`}
                  >
                    <div className="text-xs font-bold">Código {t.codigo}</div>
                    <div className="text-sm font-semibold mt-0.5">{t.nombre}</div>
                    <div className="text-[11px] mt-1 opacity-80">
                      {t.enviaSunat ? "⚡ Envío directo SUNAT" : "🔒 Uso Interno (No SUNAT)"}
                    </div>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Serie</label>
                  <input
                    value={serieComp}
                    onChange={(e) => setSerieComp(e.target.value.toUpperCase())}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Documento Cliente (RUC/DNI)</label>
                  <input
                    value={clienteDoc}
                    onChange={(e) => setClienteDoc(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Razón Social / Cliente</label>
                  <input
                    value={clienteNombre}
                    onChange={(e) => setClienteNombre(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {(tipoComp === "07" || tipoComp === "08") && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">
                      Comprobante Modificado (Factura/Boleta)
                    </label>
                    <input
                      value={docAfectadoNumero}
                      onChange={(e) => setDocAfectadoNumero(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">
                      Motivo SUNAT ({tipoComp === "07" ? "Catálogo 09" : "Catálogo 10"})
                    </label>
                    <select
                      value={codMotivoNota}
                      onChange={(e) => setCodMotivoNota(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    >
                      {(tipoComp === "07" ? MOTIVOS_NOTA_CREDITO : MOTIVOS_NOTA_DEBITO).map((m) => (
                        <option key={m.codigo} value={m.codigo}>{m.descripcion}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">Sustento / Descripción</label>
                    <input
                      value={sustentoNota}
                      onChange={(e) => setSustentoNota(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                <div className="text-sm">
                  Gravadas: <strong>S/ {totalesCalculados.gravadas}</strong> | IGV (18%):{" "}
                  <strong>S/ {totalesCalculados.igv}</strong> | Total:{" "}
                  <strong className="text-lg">S/ {totalesCalculados.total}</strong>
                </div>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold"
                >
                  {tipoComp === "NV"
                    ? "Registrar Nota de Venta Interna (Sin SUNAT)"
                    : `Firmar XML con CDT y Enviar a SUNAT (${empresaCliente.entorno})`}
                </button>
              </div>
            </form>

            {/* Tabla de comprobantes aislados de la empresa activa */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-bold text-sm">
                  Comprobantes Emitidos por {empresaCliente.razonSocial} (`empresa_id = {empresaCliente.id}`)
                </h3>
                <span className="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-semibold">
                  {comprobantesAisladosCliente.length} registros aislados
                </span>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Comprobante</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Destino / Estado SUNAT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {comprobantesAisladosCliente.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3 font-mono font-bold">{c.numeroFormato}</td>
                      <td className="px-4 py-3">{c.tipoComprobante}</td>
                      <td className="px-4 py-3">{c.clienteNombre}</td>
                      <td className="px-4 py-3 text-right font-semibold">S/ {c.total.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        {c.esUsoInterno ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                            USO INTERNO (NO ENVIADO A SUNAT)
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                            {c.estadoSunat} EN SUNAT
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* COMPONENTE 2: PANEL SUPERADMINISTRADOR MULTIEMPRESA */
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-base font-bold mb-2">
                Configuración SUNAT por Empresa Asociada (CDT `.pfx`/`.p12`, Usuario SOL Secundario y Parámetros)
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                Desde este panel el administrador accede a la configuración y estado de todas las empresas asociadas,
                mientras los comprobantes y clientes de cada empresa permanecen estrictamente aislados por `empresa_id`.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {empresas.map((emp) => (
                  <div
                    key={emp.id}
                    onClick={() => setEmpresaAdminSeleccionadaId(emp.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition ${
                      empresaAdmin.id === emp.id
                        ? "border-amber-500 bg-amber-50/50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-mono font-bold text-slate-500">RUC {emp.ruc}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-200">
                        {emp.entorno}
                      </span>
                    </div>
                    <div className="font-bold text-sm mt-1">{emp.razonSocial}</div>
                    <div className="text-xs text-slate-600 mt-2">
                      CDT: <code>{emp.cdtNombreArchivo}</code> ({emp.cdtDiasRestantes} días restantes)
                    </div>
                    <div className="text-xs text-slate-600">
                      Usuario SOL WS: <code>{emp.ruc}{emp.usuarioSolSecundario}</code>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabla de Salud por cada Usuario del Sistema */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h3 className="font-bold text-sm">
                  Estado y Salud por cada Usuario del Sistema (Todas las Empresas Asociadas)
                </h3>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Usuario</th>
                    <th className="px-4 py-3">Empresa Aislada (`empresa_id`)</th>
                    <th className="px-4 py-3">Dispositivo (Web / APK)</th>
                    <th className="px-4 py-3 text-right">Latencia</th>
                    <th className="px-4 py-3 text-right">Emitidos Hoy</th>
                    <th className="px-4 py-3">Salud</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {usuariosSistema.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-3 font-semibold">{u.nombreCompleto} ({u.username})</td>
                      <td className="px-4 py-3">{u.empresaNombre} ({u.empresaRuc})</td>
                      <td className="px-4 py-3">{u.dispositivo}</td>
                      <td className="px-4 py-3 text-right font-mono">{u.latenciaMs} ms</td>
                      <td className="px-4 py-3 text-right font-bold">{u.emitidosHoy}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                          {u.saludUsuario}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
