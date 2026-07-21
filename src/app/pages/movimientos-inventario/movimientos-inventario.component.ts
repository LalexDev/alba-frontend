import {
  Component,
  OnInit
} from '@angular/core';
import {
  firstValueFrom
} from 'rxjs';
import {
  utils,
  writeFileXLSX
} from 'xlsx';

import {
  Producto
} from '../../core/models/producto.model';
import {
  ProductoService
} from '../../core/services/producto.service';
import {
  MovimientoInventario,
  TipoMovimientoInventario,
  TipoMovimientoVista
} from '../../core/models/movimiento-inventario.model';
import {
  MovimientoInventarioService
} from '../../core/services/movimiento-inventario.service';

@Component({
  selector: 'app-movimientos-inventario',
  templateUrl:
    './movimientos-inventario.component.html',
  styleUrls: [
    './movimientos-inventario.component.css'
  ]
})
export class MovimientosInventarioComponent
implements OnInit {

  productos: Producto[] = [];
  movimientos: MovimientoInventario[] = [];

  productoId:
    number | null = null;

  tipoSeleccionado:
    TipoMovimientoVista = 'ENTRADA';

  cantidad = 1;
  motivo = 'Compra o reposición';
  observacion = '';

  usuarioResponsable =
    'Usuario responsable automático';

  cargando = false;
  guardando = false;

  error = '';
  ok = '';

  buscar = '';
  fechaDesde = '';
  fechaHasta = '';
  filtroTipo = 'TODOS';

  paginaActual = 1;
  elementosPorPagina = 10;

  readonly tiposFiltro = [
    {
      valor: 'TODOS',
      etiqueta: 'Todos los tipos'
    },
    {
      valor: 'ENTRADA',
      etiqueta: 'Entradas'
    },
    {
      valor: 'SALIDA',
      etiqueta: 'Salidas'
    },
    {
      valor: 'AJUSTE',
      etiqueta: 'Ajustes'
    }
  ];

  constructor(
    private productoService:
      ProductoService,
    private movimientoService:
      MovimientoInventarioService
  ) {}

  ngOnInit(): void {
    this.configurarFechasIniciales();
    void this.cargarTodo();
  }

  get productoSeleccionado():
    Producto | null {
    if (!this.productoId) {
      return null;
    }

    return (
      this.productos.find(
        producto =>
          producto.id ===
          Number(this.productoId)
      ) ?? null
    );
  }

  get motivosDisponibles():
    string[] {
    switch (
      this.tipoSeleccionado
    ) {
      case 'ENTRADA':
        return [
          'Compra o reposición',
          'Devolución de cliente',
          'Ingreso inicial',
          'Regularización de entrada',
          'Otro ingreso'
        ];

      case 'SALIDA':
        return [
          'Producto dañado',
          'Producto perdido',
          'Merma',
          'Devolución a proveedor',
          'Uso interno',
          'Otra salida'
        ];

      case 'AJUSTE':
        return [
          'Conteo físico',
          'Corrección de inventario',
          'Diferencia de stock',
          'Regularización',
          'Otro ajuste'
        ];
    }
  }

  get etiquetaCantidad():
    string {
    return this.tipoSeleccionado ===
      'AJUSTE'
      ? 'Nuevo stock'
      : 'Cantidad';
  }

  get ayudaCantidad():
    string {
    if (
      this.tipoSeleccionado ===
      'AJUSTE'
    ) {
      return (
        'Escribe la cantidad final que debe quedar ' +
        'en inventario.'
      );
    }

    return (
      'Cantidad de unidades que ingresan ' +
      'o salen del inventario.'
    );
  }

  get movimientosFiltrados():
    MovimientoInventario[] {
    const termino =
      this.normalizar(
        this.buscar
      );

    const desde =
      this.fechaDesde
        ? new Date(
            `${this.fechaDesde}T00:00:00`
          )
        : null;

    const hasta =
      this.fechaHasta
        ? new Date(
            `${this.fechaHasta}T23:59:59`
          )
        : null;

    return this.movimientos.filter(
      movimiento => {
        const coincideTexto =
          !termino ||
          this.normalizar(
            [
              movimiento.codigo,
              movimiento.producto,
              movimiento.motivo,
              movimiento.usuario
            ].join(' ')
          ).includes(termino);

        const fecha =
          new Date(
            movimiento.fecha
          );

        const coincideDesde =
          !desde ||
          fecha >= desde;

        const coincideHasta =
          !hasta ||
          fecha <= hasta;

        const coincideTipo =
          this.coincideFiltroTipo(
            movimiento.tipo
          );

        return (
          coincideTexto &&
          coincideDesde &&
          coincideHasta &&
          coincideTipo
        );
      }
    );
  }

  get totalPaginas():
    number {
    return Math.max(
      Math.ceil(
        this.movimientosFiltrados.length /
        this.elementosPorPagina
      ),
      1
    );
  }

  get movimientosPaginados():
    MovimientoInventario[] {
    if (
      this.paginaActual >
      this.totalPaginas
    ) {
      this.paginaActual =
        this.totalPaginas;
    }

    const inicio =
      (
        this.paginaActual -
        1
      ) *
      this.elementosPorPagina;

    return this.movimientosFiltrados.slice(
      inicio,
      inicio +
      this.elementosPorPagina
    );
  }

  get paginasVisibles():
    number[] {
    const total =
      this.totalPaginas;

    if (total <= 5) {
      return Array.from(
        {
          length: total
        },
        (
          _,
          indice
        ) =>
          indice + 1
      );
    }

    const inicio =
      Math.max(
        Math.min(
          this.paginaActual - 2,
          total - 4
        ),
        1
      );

    return Array.from(
      {
        length: 5
      },
      (
        _,
        indice
      ) =>
        inicio + indice
    );
  }

  get ultimoMovimientoSeleccionado():
    MovimientoInventario | null {
    if (!this.productoId) {
      return null;
    }

    return (
      this.movimientos.find(
        movimiento =>
          movimiento.productoId ===
          Number(this.productoId)
      ) ?? null
    );
  }

  get totalEntradas():
    number {
    return this.movimientos
      .filter(
        movimiento =>
          this.esEntrada(
            movimiento.tipo
          )
      )
      .reduce(
        (
          total,
          movimiento
        ) =>
          total +
          movimiento.cantidad,
        0
      );
  }

  get totalSalidas():
    number {
    return this.movimientos
      .filter(
        movimiento =>
          this.esSalida(
            movimiento.tipo
          )
      )
      .reduce(
        (
          total,
          movimiento
        ) =>
          total +
          movimiento.cantidad,
        0
      );
  }

  get totalAjustes():
    number {
    return this.movimientos.filter(
      movimiento =>
        this.esAjuste(
          movimiento.tipo
        )
    ).length;
  }

  get movimientosHoy():
    number {
    const hoy =
      new Date();

    return this.movimientos.filter(
      movimiento => {
        const fecha =
          new Date(
            movimiento.fecha
          );

        return (
          fecha.getFullYear() ===
            hoy.getFullYear() &&
          fecha.getMonth() ===
            hoy.getMonth() &&
          fecha.getDate() ===
            hoy.getDate()
        );
      }
    ).length;
  }

  async cargarTodo():
    Promise<void> {
    if (this.cargando) {
      return;
    }

    this.cargando = true;
    this.error = '';

    try {
      const [
        productos,
        movimientos
      ] =
        await Promise.all([
          firstValueFrom(
            this.productoService.listar()
          ),
          firstValueFrom(
            this.movimientoService.listar()
          )
        ]);

      this.productos =
        productos.filter(
          producto =>
            producto.estado
        );

      this.movimientos =
        movimientos;

      try {
        const usuario =
          await firstValueFrom(
            this.movimientoService
              .obtenerUsuarioResponsable()
          );

        this.usuarioResponsable =
          usuario.nombre;
      } catch (errorUsuario) {
        console.warn(
          'No se pudo cargar el usuario responsable:',
          errorUsuario
        );

        this.usuarioResponsable =
          'Usuario autenticado';
      }
    } catch (error) {
      console.error(
        'Error al cargar movimientos:',
        error
      );

      this.error =
        this.mensajeError(
          error,
          'No se pudieron cargar los movimientos de inventario.'
        );
    } finally {
      this.cargando = false;
    }
  }

  seleccionarTipo(
    tipo: TipoMovimientoVista
  ): void {
    if (this.guardando) {
      return;
    }

    this.tipoSeleccionado =
      tipo;

    this.motivo =
      this.motivosDisponibles[0];

    if (
      tipo === 'AJUSTE'
    ) {
      this.cantidad =
        this.productoSeleccionado
          ?.stockActual ?? 0;
    } else {
      this.cantidad = 1;
    }
  }

  seleccionarProducto():
    void {
    if (
      this.tipoSeleccionado ===
      'AJUSTE'
    ) {
      this.cantidad =
        this.productoSeleccionado
          ?.stockActual ?? 0;
    }

    this.error = '';
    this.ok = '';
  }

  async guardar():
    Promise<void> {
    if (this.guardando) {
      return;
    }

    const producto =
      this.productoSeleccionado;

    if (!producto) {
      this.error =
        'Selecciona un producto.';
      return;
    }

    const cantidad =
      Number(this.cantidad);

    const minimo =
      this.tipoSeleccionado ===
        'AJUSTE'
        ? 0
        : 1;

    if (
      !Number.isInteger(cantidad) ||
      cantidad < minimo
    ) {
      this.error =
        this.tipoSeleccionado ===
          'AJUSTE'
          ? 'El nuevo stock debe ser un número entero igual o mayor que cero.'
          : 'La cantidad debe ser un número entero mayor que cero.';

      return;
    }

    if (
      this.tipoSeleccionado ===
        'SALIDA' &&
      cantidad >
        producto.stockActual
    ) {
      this.error =
        'La salida no puede superar el stock disponible.';
      return;
    }

    if (
      this.tipoSeleccionado ===
        'AJUSTE' &&
      cantidad ===
        producto.stockActual
    ) {
      this.error =
        'El nuevo stock es igual al stock actual. No hay cambios que registrar.';
      return;
    }

    if (
      !this.motivo.trim()
    ) {
      this.error =
        'Selecciona un motivo.';
      return;
    }

    this.guardando = true;
    this.error = '';
    this.ok = '';

    const motivoCompleto =
      [
        this.motivo.trim(),
        this.observacion.trim()
      ]
        .filter(Boolean)
        .join(' — ');

    try {
      const resultado =
        await firstValueFrom(
          this.movimientoService.registrar({
            productoId:
              producto.id,
            tipo:
              this.tipoSeleccionado,
            cantidad,
            motivo:
              motivoCompleto
          })
        );

      const stockNuevo =
        Number(
          resultado.stockNuevo
        );

      if (
        Number.isFinite(stockNuevo)
      ) {
        producto.stockActual =
          stockNuevo;
      }

      this.ok =
        `Movimiento guardado. ` +
        `Stock anterior: ${Number(
          resultado.stockAnterior ??
          0
        )}; nuevo stock: ${Number(
          resultado.stockNuevo ??
          producto.stockActual
        )}.`;

      this.observacion = '';

      if (
        this.tipoSeleccionado ===
        'AJUSTE'
      ) {
        this.cantidad =
          producto.stockActual;
      } else {
        this.cantidad = 1;
      }

      this.movimientos =
        await firstValueFrom(
          this.movimientoService.listar()
        );

      this.paginaActual = 1;
    } catch (error) {
      console.error(
        'Error al registrar movimiento:',
        error
      );

      this.error =
        this.mensajeError(
          error,
          'No se pudo guardar el movimiento.'
        );
    } finally {
      this.guardando = false;
    }
  }

  limpiarFiltros():
    void {
    this.buscar = '';
    this.filtroTipo =
      'TODOS';

    this.configurarFechasIniciales();
    this.paginaActual = 1;
  }

  actualizarFiltros():
    void {
    this.paginaActual = 1;
  }

  irPagina(
    pagina: number
  ): void {
    if (
      pagina < 1 ||
      pagina >
        this.totalPaginas
    ) {
      return;
    }

    this.paginaActual =
      pagina;
  }

  exportarExcel():
    void {
    const filas =
      this.movimientosFiltrados.map(
        movimiento => ({
          Fecha:
            this.formatearFecha(
              movimiento.fecha
            ),
          Código:
            movimiento.codigo,
          Producto:
            movimiento.producto,
          Tipo:
            this.tipoEtiqueta(
              movimiento.tipo
            ),
          Cantidad:
            movimiento.cantidad,
          'Stock anterior':
            movimiento.stockAnterior,
          'Stock posterior':
            movimiento.stockNuevo,
          Motivo:
            movimiento.motivo,
          Usuario:
            movimiento.usuario,
          Referencia:
            movimiento.referenciaTipo ||
            'MANUAL'
        })
      );

    if (!filas.length) {
      this.error =
        'No hay movimientos para exportar.';
      return;
    }

    const hoja =
      utils.json_to_sheet(
        filas
      );

    hoja['!cols'] = [
      { wch: 21 },
      { wch: 18 },
      { wch: 34 },
      { wch: 20 },
      { wch: 12 },
      { wch: 16 },
      { wch: 16 },
      { wch: 38 },
      { wch: 28 },
      { wch: 18 }
    ];

    const libro =
      utils.book_new();

    utils.book_append_sheet(
      libro,
      hoja,
      'Movimientos'
    );

    writeFileXLSX(
      libro,
      `movimientos-inventario-${this.fechaArchivo()}.xlsx`
    );

    this.ok =
      `${filas.length} movimiento(s) exportado(s) a Excel.`;
  }

  exportarPdf():
    void {
    const movimientos =
      this.movimientosFiltrados;

    if (!movimientos.length) {
      this.error =
        'No hay movimientos para generar el PDF.';
      return;
    }

    const ventana =
      window.open(
        '',
        '_blank',
        'width=1100,height=780'
      );

    if (!ventana) {
      this.error =
        'El navegador bloqueó la ventana del PDF.';
      return;
    }

    const filas =
      movimientos.map(
        movimiento => `
          <tr>
            <td>
              ${this.escapeHtml(
                this.formatearFecha(
                  movimiento.fecha
                )
              )}
            </td>
            <td>
              ${this.escapeHtml(
                movimiento.codigo
              )}
            </td>
            <td>
              ${this.escapeHtml(
                movimiento.producto
              )}
            </td>
            <td>
              ${this.escapeHtml(
                this.tipoEtiqueta(
                  movimiento.tipo
                )
              )}
            </td>
            <td>
              ${movimiento.cantidad}
            </td>
            <td>
              ${movimiento.stockAnterior}
            </td>
            <td>
              ${movimiento.stockNuevo}
            </td>
            <td>
              ${this.escapeHtml(
                movimiento.motivo
              )}
            </td>
            <td>
              ${this.escapeHtml(
                movimiento.usuario
              )}
            </td>
          </tr>
        `
      ).join('');

    ventana.document.write(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8">
          <title>Historial de movimientos</title>

          <style>
            @page {
              size: A4 landscape;
              margin: 12mm;
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              color: #111827;
              font-family:
                Arial,
                sans-serif;
            }

            header {
              display: flex;
              align-items: flex-end;
              justify-content: space-between;
              gap: 16px;
              margin-bottom: 18px;
              padding-bottom: 12px;
              border-bottom:
                2px solid #1593c7;
            }

            h1 {
              margin: 0;
              color: #0e78a5;
              font-size: 23px;
            }

            p {
              margin: 5px 0 0;
              color: #475467;
              font-size: 11px;
            }

            .count {
              color: #0e78a5;
              font-size: 12px;
              font-weight: 700;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }

            th,
            td {
              padding: 7px 5px;
              border: 1px solid #d0d5dd;
              font-size: 8.5px;
              vertical-align: top;
              overflow-wrap: anywhere;
            }

            th {
              color: #ffffff;
              background: #1593c7;
              text-align: left;
            }

            tr:nth-child(even) {
              background: #f4fbfe;
            }
          </style>
        </head>

        <body>
          <header>
            <div>
              <h1>
                Movimientos de inventario
              </h1>

              <p>
                Óptica Alba · Historial filtrado
              </p>
            </div>

            <div class="count">
              ${movimientos.length}
              registro(s)
            </div>
          </header>

          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Código</th>
                <th>Producto</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Stock ant.</th>
                <th>Stock post.</th>
                <th>Motivo</th>
                <th>Usuario</th>
              </tr>
            </thead>

            <tbody>
              ${filas}
            </tbody>
          </table>

          <script>
            window.addEventListener(
              'load',
              () => {
                window.setTimeout(
                  () => window.print(),
                  250
                );
              }
            );
          </script>
        </body>
      </html>
    `);

    ventana.document.close();

    this.ok =
      'Historial preparado para imprimir o guardar como PDF.';
  }

  tipoEtiqueta(
    tipo: TipoMovimientoInventario
  ): string {
    const etiquetas:
      Record<
        TipoMovimientoInventario,
        string
      > = {
        ENTRADA_COMPRA:
          'Entrada',
        SALIDA_VENTA:
          'Salida por venta',
        AJUSTE_ENTRADA:
          'Ajuste de entrada',
        AJUSTE_SALIDA:
          'Ajuste de salida',
        ANULACION_VENTA:
          'Anulación de venta',
        ANULACION_COMPRA:
          'Anulación de compra',
        DEVOLUCION_CLIENTE:
          'Devolución de cliente',
        DEVOLUCION_PROVEEDOR:
          'Devolución a proveedor'
      };

    return etiquetas[tipo] ??
      tipo;
  }

  tipoClase(
    tipo: TipoMovimientoInventario
  ): string {
    if (
      this.esEntrada(tipo)
    ) {
      return 'entrada';
    }

    if (
      this.esSalida(tipo)
    ) {
      return 'salida';
    }

    return 'ajuste';
  }

  cambioMovimiento(
    movimiento:
      MovimientoInventario
  ): string {
    const diferencia =
      movimiento.stockNuevo -
      movimiento.stockAnterior;

    return diferencia > 0
      ? `+${diferencia}`
      : String(diferencia);
  }

  productoBajoStock(
    producto:
      Producto | null
  ): boolean {
    if (!producto) {
      return false;
    }

    return (
      Number(
        producto.stockActual
      ) <=
      Number(
        producto.stockMinimo
      )
    );
  }

  trackMovimiento(
    _indice: number,
    movimiento:
      MovimientoInventario
  ): number {
    return movimiento.id;
  }

  private coincideFiltroTipo(
    tipo: TipoMovimientoInventario
  ): boolean {
    switch (
      this.filtroTipo
    ) {
      case 'ENTRADA':
        return this.esEntrada(
          tipo
        );

      case 'SALIDA':
        return this.esSalida(
          tipo
        );

      case 'AJUSTE':
        return this.esAjuste(
          tipo
        );

      default:
        return true;
    }
  }

  private esEntrada(
    tipo: TipoMovimientoInventario
  ): boolean {
    return [
      'ENTRADA_COMPRA',
      'AJUSTE_ENTRADA',
      'ANULACION_VENTA',
      'DEVOLUCION_CLIENTE'
    ].includes(tipo);
  }

  private esSalida(
    tipo: TipoMovimientoInventario
  ): boolean {
    return [
      'SALIDA_VENTA',
      'AJUSTE_SALIDA',
      'ANULACION_COMPRA',
      'DEVOLUCION_PROVEEDOR'
    ].includes(tipo);
  }

  private esAjuste(
    tipo: TipoMovimientoInventario
  ): boolean {
    return [
      'AJUSTE_ENTRADA',
      'AJUSTE_SALIDA'
    ].includes(tipo);
  }

  private configurarFechasIniciales():
    void {
    const hasta =
      new Date();

    const desde =
      new Date();

    desde.setDate(
      desde.getDate() - 30
    );

    this.fechaDesde =
      this.fechaInput(desde);

    this.fechaHasta =
      this.fechaInput(hasta);
  }

  private fechaInput(
    fecha: Date
  ): string {
    return [
      fecha.getFullYear(),
      String(
        fecha.getMonth() + 1
      ).padStart(2, '0'),
      String(
        fecha.getDate()
      ).padStart(2, '0')
    ].join('-');
  }

  private fechaArchivo():
    string {
    return this.fechaInput(
      new Date()
    );
  }

  private formatearFecha(
    valor: string
  ): string {
    const fecha =
      new Date(valor);

    if (
      Number.isNaN(
        fecha.getTime()
      )
    ) {
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

  private normalizar(
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

  private mensajeError(
    error: unknown,
    respaldo: string
  ): string {
    if (
      error instanceof Error
    ) {
      return error.message;
    }

    if (
      error &&
      typeof error === 'object' &&
      'message' in error
    ) {
      return String(
        (
          error as {
            message?: unknown;
          }
        ).message ||
        respaldo
      );
    }

    return respaldo;
  }

  private escapeHtml(
    valor: string
  ): string {
    return String(
      valor || ''
    )
      .replace(
        /&/g,
        '&amp;'
      )
      .replace(
        /</g,
        '&lt;'
      )
      .replace(
        />/g,
        '&gt;'
      )
      .replace(
        /"/g,
        '&quot;'
      )
      .replace(
        /'/g,
        '&#039;'
      );
  }
}
