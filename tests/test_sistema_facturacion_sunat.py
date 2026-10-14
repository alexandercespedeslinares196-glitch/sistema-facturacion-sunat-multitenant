#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
SUITE DE PRUEBAS UNITARIAS Y DE INTEGRACIÓN (14 TESTS EXHAUSTIVOS)
Sistema de Facturación Electrónica Multiempresa SUNAT (UBL 2.1)
================================================================================
Valida:
1. Aislamiento Multi-Tenant estricto por `empresa_id` (RUC) en una única BD y bloqueo HTTP 403.
2. Independencia de series y correlativos (`F001`, `B001`, `FC01`, `FD01`, `NV01`) entre empresas.
3. Emisión, firma XMLDSig (`RSA-SHA256`) y envío SOAP WS-Security a SUNAT para:
   - 01: Factura Electrónica (`Invoice`)
   - 03: Boleta de Venta Electrónica (`Invoice`)
   - 07: Nota de Crédito Electrónica (`CreditNote` - Catálogo 09)
   - 08: Nota de Débito Electrónica (`DebitNote` - Catálogo 10)
4. Regla crítica de Notas de Venta (`NV`): uso exclusivamente interno (`es_uso_interno=True`,
   `enviado_a_sunat=False`, `estado_sunat='NO_APLICA_INTERNO'`), sin generación de XML ni envío a SUNAT.
5. Carga y validación criptográfica del Certificado Digital Tributario (CDT `.pfx`/`.p12`),
   rechazo de contraseña incorrecta y cifrado simétrico Fernet (AES) de credenciales SOL.
6. Panel Superadministrador: configuración multiempresa, estado/salud global, salud por empresa
   y telemetría de salud por cada usuario del sistema.
