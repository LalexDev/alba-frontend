import { Injectable } from '@angular/core';
import { defer, Observable } from 'rxjs';

import { SupabaseService } from './supabase.service';

export interface DashboardResumen {
  totalVentas: number;
  bajoStock: number;
  cantidadVentas: number;
  totalProductos: number;
  movimientosInventario: number;
}

@Injectable({
  providedIn: 'root'
})
export class ReportesService {

  constructor(
    private supabaseService: SupabaseService
  ) {}

  dashboard(): Observable<DashboardResumen> {
    return defer(() => this.obtenerDashboard());
  }

  private async obtenerDashboard(): Promise<DashboardResumen> {
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);

    const finDia = new Date(inicioDia);
    finDia.setDate(finDia.getDate() + 1);

    const [
      ventasResult,
      productosResult,
      stockResult,
      movimientosResult
    ] = await Promise.all([
      this.supabaseService.client
        .from('ventas')
        .select('id_venta, total')
        .eq('estado_venta', 'REGISTRADA')
        .gte('fecha_venta', inicioDia.toISOString())
        .lt('fecha_venta', finDia.toISOString()),

      this.supabaseService.client
        .from('productos')
        .select('id_producto', {
          count: 'exact',
          head: true
        })
        .eq('activo', true),

      this.supabaseService.client
        .from('productos')
        .select('stock_actual, stock_minimo')
        .eq('activo', true),

      this.supabaseService.client
        .from('movimientos_inventario')
        .select('id_movimiento', {
          count: 'exact',
          head: true
        })
    ]);

    const errores = [
      ventasResult.error,
      productosResult.error,
      stockResult.error,
      movimientosResult.error
    ].filter((error) => error !== null);

    if (errores.length > 0) {
      console.error(
        'Errores al consultar dashboard:',
        errores
      );

      throw new Error(
        errores
          .map((error) => error?.message)
          .join(' | ')
      );
    }

    const ventas = (
      ventasResult.data ?? []
    ) as Array<{
      id_venta: number;
      total: number | string | null;
    }>;

    const productos = (
      stockResult.data ?? []
    ) as Array<{
      stock_actual: number;
      stock_minimo: number;
    }>;

    const totalVentas = ventas.reduce(
      (acumulado, venta) =>
        acumulado + Number(venta.total ?? 0),
      0
    );

    const bajoStock = productos.filter(
      (producto) =>
        Number(producto.stock_actual) <=
        Number(producto.stock_minimo)
    ).length;

    return {
      totalVentas,
      cantidadVentas: ventas.length,
      totalProductos: productosResult.count ?? 0,
      bajoStock,
      movimientosInventario:
        movimientosResult.count ?? 0
    };
  }

  ventasDiarias(): Observable<any[]> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client
          .from('ventas')
          .select(`
            id_venta,
            numero_venta,
            fecha_venta,
            total,
            metodo_pago,
            estado_venta
          `)
          .eq('estado_venta', 'REGISTRADA')
          .order('fecha_venta', {
            ascending: false
          });

      if (error) {
        throw new Error(error.message);
      }

      return data ?? [];
    });
  }

  bajoStock(): Observable<any[]> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client
          .from('productos')
          .select(`
            id_producto,
            codigo_interno,
            codigo_barras,
            nombre,
            stock_actual,
            stock_minimo,
            precio_venta
          `)
          .eq('activo', true)
          .order('stock_actual', {
            ascending: true
          });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).filter(
        (producto) =>
          Number(producto.stock_actual) <=
          Number(producto.stock_minimo)
      );
    });
  }

  productosMasVendidos(): Observable<any[]> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client
          .from('detalle_ventas')
          .select(`
            id_producto,
            cantidad,
            subtotal,
            productos (
              codigo_interno,
              nombre
            ),
            ventas!inner (
              estado_venta
            )
          `)
          .eq(
            'ventas.estado_venta',
            'REGISTRADA'
          );

      if (error) {
        throw new Error(error.message);
      }

      const acumulados = new Map<number, any>();

      for (const detalle of data ?? []) {
        const idProducto = Number(
          detalle.id_producto
        );

        const existente = acumulados.get(
          idProducto
        ) ?? {
          idProducto,
          codigoInterno:
            (detalle.productos as any)
              ?.codigo_interno ?? '',
          nombre:
            (detalle.productos as any)
              ?.nombre ?? 'Producto',
          cantidadVendida: 0,
          totalVendido: 0
        };

        existente.cantidadVendida += Number(
          detalle.cantidad ?? 0
        );

        existente.totalVendido += Number(
          detalle.subtotal ?? 0
        );

        acumulados.set(
          idProducto,
          existente
        );
      }

      return Array.from(
        acumulados.values()
      )
        .sort(
          (a, b) =>
            b.cantidadVendida -
            a.cantidadVendida
        )
        .slice(0, 10);
    });
  }
}