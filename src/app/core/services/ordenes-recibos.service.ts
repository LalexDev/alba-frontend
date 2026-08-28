import { Injectable } from '@angular/core';
import { defer, Observable } from 'rxjs';

import type {
  DetalleOrdenItem,
  EstadoOrden,
  EstadoPagoOrden,
  OrdenRecibo,
  OrdenReciboDetalle,
  RevisionPagoEstadoRequest,
  RevisionPagoEstadoResultado
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
  a_cuenta?: number | string | null;
  saldo?: number | string | null;
  estado_pago?: string | null;
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
            a_cuenta,
            saldo,
            estado_pago,
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
          .eq(
            'estado_venta',
            'REGISTRADA'
          )
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

  eliminarOrdenErronea(
    idVenta: number
  ): Observable<void> {
    return defer(async () => {
      if (
        !Number.isInteger(idVenta) ||
        idVenta <= 0
      ) {
        throw new Error(
          'La orden seleccionada no es válida.'
        );
      }

      const {
        error
      } =
        await this.supabaseService.client
          .rpc(
            'eliminar_orden_erronea',
            {
              p_id_venta:
                idVenta
            }
          );

      if (error) {
        throw new Error(
          this.traducirError(
            error.message
          )
        );
      }
    });
  }

  revisarPagoYEstado(
    request: RevisionPagoEstadoRequest
  ): Observable<RevisionPagoEstadoResultado> {
    return defer(async () => {
      const pagoAdicional =
        Number(request.pagoAdicional || 0);

      if (
        !Number.isFinite(pagoAdicional) ||
        pagoAdicional < 0
      ) {
        throw new Error(
          'El pago adicional no es válido.'
        );
      }

      const { data, error } =
        await this.supabaseService.client
          .rpc(
            'revisar_pago_y_estado_orden',
            {
              p_id_venta:
                request.idVenta,
              p_estado_orden:
                request.estadoOrden,
              p_pago_adicional:
                Number(
                  pagoAdicional.toFixed(2)
                ),
              p_pago_revisado:
                request.pagoRevisado
            }
          );

      if (error) {
        throw new Error(
          this.traducirError(error.message)
        );
      }

      const resultado =
        (data || {}) as
          Record<string, unknown>;

      return {
        idVenta:
          Number(
            resultado['id_venta'] ||
            request.idVenta
          ),
        total:
          this.numero(
            resultado['total'] as
              number | string | null
          ),
        montoCancelado:
          this.numero(
            resultado['monto_cancelado'] as
              number | string | null
          ),
        saldo:
          this.numero(
            resultado['saldo'] as
              number | string | null
          ),
        estadoPago:
          this.estadoPagoSeguro(
            String(
              resultado['estado_pago'] ||
              ''
            )
          ),
        estadoOrden:
          this.estadoSeguro(
            String(
              resultado['estado_orden'] ||
              request.estadoOrden
            )
          )
      };
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
      fila.a_cuenta !== null &&
      fila.a_cuenta !== undefined
        ? this.numero(fila.a_cuenta)
        : this.numero(
            fila.monto_cancelado
          );

    const saldoGuardado =
      fila.saldo !== null &&
      fila.saldo !== undefined
        ? this.numero(fila.saldo)
        : fila.monto_pendiente === null ||
            fila.monto_pendiente === undefined
          ? null
          : this.numero(
              fila.monto_pendiente
            );

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
      estadoPago:
        this.estadoPagoSeguro(
          fila.estado_pago,
          total,
          montoCancelado,
          saldo
        ),
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

  private estadoPagoSeguro(
    estado:
      string | null | undefined,
    total: number = 0,
    pagado: number = 0,
    saldo: number = 0
  ): EstadoPagoOrden {
    if (estado === 'PAGADO') {
      return 'PAGADO';
    }

    if (estado === 'PARCIAL') {
      return 'PARCIAL';
    }

    if (estado === 'PENDIENTE') {
      return 'PENDIENTE';
    }

    if (
      saldo <= 0.009 &&
      total > 0
    ) {
      return 'PAGADO';
    }

    if (pagado > 0) {
      return 'PARCIAL';
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
        'eliminar_orden_erronea'
      ) ||
      texto.includes(
        'function public.eliminar_orden_erronea'
      )
    ) {
      return 'Falta ejecutar 39_eliminar_orden_erronea.sql en Supabase.';
    }

    if (
      texto.includes(
        'tiene pagos registrados'
      )
    ) {
      return 'No se puede eliminar una orden que ya tiene pagos registrados.';
    }

    if (
      texto.includes(
        'orden completada'
      )
    ) {
      return 'Una orden completada no se puede eliminar.';
    }

    if (
      texto.includes(
        'solo puede eliminar sus propias ordenes'
      ) ||
      texto.includes(
        'solo puede eliminar sus propias órdenes'
      )
    ) {
      return 'El vendedor solo puede eliminar órdenes que él mismo registró.';
    }

    if (
      texto.includes(
        'tipo_documento_interno'
      ) ||
      texto.includes('estado_orden') ||
      texto.includes('monto_cancelado') ||
      texto.includes('monto_pendiente') ||
      texto.includes('fecha_entrega') ||
      texto.includes(
        'revisar_pago_y_estado_orden'
      )
    ) {
      return 'Falta ejecutar el SQL de revisión de pagos y estados en Supabase.';
    }

    if (
      texto.includes(
        'debes revisar y validar el pago'
      )
    ) {
      return 'Debes revisar y validar el estado del pago antes de cambiar la orden.';
    }

    if (
      texto.includes(
        'saldo pendiente'
      ) &&
      texto.includes(
        'completar'
      )
    ) {
      return 'No puedes completar la orden mientras exista saldo pendiente.';
    }

    if (
      texto.includes(
        'pagos registrados'
      ) &&
      texto.includes(
        'cancelar'
      )
    ) {
      return 'La orden tiene pagos registrados. Gestiona primero la devolución antes de cancelarla.';
    }

    if (
      texto.includes(
        'pago adicional'
      ) &&
      texto.includes(
        'saldo'
      )
    ) {
      return 'El pago adicional no puede superar el saldo pendiente.';
    }

    if (
      texto.includes(
        'caja abierta'
      )
    ) {
      return 'Debes tener una caja abierta para registrar un pago adicional en efectivo.';
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
