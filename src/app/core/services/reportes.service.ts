import { Injectable } from '@angular/core';
import { defer, Observable } from 'rxjs';

import { SupabaseService } from './supabase.service';

export interface FiltrosReporte {
  desde: string;
  hasta: string;
  vendedorId: number | null;
  proveedorId: number | null;
}

export interface OpcionReporte {
  id: number;
  nombre: string;
}

export interface DashboardResumen {
  totalVentas: number;
  bajoStock: number;
  cantidadVentas: number;
  totalProductos: number;
  movimientosInventario: number;
  // Opcional para mantener compatibilidad con el Dashboard anterior.
  gananciaEstimada?: number;
}

export interface ProductoVendidoReporte {
  idProducto: number;
  codigoInterno: string;
  nombre: string;
  cantidadVendida: number;
  totalVendido: number;
  costoEstimado: number;
  gananciaEstimada: number;
}

export interface VentaVendedorReporte {
  idVendedor: number;
  vendedor: string;
  ordenes: number;
  totalVendido: number;
  gananciaEstimada: number;
}

export interface VentaProveedorReporte {
  idProveedor: number;
  proveedor: string;
  ordenes: number;
  totalComprado: number;
  totalVendido: number;
  gananciaEstimada: number;
}

export interface ProductoBajoStockReporte {
  idProducto: number;
  codigoInterno: string;
  nombre: string;
  categoria: string;
  marca: string;
  proveedor: string;
  stockActual: number;
  stockMinimo: number;
}

export interface VentaDetalleReporte {
  idVenta: number;
  numeroVenta: string;
  fechaVenta: string;
  vendedor: string;
  metodoPago: string;
  total: number;
}

export interface ReporteCompleto {
  resumen: DashboardResumen;
  productosMasVendidos: ProductoVendidoReporte[];
  ventasPorVendedor: VentaVendedorReporte[];
  ventasPorProveedor: VentaProveedorReporte[];
  bajoStock: ProductoBajoStockReporte[];
  ventasDetalle: VentaDetalleReporte[];
}

interface UsuarioDb {
  id_usuario: number;
  nombres?: string | null;
  apellidos?: string | null;
  activo?: boolean | null;
}

interface ProveedorDb {
  id_proveedor: number;
  razon_social?: string | null;
  activo?: boolean | null;
}

interface VentaDb {
  id_venta: number;
  numero_venta?: string | null;
  id_usuario: number;
  fecha_venta: string;
  total?: number | string | null;
  metodo_pago?: string | null;
  estado_venta?: string | null;
}

interface ProductoDetalleDb {
  id_producto: number;
  codigo_interno?: string | null;
  nombre?: string | null;
  precio_compra?: number | string | null;
  id_proveedor_preferido?: number | null;
}

interface DetalleVentaDb {
  id_venta: number;
  id_producto: number;
  cantidad?: number | string | null;
  subtotal?: number | string | null;
  producto?: ProductoDetalleDb | ProductoDetalleDb[] | null;
}

interface CompraDb {
  id_compra: number;
  id_proveedor: number;
  total?: number | string | null;
  estado?: string | null;
}

interface RelacionNombreDb {
  nombre?: string | null;
}

interface RelacionProveedorDb {
  id_proveedor: number;
  razon_social?: string | null;
}

interface ProductoStockDb {
  id_producto: number;
  codigo_interno?: string | null;
  nombre?: string | null;
  stock_actual?: number | string | null;
  stock_minimo?: number | string | null;
  id_proveedor_preferido?: number | null;
  categoria?: RelacionNombreDb | RelacionNombreDb[] | null;
  marca?: RelacionNombreDb | RelacionNombreDb[] | null;
  proveedor?: RelacionProveedorDb | RelacionProveedorDb[] | null;
}

@Injectable({
  providedIn: 'root'
})
export class ReportesService {

  constructor(
    private supabaseService: SupabaseService
  ) {}

