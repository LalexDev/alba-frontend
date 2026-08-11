import { Injectable } from '@angular/core';
import { defer, Observable } from 'rxjs';

import type {
  DetalleOrdenItem,
  EstadoOrden,
  OrdenRecibo,
  OrdenReciboDetalle
} from '../models/orden-recibo.model';

import { SupabaseService } from './supabase.service';

interface ClienteDb {
  id_cliente: number;
  nombres?: string | null;
  apellidos?: string | null;
  razon_social?: string | null;
  telefono?: string | null;
  numero_documento?: string | null;
}

interface VentaDb {
  id_venta: number;
  numero_venta?: string | null;
  id_cliente?: number | null;
  fecha_venta: string;
  fecha_entrega?: string | null;
  tipo_documento_interno?: string | null;
  total?: number | string | null;
  monto_cancelado?: number | string | null;
  monto_pendiente?: number | string | null;
  metodo_pago?: string | null;
  estado_orden?: string | null;
  estado_venta?: string | null;
  observaciones?: string | null;
  cliente?: ClienteDb | ClienteDb[] | null;
}

interface MarcaDb {
  nombre?: string | null;
}

interface ProductoDb {
  id_producto: number;
  codigo_interno?: string | null;
  nombre?: string | null;
  modelo?: string | null;
  color?: string | null;
  medida?: string | null;
  material?: string | null;
  marca?: MarcaDb | MarcaDb[] | null;
}

interface DetalleVentaDb {
  id_detalle_venta: number;
  id_producto: number | null;
  descripcion_manual?: string | null;
  es_item_manual?: boolean | null;
  cantidad?: number | string | null;
  precio_unitario?: number | string | null;
  descuento?: number | string | null;
  subtotal?: number | string | null;
  producto?: ProductoDb | ProductoDb[] | null;
}

@Injectable({
  providedIn: 'root'
})
export class OrdenesRecibosService {

  constructor(
    private supabaseService: SupabaseService
  ) {}

  listar(): Observable<OrdenRecibo[]> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client
          .from('ventas')
          .select(`
            id_venta,
            numero_venta,
            id_cliente,
            fecha_venta,
            fecha_entrega,
            tipo_documento_interno,
            total,
            monto_cancelado,
            monto_pendiente,
            metodo_pago,
            estado_orden,
            estado_venta,
            observaciones,
            cliente:clientes (
              id_cliente,
              nombres,
              apellidos,
              razon_social,
              telefono,
              numero_documento
            )
          `)
          .order('fecha_venta', {
            ascending: false
          });

      if (error) {
        throw new Error(
          this.traducirError(error.message)
        );
      }

