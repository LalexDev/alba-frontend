import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';

import {
  utils,
  writeFileXLSX
} from 'xlsx';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import {
  CajaActual,
  CajaHistorial,
  MovimientoCaja,
  TipoMovimientoCaja
} from '../../core/models/caja.model';

import { CajaService } from '../../core/services/caja.service';
import { TokenService } from '../../core/services/token.service';

@Component({
  selector: 'app-caja',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './caja.component.html',
  styleUrls: ['./caja.component.css']
})
export class CajaComponent implements OnInit {

  caja: CajaActual | null = null;
  movimientos: MovimientoCaja[] = [];
  historial: CajaHistorial[] = [];

  cargando = false;
  abriendo = false;
  cerrando = false;
  guardandoMovimiento = false;

  ok = '';
  error = '';

  montoApertura = 0;
  montoContado: number | null = null;
  observacionesCierre = '';

  mostrarMovimiento = false;
  tipoMovimiento: TipoMovimientoCaja = 'EGRESO';
  conceptoMovimiento = '';
  montoMovimiento: number | null = null;

  filtroDesde = this.fechaHaceDias(30);
  filtroHasta = this.fechaActual();

  constructor(
    private cajaService: CajaService,
    private tokenService: TokenService
  ) {}

  ngOnInit(): void {
    this.cargarTodo();
  }

  get esAdministrador(): boolean {
    return this.tokenService.getRole() === 'ADMINISTRADOR';
  }

  get esVendedor(): boolean {
    return this.tokenService.getRole() === 'VENDEDOR';
  }

  get cajaAbierta(): boolean {
    return Boolean(this.caja?.abierta);
  }

  get diferenciaPrevia(): number {
    if (
      !this.cajaAbierta ||
      this.montoContado === null ||
      !Number.isFinite(Number(this.montoContado))
    ) {
      return 0;
    }

    return Number(
      (
        Number(this.montoContado) -
        Number(this.caja?.resumen.efectivoEsperado || 0)
      ).toFixed(2)
    );
  }

  get estadoDiferencia():
    'CUADRADA' | 'FALTANTE' | 'SOBRANTE' {

    if (Math.abs(this.diferenciaPrevia) < 0.01) {
      return 'CUADRADA';
    }

    return this.diferenciaPrevia < 0
      ? 'FALTANTE'
      : 'SOBRANTE';
  }

  cargarTodo(): void {
    this.cargando = true;
    this.error = '';

    forkJoin({
      caja: this.cajaService.obtenerCajaActual(),
      historial: this.cajaService.listarHistorial(
        this.filtroDesde,
        this.filtroHasta
      )
    })
      .pipe(
        finalize(() => {
          this.cargando = false;
        })
      )
      .subscribe({
        next: ({ caja, historial }) => {
          this.caja = caja;
          this.historial = historial;

          if (caja.abierta) {
            this.cargarMovimientos();
          } else {
            this.movimientos = [];
            this.montoContado = null;
          }
        },
        error: (error: unknown) => {
          this.error = this.obtenerMensaje(error);
        }
      });
  }

  abrirCaja(): void {
    if (this.abriendo || this.cajaAbierta) {
      return;
    }

    const monto = Number(this.montoApertura);

    if (!Number.isFinite(monto) || monto < 0) {
      this.error = 'Ingresa un monto inicial válido.';
      return;
    }

    this.abriendo = true;
    this.error = '';
    this.ok = '';

    this.cajaService
      .abrirCaja(monto)
      .pipe(
        finalize(() => {
          this.abriendo = false;
        })
      )
      .subscribe({
        next: (caja) => {
          this.caja = caja;
          this.montoApertura = 0;
          this.ok =
            'Caja abierta correctamente. Ya puedes registrar ventas.';

          this.cargarMovimientos();
          this.cargarHistorial();
        },
        error: (error: unknown) => {
          this.error = this.obtenerMensaje(error);
        }
      });
  }

