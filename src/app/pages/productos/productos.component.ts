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
  Categoria,
  Producto,
  ProductoRequest,
  Proveedor
} from '../../core/models/producto.model';

import {
  ProductoService
} from '../../core/services/producto.service';

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
  proveedores: Proveedor[] = [];

  search = '';
  error = '';
  ok = '';

  mostrarFormulario = false;
  guardando = false;
  cargando = false;
  mostrarSoloBajoStock = false;

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

      marcaNombre: [''],
      modelo: [''],
      color: [''],
      medida: [''],
      material: [''],

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
        0,
        [
          Validators.required,
          Validators.min(0)
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
    this.cargarTodo();
  }

  get totalProductos(): number {
    return this.productos.length;
  }

  get totalCategorias(): number {
    return new Set(
      this.productos
        .map(
          producto =>
            producto.categoria?.id
        )
        .filter(Boolean)
    ).size || this.categorias.length;
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

  get productosBajoStock(): Producto[] {
    return this.productos.filter(
      producto =>
        producto.estado &&
        Number(producto.stockActual) <=
        Number(producto.stockMinimo ?? 5)
    );
  }

  get filtrados(): Producto[] {
    const termino =
      this.search.trim().toLowerCase();

    return this.productos.filter(
      producto => {
        if (
          this.mostrarSoloBajoStock &&
          Number(producto.stockActual) >
          Number(producto.stockMinimo ?? 5)
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
          producto.proveedor?.razonSocial
        ];

        return campos.some(
          valor =>
            String(valor || '')
              .toLowerCase()
              .includes(termino)
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

  get productosPaginados(): Producto[] {
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
          proveedores
        }) => {
          this.productos = productos;
          this.categorias = categorias;
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

    this.form.reset({
      codigoBarras: '',
      nombre: '',
      categoriaId:
        this.categorias[0]?.id ?? null,
      nuevaCategoria: '',
      marcaNombre: '',
      modelo: '',
      color: '',
      medida: '',
      material: '',
      precioCompra: 0,
      precioVenta: 0,
      stockActual: 0,
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
    if (this.guardando) {
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

    const marcaNombre =
      String(
        value.marcaNombre || ''
      ).trim();

    const marca$ =
      marcaNombre
        ? this.productoService
            .crearMarca(marcaNombre)
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
          this.ok =
            `Producto ${producto.nombre} guardado correctamente.`;

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
    this.paginaActual = 1;
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
    producto: Producto
  ): boolean {
    return (
      Number(producto.stockActual) <=
      Number(producto.stockMinimo ?? 5)
    );
  }

  sinStock(
    producto: Producto
  ): boolean {
    return Number(
      producto.stockActual
    ) <= 0;
  }

  cantidadReposicion(
    producto: Producto
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
    producto: Producto
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
      `Producto: ${producto.nombre}`,
      `Código: ${producto.codigoBarras}`,
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
    producto: Producto
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
      `Reposición de ${producto.nombre}`;

    const cuerpo = [
      'Hola, somos de Óptica Alba.',
      '',
      'Solicitamos información para reponer el siguiente producto:',
      '',
      `Producto: ${producto.nombre}`,
      `Código: ${producto.codigoBarras}`,
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
