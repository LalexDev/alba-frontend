import {
  AfterViewInit,
  Component,
  ElementRef,
  ViewChild
} from '@angular/core';
import { finalize, firstValueFrom } from 'rxjs';

import { ProductoService } from '../../core/services/producto.service';
import {
  MetodoPago,
  VentaService
} from '../../core/services/venta.service';
import { SupabaseService } from '../../core/services/supabase.service';
import {
  ItemVenta,
  TipoObsequioVenta,
  VentaRegistrada
} from '../../core/models/venta.model';
import { Producto } from '../../core/models/producto.model';

interface ClienteRapidoForm {
  nombreCompleto: string;
  dni: string;
  celular: string;
  correo: string;
  direccion: string;
}

type ProductoRapido =
  | 'LIQUIDO'
  | 'ESTUCHE';

interface ResumenRecibo {
  subtotalProductos: number;
  descuentoManual: number;
  descuentoObsequios: number;
  igvIncluido: number;
  total: number;
  aCuenta: number;
  saldo: number;
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
  agregandoRapido = false;

  private secuenciaLinea = 0;
  private productosCache:
    Producto[] | null = null;

  /* =====================================================
     DATOS DE LA VENTA
     ===================================================== */

  metodoPago: MetodoPago = 'EFECTIVO';

  descuentoManual = 0;
  aCuenta = 0;
  observaciones = '';
  imprimirRecibo = true;

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
    const valor =
      this.codigo.trim();

    if (!valor) {
      this.focusInput();
      return;
    }

    this.mensaje =
      'Buscando producto...';

