import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { AdminDashboardComponent } from './pages/admin-dashboard/admin-dashboard.component';
import { VentasComponent } from './pages/ventas/ventas.component';
import { ProductosComponent } from './pages/productos/productos.component';
import { ClientesRecetasComponent } from './pages/clientes-recetas/clientes-recetas.component';
import { ProveedoresComponent } from './pages/proveedores/proveedores.component';
import { ReportesComponent } from './pages/reportes/reportes.component';
import { MovimientosInventarioComponent } from './pages/movimientos-inventario/movimientos-inventario.component';
import { CodigosBarrasComponent } from './pages/codigos-barras/codigos-barras.component';
import { OrdenesRecibosComponent } from './pages/ordenes-recibos/ordenes-recibos.component';
import { UsuariosRolesComponent } from './pages/usuarios-roles/usuarios-roles.component';
import { AdminLayoutComponent } from './layout/admin-layout/admin-layout.component';
import { AuthGuard } from './core/guards/auth.guard';
import { RoleGuard } from './core/guards/role.guard';

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: 'admin',
    component: AdminLayoutComponent,
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['ADMINISTRADOR'] },
    children: [
      { path: 'dashboard', component: AdminDashboardComponent },
      { path: 'ventas', component: VentasComponent },
      { path: 'productos', component: ProductosComponent },
      { path: 'codigos', component: CodigosBarrasComponent },
      { path: 'clientes', component: ClientesRecetasComponent },
      { path: 'ordenes', component: OrdenesRecibosComponent },
      { path: 'proveedores', component: ProveedoresComponent },
      { path: 'movimientos', component: MovimientosInventarioComponent },
      { path: 'reportes', component: ReportesComponent },
      { path: 'usuarios', component: UsuariosRolesComponent },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },
  {
    path: 'vendedor',
    component: AdminLayoutComponent,
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['VENDEDOR'] },
    children: [
      { path: 'ventas', component: VentasComponent },
      { path: 'productos', component: ProductosComponent },
      { path: 'clientes', component: ClientesRecetasComponent },
      { path: 'ordenes', component: OrdenesRecibosComponent },
      { path: '', redirectTo: 'ventas', pathMatch: 'full' }
    ]
  },
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: '**', redirectTo: '/login' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
