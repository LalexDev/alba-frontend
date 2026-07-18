import {
  AfterViewInit,
  Component,
  ElementRef,
  ViewChild
} from '@angular/core';
import { finalize } from 'rxjs';

import { ProductoService } from '../../core/services/producto.service';
import {
  MetodoPago,
  VentaService
} from '../../core/services/venta.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { ItemVenta } from '../../core/models/venta.model';

interface ClienteRapidoForm {
  nombreCompleto: string;
  dni: string;
  celular: string;
  correo: string;
  direccion: string;
}

@Component({
  selector: 'app-ventas',
  templateUrl: './ventas.component.html',
  styleUrls: ['./ventas.component.css']
})
export class VentasComponent implements AfterViewInit {

  @ViewChild('barcodeInput')
  barcodeInput?: ElementRef<HTMLInputElement>;

  /* =====================================================
     PRODUCTOS Y CARRITO
     ===================================================== */

  codigo = '';
  mensaje = '';

  carrito: ItemVenta[] = [];

  procesandoVenta = false;

  /* =====================================================
     DATOS DE LA VENTA
     ===================================================== */

  metodoPago: MetodoPago = 'EFECTIVO';

  aCuenta = 0;
  observaciones = '';

  /* =====================================================
     CLIENTE
     ===================================================== */

  clienteId: number | null = null;

  busquedaCliente = '';
  clienteSeleccionadoNombre = '';

  mostrarClienteRapido = false;
  buscandoCliente = false;
  guardandoCliente = false;

  clienteRapido: ClienteRapidoForm =
    this.crearClienteRapidoVacio();

  constructor(
    private productoService: ProductoService,
    private ventaService: VentaService,
    private supabaseService: SupabaseService
  ) {}

  ngAfterViewInit(): void {
    this.focusInput();
  }

  /* =====================================================
     BUSCAR PRODUCTO POR CÓDIGO
     ===================================================== */

  buscarPorCodigo(): void {
    const valor = this.codigo.trim();

    if (!valor) {
      this.focusInput();
      return;
    }

    this.mensaje = 'Buscando producto...';

    this.productoService
      .buscarPorCodigo(valor)
      .subscribe({
        next: (producto) => {
          if (!producto.estado) {
            this.mensaje =
              'El producto se encuentra inactivo.';

            this.limpiarCodigoYEnfocar();
            return;
          }

          if (producto.stockActual <= 0) {
            this.mensaje =
              'El producto no tiene stock disponible.';

            this.limpiarCodigoYEnfocar();
            return;
          }

          const itemExistente =
            this.carrito.find(
              item =>
                item.producto.id === producto.id
            );

          if (itemExistente) {
            const nuevaCantidad =
              itemExistente.cantidad + 1;

            if (
              nuevaCantidad >
              producto.stockActual
            ) {
              this.mensaje =
                'No se puede superar el stock disponible.';
            } else {
              itemExistente.cantidad =
                nuevaCantidad;

              this.actualizarSubtotal(
                itemExistente
              );

              this.mensaje =
                'Cantidad del producto actualizada.';
            }
          } else {
            this.carrito.push({
              producto,
              cantidad: 1,
              subtotal: Number(
                producto.precioVenta
              )
            });

            this.mensaje =
              'Producto agregado a la venta.';
          }

          this.limpiarCodigoYEnfocar();
        },

        error: (error) => {
          console.error(
            'Error al buscar producto:',
            error
          );

          this.mensaje =
            error?.message ||
            'Producto no encontrado.';

          this.limpiarCodigoYEnfocar();
        }
      });
  }

  /* =====================================================
     CANTIDADES
     ===================================================== */

  aumentarCantidad(
    item: ItemVenta
  ): void {
    const nuevaCantidad =
      item.cantidad + 1;

    if (
      nuevaCantidad >
      item.producto.stockActual
    ) {
      this.mensaje =
        'No se puede superar el stock disponible.';

      return;
    }

    item.cantidad = nuevaCantidad;

    this.actualizarSubtotal(item);

    this.mensaje =
      'Cantidad actualizada.';

    this.focusInput();
  }

  disminuirCantidad(
    item: ItemVenta
  ): void {
    if (item.cantidad <= 1) {
      this.remove(item.producto.id);
      return;
    }

    item.cantidad -= 1;

    this.actualizarSubtotal(item);

    this.mensaje =
      'Cantidad actualizada.';

    this.focusInput();
  }

