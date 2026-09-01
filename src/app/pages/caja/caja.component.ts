import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
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
  MovimientoCaja
} from '../../core/models/caja.model';

import { CajaService } from '../../core/services/caja.service';
import { TokenService } from '../../core/services/token.service';

@Component({
  selector: 'app-caja',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule
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
  observacionesCierre = '';

  mostrarMovimiento = false;
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
    if (
      !this.cajaAbierta ||
      this.cerrando
    ) {
      return;
    }

    this.cerrando = true;
    this.error = '';
    this.ok = '';

    this.cajaService
      .cerrarCaja({
        observaciones:
          this.observacionesCierre
      })
      .pipe(
        finalize(() => {
          this.cerrando = false;
        })
      )
      .subscribe({
        next: () => {
          this.ok =
            'Caja cerrada correctamente con los importes calculados desde los movimientos registrados.';

          this.observacionesCierre =
            '';

          this.movimientos = [];

          this.cargarTodo();
        },

        error: (
          error: unknown
        ) => {
          this.error =
            this.obtenerMensaje(
              error
            );
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

    const operacion =
      this.cajaService.registrarMovimiento({
        tipo: 'EGRESO',
        concepto,
        monto
      });

    operacion
      .pipe(
        finalize(() => {
          this.guardandoMovimiento = false;
        })
      )
      .subscribe({
        next: () => {
          this.ok = 'Egreso de caja registrado.';

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
      'Seguro pendiente': item.seguroPendiente,
      'Seguros cobrados hoy': item.segurosCobradosHoy,
      'Cobros de cuentas manuales': item.pagosExternos,
      'Cuentas manuales efectivo': item.pagosExternosEfectivo,
      'Cuentas manuales Yape': item.pagosExternosYape,
      'Cuentas manuales transferencia': item.pagosExternosTransferencia,
      'Saldo pendiente': item.saldoPendiente,
      'Egresos manuales': item.egresosManuales,
      'Efectivo esperado': item.montoEsperado,
      'Efectivo al cierre automático': item.montoCierreReal ?? '',
      'Yape esperado': item.yapeEsperado,
      'Yape al cierre automático': item.yapeConfirmado ?? '',
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
        'Efec. esp.',
        'Efec. cont.',
        'Dif. efec.',
        'Yape esp.',
        'Yape conf.',
        'Dif. Yape'
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
          : this.moneda(item.diferencia),
        this.moneda(item.yapeEsperado),
        item.yapeConfirmado === null
          ? '—'
          : this.moneda(item.yapeConfirmado),
        item.diferenciaYape === null
          ? '—'
          : this.moneda(item.diferenciaYape)
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
        timeStyle: 'short',
        timeZone: 'America/Lima'
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
    this.conceptoMovimiento = '';
    this.montoMovimiento = null;
  }

  private fechaActual(): string {
    return this.fechaPeru(
      new Date()
    );
  }

  private fechaHaceDias(
    dias: number
  ): string {
    const actual =
      new Date();

    actual.setUTCDate(
      actual.getUTCDate() -
      dias
    );

    return this.fechaPeru(
      actual
    );
  }

  private fechaPeru(
    fecha: Date
  ): string {
    const partes =
      new Intl.DateTimeFormat(
        'en-US',
        {
          timeZone:
            'America/Lima',
          year:
            'numeric',
          month:
            '2-digit',
          day:
            '2-digit'
        }
      )
        .formatToParts(
          fecha
        );

    const valor =
      (
        tipo:
          'year' |
          'month' |
          'day'
      ): string =>
        partes.find(
          parte =>
            parte.type === tipo
        )?.value || '';

    return [
      valor('year'),
      valor('month'),
      valor('day')
    ].join('-');
  }


  private obtenerMensaje(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Ocurrió un error al procesar la caja.';
  }
}