  cerrarCaja(): void {
    if (!this.cajaAbierta || this.cerrando) {
      return;
    }

    const contado = Number(this.montoContado);

    if (
      this.montoContado === null ||
      !Number.isFinite(contado) ||
      contado < 0
    ) {
      this.error =
        'Cuenta el efectivo físico e ingresa el monto antes de cerrar.';
      return;
    }

    const diferenciaAntes = this.diferenciaPrevia;

    this.cerrando = true;
    this.error = '';
    this.ok = '';

    this.cajaService
      .cerrarCaja({
        montoCierreReal: contado,
        observaciones: this.observacionesCierre
      })
      .pipe(
        finalize(() => {
          this.cerrando = false;
        })
      )
      .subscribe({
        next: () => {
          this.ok =
            Math.abs(diferenciaAntes) < 0.01
              ? 'Caja cerrada correctamente y sin diferencias.'
              : diferenciaAntes < 0
                ? `Caja cerrada con un faltante de S/ ${Math.abs(diferenciaAntes).toFixed(2)}.`
                : `Caja cerrada con un sobrante de S/ ${diferenciaAntes.toFixed(2)}.`;

          this.montoContado = null;
          this.observacionesCierre = '';
          this.movimientos = [];

          this.cargarTodo();
        },
        error: (error: unknown) => {
          this.error = this.obtenerMensaje(error);
        }
      });
  }

  alternarMovimiento(): void {
    this.mostrarMovimiento = !this.mostrarMovimiento;

    if (!this.mostrarMovimiento) {
      this.limpiarMovimiento();
    }
  }

  registrarMovimiento(): void {
    if (!this.cajaAbierta || this.guardandoMovimiento) {
      return;
    }

    const concepto = this.conceptoMovimiento
      .replace(/\s+/g, ' ')
      .trim();

    const monto = Number(this.montoMovimiento);

    if (concepto.length < 4) {
      this.error =
        'Indica claramente el motivo del movimiento.';
      return;
    }

    if (
      this.montoMovimiento === null ||
      !Number.isFinite(monto) ||
      monto <= 0
    ) {
      this.error = 'Ingresa un monto mayor que cero.';
      return;
    }

    this.guardandoMovimiento = true;
    this.error = '';
    this.ok = '';

    this.cajaService
      .registrarMovimiento({
        tipo: this.tipoMovimiento,
        concepto,
        monto
      })
      .pipe(
        finalize(() => {
          this.guardandoMovimiento = false;
        })
      )
      .subscribe({
        next: () => {
          this.ok =
            this.tipoMovimiento === 'INGRESO'
              ? 'Ingreso de caja registrado.'
              : 'Egreso de caja registrado.';

          this.mostrarMovimiento = false;
          this.limpiarMovimiento();
          this.refrescarCajaActual();
        },
        error: (error: unknown) => {
          this.error = this.obtenerMensaje(error);
        }
      });
  }

  cargarMovimientos(): void {
    if (!this.cajaAbierta) {
      this.movimientos = [];
      return;
    }

    this.cajaService
      .listarMovimientosActuales()
      .subscribe({
        next: (movimientos) => {
          this.movimientos = movimientos;
        },
        error: (error: unknown) => {
          this.error = this.obtenerMensaje(error);
        }
      });
  }

  cargarHistorial(): void {
    this.cajaService
      .listarHistorial(
        this.filtroDesde,
        this.filtroHasta
      )
      .subscribe({
        next: (historial) => {
          this.historial = historial;
        },
        error: (error: unknown) => {
          this.error = this.obtenerMensaje(error);
        }
      });
  }

  aplicarFiltros(): void {
    if (
      this.filtroDesde &&
      this.filtroHasta &&
      this.filtroDesde > this.filtroHasta
    ) {
      this.error =
        'La fecha inicial no puede ser posterior a la fecha final.';
      return;
    }

    this.error = '';
    this.cargarHistorial();
  }

  exportarExcel(): void {
    if (!this.esAdministrador || !this.historial.length) {
      return;
    }

    const filas = this.historial.map((item) => ({
      Fecha: this.fechaTexto(item.fechaApertura),
      Vendedor: item.usuario,
      Estado: item.estado,
      Apertura: item.montoApertura,
      Ventas: item.cantidadVentas,
      'Total vendido': item.totalVendido,
      'Total cobrado': item.totalCobrado,
      Efectivo: item.efectivo,
      Yape: item.yape,
      Transferencia: item.transferencia,
      Seguro: item.seguro,
      'Saldo pendiente': item.saldoPendiente,
      'Ingresos manuales': item.ingresosManuales,
      'Egresos manuales': item.egresosManuales,
      'Efectivo esperado': item.montoEsperado,
      'Efectivo contado': item.montoCierreReal ?? '',
      Diferencia: item.diferencia ?? '',
      Observaciones: item.observaciones
    }));

    const libro = utils.book_new();
    const hoja = utils.json_to_sheet(filas);

    hoja['!cols'] = [
      { wch: 18 },
      { wch: 25 },
      { wch: 12 },
      { wch: 14 },
      { wch: 10 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 14 },
      { wch: 16 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 14 },
      { wch: 30 }
    ];

    utils.book_append_sheet(
      libro,
      hoja,
      'Cierres de caja'
    );

    writeFileXLSX(
      libro,
      `cierres-caja-${this.filtroDesde}-${this.filtroHasta}.xlsx`
    );
  }

