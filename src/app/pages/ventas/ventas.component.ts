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
import {
  Producto,
  ResultadoBusquedaEscanerProducto
} from '../../core/models/producto.model';

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

interface RecetaClienteVenta {
  id_receta: number;
  numero_orden?: string | null;
  fecha_entrada?: string | null;
  fecha_receta?: string | null;
  lejos_od_esfera?: number | null;
  lejos_od_cilindro?: number | null;
  lejos_od_eje?: number | null;
  lejos_oi_esfera?: number | null;
  lejos_oi_cilindro?: number | null;
  lejos_oi_eje?: number | null;
  lejos_dip?: number | null;
  adicion_od?: number | null;
  adicion_oi?: number | null;
  agudeza_visual_od?: string | null;
  agudeza_visual_oi?: string | null;
  diagnostico?: string | null;
  tipo_lente?: string | null;
  observaciones?: string | null;
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

  conceptoManual = '';
  costoManual: number | null = null;

  private secuenciaLinea = 0;
  private productosCache:
    Producto[] | null = null;

  mostrarSelectorMontura = false;

  coincidenciasMontura:
    Producto[] = [];

  lecturaMonturaPendiente = '';

  seleccionandoMontura = false;

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

  recetaCliente:
    RecetaClienteVenta | null = null;

  cargandoRecetaCliente = false;

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

    if (
      this.procesandoVenta ||
      this.seleccionandoMontura
    ) {
      return;
    }

    this.mensaje =
      'Buscando producto...';

