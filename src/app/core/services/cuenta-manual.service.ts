import { Injectable } from '@angular/core';
import { defer, Observable } from 'rxjs';

import type {
  CuentaManual,
  CuentaManualForm,
  PagoCuentaManual,
  RegistrarPagoCuentaManualRequest
} from '../models/cuenta-manual.model';

import type { MetodoCaja } from '../models/caja.model';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class CuentaManualService {
  constructor(
    private supabaseService: SupabaseService
  ) {}

  listar(): Observable<CuentaManual[]> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client.rpc(
          'listar_cuentas_manuales'
        );

      if (error) {
        throw new Error(
          this.traducirError(error.message)
        );
      }

      return (Array.isArray(data) ? data : [])
        .map(
          (item: Record<string, unknown>) =>
            this.mapearCuenta(item)
        );
    });
  }

  registrar(
    form: CuentaManualForm
  ): Observable<number> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client.rpc(
          'registrar_cuenta_manual',
          {
            p_cliente_nombre:
              this.texto(form.clienteNombre),
            p_cliente_telefono:
              this.texto(form.clienteTelefono) || null,
            p_referencia:
              this.texto(form.referencia) || null,
            p_fecha_venta: form.fechaVenta,
            p_montura:
              this.texto(form.montura),
            p_precio_venta:
              this.dinero(form.precioVenta),
            p_total_venta:
              this.dinero(form.totalVenta),
            p_monto_cancelado_historico:
              this.dinero(
                form.montoCanceladoHistorico
              ),
            p_pago_hoy:
              this.dinero(form.pagoRecibidoHoy),
            p_metodo_pago_hoy:
              form.pagoRecibidoHoy &&
              Number(form.pagoRecibidoHoy) > 0
                ? form.metodoPagoHoy
                : null,
            p_observaciones:
              this.texto(form.observaciones) || null
          }
        );

      if (error) {
        throw new Error(
          this.traducirError(error.message)
        );
      }

      const resultado = (
        data && typeof data === 'object'
          ? data
          : {}
      ) as Record<string, unknown>;

      return Number(resultado['id_cuenta'] || 0);
    });
  }

  registrarPago(
    request: RegistrarPagoCuentaManualRequest
  ): Observable<void> {
    return defer(async () => {
      const { error } =
        await this.supabaseService.client.rpc(
          'registrar_pago_cuenta_manual',
          {
            p_id_cuenta: request.idCuenta,
            p_monto: this.dinero(request.monto),
            p_metodo_pago: request.metodoPago,
            p_observaciones:
              this.texto(request.observaciones) || null
          }
        );

      if (error) {
        throw new Error(
          this.traducirError(error.message)
        );
      }
    });
  }

  listarPagos(
    idCuenta: number
  ): Observable<PagoCuentaManual[]> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client.rpc(
          'listar_pagos_cuenta_manual',
          {
            p_id_cuenta: idCuenta
          }
        );

      if (error) {
        throw new Error(
          this.traducirError(error.message)
        );
      }

      return (Array.isArray(data) ? data : [])
        .map(
          (item: Record<string, unknown>): PagoCuentaManual => ({
            idPago: Number(item['id_pago'] || 0),
            idCuenta: Number(item['id_cuenta'] || 0),
            idCaja: Number(item['id_caja'] || 0),
            idUsuario: String(item['id_usuario'] || ''),
            usuario: String(item['usuario'] || 'Usuario'),
            monto: this.numero(item['monto']),
            metodoPago:
              this.metodo(item['metodo_pago']),
            fechaPago: String(item['fecha_pago'] || ''),
            observaciones:
              String(item['observaciones'] || '')
          })
        );
    });
  }

  private mapearCuenta(
    item: Record<string, unknown>
  ): CuentaManual {
    return {
      idCuenta: Number(item['id_cuenta'] || 0),
      idUsuario: String(item['id_usuario'] || ''),
      usuario: String(item['usuario'] || 'Usuario'),
      clienteNombre:
        String(item['cliente_nombre'] || ''),
      clienteTelefono:
        String(item['cliente_telefono'] || ''),
      referencia: String(item['referencia'] || ''),
      fechaVenta: String(item['fecha_venta'] || ''),
      montura: String(item['montura'] || ''),
      precioVenta:
        this.numero(item['precio_venta']),
      totalVenta:
        this.numero(item['total_venta']),
      montoCanceladoHistorico:
        this.numero(
          item['monto_cancelado_historico']
        ),
      cobrosSistema:
        this.numero(item['cobros_sistema']),
      montoCancelado:
        this.numero(item['monto_cancelado']),
      saldoPendiente:
        this.numero(item['saldo_pendiente']),
      estado:
        String(item['estado'] || '') === 'PAGADA'
          ? 'PAGADA'
          : 'PENDIENTE',
      observaciones:
        String(item['observaciones'] || ''),
      creadoEn: String(item['creado_en'] || ''),
      actualizadoEn:
        String(item['actualizado_en'] || ''),
      ultimoPagoEn: item['ultimo_pago_en']
        ? String(item['ultimo_pago_en'])
        : null
    };
  }

  private texto(valor: unknown): string {
    return String(valor || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private dinero(valor: unknown): number {
    const numero = Number(valor ?? 0);

    return Number.isFinite(numero)
      ? Number(numero.toFixed(2))
      : 0;
  }

  private numero(valor: unknown): number {
    return this.dinero(valor);
  }

  private metodo(valor: unknown): MetodoCaja {
    const metodo = String(valor || '').toUpperCase();

    return metodo === 'YAPE' ||
      metodo === 'TRANSFERENCIA'
        ? metodo
        : 'EFECTIVO';
  }

  private traducirError(mensaje: string): string {
    const texto = String(mensaje || '').toLowerCase();

    if (
      texto.includes('could not find the function') ||
      texto.includes('schema cache') ||
      texto.includes(
        'relation "public.cuentas_manuales" does not exist'
      )
    ) {
      return 'Falta ejecutar 50_cuentas_manuales.sql en Supabase.';
    }

    if (
      texto.includes('no existe una caja general abierta')
    ) {
      return 'Abre la caja antes de registrar un pago recibido hoy.';
    }

    if (
      texto.includes('supera el saldo') ||
      texto.includes('superan el total')
    ) {
      return 'El pago no puede superar el saldo pendiente.';
    }

    if (texto.includes('cuenta ya está pagada')) {
      return 'Esta cuenta ya está completamente pagada.';
    }

    return mensaje ||
      'No se pudo procesar la cuenta manual.';
  }
}