  cambiarCantidad(
    item: ItemVenta,
    cantidad: number
  ): void {
    const cantidadNueva =
      Number(cantidad);

    if (
      !Number.isInteger(cantidadNueva) ||
      cantidadNueva <= 0
    ) {
      this.mensaje =
        'La cantidad debe ser mayor que cero.';

      return;
    }

    if (
      cantidadNueva >
      item.producto.stockActual
    ) {
      this.mensaje =
        'La cantidad supera el stock disponible.';

      return;
    }

    item.cantidad = cantidadNueva;

    this.actualizarSubtotal(item);

    this.mensaje =
      'Cantidad actualizada.';
  }

  /* =====================================================
     CARRITO
     ===================================================== */

  clearCart(): void {
    if (this.procesandoVenta) {
      return;
    }

    this.carrito = [];

    this.aCuenta = 0;
    this.observaciones = '';
    this.metodoPago = 'EFECTIVO';

    this.reiniciarCliente();

    this.mensaje = '';

    this.focusInput();
  }

  remove(
    productoId: number
  ): void {
    if (this.procesandoVenta) {
      return;
    }

    this.carrito =
      this.carrito.filter(
        item =>
          item.producto.id !== productoId
      );

    if (
      this.aCuenta >
      this.totalFinal()
    ) {
      this.aCuenta =
        this.totalFinal();
    }

    this.mensaje =
      'Producto retirado de la venta.';

    this.focusInput();
  }

  /* =====================================================
     TOTALES
     ===================================================== */

  total(): number {
    return this.carrito.reduce(
      (acumulado, item) =>
        acumulado +
        Number(item.subtotal || 0),
      0
    );
  }

  /**
   * Se considera que el precio de venta ya incluye IGV.
   */
  subtotalVenta(): number {
    const totalVenta =
      this.totalFinal();

    if (totalVenta <= 0) {
      return 0;
    }

    return totalVenta / 1.18;
  }

  igv(): number {
    return Math.max(
      this.totalFinal() -
      this.subtotalVenta(),
      0
    );
  }

  totalFinal(): number {
    return this.total();
  }

  saldo(): number {
    return Math.max(
      this.totalFinal() -
      Number(this.aCuenta || 0),
      0
    );
  }

  /* =====================================================
     MÉTODO DE PAGO
     ===================================================== */

  seleccionarMetodo(
    metodo: MetodoPago
  ): void {
    if (this.procesandoVenta) {
      return;
    }

    this.metodoPago = metodo;
  }

  /* =====================================================
     MOSTRAR FORMULARIO DE CLIENTE RÁPIDO
     ===================================================== */

  toggleClienteRapido(): void {
    this.mostrarClienteRapido =
      !this.mostrarClienteRapido;

    if (
      this.mostrarClienteRapido &&
      !this.clienteRapido.nombreCompleto
    ) {
      const termino =
        this.busquedaCliente.trim();

      if (/^\d{8}$/.test(termino)) {
        this.clienteRapido.dni =
          termino;
      } else if (/^\d{9}$/.test(termino)) {
        this.clienteRapido.celular =
          termino;
      } else {
        this.clienteRapido.nombreCompleto =
          termino;
      }
    }
  }

  limpiarClienteRapido(): void {
    this.clienteRapido =
      this.crearClienteRapidoVacio();

    this.mensaje = '';
  }

  /* =====================================================
     BUSCAR CLIENTE
     ===================================================== */

  async buscarCliente(): Promise<void> {
    if (this.buscandoCliente) {
      return;
    }

    const termino =
      this.limpiarTerminoBusqueda(
        this.busquedaCliente
      );

    if (!termino) {
      this.mensaje =
        'Escribe el nombre, DNI o teléfono del cliente.';

      return;
    }

    this.buscandoCliente = true;
    this.mensaje =
      'Buscando cliente...';

    try {
      const {
        data,
        error
      } = await this.supabaseService.client
        .from('clientes')
        .select(`
          id_cliente,
          nombres,
          apellidos,
          numero_documento,
          telefono,
          email,
          direccion,
          activo
        `)
        .or(
          `nombres.ilike.%${termino}%,` +
          `apellidos.ilike.%${termino}%,` +
          `numero_documento.ilike.%${termino}%,` +
          `telefono.ilike.%${termino}%`
        )
        .eq('activo', true)
        .order(
          'creado_en',
          { ascending: false }
        )
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(
          error.message
        );
      }

      if (!data) {
        this.clienteId = null;

        this.clienteSeleccionadoNombre = '';

        this.mensaje =
          'No se encontró el cliente. Puedes registrarlo rápidamente.';

        this.mostrarClienteRapido = true;

        this.prellenarClienteRapido(
          termino
        );

        return;
      }

      const nombreCompleto = [
        data.nombres,
        data.apellidos
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

      this.clienteId =
        Number(data.id_cliente);

      this.clienteSeleccionadoNombre =
        nombreCompleto;

      this.busquedaCliente =
        nombreCompleto;

      this.mostrarClienteRapido = false;

      this.mensaje =
        `Cliente seleccionado: ${nombreCompleto}.`;

      this.focusInput();

    } catch (error) {
      console.error(
        'Error al buscar cliente:',
        error
      );

      this.mensaje =
        error instanceof Error
          ? error.message
          : 'No se pudo buscar el cliente.';

    } finally {
      this.buscandoCliente = false;
    }
  }