    this.productoService
      .buscarParaVentaPorEscaneo(
        valor
      )
      .subscribe({
        next:
          (
            resultado:
              ResultadoBusquedaEscanerProducto
          ) => {
            const productos =
              resultado.productos || [];

            if (!productos.length) {
              this.mensaje =
                'Producto no encontrado.';

              this.limpiarCodigoYEnfocar();
              return;
            }

            /*
             * Flujo rápido:
             * - código único: se agrega directamente;
             * - una sola coincidencia por medida: también se agrega directamente;
             * - varias coincidencias: recién se abre el selector.
             */
            if (
              resultado.tipo === 'CODIGO_UNICO' ||
              productos.length === 1
            ) {
              const agregado =
                this.agregarProductoAlCarrito(
                  productos[0]
                );

              if (agregado) {
                this.mensaje =
                  'Producto agregado. Listo para escanear el siguiente.';
              }

              this.limpiarCodigoYEnfocar();
              return;
            }

            this.lecturaMonturaPendiente =
              resultado.valorEscaneado;

            this.coincidenciasMontura =
              productos;

            this.mostrarSelectorMontura =
              true;

            this.codigo = '';

            this.mensaje =
              'Hay varias monturas con esa medida. Selecciona la que tienes físicamente.';
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

  seleccionarMonturaEscaneada(
    producto: Producto
  ): void {
    if (
      this.seleccionandoMontura ||
      this.procesandoVenta
    ) {
      return;
    }

    this.seleccionandoMontura =
      true;

    try {
      const agregado =
        this.agregarProductoAlCarrito(
          producto
        );

      if (!agregado) {
        return;
      }

      /*
       * IMPORTANTE:
       * se cierra inmediatamente el selector después de elegir
       * la montura. Antes no se cerraba porque cerrarSelectorMontura()
       * retornaba cuando seleccionandoMontura era true.
       */
      this.mostrarSelectorMontura =
        false;

      this.coincidenciasMontura =
        [];

      this.lecturaMonturaPendiente =
        '';

      this.codigo = '';

      this.mensaje =
        'Montura agregada. Listo para escanear el siguiente producto.';
    } finally {
      this.seleccionandoMontura =
        false;

      this.focusInput();
    }
  }

  cerrarSelectorMontura(
    enfocar:
      boolean = true
  ): void {
    this.mostrarSelectorMontura =
      false;

    this.coincidenciasMontura =
      [];

    this.lecturaMonturaPendiente =
      '';

    this.codigo = '';

    if (enfocar) {
      this.focusInput();
    }
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

    if (item.esManual) {
      item.cantidad =
        nuevaCantidad;

      this.actualizarSubtotal(item);
      this.ajustarMontosAlTotal();

      this.mensaje =
        'Cantidad del concepto actualizada.';

      return;
    }

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

    if (item.esManual) {
      item.cantidad =
        cantidadNueva;

      this.actualizarSubtotal(item);
      this.ajustarMontosAlTotal();

      this.mensaje =
        'Cantidad del concepto actualizada.';

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

    this.conceptoManual = '';
    this.costoManual = null;

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
        : item.esManual
          ? 'Concepto personalizado retirado.'
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

  get pagoPorSeguro(): boolean {
    return this.metodoPago ===
      'SEGURO';
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
    if (this.pagoPorSeguro) {
      this.aCuenta =
        this.totalFinal();

      return;
    }

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

  get estadoPagoVista():
    'PENDIENTE' |
    'PARCIAL' |
    'PAGADO' {
    const total = this.totalFinal();
    const pago = Number(this.aCuenta || 0);

    if (total > 0 && pago >= total) {
      return 'PAGADO';
    }

    if (pago > 0) {
      return 'PARCIAL';
    }

    return 'PENDIENTE';
  }

  get clienteTieneReceta(): boolean {
    return Boolean(this.recetaCliente);
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

    if (
      metodo === 'SEGURO'
    ) {
      this.aCuenta =
        this.totalFinal();

      this.mensaje =
        'El seguro cubrirá la totalidad de la venta.';
    }
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

  agregarConceptoManual(): void {
    if (this.procesandoVenta) {
      return;
    }

    const descripcion =
      String(
        this.conceptoManual || ''
      )
        .replace(/\s+/g, ' ')
        .trim();

    const costo =
      Number(this.costoManual);

    if (descripcion.length < 3) {
      this.mensaje =
        'Escribe el nombre de las lunas, producto o servicio.';
      return;
    }

    if (
      !Number.isFinite(costo) ||
      costo <= 0
    ) {
      this.mensaje =
        'Ingresa un costo mayor que S/ 0.00.';
      return;
    }

    if (costo > 999999.99) {
      this.mensaje =
        'El costo ingresado es demasiado alto.';
      return;
    }

    const precio =
      Number(costo.toFixed(2));

    const idManual =
      -(
        Date.now() +
        this.secuenciaLinea +
        1
      );

    const productoManual:
      Producto = {
      id: idManual,
      codigoInterno:
        'CONCEPTO-MANUAL',
      codigoBarras: '',
      nombre: descripcion,
      descripcion:
        'Concepto agregado manualmente durante la venta.',
      precioVenta: precio,
      stockActual:
        Number.MAX_SAFE_INTEGER,
      stockMinimo: 0,
      estado: true
    };

    const item:
      ItemVenta = {
      idLinea:
        this.crearIdLinea(),
      producto:
        productoManual,
      cantidad: 1,
      subtotal: precio,
      esManual: true,
      descripcionManual:
        descripcion,
      precioManual: precio
    };

    this.carrito.push(item);

    this.conceptoManual = '';
    this.costoManual = null;

    this.ajustarMontosAlTotal();

    this.mensaje =
      `${descripcion} agregado a la compra por S/ ${precio.toFixed(2)}.`;

    this.focusInput();
  }

  hayMonturaEnCarrito(): boolean {
    return this.carrito.some(
      item =>
        !item.esObsequio &&
        !item.esManual &&
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

  /**
   * El líquido promocional se maneja como obsequio genérico
   * para no obligar a cambiar TipoObsequioVenta si actualmente
   * el modelo solo contiene MICROFIBRA y ESTUCHE.
   */
  liquidoGratisSeleccionado(): boolean {
    return this.carrito.some(
      item =>
        Boolean(item.esObsequio) &&
        !item.tipoObsequio &&
        this.esLiquido(
          item.producto
        )
    );
  }

  async cambiarLiquidoGratis(
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
              !item.tipoObsequio &&
              this.esLiquido(
                item.producto
              )
            )
        );

      this.ajustarMontosAlTotal();

      this.mensaje =
        'Líquido gratuito retirado.';

      this.focusInput();
      return;
    }

    if (
      !this.hayMonturaEnCarrito()
    ) {
      checkbox.checked = false;

      this.mensaje =
        'Primero agrega una montura a la venta.';

      this.focusInput();
      return;
    }

    try {
      const producto =
        await this.buscarProductoEspecial(
          'LIQUIDO'
        );

      if (!producto) {
        checkbox.checked = false;

        this.mensaje =
          'No se encontró un líquido o limpiador activo con stock.';

        return;
      }

      const agregado =
        this.agregarProductoAlCarrito(
          producto,
          true
        );

      if (!agregado) {
        checkbox.checked = false;
        return;
      }

      this.mensaje =
        'Líquido agregado gratis con la montura.';
    } catch (error) {
      checkbox.checked = false;

      this.mensaje =
        error instanceof Error
          ? error.message
          : 'No se pudo agregar el líquido gratuito.';
    } finally {
      this.focusInput();
    }
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

      await this.cargarRecetaCliente(
        this.clienteId
      );

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

          await this.cargarRecetaCliente(
            this.clienteId
          );

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

      this.recetaCliente = null;

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

    this.recetaCliente = null;

    this.busquedaCliente = '';

    this.mensaje =
      'La venta continuará sin cliente.';

    this.focusInput();
  }

  /* =====================================================
     RECETA DEL CLIENTE
     ===================================================== */

  async cargarRecetaCliente(
    clienteId: number | null
  ): Promise<void> {
    this.recetaCliente = null;

    if (!clienteId) {
      return;
    }

    this.cargandoRecetaCliente = true;

    try {
      const { data, error } =
        await this.supabaseService.client
          .from('recetas_opticas')
          .select(`
            id_receta,
            numero_orden,
            fecha_entrada,
            fecha_receta,
            lejos_od_esfera,
            lejos_od_cilindro,
            lejos_od_eje,
            lejos_oi_esfera,
            lejos_oi_cilindro,
            lejos_oi_eje,
            lejos_dip,
            adicion_od,
            adicion_oi,
            agudeza_visual_od,
            agudeza_visual_oi,
            diagnostico,
            tipo_lente,
            observaciones
          `)
          .eq('id_cliente', clienteId)
          .eq('vigente', true)
          .order('fecha_entrada', {
            ascending: false
          })
          .limit(1)
          .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      this.recetaCliente =
        (data || null) as
          RecetaClienteVenta | null;
    } catch (error) {
      console.error(
        'Error al consultar receta:',
        error
      );

      this.mensaje =
        'El cliente fue seleccionado, pero no se pudo consultar su receta.';
    } finally {
      this.cargandoRecetaCliente = false;
    }
  }

  imprimirRecetaCliente(): void {
    if (
      !this.clienteId ||
      !this.clienteSeleccionadoNombre
    ) {
      this.mensaje =
        'Selecciona primero un cliente.';
      return;
    }

    const ventana = window.open(
      '',
      '_blank',
      'width=620,height=720'
    );

    if (!ventana) {
      this.mensaje =
        'El navegador bloqueó la ventana de impresión.';
      return;
    }

    void this.generarRecetaCliente(ventana);
  }

  private async generarRecetaCliente(
    ventana: Window
  ): Promise<void> {
    const logo = await this.obtenerLogoRecibo();
    const receta = this.recetaCliente;

    const fechaBase = String(
      receta?.fecha_entrada ||
      receta?.fecha_receta ||
      this.fechaIsoActual()
    );

    const partes = fechaBase.split('-');
    const anio = partes[0] || '—';
    const mes = partes[1] || '—';
    const dia = partes[2] || '—';

    const grad = (
      valor: number | null | undefined
    ): string => {
      if (
        valor === null ||
        valor === undefined ||
        Number.isNaN(Number(valor))
      ) {
        return '';
      }

      const numero = Number(valor);
      return numero > 0
        ? `+${numero}`
        : String(numero);
    };

    const text = (
      valor: string | number | null | undefined
    ): string =>
      valor === null || valor === undefined
        ? ''
        : this.escapeHtml(String(valor));

    const observaciones =
      receta?.observaciones ||
      (receta ? '' : 'Receta pendiente de completar.');

    ventana.document.open();
    ventana.document.write(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Receta ${this.escapeHtml(this.clienteSeleccionadoNombre)}</title>

          <style>
            @page { size: 70mm 70mm; margin: 0; }
            * { box-sizing: border-box; }
            html, body { margin: 0; min-height: 100%; }
            body {
              display: flex;
              justify-content: center;
              padding: 22px;
              color: #11344e;
              background: #edf7fb;
              font-family: Arial, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .receta {
              width: 70mm;
              height: 70mm;
              padding: 1.8mm;
              overflow: hidden;
              border: .45mm solid #1593c7;
              border-radius: 4mm;
              background: #fff;
              box-shadow: 0 12px 34px rgba(15,74,96,.18);
            }
            .marca { text-align: center; }
            .logo { max-width: 38mm; height: 7mm; object-fit: contain; }
            .logo-fallback { color: #1593c7; font-size: 9pt; font-weight: 900; }
            .contacto { margin-top: .2mm; color: #147ca8; font-size: 4pt; font-weight: 800; white-space: nowrap; }
            h1 { margin: .65mm 0 .45mm; color: #126f98; font-size: 5.9pt; letter-spacing: .24em; text-align: center; }
            .fecha { width: 29mm; margin: 0 auto .65mm; overflow: hidden; border: .2mm solid #1593c7; border-radius: 1.5mm; }
            .fecha-row { display: grid; grid-template-columns: repeat(3,1fr); text-align: center; }
            .fecha-head { color:#fff; background:#1593c7; font-size:4.3pt; font-weight:900; }
            .fecha-values { font-size:4.7pt; font-weight:900; }
            .fecha span { padding:.35mm .15mm; border-right:.16mm solid #1593c7; }
            .fecha span:last-child { border-right:0; }
            .cliente { display:flex; gap:1mm; margin-bottom:.6mm; font-size:4.9pt; }
            .cliente strong { color:#126f98; }
            .cliente span { flex:1; overflow:hidden; border-bottom:.18mm solid #1593c7; text-overflow:ellipsis; white-space:nowrap; }
            .cristales { margin-bottom:.3mm; padding:.28mm; color:#fff; background:#1593c7; font-size:4.3pt; font-weight:900; letter-spacing:.3em; text-align:center; }
            .grad { display:grid; grid-template-columns:5.2mm 1fr; gap:.45mm; }
            .lateral { display:grid; place-items:center; border-radius:1.2mm; color:#fff; background:#1593c7; font-size:4.1pt; font-weight:900; writing-mode:vertical-rl; transform:rotate(180deg); }
            table { width:100%; border-collapse:separate; border-spacing:.45mm .35mm; table-layout:fixed; }
            th,td { height:3.5mm; padding:.2mm; overflow:hidden; border:.16mm solid #78c6e5; border-radius:.7mm; font-size:4.5pt; line-height:1; text-align:center; white-space:nowrap; }
            thead th, tbody th { border:0; color:#126f98; background:transparent; font-weight:900; }
            .dip { display:flex; gap:1mm; margin:.25mm 0 .5mm 5.8mm; font-size:4.6pt; }
            .dip strong { color:#126f98; }
            .dip span { flex:1; max-width:25mm; border-bottom:.16mm solid #1593c7; }
            .extras { display:grid; grid-template-columns:repeat(2,1fr); gap:.35mm .55mm; }
            .extra,.linea { overflow:hidden; border:.15mm solid #9fd7ec; border-radius:.7mm; font-size:3.95pt; line-height:1.05; }
            .extra { min-height:2.8mm; padding:.28mm .45mm; }
            .extra strong,.linea strong { color:#126f98; font-size:3.6pt; text-transform:uppercase; }
            .linea { min-height:3.35mm; margin-top:.35mm; padding:.32mm .45mm; }
            .observaciones { min-height:5.2mm; max-height:5.2mm; }
            @media print {
              html,body { width:70mm!important; height:70mm!important; }
              body { display:block; padding:0; background:#fff; }
              .receta { margin:0; box-shadow:none; }
            }
          </style>
        </head>

        <body>
          <main class="receta">
            <header class="marca">
              ${logo ? `<img class="logo" src="${logo}" alt="Óptica Alba">` : '<div class="logo-fallback">ÓPTICA ALBA</div>'}
              <div class="contacto">JR. DOS DE MAYO 964 · CEL. +51 926 474 267 · CAJAMARCA</div>
            </header>

            <h1>ORDEN DE TRABAJO</h1>

            <section class="fecha">
              <div class="fecha-row fecha-head"><span>DÍA</span><span>MES</span><span>AÑO</span></div>
              <div class="fecha-row fecha-values"><span>${this.escapeHtml(dia)}</span><span>${this.escapeHtml(mes)}</span><span>${this.escapeHtml(anio)}</span></div>
            </section>

            <section class="cliente"><strong>Cliente:</strong><span>${this.escapeHtml(this.clienteSeleccionadoNombre)}</span></section>
            <div class="cristales">CRISTALES</div>

            <section class="grad">
              <div class="lateral">LEJOS</div>
              <table>
                <thead><tr><th></th><th>ESF.</th><th>CYL.</th><th>EJE</th></tr></thead>
                <tbody>
                  <tr><th>OD:</th><td>${grad(receta?.lejos_od_esfera)}</td><td>${grad(receta?.lejos_od_cilindro)}</td><td>${text(receta?.lejos_od_eje)}</td></tr>
                  <tr><th>OI:</th><td>${grad(receta?.lejos_oi_esfera)}</td><td>${grad(receta?.lejos_oi_cilindro)}</td><td>${text(receta?.lejos_oi_eje)}</td></tr>
                </tbody>
              </table>
            </section>

            <div class="dip"><strong>DIP:</strong><span>${text(receta?.lejos_dip)}</span></div>

            <section class="extras">
              <div class="extra"><strong>Adic. OD</strong> ${grad(receta?.adicion_od)}</div>
              <div class="extra"><strong>Adic. OI</strong> ${grad(receta?.adicion_oi)}</div>
              <div class="extra"><strong>AV OD</strong> ${text(receta?.agudeza_visual_od)}</div>
              <div class="extra"><strong>AV OI</strong> ${text(receta?.agudeza_visual_oi)}</div>
            </section>

            <section class="linea"><strong>Diagnóstico:</strong> ${text(receta?.diagnostico)}</section>
            <section class="linea"><strong>Tipo de lente / lunas:</strong> ${text(receta?.tipo_lente)}</section>
            <section class="linea observaciones"><strong>Observaciones:</strong> ${this.escapeHtml(observaciones)}</section>
          </main>

          <script>
            window.addEventListener('load', () => {
              setTimeout(() => { window.focus(); window.print(); }, 350);
            });
          </script>
        </body>
      </html>
    `);
    ventana.document.close();

    this.mensaje = receta
      ? 'Receta preparada para imprimir.'
      : 'Se preparó una receta en blanco para el cliente.';
  }

  private fechaIsoActual(): string {
    const fecha = new Date();
    return [
      fecha.getFullYear(),
      String(fecha.getMonth() + 1).padStart(2, '0'),
      String(fecha.getDate()).padStart(2, '0')
    ].join('-');
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
      this.pagoPorSeguro
        ? totalVenta
        : Number(
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
            this.conceptoManual = '';
            this.costoManual = null;
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

    if (this.pagoPorSeguro) {
      this.aCuenta =
        this.totalFinal();

      return;
    }

    if (
      this.aCuenta >
      this.totalFinal()
    ) {
      this.aCuenta =
        this.totalFinal();
    }
  }

  private esLiquido(
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
      texto.includes('liquido') ||
      texto.includes('limpiador') ||
      texto.includes('spray')
    );
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
                      : item.esManual
                        ? '<small>CONCEPTO PERSONALIZADO</small>'
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

            html,
            body {
              min-height: 100%;
              margin: 0;
            }

            body {
              display: flex;
              justify-content: center;
              padding: 24px;
              color: #111827;
              background: #edf5f8;
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
              width: 74mm;
              margin: 0 auto;
              padding: 3mm;
              border: 1px solid #d0d5dd;
              border-radius: 3mm;
              background: #ffffff;
              box-shadow:
                0 12px 34px
                rgba(15, 23, 42, 0.16);
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
              html,
              body {
                width: auto;
                min-height: auto;
              }

              body {
                display: block;
                padding: 0;
                background: #ffffff;
              }

              .recibo {
                width: 74mm;
                margin: 0 auto;
                padding: 2.5mm;
                border: 0;
                border-radius: 0;
                box-shadow: none;
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
                <span>Pago recibido</span>
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

    this.recetaCliente = null;
    this.cargandoRecetaCliente = false;

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