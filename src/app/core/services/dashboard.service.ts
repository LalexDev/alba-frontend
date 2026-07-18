import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface DashboardResumen {
  ventasDia: number;
  totalProductos: number;
  bajoStock: number;
  movimientos: number;
  ultimasVentas: VentaReciente[];
}

export interface VentaReciente {
  id_venta: number;
  numero_venta: string;
  fecha_venta: string;
  total: number;
  metodo_pago: string;
  estado_venta: string;
}

@Injectable({
  providedIn: 'root'
})
export class DashboardService {

  constructor(
    private supabase: SupabaseService
  ) {}

  async obtenerResumen(): Promise<DashboardResumen> {
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);

    const finDia = new Date(inicioDia);
    finDia.setDate(finDia.getDate() + 1);

    const [
      ventasResult,
      productosResult,
      stockResult,
      movimientosResult,
      recientesResult
    ] = await Promise.all([
      this.supabase.client
        .from('ventas')
        .select('total')
        .eq('estado_venta', 'REGISTRADA')
        .gte('fecha_venta', inicioDia.toISOString())
        .lt('fecha_venta', finDia.toISOString()),

      this.supabase.client
        .from('productos')
        .select('id_producto', {
          count: 'exact',
          head: true
        })
        .eq('activo', true),

      this.supabase.client
        .from('productos')
        .select('stock_actual, stock_minimo')
        .eq('activo', true),

      this.supabase.client
        .from('movimientos_inventario')
        .select('id_movimiento', {
          count: 'exact',
          head: true
        }),

      this.supabase.client
        .from('ventas')
        .select(`
          id_venta,
          numero_venta,
          fecha_venta,
          total,
          metodo_pago,
          estado_venta
        `)
        .order('fecha_venta', {
          ascending: false
        })
        .limit(5)
    ]);

    const errores = [
      ventasResult.error,
      productosResult.error,
      stockResult.error,
      movimientosResult.error,
      recientesResult.error
    ].filter(Boolean);

    if (errores.length > 0) {
      console.error(
        'Errores del dashboard:',
        errores
      );

      throw new Error(
        errores
          .map((error) => error?.message)
          .join(' | ')
      );
    }

    const ventasDia = (ventasResult.data ?? [])
      .reduce(
        (total, venta) =>
          total + Number(venta.total ?? 0),
        0
      );

    const bajoStock = (stockResult.data ?? [])
      .filter(
        (producto) =>
          Number(producto.stock_actual) <=
          Number(producto.stock_minimo)
      )
      .length;

    return {
      ventasDia,
      totalProductos: productosResult.count ?? 0,
      bajoStock,
      movimientos: movimientosResult.count ?? 0,
      ultimasVentas:
        (recientesResult.data ?? []) as VentaReciente[]
    };
  }
}