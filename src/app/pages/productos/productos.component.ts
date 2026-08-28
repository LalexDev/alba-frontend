import {
  Component,
  OnInit
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators
} from '@angular/forms';
import {
  finalize,
  forkJoin,
  of,
  switchMap
} from 'rxjs';

import {
  utils,
  writeFileXLSX
} from 'xlsx';

import {
  Categoria,
  Marca,
  Producto,
  ProductoEdicionVendedorRequest,
  ProductoRequest,
  Proveedor,
  ResultadoRegistroProducto
} from '../../core/models/producto.model';

import {
  ProductoService
} from '../../core/services/producto.service';

import {
  TokenService
} from '../../core/services/token.service';

interface ProductoInventario extends Producto {
  claveInventario: string;
  productosAgrupados: Producto[];
  cantidadModelos: number;
  modelosRegistrados: string[];
  sexosRegistrados: string[];
  nombresRegistrados: string[];
  proveedoresRegistrados: string[];
  precioCompraMin: number;
  precioCompraMax: number;
  precioVentaMin: number;
  precioVentaMax: number;
}

@Component({
  selector: 'app-productos',
  templateUrl: './productos.component.html',
  styleUrls: ['./productos.component.css']
})
export class ProductosComponent
  implements OnInit {

  readonly categoriaOtros = 'OTROS';

  productos: Producto[] = [];
  categorias: Categoria[] = [];
  marcas: Marca[] = [];
  proveedores: Proveedor[] = [];

  mostrarNuevaMarca = false;
  guardandoMarca = false;
  mensajeMarca = '';
  errorMarca = '';

  mensajeLecturaEscaner = '';

  search = '';
  error = '';
  ok = '';

  mostrarFormulario = false;
  guardando = false;
  cargando = false;
  mostrarSoloBajoStock = false;

  modoEdicion = false;
  productoEditando:
    Producto | null = null;

  mostrarDetalle = false;
  productoSeleccionado:
    Producto | null = null;

  mostrarConfirmacionEliminar = false;
  productoPorEliminar:
    Producto | null = null;
  eliminando = false;

  marcaSeleccionada = 'TODAS';
  categoriaSeleccionada = 'TODAS';

  paginaActual = 1;
  readonly tamanioPagina = 10;

  form: FormGroup;

  constructor(
    private productoService:
      ProductoService,
    private tokenService:
      TokenService,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      codigoBarras: [''],

      nombre: [
        '',
        Validators.required
      ],

      categoriaId: [
        null,
        Validators.required
      ],

      nuevaCategoria: [''],

      marcaId: [
        null,
        Validators.required
      ],
      nuevaMarca: [''],
      modelo: [''],
      color: [''],
      medida: [''],
      material: [''],
      sexo: [null],

      precioCompra: [
        0,
        [
          Validators.required,
          Validators.min(0)
        ]
      ],

      precioVenta: [
        0,
        [
          Validators.required,
          Validators.min(0.01)
        ]
      ],

      stockActual: [
        1,
        [
          Validators.required,
          Validators.min(1)
        ]
      ],

      stockMinimo: [
        5,
        [
          Validators.required,
          Validators.min(0)
        ]
      ],

      proveedorId: [
        null,
        Validators.required
      ],

      fechaIngreso: [
        this.fechaActual()
      ],

      estado: [
        'ACTIVO'
      ],

      descripcion: ['']
    });
  }

  ngOnInit(): void {
    this.configurarCategoriaOtros();
    this.configurarValidacionesCategoria();
    this.cargarTodo();
  }

  get esAdministrador(): boolean {
    return this.tokenService.getRole() ===
      'ADMINISTRADOR';
  }

  get esVendedor(): boolean {
    return this.tokenService.getRole() ===
      'VENDEDOR';
  }

  get edicionLimitadaVendedor(): boolean {
    return (
      this.esVendedor &&
      this.modoEdicion &&
      Boolean(this.productoEditando)
    );
  }

  get inventarioPorMarca(): ProductoInventario[] {
    const grupos = new Map<
      string,
      Producto[]
    >();

    for (const producto of this.productos) {
      const categoriaId =
        producto.categoria?.id ?? 0;
      const marcaId =
        producto.marca?.id ?? 0;

      /*
       * La vista de inventario se agrupa por
       * categoría + marca. Los modelos siguen
       * guardados individualmente en productos,
       * pero el stock mostrado es la suma de todos.
       */
      const clave = marcaId
        ? `${categoriaId}-${marcaId}`
        : `${categoriaId}-SIN-MARCA-${producto.id}`;

      const lista = grupos.get(clave) ?? [];
      lista.push(producto);
      grupos.set(clave, lista);
    }

    return Array.from(grupos.entries())
      .map(([clave, productos]) =>
        this.crearInventarioMarca(
          clave,
          productos
        )
      )
      .sort((a, b) => {
        const porCategoria =
          String(
            a.categoria?.nombre || ''
          ).localeCompare(
            String(
              b.categoria?.nombre || ''
            ),
            'es',
            { sensitivity: 'base' }
          );

        if (porCategoria !== 0) {
          return porCategoria;
        }

        return String(
          a.marca?.nombre || a.nombre
        ).localeCompare(
          String(
            b.marca?.nombre || b.nombre
          ),
          'es',
          { sensitivity: 'base' }
        );
      });
  }

  /**
   * Cantidad de registros de la categoría Monturas.
   *
   * Este valor debe coincidir con COUNT(*) de Supabase
   * para la categoría Monturas.
   *
   * Con los datos actuales:
   * - 1722 registros de monturas
   * - 1890 unidades físicas en stock
   */
  get totalMonturasRegistradas(): number {
    return this.productos.filter(
      producto =>
        producto.estado &&
        this.esProductoMontura(
          producto
        )
    ).length;
  }

  /**
   * Total físico disponible de monturas.
   *
   * Suma stockActual únicamente de los productos
   * pertenecientes a la categoría Monturas.
   */
  get totalUnidadesMonturas(): number {
    return this.productos
      .filter(
        producto =>
          producto.estado &&
          this.esProductoMontura(
            producto
          )
      )
      .reduce(
        (
          total,
          producto
        ) =>
          total +
          Math.max(
            Number(
              producto.stockActual ||
              0
            ),
            0
          ),
        0
      );
  }

  /**
   * Marcas distintas presentes en el inventario activo.
   * No usa inventarioPorMarca.length porque ese valor puede repetir
   * una misma marca cuando aparece en categorías diferentes.
   */
  get totalMarcasRegistradas(): number {
    return new Set(
      this.productos
        .filter(
          producto =>
            producto.estado
        )
        .map(
          producto =>
            this.normalizarTexto(
              producto.marca?.nombre ||
              ''
            )
        )
        .filter(Boolean)
    ).size;
  }

  get totalProductos(): number {
    return this.inventarioPorMarca.length;
  }

  get totalModelosRegistrados(): number {
    return this.productos.length;
  }

  get totalCategorias(): number {
    return this.categoriasFormulario.length;
  }

  get totalBajoStock(): number {
    return this.productosBajoStock.length;
  }

  get valorizacionInventario(): number {
    if (!this.esAdministrador) {
      return 0;
    }

    return this.productos.reduce(
      (total, producto) =>
        total +
        Number(
          producto.precioCompra || 0
        ) *
        Number(
          producto.stockActual || 0
        ),
      0
    );
  }

  get productosBajoStock():
    ProductoInventario[] {
    return this.inventarioPorMarca.filter(
      producto =>
        producto.estado &&
        Number(producto.stockActual) <=
        Number(producto.stockMinimo ?? 5)
    );
  }

  get marcasDisponibles(): string[] {
    return Array.from(
      new Set(
        this.inventarioPorMarca
          .map(
            producto =>
              producto.marca?.nombre?.trim()
          )
          .filter(
            (marca): marca is string =>
              Boolean(marca)
          )
      )
    ).sort((a, b) =>
      a.localeCompare(
        b,
        'es',
        { sensitivity: 'base' }
      )
    );
  }

  get marcasFormulario(): Marca[] {
    const marcasUnicas = new Map<
      string,
      Marca
    >();

    for (const marca of this.marcas) {
      if (marca.estado === false) {
        continue;
      }

      const clave =
        this.normalizarTexto(marca.nombre);

      if (
        clave &&
        !marcasUnicas.has(clave)
      ) {
        marcasUnicas.set(clave, marca);
      }
    }

    return Array.from(
      marcasUnicas.values()
    ).sort((a, b) =>
      a.nombre.localeCompare(
        b.nombre,
        'es',
        { sensitivity: 'base' }
      )
    );
  }

  get marcaFormularioSeleccionada():
    Marca | undefined {
    const idMarca = Number(
      this.form.get('marcaId')?.value
    );

    return this.marcasFormulario.find(
      marca => marca.id === idMarca
    );
  }

  get categoriasFormulario(): Categoria[] {
    const categoriasUnicas = new Map<
      string,
      Categoria
    >();

    for (const categoria of this.categorias) {
      const clave =
        this.normalizarTexto(
          categoria.nombre
        );

      if (
        categoria.estado === false ||
        !clave ||
        clave === 'otros'
      ) {
        continue;
      }

      if (!categoriasUnicas.has(clave)) {
        categoriasUnicas.set(
          clave,
          categoria
        );
      }
    }

    return Array.from(
      categoriasUnicas.values()
    ).sort((a, b) =>
      a.nombre.localeCompare(
        b.nombre,
        'es',
        { sensitivity: 'base' }
      )
    );
  }

  get categoriasDisponibles(): string[] {
    return Array.from(
      new Set(
        this.inventarioPorMarca
          .map(
            producto =>
              producto.categoria?.nombre?.trim()
          )
          .filter(
            (categoria): categoria is string =>
              Boolean(categoria)
          )
      )
    ).sort((a, b) =>
      a.localeCompare(
        b,
        'es',
        { sensitivity: 'base' }
      )
    );
  }

  get nombreCategoriaFormulario(): string {
    const valor =
      this.form.get('categoriaId')?.value;

    if (valor === this.categoriaOtros) {
      return String(
        this.form.get('nuevaCategoria')?.value || ''
      );
    }

    return this.categoriasFormulario.find(
      categoria =>
        categoria.id === Number(valor)
    )?.nombre || '';
  }

  get usarFormularioCompleto(): boolean {
    const categoria =
      this.normalizarTexto(
        this.nombreCategoriaFormulario
      );

    return (
      categoria === 'monturas' ||
      categoria === 'estuches'
    );
  }

  get usarFormularioSimplificado(): boolean {
    return Boolean(
      this.nombreCategoriaFormulario
    ) && !this.usarFormularioCompleto;
  }

  get mensajeCategoriaFormulario(): string {
    if (this.usarFormularioCompleto) {
      return 'Esta categoría utiliza marca, modelo, color, medida, material y proveedor.';
    }

    if (this.usarFormularioSimplificado) {
      return 'Para esta categoría solo debes completar nombre, precio de compra, precio de venta y cantidad.';
    }

    return 'Selecciona una categoría para mostrar los campos correspondientes.';
  }

  get mostrarCampoColor(): boolean {
    return this.reglasCategoriaActual().color;
  }

  get mostrarCampoMedida(): boolean {
    return this.reglasCategoriaActual().medida;
  }

  get mostrarCampoMaterial(): boolean {
    return this.reglasCategoriaActual().material;
  }

  get modeloObligatorio(): boolean {
    return this.reglasCategoriaActual()
      .modeloObligatorio;
  }

  get colorObligatorio(): boolean {
    return this.reglasCategoriaActual()
      .colorObligatorio;
  }

  get medidaObligatoria(): boolean {
    return this.reglasCategoriaActual()
      .medidaObligatoria;
  }

  get materialObligatorio(): boolean {
    return this.reglasCategoriaActual()
      .materialObligatorio;
  }

  get filtrados(): ProductoInventario[] {
    const termino =
      this.normalizarTexto(this.search);

    const marcaFiltro =
      this.normalizarTexto(
        this.marcaSeleccionada
      );

    const categoriaFiltro =
      this.normalizarTexto(
        this.categoriaSeleccionada
      );

    return this.inventarioPorMarca.filter(
      producto => {
        const stockActual =
          Number(producto.stockActual || 0);

        const stockMinimo =
          Number(
            producto.stockMinimo ?? 5
          );

        if (
          this.mostrarSoloBajoStock &&
          stockActual > stockMinimo
        ) {
          return false;
        }

        const marcaProducto =
          this.normalizarTexto(
            producto.marca?.nombre || ''
          );

        if (
          this.marcaSeleccionada !==
            'TODAS' &&
          marcaProducto !== marcaFiltro
        ) {
          return false;
        }

        const categoriaProducto =
          this.normalizarTexto(
            producto.categoria?.nombre || ''
          );

        if (
          this.categoriaSeleccionada !==
            'TODAS' &&
          categoriaProducto !==
            categoriaFiltro
        ) {
          return false;
        }

        if (!termino) {
          return true;
        }

        const campos = [
          producto.codigoBarras,
          producto.codigoInterno,
          producto.nombre,
          producto.descripcion,
          producto.categoria?.nombre,
          producto.marca?.nombre,
          producto.modelo,
          producto.color,
          producto.medida,
          producto.material,
          producto.proveedor?.razonSocial
        ];

        return campos.some(
          valor =>
            this.normalizarTexto(
              String(valor || '')
            ).includes(termino)
        );
      }
    );
  }

  get totalPaginas(): number {
    return Math.max(
      Math.ceil(
        this.filtrados.length /
        this.tamanioPagina
      ),
      1
    );
  }

  get productosPaginados(): ProductoInventario[] {
    if (
      this.paginaActual >
      this.totalPaginas
    ) {
      this.paginaActual =
        this.totalPaginas;
    }

    const inicio =
      (this.paginaActual - 1) *
      this.tamanioPagina;

    return this.filtrados.slice(
      inicio,
      inicio + this.tamanioPagina
    );
  }

  cargarTodo(): void {
    this.cargando = true;
    this.error = '';

    forkJoin({
      productos:
        this.productoService.listar(),

      categorias:
        this.productoService.categorias(),

      marcas:
        this.productoService.marcas(),

      proveedores:
        this.productoService.proveedores()
    })
      .pipe(
        finalize(() => {
          this.cargando = false;
        })
      )
      .subscribe({
        next: ({
          productos,
          categorias,
          marcas,
          proveedores
        }) => {
          this.productos = productos;
          this.categorias = categorias;
          this.marcas = marcas;
          this.proveedores = proveedores;
          this.paginaActual = 1;
        },

        error: (error) => {
          console.error(
            'Error al cargar inventario:',
            error
          );

          this.error =
            error?.message ||
            'No se pudo cargar el inventario.';
        }
      });
  }

  abrirFormulario(): void {
    if (!this.esAdministrador) {
      this.error =
        'Solo el administrador puede registrar productos.';
      return;
    }

    this.habilitarControlesAdministrador();

    this.error = '';
    this.ok = '';
    this.modoEdicion = false;
    this.productoEditando = null;
    this.mostrarFormulario = true;

    this.form.get(
      'stockActual'
    )?.enable({
      emitEvent: false
    });
    this.mostrarNuevaMarca = false;
    this.guardandoMarca = false;
    this.mensajeMarca = '';
    this.errorMarca = '';
    this.mensajeLecturaEscaner = '';

    this.form.reset({
      codigoBarras: '',
      nombre: '',
      categoriaId:
        this.categorias[0]?.id ?? null,
      nuevaCategoria: '',
      marcaId: null,
      nuevaMarca: '',
      modelo: '',
      color: '',
      medida: '',
      material: '',
      sexo: null,
      precioCompra: 0,
      precioVenta: 0,
      stockActual: 1,
      stockMinimo: 5,
      proveedorId:
        this.proveedores[0]?.id ?? null,
      fechaIngreso:
        this.fechaActual(),
      estado: 'ACTIVO',
      descripcion: ''
    });
  }

  cerrarFormulario(): void {
    if (this.guardando) {
      return;
    }

    this.mostrarFormulario = false;
    this.modoEdicion = false;
    this.productoEditando = null;

    this.habilitarControlesAdministrador();

    this.form.get(
      'stockActual'
    )?.enable({
      emitEvent: false
    });

    this.form.get('nuevaCategoria')
      ?.clearValidators();

    this.form.get('nuevaCategoria')
      ?.updateValueAndValidity({
        emitEvent: false
      });

    this.mostrarNuevaMarca = false;
    this.mensajeMarca = '';
    this.errorMarca = '';
  }

  visualizarProducto(
    producto: Producto
  ): void {
    this.productoSeleccionado =
      producto;
    this.mostrarDetalle =
      true;
    this.error = '';
  }

  cerrarDetalle(): void {
    this.mostrarDetalle =
      false;
    this.productoSeleccionado =
      null;
  }

  editarProducto(
    producto: Producto
  ): void {
    this.error = '';
    this.ok = '';
    this.modoEdicion = true;
    this.productoEditando =
      producto;
    this.mostrarFormulario =
      true;
    this.mostrarNuevaMarca =
      false;
    this.mensajeMarca = '';
    this.errorMarca = '';

    this.form.patchValue(
      {
        codigoBarras:
          producto.codigoBarras ||
          producto.codigoInterno ||
          '',
        nombre:
          producto.nombre,
        categoriaId:
          producto.categoria?.id ??
          null,
        nuevaCategoria: '',
        marcaId:
          producto.marca?.id ??
          null,
        nuevaMarca: '',
        modelo:
          producto.modelo || '',
        color:
          producto.color || '',
        medida:
          producto.medida || '',
        material:
          producto.material || '',
        sexo:
          producto.sexo ?? null,
        precioCompra:
          Number(
            producto.precioCompra || 0
          ),
        precioVenta:
          Number(
            producto.precioVenta || 0
          ),
        stockActual:
          Number(
            producto.stockActual || 0
          ),
        stockMinimo:
          Number(
            producto.stockMinimo ?? 5
          ),
        proveedorId:
          producto.proveedor?.id ??
          null,
        fechaIngreso:
          producto.fechaIngreso
            ? producto.fechaIngreso
                .slice(0, 10)
            : this.fechaActual(),
        estado:
          producto.estado
            ? 'ACTIVO'
            : 'INACTIVO',
        descripcion:
          producto.descripcion || ''
      },
      {
        emitEvent: true
      }
    );

    this.actualizarValidacionesCampos();

    if (this.esVendedor) {
      this.configurarControlesVendedor();
      return;
    }

    this.form.get(
      'stockActual'
    )?.disable({
      emitEvent: false
    });
  }

  solicitarEliminarProducto(
    producto: Producto
  ): void {
    if (!this.esAdministrador) {
      this.error =
        'Solo el administrador puede eliminar o desactivar productos.';
      return;
    }

    this.productoPorEliminar =
      producto;
    this.mostrarConfirmacionEliminar =
      true;
    this.error = '';
  }

  cancelarEliminarProducto(): void {
    if (this.eliminando) {
      return;
    }

    this.productoPorEliminar =
      null;
    this.mostrarConfirmacionEliminar =
      false;
  }

  eliminarProducto(): void {
    if (!this.esAdministrador) {
      this.error =
        'Solo el administrador puede eliminar o desactivar productos.';
      return;
    }

    if (
      !this.productoPorEliminar ||
      this.eliminando
    ) {
      return;
    }

    const producto =
      this.productoPorEliminar;

    this.eliminando =
      true;
    this.error = '';
    this.ok = '';

    this.productoService
      .eliminar(
        producto.id
      )
      .pipe(
        finalize(() => {
          this.eliminando =
            false;
        })
      )
      .subscribe({
        next: (resultado) => {
          this.ok =
            resultado.accion ===
              'ELIMINADO'
              ? `Producto ${producto.modelo || producto.nombre} eliminado de la base de datos.`
              : `Producto ${producto.modelo || producto.nombre} desactivado. Se conservó porque tiene historial de ventas.`;

          this.cancelarEliminarProducto();

          if (
            this.productoSeleccionado?.id ===
              producto.id
          ) {
            this.cerrarDetalle();
          }

          this.cargarTodo();
        },

        error: (error) => {
          this.error =
            error?.message ||
            'No se pudo eliminar el producto.';
        }
      });
  }

  alternarNuevaMarca(): void {
    if (!this.esAdministrador) {
      this.error =
        'Solo el administrador puede registrar marcas.';
      return;
    }

    this.mostrarNuevaMarca =
      !this.mostrarNuevaMarca;

    this.mensajeMarca = '';
    this.errorMarca = '';

    if (!this.mostrarNuevaMarca) {
      this.form.patchValue({
        nuevaMarca: ''
      });
    }
  }

  guardarNuevaMarca(): void {
    if (!this.esAdministrador) {
      this.errorMarca =
        'Solo el administrador puede registrar marcas.';
      return;
    }

    if (this.guardandoMarca) {
      return;
    }

    const nombreMarca = String(
      this.form.get('nuevaMarca')?.value || ''
    )
      .trim()
      .replace(/\s+/g, ' ');

    if (nombreMarca.length < 2) {
      this.errorMarca =
        'Escribe una marca válida.';
      this.mensajeMarca = '';
      return;
    }

    const existente = this.marcas.find(
      marca =>
        this.normalizarTexto(marca.nombre) ===
        this.normalizarTexto(nombreMarca)
    );

    if (existente) {
      this.form.patchValue({
        marcaId: existente.id,
        nuevaMarca: ''
      });

      this.mostrarNuevaMarca = false;
      this.errorMarca = '';
      this.mensajeMarca =
        'La marca ya estaba registrada y fue seleccionada.';
      return;
    }

    this.guardandoMarca = true;
    this.errorMarca = '';
    this.mensajeMarca = '';

    this.productoService
      .crearMarca(nombreMarca)
      .pipe(
        finalize(() => {
          this.guardandoMarca = false;
        })
      )
      .subscribe({
        next: (marca: Marca) => {
          const indice = this.marcas.findIndex(
            item =>
              item.id === marca.id ||
              this.normalizarTexto(item.nombre) ===
              this.normalizarTexto(marca.nombre)
          );

          if (indice >= 0) {
            this.marcas[indice] = marca;
          } else {
            this.marcas.push(marca);
          }

          this.marcas = [...this.marcas]
            .sort((a, b) =>
              a.nombre.localeCompare(
                b.nombre,
                'es',
                {
                  sensitivity: 'base'
                }
              )
            );

          this.form.patchValue({
            marcaId: marca.id,
            nuevaMarca: ''
          });

          this.mostrarNuevaMarca = false;
          this.errorMarca = '';
          this.mensajeMarca =
            `Marca ${marca.nombre} guardada y seleccionada.`;
        },

        error: (error: unknown) => {
          console.error(
            'Error al guardar marca:',
            error
          );

          this.errorMarca =
            error instanceof Error
              ? error.message
              : 'No se pudo guardar la marca.';
        }
      });
  }

  procesarLecturaEscaner(
    event?: Event
  ): void {
    event?.preventDefault();

    const lectura =
      String(
        this.form.get(
          'codigoBarras'
        )?.value || ''
      ).trim();

    if (!lectura) {
      this.mensajeLecturaEscaner =
        '';
      return;
    }

    const medida =
      this.extraerMedidaMontura(
        lectura
      );

    if (!medida) {
      this.mensajeLecturaEscaner =
        'Código capturado. Escribe la medida manualmente cuando el lector no la incluya.';
      return;
    }

    this.form.patchValue(
      {
        codigoBarras:
          medida,
        medida
      },
      {
        emitEvent: true
      }
    );

    this.mensajeLecturaEscaner =
      `Código de barras y medida cargados: ${medida}.`;
  }

  private extraerMedidaMontura(
    valor: string
  ): string | null {
    const texto =
      String(valor || '')
        .trim()
        .toUpperCase()
        .replace(
          /[×X]/g,
          '-'
        )
        .replace(
          /[\/\\|_]/g,
          '-'
        )
        .replace(
          /\s+/g,
          '-'
        )
        .replace(
          /-+/g,
          '-'
        );

    /*
     * Formatos aceptados:
     * 52-18-140
     * 52/18/140
     * 52 18 140
     * 52x18x140
     * EXP-52-18-140
     */
    const coincidencia =
      texto.match(
        /(?:^|[^0-9])(\d{2,3})-(\d{2,3})-(\d{3})(?:$|[^0-9])/
      );

    if (coincidencia) {
      return [
        coincidencia[1],
        coincidencia[2],
        coincidencia[3]
      ].join('-');
    }

    /*
     * Algunos lectores entregan solo los siete dígitos:
     * 5218140 -> 52-18-140
     */
    const soloDigitos =
      String(valor || '')
        .replace(/\D/g, '');

    if (soloDigitos.length === 7) {
      return [
        soloDigitos.slice(0, 2),
        soloDigitos.slice(2, 4),
        soloDigitos.slice(4, 7)
      ].join('-');
    }

    return null;
  }

  guardar(): void {
    if (this.edicionLimitadaVendedor) {
      this.guardarEdicionVendedor();
      return;
    }

    if (!this.esAdministrador) {
      this.error =
        'Tu rol no puede registrar ni modificar la ficha completa del producto.';
      return;
    }

    const lecturaPendiente =
      String(
        this.form.get(
          'codigoBarras'
        )?.value || ''
      ).trim();

    if (lecturaPendiente) {
      this.procesarLecturaEscaner();
    }

    if (
      this.guardando ||
      this.guardandoMarca
    ) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();

      const camposInvalidos =
        Object.entries(
          this.form.controls
        )
          .filter(
            ([, control]) =>
              control.enabled &&
              control.invalid
          )
          .map(
            ([nombre]) =>
              nombre
          );

      console.warn(
        'Campos inválidos del producto:',
        camposInvalidos
      );

      this.error =
        this.usarFormularioCompleto
          ? 'Completa los campos obligatorios de la montura.'
          : 'Completa nombre, categoría, precio de compra, precio de venta y cantidad.';

      return;
    }

    const value =
      this.form.getRawValue();

    this.error = '';
    this.ok = '';
    this.guardando = true;

    const categoria$ =
      value.categoriaId ===
      this.categoriaOtros
        ? this.productoService
            .crearCategoria(
              String(
                value.nuevaCategoria || ''
              )
            )
        : of({
            id:
              Number(value.categoriaId),
            nombre: '',
            estado: true
          } as Categoria);

    const marcaIdSeleccionada =
      Number(value.marcaId || 0);

    if (
      this.usarFormularioCompleto &&
      !marcaIdSeleccionada
    ) {
      this.guardando = false;
      this.error =
        'Selecciona una marca registrada o crea una nueva.';
      return;
    }

    const marca$ =
      marcaIdSeleccionada
        ? of(
            this.marcasFormulario.find(
              marca =>
                marca.id ===
                marcaIdSeleccionada
            ) ?? null
          )
        : of(null);

    forkJoin({
      categoria:
        categoria$,
      marca:
        marca$
    })
      .pipe(
        switchMap(({
          categoria,
          marca
        }) => {
          const request:
            ProductoRequest = {
            codigoInterno:
              this.productoEditando
                ?.codigoInterno ||
              undefined,
            codigoBarras:
              String(
                value.codigoBarras
              ).trim(),
            nombre:
              String(
                value.nombre
              ).trim(),
            descripcion:
              String(
                value.descripcion || ''
              ).trim(),
            modelo:
              String(
                value.modelo || ''
              ).trim(),
            color:
              String(
                value.color || ''
              ).trim(),
            medida:
              String(
                value.medida || ''
              ).trim(),
            material:
              String(
                value.material || ''
              ).trim(),
            sexo:
              value.sexo === 'F' ||
              value.sexo === 'M'
                ? value.sexo
                : null,
            precioCompra:
              Number(
                value.precioCompra
              ),
            precioVenta:
              Number(
                value.precioVenta
              ),
            stockActual:
              this.modoEdicion &&
              this.productoEditando
                ? Number(
                    this.productoEditando
                      .stockActual || 0
                  )
                : Number(
                    value.stockActual
                  ),
            stockMinimo:
              Number(
                value.stockMinimo ?? 5
              ),
            categoriaId:
              Number(
                categoria.id
              ),
            marcaId:
              marca
                ? Number(marca.id)
                : null,
            proveedorId:
              value.proveedorId
                ? Number(
                    value.proveedorId
                  )
                : null
          };

          if (
            this.modoEdicion &&
            this.productoEditando
          ) {
            return this.productoService
              .actualizar(
                this.productoEditando.id,
                request
              );
          }

          return this.productoService
            .crear(request);
        }),
        finalize(() => {
          this.guardando = false;
        })
      )
      .subscribe({
        next: (
          resultado:
            ResultadoRegistroProducto
        ) => {
          const producto =
            resultado.producto;

          if (
            resultado.accion ===
              'STOCK_INCREMENTADO'
          ) {
            this.ok =
              `Producto agregado al stock correctamente. ` +
              `Se sumaron ${resultado.cantidadAgregada} unidad(es) a ${producto.modelo || producto.nombre}. ` +
              `Stock anterior: ${resultado.stockAnterior}. ` +
              `Stock actual: ${resultado.stockNuevo}.`;
          } else if (
            resultado.accion ===
              'ACTUALIZADO'
          ) {
            this.ok =
              `Producto ${producto.modelo || producto.nombre} actualizado correctamente.`;
          } else if (
            producto.marca?.nombre
          ) {
            this.ok =
              `Nuevo modelo registrado: ${producto.marca.nombre} ` +
              `${producto.modelo || producto.nombre}.`;
          } else {
            this.ok =
              `${producto.nombre} registrado con ${producto.stockActual} unidad(es).`;
          }

          this.mostrarFormulario =
            false;


          this.mensajeLecturaEscaner =
            '';

          this.modoEdicion =
            false;
          this.productoEditando =
            null;

          this.form.get(
            'stockActual'
          )?.enable({
            emitEvent: false
          });

          /*
           * Después de crear, actualizar o incrementar
           * stock se muestra el producto resultante.
           */
          this.productoSeleccionado =
            producto;
          this.mostrarDetalle =
            true;

          this.cargarTodo();
        },

        error: (error) => {
          console.error(
            'Error al guardar producto:',
            error
          );

          this.error =
            error?.message ||
            'No se pudo guardar el producto.';
        }
      });
  }

  private guardarEdicionVendedor(): void {
    if (
      !this.productoEditando ||
      this.guardando
    ) {
      return;
    }

    const precioVenta =
      Number(
        this.form.get(
          'precioVenta'
        )?.value
      );

    const descripcion =
      String(
        this.form.get(
          'descripcion'
        )?.value || ''
      ).trim();

    if (
      !Number.isFinite(
        precioVenta
      ) ||
      precioVenta <= 0
    ) {
      this.error =
        'Ingresa un precio de venta válido.';
      this.form.get(
        'precioVenta'
      )?.markAsTouched();
      return;
    }

    const request:
      ProductoEdicionVendedorRequest = {
        precioVenta,
        descripcion
      };

    this.guardando = true;
    this.error = '';
    this.ok = '';

    this.productoService
      .actualizarDatosVenta(
        this.productoEditando.id,
        request
      )
      .pipe(
        finalize(() => {
          this.guardando = false;
        })
      )
      .subscribe({
        next: (
          resultado:
            ResultadoRegistroProducto
        ) => {
          const producto =
            resultado.producto;

          this.ok =
            `Precio de venta de ${producto.modelo || producto.nombre} actualizado correctamente.`;

          this.mostrarFormulario =
            false;
          this.modoEdicion =
            false;
          this.productoEditando =
            null;

          this.habilitarControlesAdministrador();

          this.productoSeleccionado =
            producto;
          this.mostrarDetalle =
            true;

          this.cargarTodo();
        },

        error: (
          error: unknown
        ) => {
          console.error(
            'Error al actualizar precio de venta:',
            error
          );

          this.error =
            error instanceof Error
              ? error.message
              : 'No se pudo actualizar el precio de venta.';
        }
      });
  }

  private configurarControlesVendedor(): void {
    const editables =
      new Set([
        'precioVenta',
        'descripcion'
      ]);

    Object.entries(
      this.form.controls
    ).forEach(
      ([
        nombre,
        control
      ]) => {
        if (
          editables.has(
            nombre
          )
        ) {
          control.enable({
            emitEvent: false
          });
        } else {
          control.disable({
            emitEvent: false
          });
        }
      }
    );

    this.form.get(
      'precioVenta'
    )?.setValidators([
      Validators.required,
      Validators.min(0.01)
    ]);

    this.form.get(
      'precioVenta'
    )?.updateValueAndValidity({
      emitEvent: false
    });

    this.form.get(
      'descripcion'
    )?.clearValidators();

    this.form.get(
      'descripcion'
    )?.updateValueAndValidity({
      emitEvent: false
    });
  }

  private habilitarControlesAdministrador(): void {
    Object.values(
      this.form.controls
    ).forEach(
      control => {
        control.enable({
          emitEvent: false
        });
      }
    );

    this.actualizarValidacionesCampos();
  }

  cambiarFiltroStock(): void {
    this.mostrarSoloBajoStock =
      !this.mostrarSoloBajoStock;

    this.paginaActual = 1;
  }

  limpiarBusqueda(): void {
    this.search = '';
    this.marcaSeleccionada = 'TODAS';
    this.categoriaSeleccionada = 'TODAS';
    this.mostrarSoloBajoStock = false;
    this.paginaActual = 1;
  }

  exportarInventarioExcel(): void {
    if (!this.esAdministrador) {
      this.error =
        'La descarga administrativa del inventario está disponible solo para el administrador.';
      return;
    }

    this.error = '';
    this.ok = '';

    if (!this.productos.length) {
      this.error =
        'No existen productos para exportar.';

      return;
    }

    /*
     * Cada producto o variante se exporta en una fila.
     * Las monturas se ordenan por:
     *
     * marca -> modelo -> color -> medida.
     *
     * La marca y su stock total se muestran como un
     * bloque vertical, igual al formato proporcionado.
     */
    const productosOrdenados =
      [...this.productos]
        .filter(
          producto =>
            producto.estado
        )
        .sort(
          (
            a,
            b
          ) =>
            this.compararProductosExcel(
              a,
              b
            )
        );

    const gruposHojas = [
      {
        nombre:
          'Monturas',
        productos:
          productosOrdenados.filter(
            producto =>
              this.tipoHojaInventario(
                producto
              ) ===
                'MONTURAS'
          )
      },
      {
        nombre:
          'Estuches',
        productos:
          productosOrdenados.filter(
            producto =>
              this.tipoHojaInventario(
                producto
              ) ===
                'ESTUCHES'
          )
      },
      {
        nombre:
          'Liquidos limpiadores',
        productos:
          productosOrdenados.filter(
            producto =>
              this.tipoHojaInventario(
                producto
              ) ===
                'LIQUIDOS'
          )
      },
      {
        nombre:
          'Otros',
        productos:
          productosOrdenados.filter(
            producto =>
              this.tipoHojaInventario(
                producto
              ) ===
                'OTROS'
          )
      }
    ];

    const libro =
      utils.book_new();

    for (
      const grupo of
      gruposHojas
    ) {
      const hoja =
        this.crearHojaInventarioExcel(
          grupo.productos
        );

      utils.book_append_sheet(
        libro,
        hoja,
        grupo.nombre
      );
    }

    writeFileXLSX(
      libro,
      `inventario-optica-alba-${this.fechaArchivo()}.xlsx`,
      {
        compression:
          true,
        cellStyles:
          true
      }
    );

    this.ok =
      'Inventario descargado por marca y con cada producto en una fila.';
  }

  private crearHojaInventarioExcel(
    productos: Producto[]
  ) {
    const cabeceras = [
      'categoria',
      'marca',
      'modelo',
      'cantidad',
      'caracteristicas/medidas',
      'precio de compra',
      'precio de venta',
      'stock total de la marca',
      'stock minimo'
    ];

    /*
     * Se conserva una fila vacía debajo de la cabecera,
     * igual al archivo de ejemplo proporcionado.
     */
    const filas:
      (
        string |
        number |
        null
      )[][] = [
        cabeceras,
        Array(
          cabeceras.length
        ).fill(null)
      ];

    const combinaciones:
      {
        s: {
          r: number;
          c: number;
        };
        e: {
          r: number;
          c: number;
        };
      }[] = [];

    const gruposMarca =
      new Map<
        string,
        Producto[]
      >();

    for (
      const producto of
      productos
    ) {
      const categoria =
        producto.categoria?.nombre ||
        'Sin categoría';

      const marca =
        producto.marca?.nombre ||
        '';

      /*
       * Los artículos sin marca se agrupan por su nombre,
       * evitando sumar productos distintos bajo "Sin marca".
       */
      const claveMarca =
        marca
          ? [
              this.normalizarTexto(
                categoria
              ),
              this.normalizarTexto(
                marca
              )
            ].join('|')
          : [
              this.normalizarTexto(
                categoria
              ),
              'SIN-MARCA',
              this.normalizarTexto(
                producto.nombre
              )
            ].join('|');

      const lista =
        gruposMarca.get(
          claveMarca
        ) ?? [];

      lista.push(
        producto
      );

      gruposMarca.set(
        claveMarca,
        lista
      );
    }

    const gruposOrdenados =
      Array.from(
        gruposMarca.values()
      )
        .map(
          grupo =>
            [...grupo].sort(
              (
                a,
                b
              ) =>
                this.compararProductosExcel(
                  a,
                  b
                )
            )
        )
        .sort(
          (
            grupoA,
            grupoB
          ) => {
            const primeroA =
              grupoA[0];

            const primeroB =
              grupoB[0];

            const marcaA =
              primeroA?.marca?.nombre ||
              primeroA?.nombre ||
              '';

            const marcaB =
              primeroB?.marca?.nombre ||
              primeroB?.nombre ||
              '';

            return marcaA.localeCompare(
              marcaB,
              'es',
              {
                sensitivity:
                  'base',
                numeric:
                  true
              }
            );
          }
        );

    for (
      const grupo of
      gruposOrdenados
    ) {
      const primero =
        grupo[0];

      if (!primero) {
        continue;
      }

      const filaInicial =
        filas.length;

      const marca =
        primero.marca?.nombre ||
        'Sin marca';

      const stockTotalMarca =
        grupo.reduce(
          (
            total,
            producto
          ) =>
            total +
            Number(
              producto.stockActual ||
              0
            ),
          0
        );

      for (
        const producto of
        grupo
      ) {
        filas.push([
          producto.categoria?.nombre ||
            'Sin categoría',

          marca,

          producto.modelo ||
            producto.nombre ||
            'Sin modelo',

          Number(
            producto.stockActual ||
            0
          ),

          this.caracteristicasProductoExcel(
            producto
          ),

          Number(
            producto.precioCompra ||
            0
          ),

          Number(
            producto.precioVenta ||
            0
          ),

          stockTotalMarca,

          Number(
            producto.stockMinimo ??
            5
          )
        ]);
      }

      const filaFinal =
        filas.length - 1;

      /*
       * Si una marca tiene varias monturas:
       * - se combina verticalmente la marca;
       * - se combina verticalmente el stock total;
       * - cada modelo permanece en su propia fila.
       */
      if (
        filaFinal >
        filaInicial
      ) {
        combinaciones.push(
          {
            s: {
              r:
                filaInicial,
              c:
                1
            },
            e: {
              r:
                filaFinal,
              c:
                1
            }
          },
          {
            s: {
              r:
                filaInicial,
              c:
                7
            },
            e: {
              r:
                filaFinal,
              c:
                7
            }
          }
        );
      }
    }

    const hoja =
      utils.aoa_to_sheet(
        filas
      );

    hoja['!merges'] =
      combinaciones;

    hoja['!cols'] = [
      { wch: 20 },
      { wch: 22 },
      { wch: 22 },
      { wch: 12 },
      { wch: 48 },
      { wch: 20 },
      { wch: 20 },
      { wch: 24 },
      { wch: 16 }
    ];

    hoja['!rows'] = [
      { hpt: 30 },
      { hpt: 9 }
    ];

    hoja['!autofilter'] = {
      ref:
        'A1:I1'
    };

    hoja['!margins'] = {
      left:
        0.3,
      right:
        0.3,
      top:
        0.5,
      bottom:
        0.5,
      header:
        0.2,
      footer:
        0.2
    };

    /*
     * Formato visual basado en el Excel enviado:
     * cabecera amarilla, texto negro y filas separadas.
     *
     * Se utiliza "as any" para mantener compatibilidad
     * con distintas versiones de SheetJS.
     */
    const rango =
      utils.decode_range(
        hoja['!ref'] ||
        'A1:I2'
      );

    for (
      let fila =
        rango.s.r;
      fila <=
        rango.e.r;
      fila += 1
    ) {
      for (
        let columna =
          rango.s.c;
        columna <=
          rango.e.c;
        columna += 1
      ) {
        const referencia =
          utils.encode_cell({
            r:
              fila,
            c:
              columna
          });

        const celda =
          hoja[
            referencia
          ];

        if (!celda) {
          continue;
        }

        const estiloBase = {
          font: {
            name:
              'Arial',
            sz:
              fila === 0
                ? 12
                : 10,
            bold:
              fila === 0
          },
          alignment: {
            vertical:
              'center',
            horizontal:
              fila === 0
                ? 'center'
                : (
                    columna === 3 ||
                    columna === 5 ||
                    columna === 6 ||
                    columna === 7 ||
                    columna === 8
                      ? 'center'
                      : 'left'
                  ),
            wrapText:
              true
          },
          border: {
            top: {
              style:
                'thin',
              color: {
                rgb:
                  'D9D9D9'
              }
            },
            bottom: {
              style:
                'thin',
              color: {
                rgb:
                  'D9D9D9'
              }
            },
            left: {
              style:
                'thin',
              color: {
                rgb:
                  'D9D9D9'
              }
            },
            right: {
              style:
                'thin',
              color: {
                rgb:
                  'D9D9D9'
              }
            }
          }
        };

        (
          celda as any
        ).s = {
          ...estiloBase,
          fill:
            fila === 0
              ? {
                  patternType:
                    'solid',
                  fgColor: {
                    rgb:
                      'FFF200'
                  }
                }
              : {
                  patternType:
                    'solid',
                  fgColor: {
                    rgb:
                      'FFFFFF'
                  }
                }
        };

        if (
          fila >= 2 &&
          (
            columna === 5 ||
            columna === 6
          )
        ) {
          celda.z =
            '"S/ " #,##0.00';
        }

        if (
          fila >= 2 &&
          (
            columna === 3 ||
            columna === 7 ||
            columna === 8
          )
        ) {
          celda.z =
            '0';
        }
      }
    }

    return hoja;
  }

  private caracteristicasProductoExcel(
    producto: Producto
  ): string {
    const caracteristicas = [
      producto.sexo
        ? (
            producto.sexo === 'F'
              ? 'Sexo: Femenino'
              : 'Sexo: Masculino'
          )
        : '',

      producto.color
        ? `Color: ${producto.color}`
        : '',

      producto.medida
        ? `Medida: ${producto.medida}`
        : '',

      producto.material
        ? `Material: ${producto.material}`
        : '',

      producto.descripcion
        ? `Descripción: ${producto.descripcion}`
        : ''
    ]
      .filter(
        Boolean
      );

    return caracteristicas.join(
      ' | '
    ) ||
      'No aplica';
  }

  private tipoHojaInventario(
    producto: Producto
  ):
    'MONTURAS' |
    'ESTUCHES' |
    'LIQUIDOS' |
    'OTROS' {
    const categoria =
      this.normalizarTexto(
        producto.categoria?.nombre ||
        ''
      );

    if (
      categoria.includes(
        'montura'
      )
    ) {
      return 'MONTURAS';
    }

    if (
      categoria.includes(
        'estuche'
      )
    ) {
      return 'ESTUCHES';
    }

    if (
      categoria.includes(
        'liquid'
      ) ||
      categoria.includes(
        'limpiador'
      ) ||
      categoria.includes(
        'antiempan'
      )
    ) {
      return 'LIQUIDOS';
    }

    return 'OTROS';
  }

  private compararProductosExcel(
    a: Producto,
    b: Producto
  ): number {
    const categoriaA =
      a.categoria?.nombre ||
      '';

    const categoriaB =
      b.categoria?.nombre ||
      '';

    const porCategoria =
      categoriaA.localeCompare(
        categoriaB,
        'es',
        {
          sensitivity:
            'base',
          numeric:
            true
        }
      );

    if (
      porCategoria !== 0
    ) {
      return porCategoria;
    }

    const marcaA =
      a.marca?.nombre ||
      a.nombre ||
      '';

    const marcaB =
      b.marca?.nombre ||
      b.nombre ||
      '';

    const porMarca =
      marcaA.localeCompare(
        marcaB,
        'es',
        {
          sensitivity:
            'base',
          numeric:
            true
        }
      );

    if (
      porMarca !== 0
    ) {
      return porMarca;
    }

    const modeloA =
      a.modelo ||
      a.nombre ||
      '';

    const modeloB =
      b.modelo ||
      b.nombre ||
      '';

    const porModelo =
      modeloA.localeCompare(
        modeloB,
        'es',
        {
          sensitivity:
            'base',
          numeric:
            true
        }
      );

    if (
      porModelo !== 0
    ) {
      return porModelo;
    }

    const porColor =
      String(
        a.color ||
        ''
      ).localeCompare(
        String(
          b.color ||
          ''
        ),
        'es',
        {
          sensitivity:
            'base',
          numeric:
            true
        }
      );

    if (
      porColor !== 0
    ) {
      return porColor;
    }

    return String(
      a.medida ||
      ''
    ).localeCompare(
      String(
        b.medida ||
        ''
      ),
      'es',
      {
        sensitivity:
          'base',
        numeric:
          true
      }
    );
  }

  paginaAnterior(): void {
    if (this.paginaActual > 1) {
      this.paginaActual -= 1;
    }
  }

  paginaSiguiente(): void {
    if (
      this.paginaActual <
      this.totalPaginas
    ) {
      this.paginaActual += 1;
    }
  }

  esBajoStockModelo(
    producto: Producto
  ): boolean {
    return (
      Number(
        producto.stockActual || 0
      ) <=
      Number(
        producto.stockMinimo ?? 5
      )
    );
  }

  sinStockModelo(
    producto: Producto
  ): boolean {
    return Number(
      producto.stockActual || 0
    ) <= 0;
  }

  esBajoStock(
    producto: ProductoInventario
  ): boolean {
    return (
      Number(producto.stockActual) <=
      Number(producto.stockMinimo ?? 5)
    );
  }

  sinStock(
    producto: ProductoInventario
  ): boolean {
    return Number(
      producto.stockActual
    ) <= 0;
  }

  cantidadReposicion(
    producto: ProductoInventario
  ): number {
    const minimo =
      Math.max(
        Number(
          producto.stockMinimo ?? 5
        ),
        1
      );

    return Math.max(
      minimo * 2 -
      Number(producto.stockActual),
      minimo
    );
  }

  contactarWhatsApp(
    producto: ProductoInventario
  ): void {
    const telefonoOriginal =
      String(
        producto.proveedor?.telefono || ''
      );

    let telefono =
      telefonoOriginal.replace(/\D/g, '');

    if (!telefono) {
      this.error =
        'El proveedor no tiene teléfono registrado.';

      return;
    }

    if (telefono.length === 9) {
      telefono = `51${telefono}`;
    }

    const mensaje = [
      'Hola, somos de Óptica Alba.',
      '',
      'Solicitamos información para reponer:',
      `Marca: ${producto.marca?.nombre || producto.nombre}`,
      `Modelos registrados: ${producto.modelosRegistrados.join(', ') || 'Sin modelo'}`,
      `Stock actual: ${producto.stockActual}`,
      `Stock mínimo: ${producto.stockMinimo ?? 5}`,
      `Cantidad solicitada: ${this.cantidadReposicion(producto)}`,
      '',
      'Por favor, confirmar disponibilidad y precio.'
    ].join('\n');

    window.open(
      `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`,
      '_blank',
      'noopener,noreferrer'
    );
  }

  contactarCorreo(
    producto: ProductoInventario
  ): void {
    const correo =
      String(
        producto.proveedor?.correo || ''
      ).trim();

    if (!correo) {
      this.error =
        'El proveedor no tiene correo registrado.';

      return;
    }

    const asunto =
      `Reposición de ${producto.marca?.nombre || producto.nombre}`;

    const cuerpo = [
      'Hola, somos de Óptica Alba.',
      '',
      'Solicitamos información para reponer el siguiente producto:',
      '',
      `Marca: ${producto.marca?.nombre || producto.nombre}`,
      `Modelos registrados: ${producto.modelosRegistrados.join(', ') || 'Sin modelo'}`,
      `Stock actual: ${producto.stockActual}`,
      `Stock mínimo: ${producto.stockMinimo ?? 5}`,
      `Cantidad solicitada: ${this.cantidadReposicion(producto)}`,
      '',
      'Por favor, confirmar disponibilidad y precio.'
    ].join('\n');

    window.location.href =
      `mailto:${correo}` +
      `?subject=${encodeURIComponent(asunto)}` +
      `&body=${encodeURIComponent(cuerpo)}`;
  }

  private configurarCategoriaOtros():
    void {

    const categoriaControl =
      this.form.get('categoriaId');

    const nuevaCategoriaControl =
      this.form.get(
        'nuevaCategoria'
      );

    categoriaControl
      ?.valueChanges
      .subscribe((valor) => {
        if (
          valor ===
          this.categoriaOtros
        ) {
          nuevaCategoriaControl
            ?.setValidators([
              Validators.required,
              Validators.minLength(2)
            ]);
        } else {
          nuevaCategoriaControl
            ?.clearValidators();

          nuevaCategoriaControl
            ?.setValue('', {
              emitEvent: false
            });
        }

        nuevaCategoriaControl
          ?.updateValueAndValidity({
            emitEvent: false
          });
      });
  }

  private configurarValidacionesCategoria():
    void {
    const categoriaControl =
      this.form.get('categoriaId');

    const nuevaCategoriaControl =
      this.form.get('nuevaCategoria');

    categoriaControl?.valueChanges
      .subscribe(() => {
        this.actualizarValidacionesCampos();
      });

    nuevaCategoriaControl?.valueChanges
      .subscribe(() => {
        if (
          categoriaControl?.value ===
          this.categoriaOtros
        ) {
          this.actualizarValidacionesCampos();
        }
      });

    this.actualizarValidacionesCampos();
  }

  private actualizarValidacionesCampos():
    void {
    const formularioCompleto =
      this.usarFormularioCompleto;

    /*
     * El código físico solo es obligatorio para categorías
     * completas como Monturas y Estuches.
     */
    this.configurarControlCategoria(
      'codigoBarras',
      formularioCompleto,
      formularioCompleto
    );

    this.configurarControlCategoria(
      'marcaId',
      formularioCompleto,
      formularioCompleto
    );

    this.configurarControlCategoria(
      'modelo',
      formularioCompleto,
      formularioCompleto
    );

    this.configurarControlCategoria(
      'color',
      formularioCompleto,
      formularioCompleto
    );

    this.configurarControlCategoria(
      'medida',
      formularioCompleto,
      formularioCompleto
    );

    this.configurarControlCategoria(
      'material',
      formularioCompleto,
      formularioCompleto
    );

    this.configurarControlCategoria(
      'sexo',
      formularioCompleto,
      formularioCompleto
    );

    this.configurarControlCategoria(
      'proveedorId',
      formularioCompleto,
      formularioCompleto
    );

    if (!formularioCompleto) {
      this.form.patchValue(
        {
          marcaId: null,
          nuevaMarca: '',
          modelo: '',
          color: '',
          medida: '',
          material: '',
          sexo: null,
          proveedorId: null,
          stockMinimo: 5,
          descripcion: ''
        },
        {
          emitEvent: false
        }
      );

      this.mostrarNuevaMarca = false;
      this.mensajeMarca = '';
      this.errorMarca = '';
    }
  }

  private configurarControlCategoria(
    controlNombre: string,
    habilitado: boolean,
    obligatorio: boolean
  ): void {
    const control =
      this.form.get(controlNombre);

    if (!control) {
      return;
    }

    if (habilitado) {
      control.enable({
        emitEvent: false
      });

      if (obligatorio) {
        control.setValidators([
          Validators.required
        ]);
      } else {
        control.clearValidators();
      }
    } else {
      control.clearValidators();
      control.disable({
        emitEvent: false
      });
    }

    control.updateValueAndValidity({
      emitEvent: false
    });
  }

  private aplicarValidadorDinamico(
    controlNombre: string,
    obligatorio: boolean
  ): void {
    const control =
      this.form.get(controlNombre);

    if (!control) {
      return;
    }

    if (obligatorio) {
      control.setValidators([
        Validators.required,
        Validators.minLength(1)
      ]);
    } else {
      control.clearValidators();
    }

    control.updateValueAndValidity({
      emitEvent: false
    });
  }

  private reglasCategoriaActual(): {
    color: boolean;
    medida: boolean;
    material: boolean;
    modeloObligatorio: boolean;
    colorObligatorio: boolean;
    medidaObligatoria: boolean;
    materialObligatorio: boolean;
  } {
    const formularioCompleto =
      this.usarFormularioCompleto;

    return {
      color:
        formularioCompleto,
      medida:
        formularioCompleto,
      material:
        formularioCompleto,
      modeloObligatorio:
        formularioCompleto,
      colorObligatorio:
        formularioCompleto,
      medidaObligatoria:
        formularioCompleto,
      materialObligatorio:
        formularioCompleto
    };
  }

  private crearInventarioMarca(
    clave: string,
    productos: Producto[]
  ): ProductoInventario {
    const productosOrdenados =
      [...productos].sort(
        (a, b) => {
          const porModelo =
            String(
              a.modelo ||
              a.nombre ||
              ''
            ).localeCompare(
              String(
                b.modelo ||
                b.nombre ||
                ''
              ),
              'es',
              {
                sensitivity:
                  'base',
                numeric: true
              }
            );

          if (porModelo !== 0) {
            return porModelo;
          }

          const porColor =
            String(
              a.color || ''
            ).localeCompare(
              String(
                b.color || ''
              ),
              'es',
              {
                sensitivity:
                  'base'
              }
            );

          if (porColor !== 0) {
            return porColor;
          }

          return String(
            a.medida || ''
          ).localeCompare(
            String(
              b.medida || ''
            ),
            'es',
            {
              sensitivity:
                'base',
              numeric: true
            }
          );
        }
      );

    const primero =
      productosOrdenados[0];

    const valoresUnicos = (
      selector: (producto: Producto) =>
        string | undefined
    ): string[] =>
      Array.from(
        new Set(
          productosOrdenados
            .map(selector)
            .map(valor =>
              String(valor || '').trim()
            )
            .filter(Boolean)
        )
      );

    const modelos =
      valoresUnicos(
        producto => producto.modelo
      );

    const nombres =
      valoresUnicos(
        producto => producto.nombre
      );

    const colores =
      valoresUnicos(
        producto => producto.color
      );

    const medidas =
      valoresUnicos(
        producto => producto.medida
      );

    const materiales =
      valoresUnicos(
        producto => producto.material
      );

    const sexos =
      valoresUnicos(
        producto => producto.sexo
      );

    const proveedores =
      valoresUnicos(
        producto =>
          producto.proveedor?.razonSocial
      );

    const preciosCompra =
      productosOrdenados.map(
        producto =>
          Number(producto.precioCompra || 0)
      );

    const preciosVenta =
      productosOrdenados.map(
        producto =>
          Number(producto.precioVenta || 0)
      );

    const stockTotal =
      productosOrdenados.reduce(
        (total, producto) =>
          total +
          Number(producto.stockActual || 0),
        0
      );

    const stockMinimo = Math.max(
      ...productosOrdenados.map(
        producto =>
          Number(producto.stockMinimo ?? 5)
      )
    );

    const marcaNombre =
      primero.marca?.nombre ||
      primero.nombre;

    return {
      ...primero,
      claveInventario: clave,
      productosAgrupados:
        productosOrdenados,
      cantidadModelos:
        modelos.length ||
        productosOrdenados.length,
      modelosRegistrados: modelos,
      sexosRegistrados: sexos,
      nombresRegistrados: nombres,
      proveedoresRegistrados: proveedores,
      nombre: marcaNombre,
      descripcion:
        `${productosOrdenados.length} modelo(s) registrado(s)`,
      modelo: modelos.join(', '),
      color: colores.join(', '),
      medida: medidas.join(', '),
      material: materiales.join(', '),
      stockActual: stockTotal,
      stockMinimo,
      precioCompra:
        Math.min(...preciosCompra),
      precioVenta:
        Math.min(...preciosVenta),
      precioCompraMin:
        Math.min(...preciosCompra),
      precioCompraMax:
        Math.max(...preciosCompra),
      precioVentaMin:
        Math.min(...preciosVenta),
      precioVentaMax:
        Math.max(...preciosVenta),
      estado:
        productosOrdenados.some(
          producto => producto.estado
        )
    };
  }

  rangoPrecio(
    minimo: number,
    maximo: number
  ): string {
    const formato = (valor: number) =>
      `S/ ${Number(valor || 0)
        .toFixed(2)}`;

    return minimo === maximo
      ? formato(minimo)
      : `${formato(minimo)} - ${formato(maximo)}`;
  }

  private esProductoMontura(
    producto: Producto
  ): boolean {
    const categoria =
      this.normalizarTexto(
        producto.categoria?.nombre ||
        ''
      );

    /*
     * En Supabase la categoría real es "Monturas".
     * Se admite también "Montura" por compatibilidad.
     */
    return (
      categoria === 'monturas' ||
      categoria === 'montura'
    );
  }

  private normalizarTexto(
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

  private fechaArchivo(): string {
    const fecha = new Date();

    const anio =
      fecha.getFullYear();

    const mes =
      String(fecha.getMonth() + 1)
        .padStart(2, '0');

    const dia =
      String(fecha.getDate())
        .padStart(2, '0');

    return `${anio}-${mes}-${dia}`;
  }

  private fechaActual(): string {
    const fecha = new Date();

    const anio =
      fecha.getFullYear();

    const mes =
      String(fecha.getMonth() + 1)
        .padStart(2, '0');

    const dia =
      String(fecha.getDate())
        .padStart(2, '0');

    return `${anio}-${mes}-${dia}`;
  }
}