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
  EstadoPagoOrden,
  FiltrosOrdenes,
  OrdenRecibo,
  OrdenReciboDetalle,
  ResumenOrdenes
} from '../../core/models/orden-recibo.model';

import {
  OrdenesRecibosService
} from '../../core/services/ordenes-recibos.service';

import {
  TokenService
} from '../../core/services/token.service';

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

  pagoAdicional = 0;
  pagoRevisado = false;
  errorAcciones = '';

  paginaActual = 1;
  elementosPorPagina = 10;

  private readonly ordenesService =
    inject(OrdenesRecibosService);

  private readonly router =
    inject(Router);

  private readonly tokenService =
    inject(TokenService);

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
        this.filtros.estadoPago !==
          'TODOS' &&
        orden.estadoPago !==
          this.filtros.estadoPago
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
    const ruta =
      this.tokenService.getRole() ===
        'VENDEDOR'
        ? '/vendedor/ventas'
        : '/admin/ventas';

    this.router.navigate([
      ruta
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
    this.pagoAdicional = 0;
    this.pagoRevisado = false;
    this.errorAcciones = '';
    this.mostrarAcciones = true;
  }

  cerrarAcciones(): void {
    if (this.actualizando) {
      return;
    }

    this.mostrarAcciones = false;
    this.ordenAcciones = null;
    this.pagoAdicional = 0;
    this.pagoRevisado = false;
    this.errorAcciones = '';
  }

  get nuevoMontoCancelado(): number {
    if (!this.ordenAcciones) {
      return 0;
    }

    return Number(
      Math.min(
        this.ordenAcciones
          .montoCancelado +
          Number(
            this.pagoAdicional ||
            0
          ),
        this.ordenAcciones.total
      ).toFixed(2)
    );
  }

  get nuevoSaldo(): number {
    if (!this.ordenAcciones) {
      return 0;
    }

    return Number(
      Math.max(
        this.ordenAcciones.total -
        this.nuevoMontoCancelado,
        0
      ).toFixed(2)
    );
  }

  get nuevoEstadoPago():
    EstadoPagoOrden {
    if (!this.ordenAcciones) {
      return 'PENDIENTE';
    }

    if (this.nuevoSaldo <= 0.009) {
      return 'PAGADO';
    }

    if (this.nuevoMontoCancelado > 0) {
      return 'PARCIAL';
    }

    return 'PENDIENTE';
  }

  get pagoAdicionalValido(): boolean {
    if (!this.ordenAcciones) {
      return false;
    }

    const pago =
      Number(
        this.pagoAdicional || 0
      );

    return (
      Number.isFinite(pago) &&
      pago >= 0 &&
      pago <=
        this.ordenAcciones.saldo
    );
  }

  get puedeCompletar(): boolean {
    return (
      this.pagoRevisado &&
      this.pagoAdicionalValido &&
      this.nuevoSaldo <= 0.009
    );
  }

  get puedeCancelar(): boolean {
    return (
      this.pagoRevisado &&
      this.pagoAdicionalValido &&
      this.nuevoMontoCancelado <= 0.009
    );
  }

  pagarTodo(): void {
    if (!this.ordenAcciones) {
      return;
    }

    this.pagoAdicional =
      Number(
        this.ordenAcciones.saldo
          .toFixed(2)
      );

    this.validarPagoAdicional();
  }

  validarPagoAdicional(): void {
    this.errorAcciones = '';

    if (!this.ordenAcciones) {
      return;
    }

    const pago =
      Number(
        this.pagoAdicional || 0
      );

    if (
      !Number.isFinite(pago) ||
      pago < 0
    ) {
      this.errorAcciones =
        'El pago adicional no es válido.';
      return;
    }

    if (
      pago >
      this.ordenAcciones.saldo
    ) {
      this.errorAcciones =
        `El pago adicional no puede superar el saldo de S/ ${this.ordenAcciones.saldo.toFixed(2)}.`;
    }
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

    this.validarPagoAdicional();

    if (this.errorAcciones) {
      return;
    }

    if (!this.pagoRevisado) {
      this.errorAcciones =
        'Marca la confirmación de revisión del pago antes de continuar.';
      return;
    }

    if (
      estado === 'COMPLETADA' &&
      this.nuevoSaldo > 0.009
    ) {
      this.errorAcciones =
        'No puedes completar la orden mientras exista saldo pendiente.';
      return;
    }

    if (
      estado === 'CANCELADA' &&
      this.nuevoMontoCancelado > 0.009
    ) {
      this.errorAcciones =
        'La orden tiene pagos registrados. Primero debe gestionarse la devolución.';
      return;
    }

    this.actualizando = true;
    this.error = '';
    this.errorAcciones = '';

    const numeroOrden =
      this.ordenAcciones.numeroOrden;

    this.ordenesService
      .revisarPagoYEstado({
        idVenta:
          this.ordenAcciones.idVenta,
        estadoOrden: estado,
        pagoAdicional:
          Number(
            this.pagoAdicional || 0
          ),
        pagoRevisado:
          this.pagoRevisado
      })
      .pipe(
        finalize(() => {
          this.actualizando = false;
        })
      )
      .subscribe({
        next: (resultado) => {
          const pagoTexto =
            Number(
              this.pagoAdicional || 0
            ) > 0
              ? ` Pago actualizado: S/ ${resultado.montoCancelado.toFixed(2)}; saldo: S/ ${resultado.saldo.toFixed(2)}.`
              : '';

          this.mensaje =
            `${numeroOrden}: estado ${this.textoEstado(
              resultado.estadoOrden
            ).toLowerCase()}.${pagoTexto}`;

          this.cerrarAcciones();
          this.cargar();
        },
        error: (error: unknown) => {
          this.errorAcciones =
            error instanceof Error
              ? error.message
              : 'No se pudo revisar el pago y cambiar el estado.';
        }
      });
  }

  textoEstadoPago(
    estado: EstadoPagoOrden
  ): string {
    if (estado === 'PAGADO') {
      return 'Pagado';
    }

    if (estado === 'PARCIAL') {
      return 'Parcial';
    }

    return 'Pendiente';
  }

  claseEstadoPago(
    estado: EstadoPagoOrden
  ): string {
    return estado.toLowerCase();
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
            'Estado del pago':
              this.textoEstadoPago(
                orden.estadoPago
              ),
            'Estado de la orden':
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
        { wch: 17 },
        { wch: 18 },
        { wch: 45 }
      ];

      const rango = utils.decode_range(
        hoja['!ref'] || 'A1:M1'
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
      'width=420,height=850'
    );

    if (!ventana) {
      this.error =
        'El navegador bloqueó la ventana de impresión.';
      return;
    }

    const filas = orden.items
      .map(item => `
        <div class="item">
          <div class="item-head">
            <strong>
              ${this.escapeHtml(item.producto)}
            </strong>
            <strong>
              S/ ${item.subtotal.toFixed(2)}
            </strong>
          </div>

          <div class="item-meta">
            ${this.escapeHtml(
              [
                item.marca,
                item.modelo,
                item.medida
              ]
                .filter(Boolean)
                .join(' · ') ||
              'Sin detalle adicional'
            )}
          </div>

          <div class="item-meta">
            ${item.cantidad} x
            S/ ${item.precioUnitario.toFixed(2)}
          </div>
        </div>
      `)
      .join('');

    ventana.document.write(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8">
          <title>${this.escapeHtml(orden.numeroOrden)}</title>

          <style>
            @page {
              size: 70mm 210mm;
              margin: 2mm;
            }

            * {
              box-sizing: border-box;
            }

            html,
            body {
              width: 66mm;
              min-height: 206mm;
              margin: 0;
              padding: 0;
              color: #000;
              background: #fff;
              font-family: Arial, sans-serif;
              font-size: 9px;
            }

            body {
              padding: 1mm 0;
            }

            .center {
              text-align: center;
            }

            .brand {
              margin: 0;
              font-size: 16px;
              font-weight: 800;
            }

            .sub {
              margin: 1mm 0 0;
              font-size: 8px;
            }

            .doc {
              margin: 2mm 0;
              padding: 2mm 0;
              border-top: 1px dashed #000;
              border-bottom: 1px dashed #000;
              text-align: center;
            }

            .doc strong {
              display: block;
              font-size: 11px;
            }

            .row {
              display: flex;
              justify-content: space-between;
              gap: 2mm;
              padding: .7mm 0;
            }

            .row span:first-child {
              color: #333;
            }

            .items {
              margin: 2mm 0;
              border-top: 1px dashed #000;
              border-bottom: 1px dashed #000;
            }

            .item {
              padding: 1.4mm 0;
              border-bottom: 1px dotted #bbb;
            }

            .item:last-child {
              border-bottom: 0;
            }

            .item-head {
              display: flex;
              justify-content: space-between;
              gap: 2mm;
              font-size: 9px;
            }

            .item-head strong:first-child {
              max-width: 44mm;
            }

            .item-meta {
              margin-top: .6mm;
              color: #444;
              font-size: 8px;
              line-height: 1.25;
            }

            .totals {
              margin-top: 2mm;
            }

            .totals .row {
              font-size: 10px;
            }

            .totals .total {
              margin-top: 1mm;
              padding-top: 1mm;
              border-top: 1px solid #000;
              font-size: 12px;
              font-weight: 800;
            }

            .payment-status {
              margin: 2mm 0;
              padding: 1.5mm;
              border: 1px solid #000;
              text-align: center;
              font-weight: 800;
            }

            .obs {
              margin-top: 2mm;
              line-height: 1.35;
              overflow-wrap: anywhere;
            }

            .footer {
              margin-top: 4mm;
              padding-top: 2mm;
              border-top: 1px dashed #000;
              text-align: center;
              font-size: 8px;
            }

            @media print {
              html,
              body {
                width: 66mm;
                min-height: 206mm;
              }
            }
          </style>
        </head>

        <body>
          <header class="center">
            <h1 class="brand">Óptica Alba</h1>
            <p class="sub">Sistema para ópticas · Cajamarca, Perú</p>
          </header>

          <section class="doc">
            <strong>
              ${this.escapeHtml(
                this.textoTipo(orden.tipo)
              )}
            </strong>

            ${this.escapeHtml(
              orden.numeroOrden
            )}

            <div>
              ${this.escapeHtml(
                this.formatearFecha(
                  orden.fechaVenta
                )
              )}
            </div>
          </section>

          <section>
            <div class="row">
              <span>Cliente</span>
              <strong>
                ${this.escapeHtml(orden.cliente)}
              </strong>
            </div>

            <div class="row">
              <span>Documento</span>
              <strong>
                ${this.escapeHtml(
                  orden.documento || '-'
                )}
              </strong>
            </div>

            <div class="row">
              <span>Teléfono</span>
              <strong>
                ${this.escapeHtml(
                  orden.telefono || '-'
                )}
              </strong>
            </div>

            <div class="row">
              <span>Método</span>
              <strong>
                ${this.escapeHtml(
                  orden.metodoPago
                )}
              </strong>
            </div>
          </section>

          <section class="items">
            ${
              filas ||
              '<div class="item">Sin productos registrados</div>'
            }
          </section>

          <section class="totals">
            <div class="row">
              <span>Total</span>
              <strong>
                S/ ${orden.total.toFixed(2)}
              </strong>
            </div>

            <div class="row">
              <span>Pagado</span>
              <strong>
                S/ ${orden.montoCancelado.toFixed(2)}
              </strong>
            </div>

            <div class="row total">
              <span>Saldo</span>
              <strong>
                S/ ${orden.saldo.toFixed(2)}
              </strong>
            </div>
          </section>

          <div class="payment-status">
            PAGO:
            ${this.escapeHtml(
              this.textoEstadoPago(
                orden.estadoPago
              ).toUpperCase()
            )}
            · ORDEN:
            ${this.escapeHtml(
              this.textoEstado(
                orden.estado
              ).toUpperCase()
            )}
          </div>

          <p class="obs">
            <strong>Observaciones:</strong><br>
            ${this.escapeHtml(
              orden.observaciones ||
              'Sin observaciones'
            )}
          </p>

          <p class="footer">
            Gracias por confiar en Óptica Alba.
          </p>

          <script>
            window.onload = () => {
              window.print();
            };
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
      estadoPago: 'TODOS',
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