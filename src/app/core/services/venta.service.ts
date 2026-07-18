import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';

import {
  ItemVenta,
  VentaListado,
  VentaRegistrada
} from '../models/venta.model';

import { SupabaseService } from './supabase.service';

export type MetodoPago =
  | 'EFECTIVO'
  | 'YAPE'
  | 'TRANSFERENCIA';

interface RegistrarVentaDb {
  id_venta: number;
  numero_venta: string;
  total: number | string;
  a_cuenta: number | string;
  saldo: number | string;
  estado_pago: 'PENDIENTE' | 'PARCIAL' | 'PAGADO';
}

@Injectable({
  providedIn: 'root'
})
export class VentaService {

  constructor(
    private supabase: SupabaseService
  ) {}

  /**
   * Registra una venta completa mediante una función PostgreSQL.
   *
   * La función registrar_venta se encarga de:
   * - crear la venta;
   * - crear los detalles;
   * - validar el stock;
   * - descontar el inventario;
   * - registrar el kardex;
   * - calcular adelanto y saldo;
   * - registrar el movimiento de caja cuando sea efectivo.
   */
  registrarVenta(
    items: ItemVenta[],
    metodoPago: string = 'EFECTIVO',
    aCuenta: number = 0,
    observaciones: string = '',
    clienteId: number | null = null
  ): Observable<VentaRegistrada> {
    return from(
      this.registrarVentaInterna(
        items,
        metodoPago,
        aCuenta,
        observaciones,
        clienteId
      )
    );
  }

  /**
   * Lista las ventas para órdenes, recibos e historial.
   */
  listar(): Observable<VentaListado[]> {
    return from(this.listarInterno());
  }

  /**
   * Anula una venta y devuelve el stock.
   */
  anular(
    idVenta: number,
    motivo: string
  ): Observable<void> {
    return from(
      this.anularInterno(idVenta, motivo)
    );
  }

  private async registrarVentaInterna(
    items: ItemVenta[],
    metodoPago: string,
    aCuenta: number,
    observaciones: string,
    clienteId: number | null
  ): Promise<VentaRegistrada> {

    if (!items.length) {
      throw new Error(
        'No se puede registrar una venta vacía.'
      );
    }

    const metodo = metodoPago
      .trim()
      .toUpperCase() as MetodoPago;

    const metodosPermitidos: MetodoPago[] = [
      'EFECTIVO',
      'YAPE',
      'TRANSFERENCIA'
    ];

    if (!metodosPermitidos.includes(metodo)) {
      throw new Error(
        'El método de pago seleccionado no es válido.'
      );
    }

    const totalCarrito = items.reduce(
      (total, item) =>
        total +
        Number(item.producto.precioVenta) *
        Number(item.cantidad),
      0
    );

    const adelanto = Number(aCuenta || 0);

    if (
      !Number.isFinite(adelanto) ||
      adelanto < 0 ||
      adelanto > totalCarrito
    ) {
      throw new Error(
        'El monto a cuenta debe estar entre S/ 0.00 y el total de la venta.'
      );
    }

    const detalles = items.map((item) => {
      const cantidad = Number(item.cantidad);

      if (
        !Number.isInteger(cantidad) ||
        cantidad <= 0
      ) {
        throw new Error(
          `La cantidad del producto ${item.producto.nombre} no es válida.`
        );
      }

      return {
        producto_id: Number(item.producto.id),
        cantidad,
        descuento: 0
      };
    });

    const {
      data,
      error
    } = await this.supabase.client.rpc(
      'registrar_venta',
      {
        p_id_cliente: clienteId,
        p_metodo_pago: metodo,
        p_a_cuenta: adelanto,
        p_observaciones:
          observaciones.trim() || null,
        p_detalles: detalles
      }
    );

    if (error) {
      console.error(
        'Error de Supabase al registrar venta:',
        error
      );

      throw new Error(
        this.traducirError(error.message)
      );
    }

    if (!data) {
      throw new Error(
        'Supabase no devolvió los datos de la venta.'
      );
    }

    const resultado =
      data as RegistrarVentaDb;

    return {
      idVenta: Number(resultado.id_venta),
      numeroVenta:
        String(resultado.numero_venta),
      total: Number(resultado.total),
      aCuenta: Number(resultado.a_cuenta),
      saldo: Number(resultado.saldo),
      estadoPago: resultado.estado_pago
    };
  }