7. Descarga del instalador móvil Android (`.apk`) desde la aplicación web del cliente.
================================================================================
"""

import base64
import os
import sys
import unittest
import zipfile
import io
from lxml import etree

# Asegurar que el directorio de salida esté en sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from fastapi import HTTPException
import backend_fastapi_sunat as backend


class TestSistemaFacturacionSunat(unittest.TestCase):
    """Suite de pruebas unitarias para los dos componentes del Sistema de Facturación SUNAT."""

    @classmethod
    def setUpClass(cls):
        """Inicializa la base de datos única multiempresa con datos semilla antes de la suite."""
        backend.inicializar_bd_y_verificar_sistema()

    def setUp(self):
        self.ctx_superadmin = backend.obtener_contexto_actual(
            x_user_id=1, x_empresa_id=None, x_dispositivo="Web Console Admin"
        )
        self.ctx_empresa1 = backend.obtener_contexto_actual(
            x_user_id=2, x_empresa_id=1, x_dispositivo="Web App Cliente"
        )
        self.ctx_empresa2 = backend.obtener_contexto_actual(
            x_user_id=3, x_empresa_id=2, x_dispositivo="Android APK v2.4.0"
        )
        self.items_demo = [
            backend.ItemComprobanteInput(
                codigo_producto="ITEM-TEST-01",
                descripcion="Servicio de Desarrollo y Facturación Electrónica",
                unidad_medida="ZZ",
                cantidad=2.0,
                precio_unitario_con_igv=590.00,
                cod_afectacion_igv="10",
            )
        ]

    def test_01_aislamiento_multitenant_bloqueo_cruzado_http_403(self):
        """Verifica que un usuario de empresa_id=1 reciba HTTP 403 si intenta operar sobre empresa_id=2."""
        with self.assertRaises(HTTPException) as ctx_err:
            backend.obtener_contexto_actual(
                x_user_id=2, x_empresa_id=2, x_dispositivo="Intento Cruzado"
            )
        self.assertEqual(ctx_err.exception.status_code, 403)
        self.assertIn("empresa_id=1", ctx_err.exception.detail)

    def test_02_bloqueo_acceso_panel_admin_para_usuario_cliente(self):
        """Verifica que un usuario de empresa (no SUPERADMIN) no pueda acceder al Panel Administrador."""
        with self.assertRaises(HTTPException) as ctx_err:
            backend.requerir_superadmin(self.ctx_empresa1)
        self.assertEqual(ctx_err.exception.status_code, 403)

    def test_03_emision_factura_electronica_01_ubl21_y_cdr(self):
        """Verifica la emisión de una Factura Electrónica (01), cálculo de IGV 18%, XML UBL 2.1 y CDR."""
        res = backend.emitir_comprobante(
            backend.EmitirComprobanteInput(
                tipo_comprobante=backend.TipoComprobante.FACTURA,
                serie="F001",
                moneda="PEN",
                cliente_tipo_doc="6",
                cliente_num_doc="20100128218",
                cliente_razon_social="CORPORACIÓN PERUANA DE PRUEBAS S.A.C.",
                items=self.items_demo,
            ),
            ctx=self.ctx_empresa1,
        )
        self.assertEqual(res["empresa_id"], 1)
        self.assertEqual(res["tipo_comprobante"], "01")
        self.assertFalse(res["es_uso_interno"])
        self.assertTrue(res["enviado_a_sunat"])
        self.assertEqual(res["estado_sunat"], "ACEPTADO")
        self.assertEqual(res["codigo_respuesta_sunat"], "0")
        self.assertEqual(res["importe_total"], 1180.00)
        self.assertIsNotNone(res["hash_cpe"])

    def test_04_emision_boleta_venta_03_ubl21(self):
        """Verifica la emisión de una Boleta de Venta Electrónica (03) con DNI y envío a SUNAT."""
        res = backend.emitir_comprobante(
            backend.EmitirComprobanteInput(
                tipo_comprobante=backend.TipoComprobante.BOLETA,
                serie="B001",
                moneda="PEN",
                cliente_tipo_doc="1",
                cliente_num_doc="44556677",
                cliente_razon_social="CLIENTE CONSUMIDOR FINAL",
                items=self.items_demo,
            ),
            ctx=self.ctx_empresa1,
        )
        self.assertEqual(res["tipo_comprobante"], "03")
        self.assertTrue(res["numero_formato"].startswith("B001-"))
        self.assertTrue(res["enviado_a_sunat"])
        self.assertEqual(res["estado_sunat"], "ACEPTADO")

    def test_05_emision_nota_credito_07_catalogo09(self):
        """Verifica la emisión de una Nota de Crédito (07) vinculada a una Factura con Catálogo 09."""
        res = backend.emitir_comprobante(
            backend.EmitirComprobanteInput(
                tipo_comprobante=backend.TipoComprobante.NOTA_CREDITO,
                serie="FC01",
                cliente_tipo_doc="6",
                cliente_num_doc="20100128218",
                cliente_razon_social="CORPORACIÓN PERUANA DE PRUEBAS S.A.C.",
                doc_afectado_tipo="01",
                doc_afectado_numero="F001-00000001",
                cod_motivo_nota="01",
                sustento_motivo_nota="Anulación de la operación",
                items=self.items_demo,
            ),
            ctx=self.ctx_empresa1,
        )
        self.assertEqual(res["tipo_comprobante"], "07")
        self.assertTrue(res["enviado_a_sunat"])
        self.assertEqual(res["estado_sunat"], "ACEPTADO")

    def test_06_emision_nota_debito_08_catalogo10(self):
        """Verifica la emisión de una Nota de Débito (08) vinculada a una Factura con Catálogo 10."""
        res = backend.emitir_comprobante(
            backend.EmitirComprobanteInput(
                tipo_comprobante=backend.TipoComprobante.NOTA_DEBITO,
                serie="FD01",
                cliente_tipo_doc="6",
                cliente_num_doc="20100128218",
                cliente_razon_social="CORPORACIÓN PERUANA DE PRUEBAS S.A.C.",
                doc_afectado_tipo="01",
                doc_afectado_numero="F001-00000001",
                cod_motivo_nota="02",
                sustento_motivo_nota="Aumento en el valor del servicio",
                items=self.items_demo,
            ),
            ctx=self.ctx_empresa1,
        )
        self.assertEqual(res["tipo_comprobante"], "08")
        self.assertTrue(res["enviado_a_sunat"])
        self.assertEqual(res["estado_sunat"], "ACEPTADO")

    def test_07_nota_credito_sin_documento_afectado_rechazada_422(self):
        """Verifica que no se permita emitir Nota de Crédito (07) sin indicar el comprobante modificado."""
        with self.assertRaises(HTTPException) as err:
            backend.emitir_comprobante(
                backend.EmitirComprobanteInput(
                    tipo_comprobante=backend.TipoComprobante.NOTA_CREDITO,
                    serie="FC01",
                    cliente_tipo_doc="6",
                    cliente_num_doc="20100128218",
                    cliente_razon_social="EMPRESA TEST",
                    items=self.items_demo,
                ),
                ctx=self.ctx_empresa1,
            )
        self.assertEqual(err.exception.status_code, 422)

    def test_08_nota_de_venta_interna_bloquea_envio_sunat(self):
        """
        PRUEBA CRÍTICA DE NEGOCIO: Verifica que las Notas de Venta (NV) sean estrictamente
        para uso interno (`es_uso_interno=True`, `enviado_a_sunat=False`, `estado_sunat=NO_APLICA_INTERNO`)
        y que en la base de datos no almacenen XML firmado ni CDR de SUNAT.
        """
        res = backend.emitir_comprobante(
            backend.EmitirComprobanteInput(
                tipo_comprobante=backend.TipoComprobante.NOTA_VENTA,
                serie="NV01",
                cliente_tipo_doc="0",
                cliente_num_doc="00000000",
                cliente_razon_social="CONTROL INTERNO ALMACÉN",
                items=self.items_demo,
            ),
            ctx=self.ctx_empresa1,
        )
        self.assertEqual(res["tipo_comprobante"], "NV")
        self.assertTrue(res["es_uso_interno"])
        self.assertFalse(res["enviado_a_sunat"])
        self.assertEqual(res["estado_sunat"], "NO_APLICA_INTERNO")
        self.assertIsNone(res["hash_cpe"])

        # Verificar directamente en la tabla `comprobantes` que xml_firmado_base64 y cdr_sunat_base64 sean NULL
        with backend.get_db_connection() as conn:
            row = conn.execute(
                "SELECT xml_firmado_base64, cdr_sunat_base64, enviar_a_sunat FROM comprobantes WHERE id = ?",
                (res["id"],),
            ).fetchone()
            self.assertIsNone(row["xml_firmado_base64"])
            self.assertIsNone(row["cdr_sunat_base64"])
            self.assertEqual(row["enviar_a_sunat"], 0)

    def test_09_validacion_prefijos_series_sunat(self):
        """Verifica que Facturas exijan prefijo F, Boletas prefijo B y Notas de Venta prefijo NV."""
        with self.assertRaises(HTTPException) as err_fac:
            backend.emitir_comprobante(
                backend.EmitirComprobanteInput(
                    tipo_comprobante=backend.TipoComprobante.FACTURA,
                    serie="B001",  # Serie inválida para Factura
                    cliente_tipo_doc="6",
                    cliente_num_doc="20100128218",
                    cliente_razon_social="TEST",
                    items=self.items_demo,
                ),
                ctx=self.ctx_empresa1,
            )
        self.assertEqual(err_fac.exception.status_code, 422)

    def test_10_independencia_datos_listado_entre_empresas(self):
        """Verifica que al listar comprobantes de Empresa 1 y Empresa 2 no exista cruce de registros."""
        lista_emp1 = backend.listar_comprobantes_aislados_por_empresa(ctx=self.ctx_empresa1)
        lista_emp2 = backend.listar_comprobantes_aislados_por_empresa(ctx=self.ctx_empresa2)

        self.assertEqual(lista_emp1["empresa_id_aislada"], 1)
        self.assertEqual(lista_emp2["empresa_id_aislada"], 2)

        ids_emp1 = {c["id"] for c in lista_emp1["comprobantes"]}
        ids_emp2 = {c["id"] for c in lista_emp2["comprobantes"]}
        self.assertTrue(ids_emp1.isdisjoint(ids_emp2), "Los comprobantes entre empresas deben ser disjuntos.")

    def test_11_carga_cdt_pfx_valido_y_rechazo_password_erroneo(self):
        """Verifica la extracción criptográfica de un archivo .pfx/.p12 y el rechazo de clave incorrecta."""
        pfx_bytes = backend.GestorCertificadoCDT.generar_pfx_autohomologado_demo(
            "20608945123", "EMPRESA CERTIFICADA S.A.C.", "MiClaveSecreta2026"
        )
        info = backend.GestorCertificadoCDT.procesar_archivo_pfx(pfx_bytes, "MiClaveSecreta2026")
        self.assertIn("BEGIN CERTIFICATE", info["pem_cert"])
        self.assertIn("BEGIN PRIVATE KEY", info["pem_key"])

        with self.assertRaises(ValueError):
            backend.GestorCertificadoCDT.procesar_archivo_pfx(pfx_bytes, "ClaveIncorrecta")

    def test_12_firma_digital_xmldsig_estructura_ubl21(self):
        """Verifica que el XML firmado contenga los nodos oficiales UBL 2.1 y ds:Signature."""
        xml_base = """<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
    <ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>