  /* =====================================================
     GUARDAR CLIENTE RÁPIDO
     ===================================================== */

  async guardarClienteRapido():
    Promise<void> {

    if (this.guardandoCliente) {
      return;
    }

    const nombreCompleto =
      this.clienteRapido
        .nombreCompleto
        .trim()
        .replace(/\s+/g, ' ');

    const dni =
      this.clienteRapido
        .dni
        .trim();

    const celular =
      this.clienteRapido
        .celular
        .trim();

    const correo =
      this.clienteRapido
        .correo
        .trim()
        .toLowerCase();

    const direccion =
      this.clienteRapido
        .direccion
        .trim();

    if (nombreCompleto.length < 3) {
      this.mensaje =
        'Ingresa el nombre completo del cliente.';

      return;
    }

    if (
      dni &&
      !/^\d{8}$/.test(dni)
    ) {
      this.mensaje =
        'El DNI debe contener exactamente 8 números.';

      return;
    }

    if (
      celular &&
      !/^\d{9}$/.test(celular)
    ) {
      this.mensaje =
        'El celular debe contener exactamente 9 números.';

      return;
    }

    if (
      correo &&
      !this.correoValido(correo)
    ) {
      this.mensaje =
        'Ingresa un correo electrónico válido.';

      return;
    }

    this.guardandoCliente = true;

    this.mensaje =
      'Guardando cliente...';

    try {
      /*
       * Si se ingresó DNI, comprobamos primero
       * que el cliente no esté registrado.
       */
      if (dni) {
        const {
          data: clienteExistente,
          error: errorBusqueda
        } = await this.supabaseService.client
          .from('clientes')
          .select(`
            id_cliente,
            nombres,
            apellidos,
            activo
          `)
          .eq(
            'tipo_documento',
            'DNI'
          )
          .eq(
            'numero_documento',
            dni
          )
          .maybeSingle();

        if (errorBusqueda) {
          throw new Error(
            errorBusqueda.message
          );
        }

        if (clienteExistente) {
          const nombreExistente = [
            clienteExistente.nombres,
            clienteExistente.apellidos
          ]
            .filter(Boolean)
            .join(' ')
            .trim();

          this.clienteId =
            Number(
              clienteExistente.id_cliente
            );

          this.clienteSeleccionadoNombre =
            nombreExistente;

          this.busquedaCliente =
            nombreExistente;

          this.mostrarClienteRapido =
            false;

          this.clienteRapido =
            this.crearClienteRapidoVacio();

          this.mensaje =
            `El cliente ya estaba registrado y fue seleccionado: ${nombreExistente}.`;

          this.focusInput();

          return;
        }
      }

      const {
        nombres,
        apellidos
      } = this.separarNombreCompleto(
        nombreCompleto
      );

      const {
        data,
        error
      } = await this.supabaseService.client
        .from('clientes')
        .insert({
          tipo_persona:
            'NATURAL',

          tipo_documento:
            dni
              ? 'DNI'
              : 'SIN_DOCUMENTO',

          numero_documento:
            dni || null,

          nombres,
          apellidos,

          razon_social:
            null,

          telefono:
            celular || null,

          email:
            correo || null,

          direccion:
            direccion || null,

          observaciones:
            'Cliente registrado desde venta rápida',

          activo:
            true
        })
        .select(`
          id_cliente,
          nombres,
          apellidos
        `)
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(
            'Ya existe un cliente registrado con ese documento.'
          );
        }

        throw new Error(
          error.message
        );
      }