    this.productoService
      .buscarPorCodigo(valor)
      .subscribe({
        next:
          (
            producto:
              Producto
          ) => {
            this.agregarProductoAlCarrito(
              producto
            );

            this.limpiarCodigoYEnfocar();
          },

        error:
          (
            error:
              unknown
          ) => {
            console.error(
              'Error al buscar producto:',
              error
            );

            this.mensaje =
              error instanceof Error
                ? error.message
                : 'Producto no encontrado.';

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
    if (
      item.esObsequio ||
      this.procesandoVenta
    ) {
      return;
    }

    const nuevaCantidad =
      item.cantidad + 1;

    const otrasUnidades =
      this.cantidadTotalProducto(
        item.producto.id,
        item.idLinea
      );

    if (
      nuevaCantidad +
      otrasUnidades >
      item.producto.stockActual
    ) {
      this.mensaje =
        'No se puede superar el stock disponible.';

      return;
    }

    item.cantidad =
      nuevaCantidad;

    this.actualizarSubtotal(
      item
    );

    this.ajustarMontosAlTotal();

    this.mensaje =
      'Cantidad actualizada.';

    this.focusInput();
  }

  disminuirCantidad(
    item: ItemVenta
  ): void {
    if (
      item.esObsequio ||
      this.procesandoVenta
    ) {
      return;
    }

    if (item.cantidad <= 1) {
      this.remove(item);
      return;
    }

    item.cantidad -= 1;

    this.actualizarSubtotal(
      item
    );

    this.ajustarMontosAlTotal();

    this.mensaje =
      'Cantidad actualizada.';

    this.focusInput();
  }

  cambiarCantidad(
    item: ItemVenta,
    cantidad: number
  ): void {
    if (
      item.esObsequio ||
      this.procesandoVenta
    ) {
      return;
    }

    const cantidadNueva =
      Number(cantidad);

    if (
      !Number.isInteger(
        cantidadNueva
      ) ||
      cantidadNueva <= 0
    ) {
      this.mensaje =
        'La cantidad debe ser mayor que cero.';

      return;
    }

    const otrasUnidades =
      this.cantidadTotalProducto(
        item.producto.id,
        item.idLinea
      );

    if (
      cantidadNueva +
      otrasUnidades >
      item.producto.stockActual
    ) {
      this.mensaje =
        'La cantidad supera el stock disponible.';

      return;
    }

    item.cantidad =
      cantidadNueva;

    this.actualizarSubtotal(
      item
    );

    this.ajustarMontosAlTotal();

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

    this.descuentoManual = 0;
    this.aCuenta = 0;
    this.observaciones = '';
    this.metodoPago =
      'EFECTIVO';

    this.reiniciarCliente();

    this.mensaje = '';

    this.focusInput();
  }

  remove(
    item: ItemVenta
  ): void {
    if (this.procesandoVenta) {
      return;
    }

    this.carrito =
      this.carrito.filter(
        fila =>
          fila.idLinea !==
          item.idLinea
      );

    this.sincronizarObsequiosConMontura();
    this.ajustarMontosAlTotal();

    this.mensaje =
      item.esObsequio
        ? 'Obsequio retirado.'
        : 'Producto retirado de la venta.';

    this.focusInput();
  }

  trackItem(
    indice: number,
    item: ItemVenta
  ): string {
    return (
      item.idLinea ||
      `${item.producto.id}-${indice}`
    );
  }

  /* =====================================================
     TOTALES
     ===================================================== */

  total(): number {
    return this.subtotalProductos();
  }

  subtotalProductos(): number {
    return Number(
      this.carrito
        .reduce(
          (
            acumulado,
            item
          ) =>
            acumulado +
            this.importeBaseItem(
              item
            ),
          0
        )
        .toFixed(2)
    );
  }

  descuentoObsequios(): number {
    return Number(
      this.carrito
        .filter(
          item =>
            Boolean(
              item.esObsequio
            )
        )
        .reduce(
          (
            acumulado,
            item
          ) =>
            acumulado +
            this.importeBaseItem(
              item
            ),
          0
        )
        .toFixed(2)
    );
  }

  maximoDescuentoManual(): number {
    return Number(
      Math.max(
        this.subtotalProductos() -
        this.descuentoObsequios(),
        0
      ).toFixed(2)
    );
  }

  descuentoAplicado(): number {
    const descuento =
      Number(
        this.descuentoManual || 0
      );

    if (
      !Number.isFinite(descuento) ||
      descuento <= 0
    ) {
      return 0;
    }

    return Number(
      Math.min(
        descuento,
        this.maximoDescuentoManual()
      ).toFixed(2)
    );
  }

  totalFinal(): number {
    return Number(
      Math.max(
        this.subtotalProductos() -
        this.descuentoObsequios() -
        this.descuentoAplicado(),
        0
      ).toFixed(2)
    );
  }

  /**
   * Los precios del sistema ya incluyen IGV.
   */
  subtotalVenta(): number {
    const totalVenta =
      this.totalFinal();

    if (totalVenta <= 0) {
      return 0;
    }

    return Number(
      (
        totalVenta /
        1.18
      ).toFixed(2)
    );
  }

  igv(): number {
    return Number(
      Math.max(
        this.totalFinal() -
        this.subtotalVenta(),
        0
      ).toFixed(2)
    );
  }

  saldo(): number {
    return Number(
      Math.max(
        this.totalFinal() -
        Number(
          this.aCuenta || 0
        ),
        0
      ).toFixed(2)
    );
  }

  aplicarPagoTotal(): void {
    this.aCuenta =
      this.totalFinal();
  }

  actualizarDescuento(): void {
    const valor =
      Number(
        this.descuentoManual || 0
      );

    this.descuentoManual =
      Number.isFinite(valor)
        ? Math.max(valor, 0)
        : 0;

    this.ajustarMontosAlTotal();
  }

  actualizarACuenta(): void {
    const valor =
      Number(
        this.aCuenta || 0
      );

    this.aCuenta =
      Number.isFinite(valor)
        ? Math.max(valor, 0)
        : 0;

    if (
      this.aCuenta >
      this.totalFinal()
    ) {
      this.aCuenta =
        this.totalFinal();
    }
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
     PRODUCTOS RÁPIDOS Y OBSEQUIOS
     ===================================================== */

  async agregarProductoRapido(
    tipo: ProductoRapido
  ): Promise<void> {
    if (
      this.agregandoRapido ||
      this.procesandoVenta
    ) {
      return;
    }

    this.agregandoRapido = true;

    try {
      const producto =
        await this.buscarProductoEspecial(
          tipo
        );

      if (!producto) {
        this.mensaje =
          tipo === 'LIQUIDO'
            ? 'No se encontró un producto activo llamado Líquido o Limpiador.'
            : 'No se encontró un producto activo llamado Estuche.';

        return;
      }

      const precio =
        Number(
          producto.precioVenta || 0
        );

      if (
        Math.abs(
          precio - 10
        ) > 0.01
      ) {
        this.mensaje =
          `${producto.nombre} tiene precio S/ ${precio.toFixed(2)}. ` +
          'Configúralo en S/ 10.00 para usar el botón rápido.';

        return;
      }

      this.agregarProductoAlCarrito(
        producto
      );
    } catch (error) {
      console.error(
        'Error al agregar producto rápido:',
        error
      );

      this.mensaje =
        error instanceof Error
          ? error.message
          : 'No se pudo agregar el producto rápido.';
    } finally {
      this.agregandoRapido = false;
      this.focusInput();
    }
  }

  hayMonturaEnCarrito(): boolean {
    return this.carrito.some(
      item =>
        !item.esObsequio &&
        this.esMontura(
          item.producto
        )
    );
  }

  obsequioSeleccionado(
    tipo:
      TipoObsequioVenta
  ): boolean {
    return this.carrito.some(
      item =>
        item.esObsequio &&
        item.tipoObsequio ===
          tipo
    );
  }

  async cambiarObsequio(
    tipo:
      TipoObsequioVenta,
    event: Event
  ): Promise<void> {
    const checkbox =
      event.target as
        HTMLInputElement;

    if (!checkbox.checked) {
      this.carrito =
        this.carrito.filter(
          item =>
            !(
              item.esObsequio &&
              item.tipoObsequio ===
                tipo
            )
        );

      this.ajustarMontosAlTotal();

      this.mensaje =
        tipo === 'MICROFIBRA'
          ? 'Microfibra gratuita retirada.'
          : 'Estuche gratuito retirado.';

      return;
    }

    if (
      !this.hayMonturaEnCarrito()
    ) {
      checkbox.checked = false;

      this.mensaje =
        'Primero agrega una montura a la venta.';

      return;
    }

    try {
      const producto =
        await this.buscarProductoEspecial(
          tipo
        );

      if (!producto) {
        checkbox.checked = false;

        this.mensaje =
          tipo === 'MICROFIBRA'
            ? 'No se encontró una microfibra activa con stock.'
            : 'No se encontró un estuche activo con stock.';

        return;
      }

      const agregado =
        this.agregarProductoAlCarrito(
          producto,
          true,
          tipo
        );

      if (!agregado) {
        checkbox.checked = false;
      }
    } catch (error) {
      checkbox.checked = false;

      this.mensaje =
        error instanceof Error
          ? error.message
          : 'No se pudo agregar el obsequio.';
    }
  }

  private async buscarProductoEspecial(
    tipo:
      | ProductoRapido
      | TipoObsequioVenta
  ): Promise<Producto | null> {
    const productos =
      await this.obtenerProductosDisponibles();

    const coincide = (
      producto: Producto
    ): boolean => {
      const texto =
        this.normalizarTexto(
          [
            producto.nombre,
            producto.descripcion,
            producto.categoria?.nombre
          ]
            .filter(Boolean)
            .join(' ')
        );

      switch (tipo) {
        case 'LIQUIDO':
          return (
            texto.includes('liquido') ||
            texto.includes('limpiador') ||
            texto.includes('spray')
          );

        case 'ESTUCHE':
          return texto.includes(
            'estuche'
          );

        case 'MICROFIBRA':
          return (
            texto.includes(
              'microfibra'
            ) ||
            texto.includes(
              'pano'
            )
          );

        default:
          return false;
      }
    };

    return (
      productos.find(
        producto =>
          producto.estado &&
          producto.stockActual > 0 &&
          coincide(producto)
      ) ?? null
    );
  }

  private async obtenerProductosDisponibles():
    Promise<Producto[]> {
    if (this.productosCache) {
      return this.productosCache;
    }

    this.productosCache =
      await firstValueFrom(
        this.productoService.listar()
      );

    return this.productosCache;
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

    const descuento =
      Number(
        this.descuentoManual || 0
      );

    const adelanto =
      Number(
        this.aCuenta || 0
      );

    if (
      !Number.isFinite(descuento) ||
      descuento < 0 ||
      descuento >
        this.maximoDescuentoManual()
    ) {
      this.mensaje =
        'El descuento no puede superar el importe de los productos cobrados.';

      return;
    }

    if (
      !Number.isFinite(adelanto) ||
      adelanto < 0 ||
      adelanto >
        totalVenta
    ) {
      this.mensaje =
        'El monto a cuenta debe estar entre S/ 0.00 y el total.';

      return;
    }

    if (totalVenta <= 0) {
      this.mensaje =
        'El total de la venta debe ser mayor que cero.';

      return;
    }

    const metodoRecibo =
      this.metodoPago;

    const observacionesRecibo =
      this.observaciones;

    const itemsRecibo =
      this.carrito.map(
        item => ({
          ...item,
          producto: {
            ...item.producto
          }
        })
      );

    const clienteRecibo =
      this.clienteSeleccionadoNombre ||
      'Cliente general';

    const resumenRecibo:
      ResumenRecibo = {
        subtotalProductos:
          this.subtotalProductos(),
        descuentoManual:
          this.descuentoAplicado(),
        descuentoObsequios:
          this.descuentoObsequios(),
        igvIncluido:
          this.igv(),
        total:
          totalVenta,
        aCuenta:
          adelanto,
        saldo:
          Number(
            (
              totalVenta -
              adelanto
            ).toFixed(2)
          )
      };

    const ventanaRecibo =
      this.imprimirRecibo
        ? this.abrirVentanaRecibo()
        : null;

    this.procesandoVenta = true;

    this.mensaje =
      'Registrando venta...';

    this.ventaService
      .registrarVenta(
        this.carrito,
        this.metodoPago,
        adelanto,
        this.observaciones,
        this.clienteId,
        descuento
      )
      .pipe(
        finalize(() => {
          this.procesandoVenta = false;
          this.focusInput();
        })
      )
      .subscribe({
        next:
          (
            venta:
              VentaRegistrada
          ) => {
            if (ventanaRecibo) {
              void this.imprimirReciboVenta(
                ventanaRecibo,
                venta,
                itemsRecibo,
                clienteRecibo,
                resumenRecibo,
                metodoRecibo,
                observacionesRecibo
              );
            }

            this.carrito = [];
            this.descuentoManual = 0;
            this.aCuenta = 0;
            this.observaciones = '';
            this.metodoPago =
              'EFECTIVO';
            this.productosCache =
              null;

            this.reiniciarCliente();

            this.mensaje =
              `Venta ${venta.numeroVenta} registrada. ` +
              `Total S/ ${venta.total.toFixed(2)}, ` +
              `a cuenta S/ ${venta.aCuenta.toFixed(2)} y ` +
              `saldo S/ ${venta.saldo.toFixed(2)}.` +
              (
                this.imprimirRecibo &&
                !ventanaRecibo
                  ? ' El navegador bloqueó la ventana del recibo.'
                  : ''
              );
          },

        error:
          (
            error:
              unknown
          ) => {
            ventanaRecibo?.close();

            console.error(
              'Error al guardar la venta:',
              error
            );

            this.mensaje =
              error instanceof Error
                ? error.message
                : 'No se pudo registrar la venta.';
          }
      });
  }

  /* =====================================================
     MÉTODOS INTERNOS
     ===================================================== */

  private agregarProductoAlCarrito(
    producto: Producto,
    esObsequio: boolean = false,
    tipoObsequio?:
      TipoObsequioVenta
  ): boolean {
    if (!producto.estado) {
      this.mensaje =
        'El producto se encuentra inactivo.';

      return false;
    }

    if (producto.stockActual <= 0) {
      this.mensaje =
        'El producto no tiene stock disponible.';

      return false;
    }

    const existente =
      this.carrito.find(
        item =>
          item.producto.id ===
            producto.id &&
          Boolean(
            item.esObsequio
          ) === esObsequio &&
          (
            !esObsequio ||
            item.tipoObsequio ===
              tipoObsequio
          )
      );

    if (
      esObsequio &&
      existente
    ) {
      this.mensaje =
        'El obsequio ya está agregado.';

      return true;
    }

    const cantidadActual =
      this.cantidadTotalProducto(
        producto.id
      );

    if (
      cantidadActual + 1 >
      producto.stockActual
    ) {
      this.mensaje =
        'No hay stock suficiente para agregar otra unidad.';

      return false;
    }

    if (
      existente &&
      !esObsequio
    ) {
      existente.cantidad += 1;

      this.actualizarSubtotal(
        existente
      );

      this.mensaje =
        'Cantidad del producto actualizada.';
    } else {
      const item: ItemVenta = {
        idLinea:
          this.crearIdLinea(),
        producto,
        cantidad: 1,
        subtotal:
          esObsequio
            ? 0
            : Number(
                producto.precioVenta
              ),
        esObsequio,
        tipoObsequio
      };

      this.carrito.push(
        item
      );

      this.mensaje =
        esObsequio
          ? `${producto.nombre} agregado como obsequio.`
          : 'Producto agregado a la venta.';
    }

    this.ajustarMontosAlTotal();

    return true;
  }

  private cantidadTotalProducto(
    productoId: number,
    excluirLinea?: string
  ): number {
    return this.carrito
      .filter(
        item =>
          item.producto.id ===
            productoId &&
          item.idLinea !==
            excluirLinea
      )
      .reduce(
        (
          acumulado,
          item
        ) =>
          acumulado +
          Number(
            item.cantidad || 0
          ),
        0
      );
  }

  private crearIdLinea(): string {
    this.secuenciaLinea += 1;

    return (
      `linea-${Date.now()}-` +
      this.secuenciaLinea
    );
  }

  private actualizarSubtotal(
    item: ItemVenta
  ): void {
    item.subtotal =
      item.esObsequio
        ? 0
        : Number(
            (
              Number(
                item.cantidad
              ) *
              Number(
                item.producto
                  .precioVenta
              )
            ).toFixed(2)
          );
  }

  private importeBaseItem(
    item: ItemVenta
  ): number {
    return Number(
      (
        Number(
          item.cantidad || 0
        ) *
        Number(
          item.producto
            .precioVenta || 0
        )
      ).toFixed(2)
    );
  }

  private ajustarMontosAlTotal():
    void {
    if (
      this.descuentoManual >
      this.maximoDescuentoManual()
    ) {
      this.descuentoManual =
        this.maximoDescuentoManual();
    }

    if (
      this.aCuenta >
      this.totalFinal()
    ) {
      this.aCuenta =
        this.totalFinal();
    }
  }

  private esMontura(
    producto: Producto
  ): boolean {
    const texto =
      this.normalizarTexto(
        [
          producto.nombre,
          producto.descripcion,
          producto.categoria?.nombre
        ]
          .filter(Boolean)
          .join(' ')
      );

    return (
      texto.includes(
        'montura'
      ) ||
      texto.includes(
        'armazon'
      )
    );
  }

  private sincronizarObsequiosConMontura():
    void {
    if (
      this.hayMonturaEnCarrito()
    ) {
      return;
    }

    this.carrito =
      this.carrito.filter(
        item =>
          !item.esObsequio
      );
  }

  private normalizarTexto(
    valor: string
  ): string {
    return String(
      valor || ''
    )
      .normalize('NFD')
      .replace(
        /[\u0300-\u036f]/g,
        ''
      )
      .toLowerCase()
      .trim();
  }

  private abrirVentanaRecibo():
    Window | null {
    const ventana =
      window.open(
        '',
        '_blank',
        'width=520,height=760'
      );

    if (!ventana) {
      return null;
    }

    ventana.document.write(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8">
          <title>Preparando recibo...</title>
        </head>
        <body
          style="
            margin:0;
            padding:24px;
            font-family:Arial,sans-serif;
          "
        >
          Registrando venta y preparando recibo...
        </body>
      </html>
    `);

    ventana.document.close();

    return ventana;
  }

  private async imprimirReciboVenta(
    ventana: Window,
    venta: VentaRegistrada,
    items: ItemVenta[],
    cliente: string,
    resumen: ResumenRecibo,
    metodoPago: MetodoPago,
    observacionesVenta: string
  ): Promise<void> {
    const logo =
      await this.obtenerLogoRecibo();

    const fecha =
      new Intl.DateTimeFormat(
        'es-PE',
        {
          dateStyle:
            'short',
          timeStyle:
            'short'
        }
      ).format(
        new Date()
      );

    const dinero = (
      valor: number
    ): string =>
      `S/ ${Number(valor || 0).toFixed(2)}`;

    const filas =
      items
        .map(
          item => {
            const precio =
              Number(
                item.producto
                  .precioVenta || 0
              );

            const importe =
              item.esObsequio
                ? 0
                : Number(
                    (
                      precio *
                      item.cantidad
                    ).toFixed(2)
                  );

            return `
              <tr>
                <td>
                  ${this.escapeHtml(
                    item.producto.nombre
                  )}
                  ${
                    item.esObsequio
                      ? '<small>OBSEQUIO</small>'
                      : ''
                  }
                </td>

                <td>
                  ${item.cantidad}
                </td>

                <td>
                  ${
                    item.esObsequio
                      ? 'S/ 0.00'
                      : dinero(precio)
                  }
                </td>

                <td>
                  ${dinero(importe)}
                </td>
              </tr>
            `;
          }
        )
        .join('');

    ventana.document.open();

    ventana.document.write(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8">

          <title>
            Recibo ${this.escapeHtml(
              venta.numeroVenta
            )}
          </title>

          <style>
            @page {
              size: 80mm auto;
              margin: 3mm;
            }

            * {
              box-sizing: border-box;
            }

            body {
              width: 74mm;
              margin: 0;
              color: #111827;
              background: #ffffff;
              font-family:
                Arial,
                Helvetica,
                sans-serif;
              font-size: 10px;
              -webkit-print-color-adjust:
                exact;
              print-color-adjust:
                exact;
            }

            .recibo {
              width: 100%;
            }

            .cabecera {
              padding-bottom: 8px;
              border-bottom:
                1px dashed #475467;
              text-align: center;
            }

            .logo {
              display: block;
              width: auto;
              max-width: 46mm;
              height: 12mm;
              margin: 0 auto 4px;
              object-fit: contain;
            }

            h1 {
              margin: 0;
              color: #1593c7;
              font-size: 16px;
            }

            .cabecera p {
              margin: 3px 0 0;
              line-height: 1.35;
            }

            .datos {
              padding: 8px 0;
              border-bottom:
                1px dashed #475467;
              line-height: 1.55;
            }

            table {
              width: 100%;
              margin: 8px 0;
              border-collapse:
                collapse;
              table-layout: fixed;
            }

            th,
            td {
              padding: 5px 2px;
              border-bottom:
                1px solid #e5e7eb;
              vertical-align: top;
            }

            th {
              font-size: 9px;
              text-align: right;
            }

            th:first-child,
            td:first-child {
              width: 45%;
              text-align: left;
            }

            td:not(:first-child) {
              text-align: right;
            }

            td small {
              display: block;
              margin-top: 2px;
              color: #067647;
              font-size: 8px;
              font-weight: 700;
            }

            .totales {
              display: grid;
              gap: 5px;
              padding-top: 5px;
            }

            .linea {
              display: flex;
              justify-content:
                space-between;
              gap: 10px;
            }

            .linea.total {
              margin-top: 3px;
              padding-top: 7px;
              border-top:
                1px dashed #475467;
              font-size: 14px;
              font-weight: 900;
            }

            .saldo {
              font-weight: 900;
            }

            .pie {
              margin-top: 10px;
              padding-top: 8px;
              border-top:
                1px dashed #475467;
              text-align: center;
              line-height: 1.45;
            }

            @media print {
              body {
                width: 74mm;
              }
            }
          </style>
        </head>

        <body>
          <main class="recibo">
            <header class="cabecera">
              ${
                logo
                  ? `
                    <img
                      class="logo"
                      src="${logo}"
                      alt="Óptica Alba"
                    >
                  `
                  : '<h1>ÓPTICA ALBA</h1>'
              }

              <p>
                JR. DOS DE MAYO 964<br>
                CEL. +51 926 474 267 · CAJAMARCA
              </p>
            </header>

            <section class="datos">
              <div>
                <strong>Recibo:</strong>
                ${this.escapeHtml(
                  venta.numeroVenta
                )}
              </div>

              <div>
                <strong>Fecha:</strong>
                ${this.escapeHtml(fecha)}
              </div>

              <div>
                <strong>Cliente:</strong>
                ${this.escapeHtml(cliente)}
              </div>

              <div>
                <strong>Método:</strong>
                ${this.escapeHtml(
                  metodoPago
                )}
              </div>

              <div>
                <strong>Estado:</strong>
                ${this.escapeHtml(
                  venta.estadoPago
                )}
              </div>
            </section>

            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cant.</th>
                  <th>P. unit.</th>
                  <th>Importe</th>
                </tr>
              </thead>

              <tbody>
                ${filas}
              </tbody>
            </table>

            <section class="totales">
              <div class="linea">
                <span>
                  Subtotal productos
                </span>
                <strong>
                  ${dinero(
                    resumen.subtotalProductos
                  )}
                </strong>
              </div>

              ${
                resumen.descuentoObsequios >
                0
                  ? `
                    <div class="linea">
                      <span>Obsequios</span>
                      <strong>
                        -${dinero(
                          resumen.descuentoObsequios
                        )}
                      </strong>
                    </div>
                  `
                  : ''
              }

              <div class="linea">
                <span>Descuento</span>
                <strong>
                  -${dinero(
                    resumen.descuentoManual
                  )}
                </strong>
              </div>

              <div class="linea">
                <span>
                  IGV incluido
                </span>
                <strong>
                  ${dinero(
                    resumen.igvIncluido
                  )}
                </strong>
              </div>

              <div class="linea total">
                <span>Total</span>
                <strong>
                  ${dinero(
                    venta.total
                  )}
                </strong>
              </div>

              <div class="linea">
                <span>A cuenta</span>
                <strong>
                  ${dinero(
                    venta.aCuenta
                  )}
                </strong>
              </div>

              <div class="linea saldo">
                <span>Saldo</span>
                <strong>
                  ${dinero(
                    venta.saldo
                  )}
                </strong>
              </div>
            </section>

            ${
              observacionesVenta.trim()
                ? `
                  <section class="datos">
                    <strong>Observaciones:</strong><br>
                    ${this.escapeHtml(
                      observacionesVenta
                    )}
                  </section>
                `
                : ''
            }

            <footer class="pie">
              Gracias por su compra.<br>
              Conserve este recibo.
            </footer>
          </main>

          <script>
            window.addEventListener(
              'load',
              () => {
                window.setTimeout(
                  () => {
                    window.focus();
                    window.print();
                  },
                  350
                );
              }
            );
          </script>
        </body>
      </html>
    `);

    ventana.document.close();
  }

  private async obtenerLogoRecibo():
    Promise<string> {
    const url =
      new URL(
        'assets/logo-optica-alba.png',
        document.baseURI
      ).toString();

    try {
      const respuesta =
        await fetch(url);

      if (!respuesta.ok) {
        return '';
      }

      const archivo =
        await respuesta.blob();

      return await new Promise<string>(
        resolve => {
          const lector =
            new FileReader();

          lector.onload = () =>
            resolve(
              String(
                lector.result || ''
              )
            );

          lector.onerror = () =>
            resolve('');

          lector.readAsDataURL(
            archivo
          );
        }
      );
    } catch {
      return '';
    }
  }

  private escapeHtml(
    valor: string
  ): string {
    return String(
      valor || ''
    )
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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