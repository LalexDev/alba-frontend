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
  ProductoRequest,
  Proveedor
} from '../../core/models/producto.model';

import {
  ProductoService
} from '../../core/services/producto.service';

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

  search = '';
  error = '';
  ok = '';

  mostrarFormulario = false;
  guardando = false;
  cargando = false;
  mostrarSoloBajoStock = false;

  marcaSeleccionada = 'TODAS';
  categoriaSeleccionada = 'TODAS';

  paginaActual = 1;
  readonly tamanioPagina = 10;

  form: FormGroup;

  constructor(
    private productoService:
      ProductoService,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      codigoBarras: [
        '',
        Validators.required
      ],

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
    this.error = '';
    this.ok = '';
    this.mostrarFormulario = true;
    this.mostrarNuevaMarca = false;
    this.guardandoMarca = false;
    this.mensajeMarca = '';
    this.errorMarca = '';

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

    this.generarCodigo();
  }

  cerrarFormulario(): void {
    if (this.guardando) {
      return;
    }

    this.mostrarFormulario = false;

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

  alternarNuevaMarca(): void {
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

  generarCodigo(): void {
    const mayorNumero =
      this.productos.reduce(
        (mayor, producto) => {
          const coincidencia =
            String(
              producto.codigoBarras || ''
            ).match(/(\d+)$/);

          const numero =
            coincidencia
              ? Number(coincidencia[1])
              : 0;

          return Math.max(
            mayor,
            numero
          );
        },
        0
      );

    const siguiente =
      String(mayorNumero + 1)
        .padStart(6, '0');

    this.form.patchValue({
      codigoBarras:
        `OPT-${siguiente}`
    });
  }

  guardar(): void {
    if (
      this.guardando ||
      this.guardandoMarca
    ) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();

      this.error =
        'Completa los campos obligatorios.';

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
      categoria: categoria$,
      marca: marca$
    })
      .pipe(
        switchMap(({
          categoria,
          marca
        }) => {
          const request:
            ProductoRequest = {

            codigoInterno:
              String(
                value.codigoBarras
              ).trim(),

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
              Number(
                value.stockActual
              ),

            stockMinimo:
              Number(
                value.stockMinimo ?? 5
              ),

            categoriaId:
              Number(categoria.id),

            marcaId:
              marca
                ? Number(marca.id)
                : null,

            proveedorId:
              Number(
                value.proveedorId
              )
          };

          return this.productoService
            .crear(request);
        }),
        finalize(() => {
          this.guardando = false;
        })
      )
      .subscribe({
        next: (producto) => {
          if (producto.marca?.nombre) {
            this.ok =
              `Modelo ${producto.modelo || producto.nombre} registrado. ` +
              `El stock total de ${producto.marca.nombre} se actualizó automáticamente.`;
          } else {
            this.ok =
              `${producto.nombre} registrado con ${producto.stockActual} unidad(es).`;
          }

          this.mostrarFormulario =
            false;

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
    this.error = '';
    this.ok = '';

    if (!this.productos.length) {
      this.error =
        'No existen productos para exportar.';

      return;
    }

    /*
     * Se exporta this.productos para incluir
     * todo el inventario, sin depender de filtros.
     */
    const filasInventario =
      this.inventarioPorMarca.map(
        producto => ({
          'Categoría':
            producto.categoria?.nombre ||
            'Sin categoría',

          'Marca':
            producto.marca?.nombre ||
            producto.nombre ||
            'Sin marca',

          'Modelos registrados':
            producto.modelosRegistrados.join(', ') ||
            'Sin modelo',

          'Cantidad de modelos':
            producto.cantidadModelos,

          'Características': [
            producto.sexosRegistrados.length
              ? `Sexo: ${producto.sexosRegistrados.join(', ')}`
              : '',
            producto.color
              ? `Color: ${producto.color}`
              : '',
            producto.medida
              ? `Medida: ${producto.medida}`
              : '',
            producto.material
              ? `Material: ${producto.material}`
              : ''
          ]
            .filter(Boolean)
            .join(' | ') ||
            'No aplica',

          'Precio compra':
            this.rangoPrecio(
              producto.precioCompraMin,
              producto.precioCompraMax
            ),

          'Precio venta':
            this.rangoPrecio(
              producto.precioVentaMin,
              producto.precioVentaMax
            ),

          'Stock total de la marca':
            Number(
              producto.stockActual || 0
            ),

          'Stock mínimo de la marca':
            Number(
              producto.stockMinimo ?? 5
            )
        })
      );

    const hoja =
      utils.json_to_sheet(
        filasInventario
      );

    hoja['!cols'] = [
      { wch: 24 },
      { wch: 22 },
      { wch: 45 },
      { wch: 18 },
      { wch: 40 },
      { wch: 20 },
      { wch: 20 },
      { wch: 22 },
      { wch: 24 }
    ];

    const libro =
      utils.book_new();

    utils.book_append_sheet(
      libro,
      hoja,
      'Inventario'
    );

    writeFileXLSX(
      libro,
      `inventario-optica-alba-${this.fechaArchivo()}.xlsx`
    );

    this.ok =
      'Inventario descargado correctamente.';
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
    const primero = productos[0];

    const valoresUnicos = (
      selector: (producto: Producto) =>
        string | undefined
    ): string[] =>
      Array.from(
        new Set(
          productos
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
      productos.map(
        producto =>
          Number(producto.precioCompra || 0)
      );

    const preciosVenta =
      productos.map(
        producto =>
          Number(producto.precioVenta || 0)
      );

    const stockTotal =
      productos.reduce(
        (total, producto) =>
          total +
          Number(producto.stockActual || 0),
        0
      );

    const stockMinimo = Math.max(
      ...productos.map(
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
      productosAgrupados: productos,
      cantidadModelos:
        modelos.length || productos.length,
      modelosRegistrados: modelos,
      sexosRegistrados: sexos,
      nombresRegistrados: nombres,
      proveedoresRegistrados: proveedores,
      nombre: marcaNombre,
      descripcion:
        `${productos.length} modelo(s) registrado(s)`,
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
        productos.some(
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
