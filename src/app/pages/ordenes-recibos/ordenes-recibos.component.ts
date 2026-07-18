import {
  Component,
  OnInit,
  inject
} from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import {
  utils,
  writeFileXLSX
} from 'xlsx';

import type {
  EstadoOrden,
  FiltrosOrdenes,
  OrdenRecibo,
  OrdenReciboDetalle,
  ResumenOrdenes
} from '../../core/models/orden-recibo.model';

import {
  OrdenesRecibosService
} from '../../core/services/ordenes-recibos.service';

@Component({
  selector: 'app-ordenes-recibos',
  templateUrl: './ordenes-recibos.component.html',
  styleUrls: ['./ordenes-recibos.component.css']
})
export class OrdenesRecibosComponent
  implements OnInit {

  ordenes: OrdenRecibo[] = [];
  ordenSeleccionada:
    OrdenReciboDetalle | null = null;
  ordenAcciones:
    OrdenRecibo | null = null;

  filtros: FiltrosOrdenes =
    this.crearFiltrosIniciales();

  cargando = false;
  cargandoDetalle = false;
  actualizando = false;
  exportando = false;
  error = '';
  mensaje = '';

  mostrarAvanzados = false;
  mostrarDetalle = false;
  mostrarAcciones = false;

  paginaActual = 1;
  elementosPorPagina = 10;

  private readonly ordenesService =
    inject(OrdenesRecibosService);

  private readonly router =
    inject(Router);

  constructor() {}

  ngOnInit(): void {
    this.cargar();
  }

  get ordenesFiltradas(): OrdenRecibo[] {
    const buscar = this.normalizar(
      this.filtros.buscar
    );

    return this.ordenes.filter(orden => {
      if (
        this.filtros.desde &&
        this.fechaSimple(orden.fechaVenta) <
          this.filtros.desde
      ) {
        return false;
      }

      if (
        this.filtros.hasta &&
        this.fechaSimple(orden.fechaVenta) >
          this.filtros.hasta
      ) {
        return false;
      }

      if (
        this.filtros.estado !== 'TODOS' &&
        orden.estado !==
          this.filtros.estado
      ) {
        return false;
      }

      if (
        this.filtros.tipo !== 'TODOS' &&
        orden.tipo !== this.filtros.tipo
      ) {
        return false;
      }

      if (
        this.filtros.metodoPago !==
          'TODOS' &&
        orden.metodoPago !==
          this.filtros.metodoPago
      ) {
        return false;
      }

      if (!buscar) {
        return true;
      }

      return [
        orden.numeroOrden,
        orden.cliente,
        orden.telefono,
        orden.documento,
        orden.metodoPago
      ].some(valor =>
        this.normalizar(valor)
          .includes(buscar)
      );
    });
  }

  get resumen(): ResumenOrdenes {
    const ordenes =
      this.ordenesFiltradas;

    return {
      total: ordenes.length,
      completadas:
        ordenes.filter(
          orden =>
            orden.estado === 'COMPLETADA'
        ).length,
      pendientes:
        ordenes.filter(
          orden =>
            orden.estado === 'PENDIENTE'
        ).length,
      canceladas:
        ordenes.filter(
          orden =>
            orden.estado === 'CANCELADA'
        ).length
    };
  }

  get totalPaginas(): number {
    return Math.max(
      Math.ceil(
        this.ordenesFiltradas.length /
        this.elementosPorPagina
      ),
      1
    );
  }

  get ordenesPaginadas(): OrdenRecibo[] {
    if (
      this.paginaActual >
      this.totalPaginas
    ) {
      this.paginaActual =
        this.totalPaginas;
    }

    const inicio =
      (this.paginaActual - 1) *
      this.elementosPorPagina;

    return this.ordenesFiltradas.slice(
      inicio,
      inicio + this.elementosPorPagina
    );
  }

  get paginasVisibles(): number[] {
    const total = this.totalPaginas;
    const actual = this.paginaActual;
    const desde = Math.max(
      actual - 2,
      1
    );
    const hasta = Math.min(
      desde + 4,
      total
    );
    const inicio = Math.max(
      hasta - 4,
      1
    );

    return Array.from(
      {
        length: hasta - inicio + 1
      },
      (_, indice) => inicio + indice
    );
  }

  get porcentajeCompletadas(): number {
    return this.porcentaje(
      this.resumen.completadas
    );
  }

  get porcentajePendientes(): number {
    return this.porcentaje(
      this.resumen.pendientes
    );
  }

  get porcentajeCanceladas(): number {
    return this.porcentaje(
      this.resumen.canceladas
    );
  }

  cargar(): void {
    this.cargando = true;
    this.error = '';

    this.ordenesService.listar()
      .pipe(
        finalize(() => {
          this.cargando = false;
        })
      )
      .subscribe({
        next: (
          ordenes: OrdenRecibo[]
        ) => {
          this.ordenes = ordenes;
          this.paginaActual = 1;
        },
        error: (error: unknown) => {
          console.error(
            'Error al cargar órdenes:',
            error
          );

          this.error =
            error instanceof Error
              ? error.message
              : 'No se pudieron cargar las órdenes.';
        }
      });
  }

  nuevaOrden(): void {
    this.router.navigate([
      '/admin/ventas'
    ]);
  }

  alternarFiltrosAvanzados(): void {
    this.mostrarAvanzados =
      !this.mostrarAvanzados;
  }

  aplicarFiltros(): void {
    this.paginaActual = 1;
    this.mensaje =
      'Filtros aplicados correctamente.';
  }

  limpiarFiltros(): void {
    this.filtros =
      this.crearFiltrosIniciales();
    this.paginaActual = 1;
    this.mostrarAvanzados = false;
    this.mensaje = '';
    this.error = '';
  }

  cambiarElementosPorPagina(): void {
    this.paginaActual = 1;
  }

  irPagina(pagina: number): void {
    if (
      pagina < 1 ||
      pagina > this.totalPaginas
    ) {
      return;
    }

    this.paginaActual = pagina;
  }

  paginaAnterior(): void {
    this.irPagina(
      this.paginaActual - 1
    );
  }

  paginaSiguiente(): void {
    this.irPagina(
      this.paginaActual + 1
    );
  }

  abrirDetalle(
    orden: OrdenRecibo
  ): void {
    this.cargandoDetalle = true;
    this.error = '';
    this.ordenSeleccionada = null;
    this.mostrarDetalle = true;

    this.ordenesService
      .obtenerDetalle(orden.idVenta)
      .pipe(
        finalize(() => {
          this.cargandoDetalle = false;
        })
      )
      .subscribe({
        next: (
          detalle: OrdenReciboDetalle
        ) => {
          this.ordenSeleccionada =
            detalle;
        },
        error: (error: unknown) => {
          this.mostrarDetalle = false;
          this.error =
            error instanceof Error
              ? error.message
              : 'No se pudo cargar el detalle.';
        }
      });
  }

  cerrarDetalle(): void {
    if (this.cargandoDetalle) {
      return;
    }

    this.mostrarDetalle = false;
    this.ordenSeleccionada = null;
  }

  abrirAcciones(
    orden: OrdenRecibo
  ): void {
    this.ordenAcciones = orden;
    this.mostrarAcciones = true;
  }

  cerrarAcciones(): void {
    if (this.actualizando) {
      return;
    }

    this.mostrarAcciones = false;
    this.ordenAcciones = null;
  }

  cambiarEstado(
    estado: EstadoOrden
  ): void {
    if (
      !this.ordenAcciones ||
      this.actualizando
    ) {
      return;
    }

    this.actualizando = true;
    this.error = '';

    const idVenta =
      this.ordenAcciones.idVenta;

    this.ordenesService
      .cambiarEstado(
        idVenta,
        estado
      )
      .pipe(
        finalize(() => {
          this.actualizando = false;
        })
      )
      .subscribe({
        next: () => {
          this.mensaje =
            `Orden marcada como ${this.textoEstado(
              estado
            ).toLowerCase()}.`;

          this.cerrarAcciones();
          this.cargar();
        },
        error: (error: unknown) => {
          this.error =
            error instanceof Error
              ? error.message
              : 'No se pudo cambiar el estado.';
        }
      });
  }

  imprimir(
    orden: OrdenRecibo
  ): void {
    this.cargandoDetalle = true;
    this.error = '';

    this.ordenesService
      .obtenerDetalle(orden.idVenta)
      .pipe(
        finalize(() => {
          this.cargandoDetalle = false;
        })
      )
      .subscribe({
        next: (
          detalle: OrdenReciboDetalle
        ) => {
          this.imprimirDetalle(detalle);
        },
        error: (error: unknown) => {
          this.error =
            error instanceof Error
              ? error.message
              : 'No se pudo preparar la impresión.';
        }
      });
  }

  imprimirSeleccionada(): void {
    if (this.ordenSeleccionada) {
      this.imprimirDetalle(
        this.ordenSeleccionada
      );
    }
  }

  exportarExcel(): void {
    if (
      this.exportando ||
      !this.ordenesFiltradas.length
    ) {
      return;
    }

    this.exportando = true;
    this.error = '';

    try {
      const filas =
        this.ordenesFiltradas.map(
          orden => ({
            'N° de orden':
              orden.numeroOrden,
            'Cliente':
              orden.cliente,
            'Documento':
              orden.documento,
            'Teléfono':
              orden.telefono,
            'Fecha':
              this.formatearFecha(
                orden.fechaVenta
              ),
            'Tipo':
              this.textoTipo(
                orden.tipo
              ),
            'Total':
              orden.total,
            'Cancelado':
              orden.montoCancelado,
            'Saldo':
              orden.saldo,
            'Método de pago':
              orden.metodoPago,
            'Estado':
              this.textoEstado(
                orden.estado
              ),
            'Observaciones':
              orden.observaciones
          })
        );

      const hoja =
        utils.json_to_sheet(filas);

      hoja['!cols'] = [
        { wch: 18 },
        { wch: 34 },
        { wch: 16 },
        { wch: 15 },
        { wch: 18 },
        { wch: 20 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 20 },
        { wch: 16 },
        { wch: 45 }
      ];

      const rango = utils.decode_range(
        hoja['!ref'] || 'A1:L1'
      );

      for (
        let fila = 1;
        fila <= rango.e.r;
        fila += 1
      ) {
        for (
          const columna of [6, 7, 8]
        ) {
          const celda = hoja[
            utils.encode_cell({
              r: fila,
              c: columna
            })
          ];

          if (celda) {
            celda.z = 'S/ #,##0.00';
          }
        }
      }

      const libro = utils.book_new();

      utils.book_append_sheet(
        libro,
        hoja,
        'Órdenes y recibos'
      );

      writeFileXLSX(
        libro,
        `ordenes-recibos-optica-alba-${this.fechaActual()}.xlsx`
      );

      this.mensaje =
        'Excel descargado correctamente.';
    } catch (error: unknown) {
      this.error =
        error instanceof Error
          ? error.message
          : 'No se pudo generar el Excel.';
    } finally {
      this.exportando = false;
    }
  }

  claseEstado(
    estado: EstadoOrden
  ): string {
    return estado.toLowerCase();
  }

  textoEstado(
    estado: EstadoOrden
  ): string {
    if (estado === 'COMPLETADA') {
      return 'Completada';
    }

    if (estado === 'CANCELADA') {
      return 'Cancelada';
    }

    return 'Pendiente';
  }

  textoTipo(
    tipo: string
  ): string {
    return tipo === 'RECIBO'
      ? 'Recibo'
      : 'Orden de trabajo';
  }

  private imprimirDetalle(
    orden: OrdenReciboDetalle
  ): void {
    const ventana = window.open(
      '',
      '_blank',
      'width=850,height=900'
    );

    if (!ventana) {
      this.error =
        'El navegador bloqueó la ventana de impresión.';
      return;
    }

    const filas = orden.items
      .map(item => `
        <tr>
          <td>${this.escapeHtml(item.producto)}</td>
          <td>${this.escapeHtml(item.marca || '-')}</td>
          <td>${this.escapeHtml(item.modelo || '-')}</td>
          <td>${this.escapeHtml(item.medida || '-')}</td>
          <td>${item.cantidad}</td>
          <td>S/ ${item.precioUnitario.toFixed(2)}</td>
          <td>S/ ${item.subtotal.toFixed(2)}</td>
        </tr>
      `)
      .join('');

    ventana.document.write(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8">
          <title>${this.escapeHtml(orden.numeroOrden)}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 28px;
              color: #000;
              font-family: Arial, sans-serif;
              font-size: 12px;
            }
            .head {
              display: flex;
              justify-content: space-between;
              gap: 24px;
              border-bottom: 2px solid #1593C7;
              padding-bottom: 14px;
            }
            h1 { margin: 0; font-size: 23px; }
            h2 { margin: 5px 0 0; font-size: 14px; }
            .meta {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 8px 24px;
              margin: 20px 0;
            }
            .meta div, .totals div {
              display: flex;
              justify-content: space-between;
              gap: 16px;
              border-bottom: 1px solid #ddd;
              padding: 7px 0;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 18px;
            }
            th, td {
              border: 1px solid #ccc;
              padding: 7px;
              text-align: left;
            }
            th {
              background: #EAF7FC;
            }
            .totals {
              width: 330px;
              margin: 18px 0 0 auto;
            }
            .total {
              font-size: 15px;
              font-weight: bold;
            }
            .footer {
              margin-top: 34px;
              text-align: center;
              color: #555;
            }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <section class="head">
            <div>
              <h1>Óptica Alba</h1>
              <h2>${this.escapeHtml(
                this.textoTipo(orden.tipo)
              )}</h2>
              <p>Cajamarca, Perú</p>
            </div>
            <div>
              <strong>${this.escapeHtml(
                orden.numeroOrden
              )}</strong>
              <p>${this.escapeHtml(
                this.formatearFecha(
                  orden.fechaVenta
                )
              )}</p>
            </div>
          </section>

          <section class="meta">
            <div>
              <span>Cliente</span>
              <strong>${this.escapeHtml(
                orden.cliente
              )}</strong>
            </div>
            <div>
              <span>Documento</span>
              <strong>${this.escapeHtml(
                orden.documento || '-'
              )}</strong>
            </div>
            <div>
              <span>Teléfono</span>
              <strong>${this.escapeHtml(
                orden.telefono || '-'
              )}</strong>
            </div>
            <div>
              <span>Método de pago</span>
              <strong>${this.escapeHtml(
                orden.metodoPago
              )}</strong>
            </div>
          </section>

          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Marca</th>
                <th>Modelo</th>
                <th>Medida</th>
                <th>Cant.</th>
                <th>P. unitario</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${
                filas ||
                '<tr><td colspan="7">Sin productos registrados</td></tr>'
              }
            </tbody>
          </table>

          <section class="totals">
            <div>
              <span>Total</span>
              <strong>S/ ${orden.total.toFixed(2)}</strong>
            </div>
            <div>
              <span>Cancelado</span>
              <strong>S/ ${orden.montoCancelado.toFixed(2)}</strong>
            </div>
            <div class="total">
              <span>Saldo</span>
              <strong>S/ ${orden.saldo.toFixed(2)}</strong>
            </div>
          </section>

          <p>
            <strong>Observaciones:</strong>
            ${this.escapeHtml(
              orden.observaciones || 'Sin observaciones'
            )}
          </p>

          <p class="footer">
            Gracias por confiar en Óptica Alba.
          </p>

          <script>
            window.onload = () => window.print();
          </script>
        </body>
      </html>
    `);

    ventana.document.close();
  }

  private crearFiltrosIniciales():
    FiltrosOrdenes {
    const hoy = new Date();
    const inicioMes = new Date(
      hoy.getFullYear(),
      hoy.getMonth(),
      1
    );

    return {
      buscar: '',
      desde:
        this.fechaInput(inicioMes),
      hasta:
        this.fechaInput(hoy),
      estado: 'TODOS',
      tipo: 'TODOS',
      metodoPago: 'TODOS'
    };
  }

  private porcentaje(
    cantidad: number
  ): number {
    if (!this.resumen.total) {
      return 0;
    }

    return Number(
      (
        cantidad /
        this.resumen.total *
        100
      ).toFixed(1)
    );
  }

  private fechaSimple(
    valor: string
  ): string {
    return String(valor || '')
      .slice(0, 10);
  }

  private formatearFecha(
    valor: string
  ): string {
    const fecha = new Date(valor);

    if (
      Number.isNaN(
        fecha.getTime()
      )
    ) {
      return valor;
    }

    return fecha.toLocaleString(
      'es-PE',
      {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }
    );
  }

  private fechaInput(
    fecha: Date
  ): string {
    return [
      fecha.getFullYear(),
      String(fecha.getMonth() + 1)
        .padStart(2, '0'),
      String(fecha.getDate())
        .padStart(2, '0')
    ].join('-');
  }

  private fechaActual(): string {
    return this.fechaInput(
      new Date()
    );
  }

  private normalizar(
    valor: string
  ): string {
    return String(valor || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(
        /[\u0300-\u036f]/g,
        ''
      );
  }

  private escapeHtml(
    valor: string
  ): string {
    return String(valor || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}