      return (data ?? []).map(
        (fila: unknown): OrdenRecibo =>
          this.mapearOrden(
            fila as VentaDb
          )
      );
    });
  }

  obtenerDetalle(
    idVenta: number
  ): Observable<OrdenReciboDetalle> {
    return defer(async () => {
      const [ventaRespuesta, detalleRespuesta] =
        await Promise.all([
          this.supabaseService.client
            .from('ventas')
            .select(`
              id_venta,
              numero_venta,
              id_cliente,
              fecha_venta,
              fecha_entrega,
              tipo_documento_interno,
              total,
              monto_cancelado,
              monto_pendiente,
              metodo_pago,
              estado_orden,
              estado_venta,
              observaciones,
              cliente:clientes (
                id_cliente,
                nombres,
                apellidos,
                razon_social,
                telefono,
                numero_documento
              )
            `)
            .eq('id_venta', idVenta)
            .single(),

          this.supabaseService.client
            .from('detalle_ventas')
            .select(`
              id_detalle_venta,
              id_producto,
              descripcion_manual,
              es_item_manual,
              cantidad,
              precio_unitario,
              descuento,
              subtotal,
              producto:productos (
                id_producto,
                codigo_interno,
                nombre,
                modelo,
                color,
                medida,
                material,
                marca:marcas (
                  nombre
                )
              )
            `)
            .eq('id_venta', idVenta)
            .order('id_detalle_venta', {
              ascending: true
            })
        ]);

      if (ventaRespuesta.error) {
        throw new Error(
          this.traducirError(
            ventaRespuesta.error.message
          )
        );
      }

      if (detalleRespuesta.error) {
        throw new Error(
          this.traducirError(
            detalleRespuesta.error.message
          )
        );
      }

      const orden = this.mapearOrden(
        ventaRespuesta.data as unknown as VentaDb
      );

      const items = (
        detalleRespuesta.data ?? []
      ).map(
        (fila: unknown): DetalleOrdenItem =>
          this.mapearDetalle(
            fila as DetalleVentaDb
          )
      );

      return {
        ...orden,
        items
      };
    });
  }

  cambiarEstado(
    idVenta: number,
    estado: EstadoOrden
  ): Observable<void> {
    return defer(async () => {
      const payload: Record<string, unknown> = {
        estado_orden: estado
      };

      if (estado === 'COMPLETADA') {
        payload['fecha_entrega'] =
          new Date().toISOString();
      }

      if (estado === 'PENDIENTE') {
        payload['fecha_entrega'] = null;
      }

      const { error } =
        await this.supabaseService.client
          .from('ventas')
          .update(payload)
          .eq('id_venta', idVenta);

      if (error) {
        throw new Error(
          this.traducirError(error.message)
        );
      }
    });
  }

  private mapearOrden(
    fila: VentaDb
  ): OrdenRecibo {
    const cliente = this.obtenerRelacion(
      fila.cliente
    );

    const nombres = [
      cliente?.nombres,
      cliente?.apellidos
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    const nombreCliente =
      cliente?.razon_social ||
      nombres ||
      'Cliente general';

    const total = this.numero(fila.total);
    const montoCancelado =
      this.numero(fila.monto_cancelado);

    const saldoGuardado =
      fila.monto_pendiente === null ||
      fila.monto_pendiente === undefined
        ? null
        : this.numero(fila.monto_pendiente);

    const saldo = saldoGuardado === null
      ? Math.max(total - montoCancelado, 0)
      : saldoGuardado;

    const estado = fila.estado_venta ===
      'ANULADA'
        ? 'CANCELADA'
        : this.estadoSeguro(
            fila.estado_orden
          );

    return {
      idVenta: Number(fila.id_venta),
      numeroOrden:
        fila.numero_venta ||
        `ORD-${String(fila.id_venta)
          .padStart(6, '0')}`,
      idCliente:
        fila.id_cliente === null ||
        fila.id_cliente === undefined
          ? null
          : Number(fila.id_cliente),
      cliente: nombreCliente,
      telefono:
        cliente?.telefono || '',
      documento:
        cliente?.numero_documento || '',
      fechaVenta: fila.fecha_venta,
      fechaEntrega:
        fila.fecha_entrega ?? null,
      tipo:
        fila.tipo_documento_interno ===
          'RECIBO'
          ? 'RECIBO'
          : 'ORDEN_TRABAJO',
      total,
      montoCancelado,
      saldo,
      metodoPago:
        fila.metodo_pago === 'YAPE' ||
        fila.metodo_pago ===
          'TRANSFERENCIA' ||
        fila.metodo_pago ===
          'SEGURO'
          ? fila.metodo_pago
          : 'EFECTIVO',
      estado,
      observaciones:
        fila.observaciones || ''
    };
  }

  private mapearDetalle(
    fila: DetalleVentaDb
  ): DetalleOrdenItem {
    const producto = this.obtenerRelacion(
      fila.producto
    );
    const marca = this.obtenerRelacion(
      producto?.marca
    );

    return {
      idDetalle:
        Number(fila.id_detalle_venta),
      idProducto:
        fila.id_producto === null
          ? null
          : Number(
              fila.id_producto
            ),
      codigo:
        fila.es_item_manual
          ? 'MANUAL'
          : producto?.codigo_interno ||
            '',
      producto:
        fila.es_item_manual
          ? fila.descripcion_manual ||
            'Concepto personalizado'
          : producto?.nombre ||
            'Producto',
      esManual:
        Boolean(
          fila.es_item_manual
        ),
      modelo:
        producto?.modelo || '',
      color:
        producto?.color || '',
      medida:
        producto?.medida || '',
      material:
        producto?.material || '',
      marca:
        marca?.nombre || '',
      cantidad:
        this.numero(fila.cantidad),
      precioUnitario:
        this.numero(fila.precio_unitario),
      descuento:
        this.numero(fila.descuento),
      subtotal:
        this.numero(fila.subtotal)
    };
  }

  private obtenerRelacion<T>(
    relacion: T | T[] | null | undefined
  ): T | undefined {
    if (!relacion) {
      return undefined;
    }

    if (Array.isArray(relacion)) {
      return relacion[0];
    }

    return relacion;
  }

  private estadoSeguro(
    estado: string | null | undefined
  ): EstadoOrden {
    if (
      estado === 'COMPLETADA' ||
      estado === 'CANCELADA'
    ) {
      return estado;
    }

    return 'PENDIENTE';
  }

  private numero(
    valor: number | string | null | undefined
  ): number {
    const numero = Number(valor ?? 0);

    return Number.isFinite(numero)
      ? Number(numero.toFixed(2))
      : 0;
  }

  private traducirError(
    mensaje: string
  ): string {
    const texto = String(
      mensaje || ''
    ).toLowerCase();

    if (
      texto.includes(
        'tipo_documento_interno'
      ) ||
      texto.includes('estado_orden') ||
      texto.includes('monto_cancelado') ||
      texto.includes('monto_pendiente') ||
      texto.includes('fecha_entrega')
    ) {
      return 'Falta ejecutar el SQL de Órdenes y recibos en Supabase.';
    }

    if (
      texto.includes('permission denied') ||
      texto.includes('row-level security')
    ) {
      return 'Supabase bloqueó la operación. Revisa las políticas RLS de ventas.';
    }

    return mensaje;
  }
}