      const clienteGuardado = [
        data.nombres,
        data.apellidos
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

      this.clienteId =
        Number(data.id_cliente);

      this.clienteSeleccionadoNombre =
        clienteGuardado;

      this.busquedaCliente =
        clienteGuardado;

      this.mostrarClienteRapido =
        false;

      this.clienteRapido =
        this.crearClienteRapidoVacio();

      this.mensaje =
        `Cliente ${clienteGuardado} registrado y seleccionado correctamente.`;

      this.focusInput();

    } catch (error) {
      console.error(
        'Error al guardar cliente:',
        error
      );

      this.mensaje =
        error instanceof Error
          ? error.message
          : 'No se pudo registrar el cliente.';

    } finally {
      this.guardandoCliente = false;
    }
  }

  quitarCliente(): void {
    this.clienteId = null;

    this.clienteSeleccionadoNombre = '';

    this.busquedaCliente = '';

    this.mensaje =
      'La venta continuará sin cliente.';

    this.focusInput();
  }

  /* =====================================================
     CONFIRMAR VENTA
     ===================================================== */

  confirmarVenta(): void {
    if (this.procesandoVenta) {
      return;
    }

    if (!this.carrito.length) {
      this.mensaje =
        'No se puede confirmar una venta vacía.';

      this.focusInput();

      return;
    }

    const totalVenta =
      this.totalFinal();

    /*
     * Como actualmente no hay un campo visible
     * para ingresar adelanto, la venta se registra
     * como pagada por el total.
     *
     * Si posteriormente se agrega un adelanto,
     * se utilizará el valor de aCuenta.
     */
    const adelanto =
      Number(this.aCuenta) > 0
        ? Number(this.aCuenta)
        : totalVenta;

    if (
      !Number.isFinite(adelanto) ||
      adelanto < 0
    ) {
      this.mensaje =
        'El monto a cuenta no es válido.';

      return;
    }

    if (
      adelanto >
      totalVenta
    ) {
      this.mensaje =
        'El monto a cuenta no puede superar el total.';

      return;
    }

    this.procesandoVenta = true;

    this.mensaje =
      'Registrando venta...';

    this.ventaService
      .registrarVenta(
        this.carrito,
        this.metodoPago,
        adelanto,
        this.observaciones,
        this.clienteId
      )
      .pipe(
        finalize(() => {
          this.procesandoVenta = false;

          this.focusInput();
        })
      )
      .subscribe({
        next: (venta) => {
          this.carrito = [];

          this.aCuenta = 0;
          this.observaciones = '';
          this.metodoPago =
            'EFECTIVO';

          this.reiniciarCliente();

          this.mensaje =
            `Venta ${venta.numeroVenta} ` +
            `registrada correctamente. ` +
            `Total: S/ ${venta.total.toFixed(2)}.`;

          console.log(
            'Venta registrada:',
            venta
          );
        },

        error: (error) => {
          console.error(
            'Error al guardar la venta:',
            error
          );

          this.mensaje =
            error?.message ||
            'No se pudo registrar la venta.';
        }
      });
  }

  /* =====================================================
     MÉTODOS INTERNOS
     ===================================================== */

  private actualizarSubtotal(
    item: ItemVenta
  ): void {
    item.subtotal =
      Number(item.cantidad) *
      Number(
        item.producto.precioVenta
      );
  }

  private limpiarCodigoYEnfocar():
    void {

    this.codigo = '';

    this.focusInput();
  }

  private focusInput(): void {
    setTimeout(() => {
      this.barcodeInput
        ?.nativeElement
        .focus();
    }, 0);
  }

  private crearClienteRapidoVacio():
    ClienteRapidoForm {

    return {
      nombreCompleto: '',
      dni: '',
      celular: '',
      correo: '',
      direccion: ''
    };
  }

  private reiniciarCliente(): void {
    this.clienteId = null;

    this.busquedaCliente = '';

    this.clienteSeleccionadoNombre = '';

    this.mostrarClienteRapido = false;

    this.buscandoCliente = false;

    this.guardandoCliente = false;

    this.clienteRapido =
      this.crearClienteRapidoVacio();
  }

  private prellenarClienteRapido(
    termino: string
  ): void {

    if (/^\d{8}$/.test(termino)) {
      this.clienteRapido.dni =
        termino;

      return;
    }

    if (/^\d{9}$/.test(termino)) {
      this.clienteRapido.celular =
        termino;

      return;
    }

    this.clienteRapido.nombreCompleto =
      termino;
  }

  private limpiarTerminoBusqueda(
    valor: string
  ): string {

    return valor
      .trim()
      .replace(/[,%()]/g, '')
      .replace(/\s+/g, ' ');
  }

  private correoValido(
    correo: string
  ): boolean {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      .test(correo);
  }

  private separarNombreCompleto(
    nombreCompleto: string
  ): {
    nombres: string;
    apellidos: string;
  } {
    const partes =
      nombreCompleto
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (partes.length === 1) {
      return {
        nombres: partes[0],
        apellidos: ''
      };
    }

    if (partes.length === 2) {
      return {
        nombres: partes[0],
        apellidos: partes[1]
      };
    }

    /*
     * Para nombres como:
     * Ana María Torres Díaz
     *
     * nombres: Ana María
     * apellidos: Torres Díaz
     */
    return {
      nombres:
        partes
          .slice(0, -2)
          .join(' '),

      apellidos:
        partes
          .slice(-2)
          .join(' ')
    };
  }
}