  exportarPdf(): void {
    if (!this.esAdministrador || !this.historial.length) {
      return;
    }

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    pdf.setFontSize(17);
    pdf.text(
      'Óptica Alba - Cierres de caja',
      14,
      14
    );

    pdf.setFontSize(9);
    pdf.text(
      `Periodo: ${this.filtroDesde} al ${this.filtroHasta}`,
      14,
      20
    );

    autoTable(pdf, {
      startY: 25,
      head: [[
        'Fecha',
        'Vendedor',
        'Ventas',
        'Cobrado',
        'Efectivo',
        'Yape',
        'Transf.',
        'Seguro',
        'Esperado',
        'Contado',
        'Diferencia'
      ]],
      body: this.historial.map((item) => [
        this.fechaTexto(item.fechaApertura),
        item.usuario,
        String(item.cantidadVentas),
        this.moneda(item.totalCobrado),
        this.moneda(item.efectivo),
        this.moneda(item.yape),
        this.moneda(item.transferencia),
        this.moneda(item.seguro),
        this.moneda(item.montoEsperado),
        item.montoCierreReal === null
          ? '—'
          : this.moneda(item.montoCierreReal),
        item.diferencia === null
          ? '—'
          : this.moneda(item.diferencia)
      ]),
      styles: {
        fontSize: 7
      }
    });

    pdf.save(
      `cierres-caja-${this.filtroDesde}-${this.filtroHasta}.pdf`
    );
  }

  fechaTexto(valor: string | null): string {
    if (!valor) {
      return '—';
    }

    const fecha = new Date(valor);

    if (Number.isNaN(fecha.getTime())) {
      return valor;
    }

    return new Intl.DateTimeFormat(
      'es-PE',
      {
        dateStyle: 'short',
        timeStyle: 'short'
      }
    ).format(fecha);
  }

  moneda(valor: number): string {
    const numero = Number(valor || 0);
    const signo = numero < 0 ? '-' : '';
    return `${signo}S/ ${Math.abs(numero).toFixed(2)}`;
  }

  classDiferencia(valor: number | null): string {
    const numero = Number(valor || 0);

    if (Math.abs(numero) < 0.01) {
      return 'balanced';
    }

    return numero < 0
      ? 'shortage'
      : 'surplus';
  }

  signoDiferencia(valor: number | null): string {
    return Number(valor || 0) >= 0
      ? '+ '
      : '- ';
  }

  diferenciaAbsoluta(valor: number | null): number {
    return Math.abs(
      Number(valor || 0)
    );
  }

  private refrescarCajaActual(): void {
    forkJoin({
      caja: this.cajaService.obtenerCajaActual(),
      movimientos:
        this.cajaService.listarMovimientosActuales()
    }).subscribe({
      next: ({ caja, movimientos }) => {
        this.caja = caja;
        this.movimientos = movimientos;
      },
      error: (error: unknown) => {
        this.error = this.obtenerMensaje(error);
      }
    });
  }

  private limpiarMovimiento(): void {
    this.tipoMovimiento = 'EGRESO';
    this.conceptoMovimiento = '';
    this.montoMovimiento = null;
  }

  private fechaActual(): string {
    return this.fechaInput(new Date());
  }

  private fechaHaceDias(dias: number): string {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - dias);
    return this.fechaInput(fecha);
  }

  private fechaInput(fecha: Date): string {
    return [
      fecha.getFullYear(),
      String(fecha.getMonth() + 1).padStart(2, '0'),
      String(fecha.getDate()).padStart(2, '0')
    ].join('-');
  }

  private obtenerMensaje(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Ocurrió un error al procesar la caja.';
  }
}
