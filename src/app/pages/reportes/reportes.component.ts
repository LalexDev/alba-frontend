import {
  Component,
  OnInit
} from '@angular/core';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import {
  utils,
  writeFileXLSX
} from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import {
  DashboardResumen,
  FiltrosReporte,
  OpcionReporte,
  ProductoBajoStockReporte,
  ProductoVendidoReporte,
  ReporteCompleto,
  ReportesService,
  VentaProveedorReporte,
  VentaVendedorReporte
} from '../../core/services/reportes.service';

@Component({
  selector: 'app-reportes',
  templateUrl: './reportes.component.html',
  styleUrls: ['./reportes.component.css']
})
export class ReportesComponent
  implements OnInit {

  filtros: FiltrosReporte =
    this.crearFiltrosIniciales();

  resumen: DashboardResumen = {
    totalVentas: 0,
    bajoStock: 0,
    cantidadVentas: 0,
    totalProductos: 0,
    movimientosInventario: 0,
    gananciaEstimada: 0
  };

  productosMasVendidos:
    ProductoVendidoReporte[] = [];
  ventasPorVendedor:
    VentaVendedorReporte[] = [];
  ventasPorProveedor:
    VentaProveedorReporte[] = [];
  bajoStock:
    ProductoBajoStockReporte[] = [];

  vendedores: OpcionReporte[] = [];
  proveedores: OpcionReporte[] = [];

  cargando = false;
  exportando = false;
  error = '';
  mensaje = '';

  mostrarTodosProductos = false;
  mostrarTodosVendedores = false;
  mostrarTodosProveedores = false;
  mostrarTodoBajoStock = false;

  readonly ahora = new Date();

  constructor(
    private reportesService: ReportesService
  ) {}

  ngOnInit(): void {
    this.cargarCatalogosYReporte();
  }

  get productosVisibles():
    ProductoVendidoReporte[] {
    return this.mostrarTodosProductos
      ? this.productosMasVendidos
      : this.productosMasVendidos.slice(0, 5);
  }

  get vendedoresVisibles():
    VentaVendedorReporte[] {
    return this.mostrarTodosVendedores
      ? this.ventasPorVendedor
      : this.ventasPorVendedor.slice(0, 5);
  }

  get proveedoresVisibles():
    VentaProveedorReporte[] {
    return this.mostrarTodosProveedores
      ? this.ventasPorProveedor
      : this.ventasPorProveedor.slice(0, 5);
  }

  get bajoStockVisible():
    ProductoBajoStockReporte[] {
    return this.mostrarTodoBajoStock
      ? this.bajoStock
      : this.bajoStock.slice(0, 6);
  }

  cargarCatalogosYReporte(): void {
    this.cargando = true;
    this.error = '';

    forkJoin({
      vendedores:
        this.reportesService.listarVendedores(),
      proveedores:
        this.reportesService.listarProveedores(),
      reporte:
        this.reportesService.obtenerReporte(
          this.filtros
        )
    })
      .pipe(
        finalize(() => {
          this.cargando = false;
        })
      )
      .subscribe({
        next: resultado => {
          this.vendedores =
            resultado.vendedores;
          this.proveedores =
            resultado.proveedores;
          this.aplicarResultado(
            resultado.reporte
          );
        },
        error: (error: unknown) => {
          console.error(
            'Error al cargar reportes:',
            error
          );

          this.error =
            error instanceof Error
              ? error.message
              : 'No se pudo cargar el reporte.';
        }
      });
  }

  aplicarFiltros(): void {
    if (this.cargando) {
      return;
    }

    this.cargando = true;
    this.error = '';
    this.mensaje = '';

    this.reportesService
      .obtenerReporte(this.filtros)
      .pipe(
        finalize(() => {
          this.cargando = false;
        })
      )
      .subscribe({
        next: reporte => {
          this.aplicarResultado(reporte);
          this.mensaje =
            'Reporte actualizado con los filtros seleccionados.';
        },
        error: (error: unknown) => {
          console.error(
            'Error al aplicar filtros:',
            error
          );

          this.error =
            error instanceof Error
              ? error.message
              : 'No se pudo aplicar el filtro.';
        }
      });
  }

  limpiarFiltros(): void {
    this.filtros =
      this.crearFiltrosIniciales();
    this.aplicarFiltros();
  }

  exportarExcel(): void {
    if (this.exportando || this.cargando) {
      return;
    }

    this.exportando = true;
    this.error = '';

    try {
      const libro = utils.book_new();

      const resumen = utils.json_to_sheet([{
        'Desde':
          this.formatearFecha(this.filtros.desde),
        'Hasta':
          this.formatearFecha(this.filtros.hasta),
        'Vendedor':
          this.nombreVendedorFiltro(),
        'Proveedor':
          this.nombreProveedorFiltro(),
        'Ventas registradas':
          this.resumen.cantidadVentas,
        'Total vendido':
          this.resumen.totalVentas,
        'Ganancia estimada':
          this.resumen.gananciaEstimada ?? 0,
        'Productos bajo stock':
          this.resumen.bajoStock
      }]);

      resumen['!cols'] = [
        { wch: 15 },
        { wch: 15 },
        { wch: 28 },
        { wch: 32 },
        { wch: 20 },
        { wch: 18 },
        { wch: 20 },
        { wch: 22 }
      ];

      const productos = utils.json_to_sheet(
        this.productosMasVendidos.map(
          (producto, indice) => ({
            '#': indice + 1,
            'Código': producto.codigoInterno,
            'Producto': producto.nombre,
            'Cantidad': producto.cantidadVendida,
            'Total vendido': producto.totalVendido,
            'Costo estimado': producto.costoEstimado,
            'Ganancia estimada':
              producto.gananciaEstimada
          })
        )
      );

      productos['!cols'] = [
        { wch: 6 },
        { wch: 18 },
        { wch: 35 },
        { wch: 12 },
        { wch: 18 },
        { wch: 18 },
        { wch: 20 }
      ];

      const vendedores = utils.json_to_sheet(
        this.ventasPorVendedor.map(
          vendedor => ({
            'Vendedor': vendedor.vendedor,
            'Órdenes': vendedor.ordenes,
            'Total vendido':
              vendedor.totalVendido,
            'Ganancia estimada':
              vendedor.gananciaEstimada
          })
        )
      );

      vendedores['!cols'] = [
        { wch: 32 },
        { wch: 12 },
        { wch: 18 },
        { wch: 20 }
      ];

      const proveedores = utils.json_to_sheet(
        this.ventasPorProveedor.map(
          proveedor => ({
            'Proveedor': proveedor.proveedor,
            'Órdenes': proveedor.ordenes,
            'Total comprado':
              proveedor.totalComprado,
            'Total vendido':
              proveedor.totalVendido,
            'Ganancia estimada':
              proveedor.gananciaEstimada
          })
        )
      );

      proveedores['!cols'] = [
        { wch: 38 },
        { wch: 12 },
        { wch: 18 },
        { wch: 18 },
        { wch: 20 }
      ];

      const stock = utils.json_to_sheet(
        this.bajoStock.map(
          producto => ({
            'Código': producto.codigoInterno,
            'Producto': producto.nombre,
            'Categoría': producto.categoria,
            'Marca': producto.marca,
            'Proveedor': producto.proveedor,
            'Stock actual': producto.stockActual,
            'Stock mínimo': producto.stockMinimo
          })
        )
      );

      stock['!cols'] = [
        { wch: 18 },
        { wch: 34 },
        { wch: 24 },
        { wch: 22 },
        { wch: 36 },
        { wch: 14 },
        { wch: 14 }
      ];

      utils.book_append_sheet(
        libro,
        resumen,
        'Resumen'
      );
      utils.book_append_sheet(
        libro,
        productos,
        'Productos vendidos'
      );
      utils.book_append_sheet(
        libro,
        vendedores,
        'Vendedores'
      );
      utils.book_append_sheet(
        libro,
        proveedores,
        'Proveedores'
      );
      utils.book_append_sheet(
        libro,
        stock,
        'Bajo stock'
      );

      writeFileXLSX(
        libro,
        `reporte-optica-alba-${
          this.filtros.desde
        }-${this.filtros.hasta}.xlsx`
      );

      this.mensaje =
        'Reporte Excel descargado correctamente.';
    } catch (error: unknown) {
      console.error(
        'Error al exportar Excel:',
        error
      );

      this.error =
        error instanceof Error
          ? error.message
          : 'No se pudo generar el Excel.';
    } finally {
      this.exportando = false;
    }
  }

  exportarPdf(): void {
    if (this.exportando || this.cargando) {
      return;
    }

    this.exportando = true;
    this.error = '';

    try {
      const documento = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      documento.setFont('helvetica', 'bold');
      documento.setFontSize(18);
      documento.text(
        'ÓPTICA ALBA - REPORTE DE RENDIMIENTO',
        14,
        15
      );

      documento.setFont('helvetica', 'normal');
      documento.setFontSize(9);
      documento.text(
        `Periodo: ${
          this.formatearFecha(this.filtros.desde)
        } al ${
          this.formatearFecha(this.filtros.hasta)
        }`,
        14,
        22
      );
      documento.text(
        `Vendedor: ${this.nombreVendedorFiltro()}  |  Proveedor: ${this.nombreProveedorFiltro()}`,
        14,
        27
      );
      documento.text(
        `Generado: ${new Date().toLocaleString('es-PE')}`,
        14,
        32
      );

      autoTable(documento, {
        startY: 38,
        head: [[
          'Ventas',
          'Total vendido',
          'Ganancia estimada',
          'Bajo stock'
        ]],
        body: [[
          String(this.resumen.cantidadVentas),
          this.moneda(this.resumen.totalVentas),
          this.moneda(
            this.resumen.gananciaEstimada ?? 0
          ),
          String(this.resumen.bajoStock)
        ]],
        theme: 'grid',
        headStyles: {
          fillColor: [21, 147, 199]
        },
        styles: {
          fontSize: 8
        }
      });

      this.agregarTablaPdf(
        documento,
        'Productos más vendidos',
        [
          '#',
          'Código',
          'Producto',
          'Cantidad',
          'Total vendido',
          'Ganancia'
        ],
        this.productosMasVendidos.map(
          (producto, indice) => [
            indice + 1,
            producto.codigoInterno,
            producto.nombre,
            producto.cantidadVendida,
            this.moneda(producto.totalVendido),
            this.moneda(
              producto.gananciaEstimada
            )
          ]
        )
      );

      this.agregarTablaPdf(
        documento,
        'Ventas por vendedor',
        [
          'Vendedor',
          'Órdenes',
          'Total vendido',
          'Ganancia estimada'
        ],
        this.ventasPorVendedor.map(
          vendedor => [
            vendedor.vendedor,
            vendedor.ordenes,
            this.moneda(vendedor.totalVendido),
            this.moneda(
              vendedor.gananciaEstimada
            )
          ]
        )
      );

      this.agregarTablaPdf(
        documento,
        'Ventas por proveedor',
        [
          'Proveedor',
          'Órdenes',
          'Total comprado',
          'Total vendido',
          'Ganancia estimada'
        ],
        this.ventasPorProveedor.map(
          proveedor => [
            proveedor.proveedor,
            proveedor.ordenes,
            this.moneda(proveedor.totalComprado),
            this.moneda(proveedor.totalVendido),
            this.moneda(
              proveedor.gananciaEstimada
            )
          ]
        )
      );

      this.agregarTablaPdf(
        documento,
        'Productos con bajo stock',
        [
          'Código',
          'Producto',
          'Categoría',
          'Marca',
          'Proveedor',
          'Actual',
          'Mínimo'
        ],
        this.bajoStock.map(
          producto => [
            producto.codigoInterno,
            producto.nombre,
            producto.categoria,
            producto.marca,
            producto.proveedor,
            producto.stockActual,
            producto.stockMinimo
          ]
        )
      );

      documento.save(
        `reporte-optica-alba-${
          this.filtros.desde
        }-${this.filtros.hasta}.pdf`
      );

      this.mensaje =
        'Reporte PDF descargado correctamente.';
    } catch (error: unknown) {
      console.error(
        'Error al generar PDF:',
        error
      );

      this.error =
        error instanceof Error
          ? error.message
          : 'No se pudo generar el PDF.';
    } finally {
      this.exportando = false;
    }
  }

  alternarProductos(): void {
    this.mostrarTodosProductos =
      !this.mostrarTodosProductos;
  }

  alternarVendedores(): void {
    this.mostrarTodosVendedores =
      !this.mostrarTodosVendedores;
  }

  alternarProveedores(): void {
    this.mostrarTodosProveedores =
      !this.mostrarTodosProveedores;
  }

  alternarBajoStock(): void {
    this.mostrarTodoBajoStock =
      !this.mostrarTodoBajoStock;
  }

  iniciales(nombre: string): string {
    return nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(parte =>
        parte[0]?.toUpperCase()
      )
      .join('');
  }

  private aplicarResultado(
    reporte: ReporteCompleto
  ): void {
    this.resumen = reporte.resumen;
    this.productosMasVendidos =
      reporte.productosMasVendidos;
    this.ventasPorVendedor =
      reporte.ventasPorVendedor;
    this.ventasPorProveedor =
      reporte.ventasPorProveedor;
    this.bajoStock = reporte.bajoStock;
  }

  private agregarTablaPdf(
    documento: jsPDF,
    titulo: string,
    cabecera: string[],
    cuerpo: Array<Array<string | number>>
  ): void {
    const ultimoY = Number(
      (
        documento as jsPDF & {
          lastAutoTable?: {
            finalY?: number;
          };
        }
      ).lastAutoTable?.finalY ?? 38
    );

    let inicioY = ultimoY + 11;

    if (inicioY > 175) {
      documento.addPage();
      inicioY = 18;
    }

    documento.setFont('helvetica', 'bold');
    documento.setFontSize(11);
    documento.text(titulo, 14, inicioY - 3);

    autoTable(documento, {
      startY: inicioY,
      head: [cabecera],
      body:
        cuerpo.length > 0
          ? cuerpo
          : [[
              'Sin información para el filtro seleccionado'
            ]],
      theme: 'grid',
      headStyles: {
        fillColor: [21, 147, 199]
      },
      styles: {
        fontSize: 7,
        cellPadding: 2
      },
      margin: {
        left: 14,
        right: 14
      }
    });
  }

  private nombreVendedorFiltro(): string {
    if (this.filtros.vendedorId === null) {
      return 'Todos';
    }

    return this.vendedores.find(
      vendedor =>
        vendedor.id ===
        this.filtros.vendedorId
    )?.nombre || 'Todos';
  }

  private nombreProveedorFiltro(): string {
    if (this.filtros.proveedorId === null) {
      return 'Todos';
    }

    return this.proveedores.find(
      proveedor =>
        proveedor.id ===
        this.filtros.proveedorId
    )?.nombre || 'Todos';
  }

  private crearFiltrosIniciales():
    FiltrosReporte {
    const hoy = new Date();
    const inicioMes = new Date(
      hoy.getFullYear(),
      hoy.getMonth(),
      1
    );

    return {
      desde: this.fechaInput(inicioMes),
      hasta: this.fechaInput(hoy),
      vendedorId: null,
      proveedorId: null
    };
  }

  private fechaInput(fecha: Date): string {
    return [
      fecha.getFullYear(),
      String(fecha.getMonth() + 1)
        .padStart(2, '0'),
      String(fecha.getDate())
        .padStart(2, '0')
    ].join('-');
  }

  private formatearFecha(
    fecha: string
  ): string {
    const partes = fecha.split('-');

    if (partes.length !== 3) {
      return fecha;
    }

    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  private moneda(valor: number): string {
    return `S/ ${Number(valor || 0)
      .toLocaleString('es-PE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`;
  }
}