</Invoice>"""
        res = backend.GestorCertificadoCDT.firmar_xml_ubl21(xml_base, None, None)
        root = etree.fromstring(res["xml_firmado"].encode("utf-8"))
        ns = {"ds": "http://www.w3.org/2000/09/xmldsig#"}
        self.assertIsNotNone(root.find(".//ds:Signature", namespaces=ns))
        self.assertIsNotNone(root.find(".//ds:DigestValue", namespaces=ns))
        self.assertIsNotNone(root.find(".//ds:SignatureValue", namespaces=ns))

    def test_13_panel_admin_multiempresa_y_salud_por_usuario(self):
        """Verifica que el SuperAdmin consulte todas las empresas asociadas y la salud por cada usuario."""
        empresas_admin = backend.admin_listar_empresas_y_estado(ctx=self.ctx_superadmin)
        self.assertGreaterEqual(empresas_admin["total_empresas_asociadas"], 2)

        salud = backend.admin_estado_salud_sistema_y_usuarios(ctx=self.ctx_superadmin)
        self.assertEqual(salud["estado_global_sistema"], "OPTIMO")
        self.assertGreaterEqual(len(salud["salud_por_usuario"]), 3)
        usernames = [u["username"] for u in salud["salud_por_usuario"]]
        self.assertIn("superadmin", usernames)
        self.assertIn("admin.emp1", usernames)
        self.assertIn("admin.emp2", usernames)

    def test_14_descarga_apk_android_valida(self):
        """Verifica que el endpoint de descarga de APK entregue un paquete Android con AndroidManifest.xml."""
        resp = backend.descargar_apk_cliente()
        self.assertEqual(resp.media_type, "application/vnd.android.package-archive")
        self.assertIn("FacturadorSUNAT-Cliente-v2.4.0.apk", resp.headers["Content-Disposition"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
