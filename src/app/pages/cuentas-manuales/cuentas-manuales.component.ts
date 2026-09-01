import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  inject
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';

import type { MetodoCaja } from '../../core/models/caja.model';
import type {
  CuentaManual,
  CuentaManualForm,
  FiltroEstadoCuentaManual,
  PagoCuentaManual
} from '../../core/models/cuenta-manual.model';

import { CajaService } from '../../core/services/caja.service';
import {
  CuentaManualService
} from '../../core/services/cuenta-manual.service';

@Component({
  selector: 'app-cuentas-manuales',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './cuentas-manuales.component.html',
  styleUrls: ['./cuentas-manuales.component.css']
})
export class CuentasManualesComponent
  implements OnInit {

  private readonly cuentaService =
    inject(CuentaManualService);

  private readonly cajaService =
    inject(CajaService);

  cuentas: CuentaManual[] = [];
  buscar = '';
  filtroEstado:
    FiltroEstadoCuentaManual = 'TODAS';

  cargando = false;
  guardando = false;
  guardandoPago = false;
  cargandoHistorial = false;

  mensaje = '';
  error = '';
  errorFormulario = '';
  errorPago = '';

  cajaAbierta = false;
  cajaFechaApertura: string | null = null;

  mostrarFormulario = false;
  mostrarPago = false;
  mostrarHistorial = false;

  cuentaSeleccionada: CuentaManual | null = null;
  pagosSeleccionados: PagoCuentaManual[] = [];

  form: CuentaManualForm =
    this.crearFormulario();

  montoPago: number | null = null;
  metodoPago: MetodoCaja = 'EFECTIVO';
  observacionesPago = '';

  ngOnInit(): void {
    this.cargar();
  }

  get cuentasFiltradas(): CuentaManual[] {
    const termino = this.normalizar(this.buscar);

    return this.cuentas.filter(cuenta => {
      if (
        this.filtroEstado !== 'TODAS' &&
        cuenta.estado !== this.filtroEstado
      ) {
        return false;
      }

      if (!termino) {
        return true;
      }

      return [
        cuenta.clienteNombre,
        cuenta.clienteTelefono,
        cuenta.referencia,
        cuenta.montura,
        cuenta.usuario
      ].some(valor =>
        this.normalizar(valor).includes(termino)
      );
    });
  }

  get totalRegistrado(): number {
    return this.sumar(
      this.cuentas,
      cuenta => cuenta.totalVenta
    );
  }

  get totalCancelado(): number {
    return this.sumar(
      this.cuentas,
      cuenta => cuenta.montoCancelado
    );
  }

  get totalPendiente(): number {
    return this.sumar(
      this.cuentas,
      cuenta => cuenta.saldoPendiente
    );
  }

  get cuentasPendientes(): number {
    return this.cuentas.filter(
      cuenta => cuenta.estado === 'PENDIENTE'
    ).length;
  }

  get saldoFormulario(): number {
    return this.redondear(
      Math.max(
        Number(this.form.totalVenta || 0) -
          Number(
            this.form.montoCanceladoHistorico || 0
          ) -
          Number(this.form.pagoRecibidoHoy || 0),
        0
      )
    );
  }

  get canceladoFormulario(): number {
    return this.redondear(
      Number(
        this.form.montoCanceladoHistorico || 0
      ) +
      Number(this.form.pagoRecibidoHoy || 0)
    );
  }

  get maximoPagoHoy(): number {
    return this.redondear(
      Math.max(
        Number(this.form.totalVenta || 0) -
          Number(
            this.form.montoCanceladoHistorico || 0
          ),
        0
      )
    );
  }

  cargar(): void {
    this.cargando = true;
    this.error = '';

    forkJoin({
      cuentas: this.cuentaService.listar(),
      caja: this.cajaService.obtenerCajaActual()
    })
      .pipe(
        finalize(() => {
          this.cargando = false;
        })
      )
      .subscribe({
        next: ({ cuentas, caja }) => {
          this.cuentas = cuentas;
          this.cajaAbierta = caja.abierta;
          this.cajaFechaApertura = caja.fechaApertura;
        },
        error: (error: unknown) => {
          this.error = this.obtenerMensaje(error);
        }
      });
  }

  abrirFormulario(): void {
    this.form = this.crearFormulario();
    this.errorFormulario = '';
    this.mensaje = '';
    this.error = '';
    this.mostrarFormulario = true;
  }

  cerrarFormulario(): void {
    if (this.guardando) {
      return;
    }

    this.mostrarFormulario = false;
    this.errorFormulario = '';
  }

  guardarCuenta(): void {
    if (this.guardando) {
      return;
    }

    const validacion = this.validarFormulario();

    if (validacion) {
      this.errorFormulario = validacion;
      return;
    }

    this.guardando = true;
    this.errorFormulario = '';
    this.mensaje = '';

    this.cuentaService
      .registrar(this.form)
      .pipe(
        finalize(() => {
          this.guardando = false;
        })
      )
      .subscribe({
        next: () => {
          const pagoHoy = Number(
            this.form.pagoRecibidoHoy || 0
          );

          this.mensaje = pagoHoy > 0
            ? 'Cuenta registrada. El pago recibido hoy ya ingresó a la caja actual.'
            : 'Cuenta manual registrada sin alterar la caja del día.';

          this.mostrarFormulario = false;
          this.cargar();
        },
        error: (error: unknown) => {
          this.errorFormulario =
            this.obtenerMensaje(error);
        }
      });
  }

  abrirPago(cuenta: CuentaManual): void {
    if (cuenta.estado === 'PAGADA') {
      return;
    }

    this.cuentaSeleccionada = cuenta;
    this.montoPago = cuenta.saldoPendiente;
    this.metodoPago = 'EFECTIVO';
    this.observacionesPago = '';
    this.errorPago = '';
    this.mensaje = '';
    this.mostrarPago = true;
  }

  cerrarPago(): void {
    if (this.guardandoPago) {
      return;
    }

    this.mostrarPago = false;
    this.cuentaSeleccionada = null;
    this.errorPago = '';
  }

  registrarPago(): void {
    const cuenta = this.cuentaSeleccionada;

    if (!cuenta || this.guardandoPago) {
      return;
    }

    const monto = Number(this.montoPago);

    if (!this.cajaAbierta) {
      this.errorPago =
        'Debes abrir la caja antes de recibir este pago.';
      return;
    }

    if (!Number.isFinite(monto) || monto <= 0) {
      this.errorPago =
        'Ingresa un pago mayor que cero.';
      return;
    }

    if (monto - cuenta.saldoPendiente > 0.001) {
      this.errorPago =
        `El pago no puede superar ${this.moneda(cuenta.saldoPendiente)}.`;
      return;
    }

    this.guardandoPago = true;
    this.errorPago = '';
    this.mensaje = '';

    this.cuentaService
      .registrarPago({
        idCuenta: cuenta.idCuenta,
        monto,
        metodoPago: this.metodoPago,
        observaciones: this.observacionesPago
      })
      .pipe(
        finalize(() => {
          this.guardandoPago = false;
        })
      )
      .subscribe({
        next: () => {
          this.mensaje =
            `Pago de ${this.moneda(monto)} registrado por ${this.metodoTexto(this.metodoPago)}. Ya figura en la caja actual.`;

          this.mostrarPago = false;
          this.cuentaSeleccionada = null;
          this.cargar();
        },
        error: (error: unknown) => {
          this.errorPago = this.obtenerMensaje(error);
        }
      });
  }

  abrirHistorial(cuenta: CuentaManual): void {
    this.cuentaSeleccionada = cuenta;
    this.pagosSeleccionados = [];
    this.mostrarHistorial = true;
    this.cargandoHistorial = true;
    this.errorPago = '';

    this.cuentaService
      .listarPagos(cuenta.idCuenta)
      .pipe(
        finalize(() => {
          this.cargandoHistorial = false;
        })
      )
      .subscribe({
        next: pagos => {
          this.pagosSeleccionados = pagos;
        },
        error: (error: unknown) => {
          this.errorPago = this.obtenerMensaje(error);
        }
      });
  }

  cerrarHistorial(): void {
    if (this.cargandoHistorial) {
      return;
    }

    this.mostrarHistorial = false;
    this.cuentaSeleccionada = null;
    this.pagosSeleccionados = [];
    this.errorPago = '';
  }

  aplicarFiltros(): void {
    this.error = '';
  }

  limpiarFiltros(): void {
    this.buscar = '';
    this.filtroEstado = 'TODAS';
  }

  pagarSaldoCompleto(): void {
    if (this.cuentaSeleccionada) {
      this.montoPago =
        this.cuentaSeleccionada.saldoPendiente;
    }
  }

  ajustarTotalFormulario(): void {
    const total = Number(this.form.totalVenta);

    if (!Number.isFinite(total) || total < 0) {
      return;
    }

    const historico = Number(
      this.form.montoCanceladoHistorico || 0
    );

    if (historico > total) {
      this.form.montoCanceladoHistorico =
        this.redondear(total);
    }

    this.ajustarPagoHoy();
  }

  ajustarCanceladoHistorico(): void {
    const total = Number(this.form.totalVenta || 0);
    const historico = Number(
      this.form.montoCanceladoHistorico || 0
    );

    if (!Number.isFinite(historico) || historico < 0) {
      this.form.montoCanceladoHistorico = 0;
    } else if (total > 0 && historico > total) {
      this.form.montoCanceladoHistorico =
        this.redondear(total);
    }

    this.ajustarPagoHoy();
  }

  ajustarPagoHoy(): void {
    const pago = Number(this.form.pagoRecibidoHoy || 0);

    if (!Number.isFinite(pago) || pago < 0) {
      this.form.pagoRecibidoHoy = 0;
      return;
    }

    if (pago > this.maximoPagoHoy) {
      this.form.pagoRecibidoHoy = this.maximoPagoHoy;
    }
  }

  ajustarMontoPago(): void {
    const cuenta = this.cuentaSeleccionada;
    const pago = Number(this.montoPago || 0);

    if (!cuenta) {
      return;
    }

    if (!Number.isFinite(pago) || pago < 0) {
      this.montoPago = 0;
      return;
    }

    if (pago > cuenta.saldoPendiente) {
      this.montoPago = cuenta.saldoPendiente;
    }
  }

  iniciales(nombre: string): string {
    return String(nombre || '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(parte => parte.charAt(0).toUpperCase())
      .join('') || 'CM';
  }

  moneda(valor: number): string {
    const numero = Number(valor || 0);
    return `S/ ${numero.toFixed(2)}`;
  }

  fechaTexto(valor: string | null): string {
    if (!valor) {
      return '—';
    }

    const valorFecha = /^\d{4}-\d{2}-\d{2}$/
      .test(valor)
        ? `${valor}T12:00:00`
        : valor;

    const fecha = new Date(valorFecha);

    if (Number.isNaN(fecha.getTime())) {
      return valor;
    }

    return new Intl.DateTimeFormat(
      'es-PE',
      {
        dateStyle: 'medium',
        timeZone: 'America/Lima'
      }
    ).format(fecha);
  }

  fechaHoraTexto(valor: string | null): string {
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
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Lima'
      }
    ).format(fecha);
  }

  metodoTexto(metodo: MetodoCaja): string {
    return metodo === 'YAPE'
      ? 'Yape'
      : metodo === 'TRANSFERENCIA'
        ? 'transferencia'
        : 'efectivo';
  }

  private validarFormulario(): string {
    const cliente = this.texto(this.form.clienteNombre);
    const montura = this.texto(this.form.montura);
    const precio = Number(this.form.precioVenta);
    const total = Number(this.form.totalVenta);
    const historico = Number(
      this.form.montoCanceladoHistorico || 0
    );
    const pagoHoy = Number(
      this.form.pagoRecibidoHoy || 0
    );

    if (cliente.length < 3) {
      return 'Ingresa el nombre completo del cliente.';
    }

    if (montura.length < 2) {
      return 'Describe la montura vendida.';
    }

    if (!this.form.fechaVenta) {
      return 'Selecciona la fecha de la venta manual.';
    }

    if (!Number.isFinite(precio) || precio < 0) {
      return 'El precio de venta de la montura no es válido.';
    }

    if (!Number.isFinite(total) || total <= 0) {
      return 'El total de la venta debe ser mayor que cero.';
    }

    if (
      !Number.isFinite(historico) ||
      !Number.isFinite(pagoHoy) ||
      historico < 0 ||
      pagoHoy < 0
    ) {
      return 'Los montos cancelados no pueden ser negativos.';
    }

    if (historico + pagoHoy - total > 0.001) {
      return 'Lo cancelado no puede superar el total de la venta.';
    }

    if (pagoHoy > 0 && !this.cajaAbierta) {
      return 'Abre la caja o deja “Pago recibido hoy” en S/ 0.00.';
    }

    return '';
  }

  private crearFormulario(): CuentaManualForm {
    return {
      clienteNombre: '',
      clienteTelefono: '',
      referencia: '',
      fechaVenta: this.fechaActual(),
      montura: '',
      precioVenta: null,
      totalVenta: null,
      montoCanceladoHistorico: 0,
      pagoRecibidoHoy: 0,
      metodoPagoHoy: 'EFECTIVO',
      observaciones: ''
    };
  }

  private sumar(
    cuentas: CuentaManual[],
    selector: (cuenta: CuentaManual) => number
  ): number {
    return this.redondear(
      cuentas.reduce(
        (total, cuenta) => total + selector(cuenta),
        0
      )
    );
  }

  private redondear(valor: number): number {
    return Number(Number(valor || 0).toFixed(2));
  }

  private texto(valor: unknown): string {
    return String(valor || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizar(valor: unknown): string {
    return String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private fechaActual(): string {
    const partes = new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }
    ).formatToParts(new Date());

    const obtener = (
      tipo: 'year' | 'month' | 'day'
    ): string =>
      partes.find(parte => parte.type === tipo)
        ?.value || '';

    return [
      obtener('year'),
      obtener('month'),
      obtener('day')
    ].join('-');
  }

  private obtenerMensaje(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'No se pudo procesar la cuenta manual.';
  }
}
