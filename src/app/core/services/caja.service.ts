import { Injectable } from '@angular/core';
import { defer, Observable } from 'rxjs';

import {
  CajaActual,
  CajaHistorial,
  CerrarCajaRequest,
  MovimientoCaja,
  RegistrarMovimientoCajaRequest
} from '../models/caja.model';

import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class CajaService {
  constructor(private supabaseService: SupabaseService) {}

  obtenerCajaActual(): Observable<CajaActual> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client.rpc('obtener_caja_actual');

      if (error) {
        throw new Error(this.traducirError(error.message));
      }

      return this.mapearCajaActual(data);
    });
  }

  abrirCaja(montoApertura: number): Observable<CajaActual> {
    return defer(async () => {
      const monto = Number(montoApertura);

      if (!Number.isFinite(monto) || monto < 0) {
        throw new Error('El monto de apertura no es válido.');
      }

      const { error } =
        await this.supabaseService.client.rpc('abrir_caja', {
          p_monto_apertura: Number(monto.toFixed(2))
        });

      if (error) {
        throw new Error(this.traducirError(error.message));
      }

      return await this.obtenerCajaActualInterna();
    });
  }

  cerrarCaja(request: CerrarCajaRequest): Observable<CajaActual> {
    return defer(async () => {
      const monto = Number(request.montoCierreReal);

      if (!Number.isFinite(monto) || monto < 0) {
        throw new Error('El efectivo contado no es válido.');
      }

      const { error } =
        await this.supabaseService.client.rpc('cerrar_caja', {
          p_monto_cierre_real: Number(monto.toFixed(2)),
          p_observaciones:
            String(request.observaciones || '').trim() || null
        });

      if (error) {
        throw new Error(this.traducirError(error.message));
      }

      return await this.obtenerCajaActualInterna();
    });
  }

  registrarMovimiento(
    request: RegistrarMovimientoCajaRequest
  ): Observable<void> {
    return defer(async () => {
      const concepto = String(request.concepto || '')
        .replace(/\s+/g, ' ')
        .trim();

      const monto = Number(request.monto);

      if (concepto.length < 4) {
        throw new Error('Escribe el motivo del movimiento.');
      }

      if (!Number.isFinite(monto) || monto <= 0) {
        throw new Error('El monto debe ser mayor que cero.');
      }

      const { error } =
        await this.supabaseService.client.rpc(
          'registrar_movimiento_caja_manual',
          {
            p_tipo: request.tipo,
            p_concepto: concepto,
            p_monto: Number(monto.toFixed(2))
          }
        );

      if (error) {
        throw new Error(this.traducirError(error.message));
      }
    });
  }

  listarMovimientosActuales(): Observable<MovimientoCaja[]> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client.rpc(
          'listar_movimientos_caja_actual'
        );

      if (error) {
        throw new Error(this.traducirError(error.message));
      }

      return (Array.isArray(data) ? data : []).map(
        (item: Record<string, unknown>): MovimientoCaja => ({
          idMovimiento: Number(item['id_movimiento'] || 0),
          idCaja: Number(item['id_caja'] || 0),
          idVenta:
            item['id_venta'] === null || item['id_venta'] === undefined
              ? null
              : Number(item['id_venta']),
          tipo:
            String(item['tipo'] || 'INGRESO') === 'EGRESO'
              ? 'EGRESO'
              : 'INGRESO',
          concepto: String(item['concepto'] || ''),
          monto: this.numero(item['monto']),
          fecha: String(item['fecha'] || ''),
          automatico: Boolean(item['automatico'])
        })
      );
    });
  }

  listarHistorial(
    desde: string,
    hasta: string
  ): Observable<CajaHistorial[]> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client.rpc('listar_cierres_caja', {
          p_desde: desde || null,
          p_hasta: hasta || null
        });

      if (error) {
        throw new Error(this.traducirError(error.message));
      }

      return (Array.isArray(data) ? data : []).map(
        (item: Record<string, unknown>): CajaHistorial => ({
          idCaja: Number(item['id_caja'] || 0),
          idUsuario: String(item['id_usuario'] || ''),
          usuario: String(item['usuario'] || 'Usuario'),
          fechaApertura: String(item['fecha_apertura'] || ''),
          fechaCierre: item['fecha_cierre']
            ? String(item['fecha_cierre'])
            : null,
          montoApertura: this.numero(item['monto_apertura']),
          montoEsperado: this.numero(item['monto_esperado']),
          montoCierreReal:
            item['monto_cierre_real'] === null ||
            item['monto_cierre_real'] === undefined
              ? null
              : this.numero(item['monto_cierre_real']),
          diferencia:
            item['diferencia'] === null ||
            item['diferencia'] === undefined
              ? null
              : this.numero(item['diferencia']),
          estado:
            String(item['estado'] || 'CERRADA') === 'ABIERTA'
              ? 'ABIERTA'
              : 'CERRADA',
          observaciones: String(item['observaciones'] || ''),
          cantidadVentas: Number(item['cantidad_ventas'] || 0),
          totalVendido: this.numero(item['total_vendido']),
          totalCobrado: this.numero(item['total_cobrado']),
          saldoPendiente: this.numero(item['saldo_pendiente']),
          efectivo: this.numero(item['efectivo']),
          yape: this.numero(item['yape']),
          transferencia: this.numero(item['transferencia']),
          seguro: this.numero(item['seguro']),
          ingresosManuales: this.numero(item['ingresos_manuales']),
          egresosManuales: this.numero(item['egresos_manuales'])
        })
      );
    });
  }

  private async obtenerCajaActualInterna(): Promise<CajaActual> {
    const { data, error } =
      await this.supabaseService.client.rpc('obtener_caja_actual');

    if (error) {
      throw new Error(this.traducirError(error.message));
    }

    return this.mapearCajaActual(data);
  }

  private mapearCajaActual(data: unknown): CajaActual {
    const item = (
      data && typeof data === 'object' ? data : {}
    ) as Record<string, unknown>;

    const resumen = (
      item['resumen'] && typeof item['resumen'] === 'object'
        ? item['resumen']
        : {}
    ) as Record<string, unknown>;

    return {
      abierta: Boolean(item['abierta']),
      idCaja:
        item['id_caja'] === null || item['id_caja'] === undefined
          ? null
          : Number(item['id_caja']),
      idUsuario: item['id_usuario']
        ? String(item['id_usuario'])
        : null,
      usuario: String(item['usuario'] || 'Usuario'),
      fechaApertura: item['fecha_apertura']
        ? String(item['fecha_apertura'])
        : null,
      montoApertura: this.numero(item['monto_apertura']),
      estado:
        item['estado'] === 'ABIERTA'
          ? 'ABIERTA'
          : item['estado'] === 'CERRADA'
            ? 'CERRADA'
            : null,
      resumen: {
        cantidadVentas: Number(resumen['cantidad_ventas'] || 0),
        totalVendido: this.numero(resumen['total_vendido']),
        totalCobrado: this.numero(resumen['total_cobrado']),
        saldoPendiente: this.numero(resumen['saldo_pendiente']),
        efectivo: this.numero(resumen['efectivo']),
        yape: this.numero(resumen['yape']),
        transferencia: this.numero(resumen['transferencia']),
        seguro: this.numero(resumen['seguro']),
        ingresosManuales: this.numero(resumen['ingresos_manuales']),
        egresosManuales: this.numero(resumen['egresos_manuales']),
        efectivoEsperado: this.numero(resumen['efectivo_esperado'])
      }
    };
  }

  private numero(valor: unknown): number {
    const numero = Number(valor ?? 0);
    return Number.isFinite(numero)
      ? Number(numero.toFixed(2))
      : 0;
  }

  private traducirError(mensaje: string): string {
    const texto = String(mensaje || '').toLowerCase();

    if (texto.includes('ya tienes una caja abierta')) {
      return 'Ya tienes una caja abierta.';
    }

    if (texto.includes('no tienes una caja abierta')) {
      return 'No tienes una caja abierta.';
    }

    if (texto.includes('debes abrir caja')) {
      return 'Debes abrir caja antes de registrar ventas.';
    }

    if (
      texto.includes('usuario autenticado') ||
      texto.includes('perfil activo')
    ) {
      return 'No se encontró un perfil activo para el usuario autenticado.';
    }

    if (
      texto.includes('could not find the function') ||
      texto.includes('schema cache')
    ) {
      return 'Falta ejecutar 36_cierre_caja_diario.sql en Supabase.';
    }

    return mensaje || 'No se pudo procesar la operación de caja.';
  }
}