  private async listarInterno():
    Promise<VentaListado[]> {

    const {
      data,
      error
    } = await this.supabase.client
      .from('ventas')
      .select(`
        id_venta,
        numero_venta,
        fecha_venta,
        total,
        a_cuenta,
        saldo,
        metodo_pago,
        estado_pago,
        estado_venta,
        observaciones,

        cliente:clientes (
          nombres,
          apellidos,
          razon_social
        ),

        usuario:usuarios!ventas_id_usuario_fkey (
          nombres,
          apellidos
        )
      `)
      .order(
        'fecha_venta',
        { ascending: false }
      )
      .limit(500);

    if (error) {
      console.error(
        'Error al listar ventas:',
        error
      );

      throw new Error(error.message);
    }

    return (data ?? []).map((fila): VentaListado => {
      const cliente =
        this.obtenerRelacion(fila.cliente);

      const usuario =
        this.obtenerRelacion(fila.usuario);

      const nombresCliente = [
        cliente?.['nombres'],
        cliente?.['apellidos']
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

      const nombreCliente =
        String(
          cliente?.['razon_social'] ||
          nombresCliente ||
          'Cliente general'
        );

      const nombreVendedor = [
        usuario?.['nombres'],
        usuario?.['apellidos']
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

      return {
        id: Number(fila.id_venta),
        numeroVenta:
          String(fila.numero_venta),
        fechaVenta:
          String(fila.fecha_venta),
        cliente: nombreCliente,
        vendedor:
          nombreVendedor || 'Usuario',
        total: Number(fila.total),
        aCuenta: Number(fila.a_cuenta),
        saldo: Number(fila.saldo),
        metodoPago:
          String(fila.metodo_pago),
        estadoPago:
          String(fila.estado_pago),
        estadoVenta:
          String(fila.estado_venta),
        observaciones:
          fila.observaciones
            ? String(fila.observaciones)
            : undefined
      };
    });
  }

  private async anularInterno(
    idVenta: number,
    motivo: string
  ): Promise<void> {

    const motivoLimpio = motivo.trim();

    if (!idVenta) {
      throw new Error(
        'La venta seleccionada no es válida.'
      );
    }

    if (motivoLimpio.length < 5) {
      throw new Error(
        'Ingresa el motivo de la anulación.'
      );
    }

    const {
      error
    } = await this.supabase.client.rpc(
      'anular_venta',
      {
        p_id_venta: idVenta,
        p_motivo: motivoLimpio
      }
    );

    if (error) {
      console.error(
        'Error al anular venta:',
        error
      );

      throw new Error(
        this.traducirError(error.message)
      );
    }
  }

  private obtenerRelacion(
    valor: unknown
  ): Record<string, unknown> | null {

    if (Array.isArray(valor)) {
      return (
        valor[0] as
          Record<string, unknown> | undefined
      ) ?? null;
    }

    if (
      valor &&
      typeof valor === 'object'
    ) {
      return valor as Record<string, unknown>;
    }

    return null;
  }

  private traducirError(
    mensaje: string
  ): string {

    const mensajeNormalizado =
      mensaje.toLowerCase();

    if (
      mensajeNormalizado.includes(
        'stock insuficiente'
      )
    ) {
      return mensaje;
    }

    if (
      mensajeNormalizado.includes(
        'usuario no autorizado'
      )
    ) {
      return 'Tu usuario no está autorizado para registrar ventas.';
    }

    if (
      mensajeNormalizado.includes(
        'producto no encontrado'
      )
    ) {
      return 'Uno de los productos ya no existe.';
    }

    if (
      mensajeNormalizado.includes(
        'método de pago inválido'
      )
    ) {
      return 'El método de pago seleccionado no es válido.';
    }

    if (
      mensajeNormalizado.includes(
        'function public.registrar_venta'
      ) ||
      mensajeNormalizado.includes(
        'could not find the function'
      )
    ) {
      return 'La función registrar_venta todavía no está instalada en Supabase.';
    }

    return mensaje;
  }
}