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
  | 'TRANSFERENCIA'
  | 'SEGURO';

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
    clienteId: number | null = null,
    descuentoManual: number = 0
  ): Observable<VentaRegistrada> {
    return from(
      this.registrarVentaInterna(
        items,
        metodoPago,
        aCuenta,
        observaciones,
        clienteId,
        descuentoManual
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
    clienteId: number | null,
    descuentoManual: number
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
      'TRANSFERENCIA',
      'SEGURO'
    ];

    if (!metodosPermitidos.includes(metodo)) {
      throw new Error(
        'El método de pago seleccionado no es válido.'
      );
    }

    const lineas = items.map(
      (
        item,
        indice
      ) => {
        const cantidad =
          Number(item.cantidad);

        if (
          !Number.isInteger(cantidad) ||
          cantidad <= 0
        ) {
          throw new Error(
            `La cantidad del producto ${item.producto.nombre} no es válida.`
          );
        }

        const esManual =
          Boolean(item.esManual);

        const descripcionManual =
          String(
            item.descripcionManual ||
            item.producto.nombre ||
            ''
          )
            .replace(/\s+/g, ' ')
            .trim();

        const precioUnitario =
          Number(
            esManual
              ? item.precioManual ??
                item.producto.precioVenta ??
                0
              : item.producto.precioVenta ||
                0
          );

        if (
          esManual &&
          descripcionManual.length < 3
        ) {
          throw new Error(
            'El concepto personalizado no tiene una descripción válida.'
          );
        }

        if (
          !Number.isFinite(precioUnitario) ||
          precioUnitario < 0
        ) {
          throw new Error(
            `El precio de ${item.producto.nombre} no es válido.`
          );
        }

        const importe = Number(
          (
            precioUnitario *
            cantidad
          ).toFixed(2)
        );

        return {
          indice,
          item,
          cantidad,
          importe,
          esObsequio:
            Boolean(item.esObsequio),
          esManual,
          descripcionManual,
          precioUnitario
        };
      }
    );

    const totalBruto = Number(
      lineas
        .reduce(
          (
            acumulado,
            linea
          ) =>
            acumulado +
            linea.importe,
          0
        )
        .toFixed(2)
    );

    const descuentoObsequios = Number(
      lineas
        .filter(
          linea =>
            linea.esObsequio
        )
        .reduce(
          (
            acumulado,
            linea
          ) =>
            acumulado +
            linea.importe,
          0
        )
        .toFixed(2)
    );

    const basePagada = Number(
      (
        totalBruto -
        descuentoObsequios
      ).toFixed(2)
    );

    const descuento =
      Number(descuentoManual || 0);

    if (
      !Number.isFinite(descuento) ||
      descuento < 0 ||
      descuento > basePagada
    ) {
      throw new Error(
        'El descuento debe estar entre S/ 0.00 y el importe de los productos cobrados.'
      );
    }

    const descuentoRedondeado =
      Number(
        descuento.toFixed(2)
      );

    const totalCarrito = Number(
      Math.max(
        totalBruto -
        descuentoObsequios -
        descuentoRedondeado,
        0
      ).toFixed(2)
    );

    const adelanto =
      metodo === 'SEGURO'
        ? totalCarrito
        : Number(
            aCuenta || 0
          );

    if (
      !Number.isFinite(adelanto) ||
      adelanto < 0 ||
      adelanto > totalCarrito
    ) {
      throw new Error(
        'El monto a cuenta debe estar entre S/ 0.00 y el total de la venta.'
      );
    }

    /*
     * La función registrar_venta de Supabase ya recibe
     * un descuento por cada detalle.
     *
     * - Los obsequios reciben descuento del 100 %.
     * - El descuento manual se reparte proporcionalmente
     *   entre las líneas que sí se cobran.
     */
    const indicesPagados =
      lineas
        .filter(
          linea =>
            !linea.esObsequio &&
            linea.importe > 0
        )
        .map(
          linea =>
            linea.indice
        );

    const ultimoIndicePagado =
      indicesPagados.length
        ? indicesPagados[
            indicesPagados.length - 1
          ]
        : -1;

    let descuentoPendiente =
      descuentoRedondeado;

    const detalles = lineas.map(
      linea => {
        let descuentoLinea =
          linea.esObsequio
            ? linea.importe
            : 0;

        if (
          !linea.esObsequio &&
          descuentoPendiente > 0 &&
          basePagada > 0
        ) {
          const parteManual =
            linea.indice ===
              ultimoIndicePagado
              ? descuentoPendiente
              : Math.min(
                  Number(
                    (
                      descuentoRedondeado *
                      linea.importe /
                      basePagada
                    ).toFixed(2)
                  ),
                  descuentoPendiente,
                  linea.importe
                );

          descuentoLinea +=
            parteManual;

          descuentoPendiente =
            Number(
              Math.max(
                descuentoPendiente -
                parteManual,
                0
              ).toFixed(2)
            );
        }

        descuentoLinea =
          Number(
            Math.min(
              descuentoLinea,
              linea.importe
            ).toFixed(2)
          );

        if (linea.esManual) {
          return {
            es_manual: true,
            descripcion:
              linea.descripcionManual,
            precio_unitario:
              Number(
                linea.precioUnitario
                  .toFixed(2)
              ),
            cantidad:
              linea.cantidad,
            descuento:
              descuentoLinea
          };
        }

        return {
          es_manual: false,
          producto_id:
            Number(
              linea.item.producto.id
            ),
          cantidad:
            linea.cantidad,
          descuento:
            descuentoLinea
        };
      }
    );

    const {
      data,
      error
    } = await this.supabase.client.rpc(
      'registrar_venta',
      {
        p_id_cliente: clienteId,
        p_metodo_pago: metodo,
        p_a_cuenta:
          Number(
            adelanto.toFixed(2)
          ),
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
      idVenta:
        Number(resultado.id_venta),
      numeroVenta:
        String(resultado.numero_venta),
      total:
        Number(resultado.total),
      aCuenta:
        Number(resultado.a_cuenta),
      saldo:
        Number(resultado.saldo),
      estadoPago:
        resultado.estado_pago
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
        'descripcion_manual'
      ) ||
      mensajeNormalizado.includes(
        'es_item_manual'
      ) ||
      mensajeNormalizado.includes(
        'detalle_venta_origen'
      )
    ) {
      return (
        'Falta ejecutar el archivo ' +
        '25_ventas_conceptos_personalizados.sql en Supabase.'
      );
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