  listarVendedores(): Observable<OpcionReporte[]> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client
          .from('usuarios')
          .select(`
            id_usuario,
            nombres,
            apellidos,
            activo
          `)
          .eq('activo', true)
          .order('nombres', {
            ascending: true
          });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).map(
        (fila: unknown): OpcionReporte => {
          const usuario = fila as UsuarioDb;
          const nombreCompleto = [
            usuario.nombres,
            usuario.apellidos
          ]
            .filter(Boolean)
            .join(' ')
            .trim();

          return {
            id: Number(usuario.id_usuario),
            nombre:
              nombreCompleto ||
              `Usuario ${usuario.id_usuario}`
          };
        }
      );
    });
  }

  listarProveedores(): Observable<OpcionReporte[]> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client
          .from('proveedores')
          .select(`
            id_proveedor,
            razon_social,
            activo
          `)
          .eq('activo', true)
          .order('razon_social', {
            ascending: true
          });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).map(
        (fila: unknown): OpcionReporte => {
          const proveedor = fila as ProveedorDb;

          return {
            id: Number(proveedor.id_proveedor),
            nombre:
              proveedor.razon_social ||
              `Proveedor ${proveedor.id_proveedor}`
          };
        }
      );
    });
  }

  obtenerReporte(
    filtros: FiltrosReporte
  ): Observable<ReporteCompleto> {
    return defer(() =>
      this.obtenerReporteInterno(filtros)
    );
  }

  // Métodos conservados para no romper componentes anteriores.
  dashboard(): Observable<DashboardResumen> {
    return defer(async () => {
      const reporte =
        await this.obtenerReporteInterno(
          this.filtrosDiaActual()
        );

      return reporte.resumen;
    });
  }

  ventasDiarias(): Observable<any[]> {
    return defer(async () => {
      const reporte =
        await this.obtenerReporteInterno(
          this.filtrosMesActual()
        );

      return reporte.ventasDetalle;
    });
  }

  bajoStock(): Observable<any[]> {
    return defer(async () => {
      const reporte =
        await this.obtenerReporteInterno(
          this.filtrosMesActual()
        );

      return reporte.bajoStock;
    });
  }

  productosMasVendidos(): Observable<any[]> {
    return defer(async () => {
      const reporte =
        await this.obtenerReporteInterno(
          this.filtrosMesActual()
        );

      return reporte.productosMasVendidos;
    });
  }

  private async obtenerReporteInterno(
    filtros: FiltrosReporte
  ): Promise<ReporteCompleto> {
    this.validarFiltros(filtros);

    const inicio =
      this.inicioFecha(filtros.desde);
    const finExclusivo =
      this.diaSiguiente(filtros.hasta);

    let ventasQuery =
      this.supabaseService.client
        .from('ventas')
        .select(`
          id_venta,
          numero_venta,
          id_usuario,
          fecha_venta,
          total,
          metodo_pago,
          estado_venta
        `)
        .eq('estado_venta', 'REGISTRADA')
        .gte('fecha_venta', inicio)
        .lt('fecha_venta', finExclusivo)
        .order('fecha_venta', {
          ascending: false
        });

    if (filtros.vendedorId !== null) {
      ventasQuery = ventasQuery.eq(
        'id_usuario',
        filtros.vendedorId
      );
    }

    let comprasQuery =
      this.supabaseService.client
        .from('compras')
        .select(`
          id_compra,
          id_proveedor,
          total,
          estado
        `)
        .eq('estado', 'REGISTRADA')
        .gte('fecha_compra', inicio)
        .lt('fecha_compra', finExclusivo);

    if (filtros.proveedorId !== null) {
      comprasQuery = comprasQuery.eq(
        'id_proveedor',
        filtros.proveedorId
      );
    }

    const [
      ventasRespuesta,
      usuariosRespuesta,
      proveedoresRespuesta,
      comprasRespuesta,
      stockRespuesta,
      productosCountRespuesta,
      movimientosRespuesta
    ] = await Promise.all([
      ventasQuery,

      this.supabaseService.client
        .from('usuarios')
        .select(`
          id_usuario,
          nombres,
          apellidos,
          activo
        `),

      this.supabaseService.client
        .from('proveedores')
        .select(`
          id_proveedor,
          razon_social,
          activo
        `),

      comprasQuery,

      this.supabaseService.client
        .from('productos')
        .select(`
          id_producto,
          codigo_interno,
          nombre,
          stock_actual,
          stock_minimo,
          id_proveedor_preferido,
          categoria:categorias (
            nombre
          ),
          marca:marcas (
            nombre
          ),
          proveedor:proveedores (
            id_proveedor,
            razon_social
          )
        `)
        .eq('activo', true)
        .order('stock_actual', {
          ascending: true
        }),

      this.supabaseService.client
        .from('productos')
        .select('id_producto', {
          count: 'exact',
          head: true
        })
        .eq('activo', true),

      this.supabaseService.client
        .from('movimientos_inventario')
        .select('id_movimiento', {
          count: 'exact',
          head: true
        })
        .gte('fecha_movimiento', inicio)
        .lt('fecha_movimiento', finExclusivo)
    ]);

    const errores = [
      ventasRespuesta.error,
      usuariosRespuesta.error,
      proveedoresRespuesta.error,
      comprasRespuesta.error,
      stockRespuesta.error,
      productosCountRespuesta.error,
      movimientosRespuesta.error
    ].filter(
      error => error !== null
    );

    if (errores.length > 0) {
      console.error(
        'Errores al construir el reporte:',
        errores
      );

      throw new Error(
        errores
          .map(error => error?.message)
          .filter(Boolean)
          .join(' | ')
      );
    }

    const ventas = (ventasRespuesta.data ?? [])
      .map(
        (fila: unknown) =>
          fila as VentaDb
      );

    const idsVenta = ventas.map(
      venta => Number(venta.id_venta)
    );

    let detalles: DetalleVentaDb[] = [];

    if (idsVenta.length > 0) {
      const { data, error } =
        await this.supabaseService.client
          .from('detalle_ventas')
          .select(`
            id_venta,
            id_producto,
            cantidad,
            subtotal,
            producto:productos (
              id_producto,
              codigo_interno,
              nombre,
              precio_compra,
              id_proveedor_preferido
            )
          `)
          .in('id_venta', idsVenta);

      if (error) {
        throw new Error(error.message);
      }

      detalles = (data ?? []).map(
        (fila: unknown) =>
          fila as DetalleVentaDb
      );
    }

    const usuarios = (usuariosRespuesta.data ?? [])
      .map(
        (fila: unknown) =>
          fila as UsuarioDb
      );

    const proveedores =
      (proveedoresRespuesta.data ?? [])
        .map(
          (fila: unknown) =>
            fila as ProveedorDb
        );

    const compras = (comprasRespuesta.data ?? [])
      .map(
        (fila: unknown) =>
          fila as CompraDb
      );

    const productosStock =
      (stockRespuesta.data ?? [])
        .map(
          (fila: unknown) =>
            fila as ProductoStockDb
        );

    const usuarioPorId = new Map<
      number,
      string
    >();

    for (const usuario of usuarios) {
      const nombre = [
        usuario.nombres,
        usuario.apellidos
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

      usuarioPorId.set(
        Number(usuario.id_usuario),
        nombre ||
          `Usuario ${usuario.id_usuario}`
      );
    }

    const proveedorPorId = new Map<
      number,
      string
    >();

    for (const proveedor of proveedores) {
      proveedorPorId.set(
        Number(proveedor.id_proveedor),
        proveedor.razon_social ||
          `Proveedor ${proveedor.id_proveedor}`
      );
    }

    const ventasPorId = new Map<
      number,
      VentaDb
    >();

    for (const venta of ventas) {
      ventasPorId.set(
        Number(venta.id_venta),
        venta
      );
    }

    const detallesFiltrados =
      filtros.proveedorId === null
        ? detalles
        : detalles.filter(detalle => {
            const producto =
              this.obtenerRelacion(
                detalle.producto
              );

            return Number(
              producto?.id_proveedor_preferido ?? 0
            ) === filtros.proveedorId;
          });

    const idsVentasConDetalle = new Set(
      detallesFiltrados.map(
        detalle => Number(detalle.id_venta)
      )
    );

    const ventasFiltradas =
      filtros.proveedorId === null
        ? ventas
        : ventas.filter(
            venta =>
              idsVentasConDetalle.has(
                Number(venta.id_venta)
              )
          );

    const totalVendido =
      filtros.proveedorId === null
        ? ventasFiltradas.reduce(
            (total, venta) =>
              total + this.numero(venta.total),
            0
          )
        : detallesFiltrados.reduce(
            (total, detalle) =>
              total + this.numero(detalle.subtotal),
            0
          );

    const gananciaEstimada =
      detallesFiltrados.reduce(
        (total, detalle) => {
          const producto =
            this.obtenerRelacion(
              detalle.producto
            );

          const cantidad =
            this.numero(detalle.cantidad);
          const costo =
            this.numero(producto?.precio_compra) *
            cantidad;
          const vendido =
            this.numero(detalle.subtotal);

          return total + vendido - costo;
        },
        0
      );

    const productosMasVendidos =
      this.agruparProductos(detallesFiltrados);

    const ventasPorVendedor =
      this.agruparVendedores(
        ventasFiltradas,
        detallesFiltrados,
        usuarioPorId,
        filtros.proveedorId !== null
      );

    const ventasPorProveedor =
      this.agruparProveedores(
        detalles,
        compras,
        ventasPorId,
        proveedorPorId,
        filtros
      );

    const bajoStock = productosStock
      .filter(producto =>
        this.numero(producto.stock_actual) <=
        this.numero(producto.stock_minimo)
      )
      .filter(producto =>
        filtros.proveedorId === null ||
        Number(
          producto.id_proveedor_preferido ?? 0
        ) === filtros.proveedorId
      )
      .map(
        (producto): ProductoBajoStockReporte => {
          const categoria =
            this.obtenerRelacion(
              producto.categoria
            );
          const marca =
            this.obtenerRelacion(
              producto.marca
            );
          const proveedor =
            this.obtenerRelacion(
              producto.proveedor
            );

          return {
            idProducto:
              Number(producto.id_producto),
            codigoInterno:
              producto.codigo_interno || '',
            nombre:
              producto.nombre || 'Producto',
            categoria:
              categoria?.nombre || 'Sin categoría',
            marca:
              marca?.nombre || 'Sin marca',
            proveedor:
              proveedor?.razon_social ||
              proveedorPorId.get(
                Number(
                  producto.id_proveedor_preferido ?? 0
                )
              ) ||
              'Sin proveedor',
            stockActual:
              this.numero(producto.stock_actual),
            stockMinimo:
              this.numero(producto.stock_minimo)
          };
        }
      );

    const ventasDetalle = ventasFiltradas.map(
      (venta): VentaDetalleReporte => ({
        idVenta: Number(venta.id_venta),
        numeroVenta:
          venta.numero_venta ||
          `V-${venta.id_venta}`,
        fechaVenta: venta.fecha_venta,
        vendedor:
          usuarioPorId.get(
            Number(venta.id_usuario)
          ) ||
          `Usuario ${venta.id_usuario}`,
        metodoPago:
          venta.metodo_pago || 'NO DEFINIDO',
        total:
          filtros.proveedorId === null
            ? this.numero(venta.total)
            : detallesFiltrados
                .filter(
                  detalle =>
                    Number(detalle.id_venta) ===
                    Number(venta.id_venta)
                )
                .reduce(
                  (total, detalle) =>
                    total +
                    this.numero(detalle.subtotal),
                  0
                )
      })
    );

    return {
      resumen: {
        totalVentas: this.redondear(totalVendido),
        cantidadVentas:
          ventasFiltradas.length,
        gananciaEstimada:
          this.redondear(gananciaEstimada),
        bajoStock:
          bajoStock.length,
        totalProductos:
          productosCountRespuesta.count ?? 0,
        movimientosInventario:
          movimientosRespuesta.count ?? 0
      },
      productosMasVendidos,
      ventasPorVendedor,
      ventasPorProveedor,
      bajoStock,
      ventasDetalle
    };
  }

  private agruparProductos(
    detalles: DetalleVentaDb[]
  ): ProductoVendidoReporte[] {
    const agrupados = new Map<
      number,
      ProductoVendidoReporte
    >();

    for (const detalle of detalles) {
      const producto =
        this.obtenerRelacion(
          detalle.producto
        );
      const idProducto = Number(
        detalle.id_producto
      );
      const cantidad =
        this.numero(detalle.cantidad);
      const vendido =
        this.numero(detalle.subtotal);
      const costo =
        this.numero(producto?.precio_compra) *
        cantidad;

      const actual = agrupados.get(
        idProducto
      ) ?? {
        idProducto,
        codigoInterno:
          producto?.codigo_interno || '',
        nombre:
          producto?.nombre || 'Producto',
        cantidadVendida: 0,
        totalVendido: 0,
        costoEstimado: 0,
        gananciaEstimada: 0
      };

      actual.cantidadVendida += cantidad;
      actual.totalVendido += vendido;
      actual.costoEstimado += costo;
      actual.gananciaEstimada +=
        vendido - costo;

      agrupados.set(idProducto, actual);
    }

    return Array.from(agrupados.values())
      .map(item => ({
        ...item,
        totalVendido:
          this.redondear(item.totalVendido),
        costoEstimado:
          this.redondear(item.costoEstimado),
        gananciaEstimada:
          this.redondear(item.gananciaEstimada)
      }))
      .sort(
        (a, b) =>
          b.cantidadVendida -
          a.cantidadVendida
      );
  }

  private agruparVendedores(
    ventas: VentaDb[],
    detalles: DetalleVentaDb[],
    usuarioPorId: Map<number, string>,
    usarSubtotalDetalle: boolean
  ): VentaVendedorReporte[] {
    const agrupados = new Map<
      number,
      VentaVendedorReporte
    >();

    for (const venta of ventas) {
      const idVendedor = Number(
        venta.id_usuario
      );
      const detallesVenta = detalles.filter(
        detalle =>
          Number(detalle.id_venta) ===
          Number(venta.id_venta)
      );

      const totalVenta = usarSubtotalDetalle
        ? detallesVenta.reduce(
            (total, detalle) =>
              total + this.numero(detalle.subtotal),
            0
          )
        : this.numero(venta.total);

      const gananciaVenta =
        detallesVenta.reduce(
          (total, detalle) => {
            const producto =
              this.obtenerRelacion(
                detalle.producto
              );
            const cantidad =
              this.numero(detalle.cantidad);

            return total +
              this.numero(detalle.subtotal) -
              this.numero(
                producto?.precio_compra
              ) * cantidad;
          },
          0
        );

      const actual = agrupados.get(
        idVendedor
      ) ?? {
        idVendedor,
        vendedor:
          usuarioPorId.get(idVendedor) ||
          `Usuario ${idVendedor}`,
        ordenes: 0,
        totalVendido: 0,
        gananciaEstimada: 0
      };

      actual.ordenes += 1;
      actual.totalVendido += totalVenta;
      actual.gananciaEstimada +=
        gananciaVenta;

      agrupados.set(idVendedor, actual);
    }

    return Array.from(agrupados.values())
      .map(item => ({
        ...item,
        totalVendido:
          this.redondear(item.totalVendido),
        gananciaEstimada:
          this.redondear(item.gananciaEstimada)
      }))
      .sort(
        (a, b) =>
          b.totalVendido - a.totalVendido
      );
  }

  private agruparProveedores(
    detalles: DetalleVentaDb[],
    compras: CompraDb[],
    ventasPorId: Map<number, VentaDb>,
    proveedorPorId: Map<number, string>,
    filtros: FiltrosReporte
  ): VentaProveedorReporte[] {
    const agrupados = new Map<
      number,
      VentaProveedorReporte & {
        idsVenta: Set<number>;
      }
    >();

    const obtener = (
      idProveedor: number
    ): VentaProveedorReporte & {
      idsVenta: Set<number>;
    } => {
      const existente = agrupados.get(
        idProveedor
      );

      if (existente) {
        return existente;
      }

      const nuevo = {
        idProveedor,
        proveedor:
          proveedorPorId.get(idProveedor) ||
          `Proveedor ${idProveedor}`,
        ordenes: 0,
        totalComprado: 0,
        totalVendido: 0,
        gananciaEstimada: 0,
        idsVenta: new Set<number>()
      };

      agrupados.set(idProveedor, nuevo);
      return nuevo;
    };

    for (const compra of compras) {
      const idProveedor = Number(
        compra.id_proveedor
      );

      if (
        filtros.proveedorId !== null &&
        idProveedor !== filtros.proveedorId
      ) {
        continue;
      }

      obtener(idProveedor).totalComprado +=
        this.numero(compra.total);
    }

    for (const detalle of detalles) {
      const venta = ventasPorId.get(
        Number(detalle.id_venta)
      );

      if (!venta) {
        continue;
      }

      if (
        filtros.vendedorId !== null &&
        Number(venta.id_usuario) !==
          filtros.vendedorId
      ) {
        continue;
      }

      const producto =
        this.obtenerRelacion(
          detalle.producto
        );
      const idProveedor = Number(
        producto?.id_proveedor_preferido ?? 0
      );

      if (!idProveedor) {
        continue;
      }

      if (
        filtros.proveedorId !== null &&
        idProveedor !== filtros.proveedorId
      ) {
        continue;
      }

      const actual = obtener(idProveedor);
      const cantidad =
        this.numero(detalle.cantidad);
      const vendido =
        this.numero(detalle.subtotal);
      const costo =
        this.numero(producto?.precio_compra) *
        cantidad;

      actual.idsVenta.add(
        Number(detalle.id_venta)
      );
      actual.totalVendido += vendido;
      actual.gananciaEstimada +=
        vendido - costo;
    }

    return Array.from(agrupados.values())
      .map(item => ({
        idProveedor: item.idProveedor,
        proveedor: item.proveedor,
        ordenes: item.idsVenta.size,
        totalComprado:
          this.redondear(item.totalComprado),
        totalVendido:
          this.redondear(item.totalVendido),
        gananciaEstimada:
          this.redondear(item.gananciaEstimada)
      }))
      .filter(item =>
        item.totalComprado > 0 ||
        item.totalVendido > 0
      )
      .sort(
        (a, b) =>
          b.totalVendido - a.totalVendido
      );
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

  private validarFiltros(
    filtros: FiltrosReporte
  ): void {
    if (!filtros.desde || !filtros.hasta) {
      throw new Error(
        'Selecciona las fechas Desde y Hasta.'
      );
    }

    if (filtros.desde > filtros.hasta) {
      throw new Error(
        'La fecha Desde no puede ser posterior a Hasta.'
      );
    }
  }

  private inicioFecha(fecha: string): string {
    return new Date(
      `${fecha}T00:00:00`
    ).toISOString();
  }

  private diaSiguiente(fecha: string): string {
    const valor = new Date(
      `${fecha}T00:00:00`
    );
    valor.setDate(valor.getDate() + 1);

    return valor.toISOString();
  }

  private filtrosDiaActual(): FiltrosReporte {
    const hoy = this.fechaLocal(new Date());

    return {
      desde: hoy,
      hasta: hoy,
      vendedorId: null,
      proveedorId: null
    };
  }

  private filtrosMesActual(): FiltrosReporte {
    const hoy = new Date();
    const primero = new Date(
      hoy.getFullYear(),
      hoy.getMonth(),
      1
    );

    return {
      desde: this.fechaLocal(primero),
      hasta: this.fechaLocal(hoy),
      vendedorId: null,
      proveedorId: null
    };
  }

  private fechaLocal(fecha: Date): string {
    return [
      fecha.getFullYear(),
      String(fecha.getMonth() + 1)
        .padStart(2, '0'),
      String(fecha.getDate())
        .padStart(2, '0')
    ].join('-');
  }

  private numero(
    valor: number | string | null | undefined
  ): number {
    const numero = Number(valor ?? 0);

    return Number.isFinite(numero)
      ? numero
      : 0;
  }

  private redondear(valor: number): number {
    return Number(valor.toFixed(2));
  }
}