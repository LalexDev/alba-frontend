import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LoginComponent } from './pages/login/login.component';
import { AdminDashboardComponent } from './pages/admin-dashboard/admin-dashboard.component';
import { VentasComponent } from './pages/ventas/ventas.component';
import { JwtInterceptor } from './core/interceptors/jwt.interceptor';
import { AdminLayoutComponent } from './layout/admin-layout/admin-layout.component';
import { ProductosComponent } from './pages/productos/productos.component';
import { ClientesRecetasComponent } from './pages/clientes-recetas/clientes-recetas.component';
import { ProveedoresComponent } from './pages/proveedores/proveedores.component';
import { ReportesComponent } from './pages/reportes/reportes.component';
import { MovimientosInventarioComponent } from './pages/movimientos-inventario/movimientos-inventario.component';
import { CodigosBarrasComponent } from './pages/codigos-barras/codigos-barras.component';
import { OrdenesRecibosComponent } from './pages/ordenes-recibos/ordenes-recibos.component';
import { UsuariosRolesComponent } from './pages/usuarios-roles/usuarios-roles.component';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    AdminDashboardComponent,
    VentasComponent,
    AdminLayoutComponent,
    ProductosComponent,
    ClientesRecetasComponent,
    ProveedoresComponent,
    ReportesComponent,
    MovimientosInventarioComponent,
    CodigosBarrasComponent,
    OrdenesRecibosComponent,
    UsuariosRolesComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    ReactiveFormsModule,
    FormsModule,
    HttpClientModule
  ],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: JwtInterceptor, multi: true }
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
