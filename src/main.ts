import { bootstrapApplication } from '@angular/platform-browser';

import { App } from './app/app';
import { appConfig } from './app/app.config';
import { Settings } from './app/features/settings/settings';

/**
 * Dos ventanas, una build.
 *
 * La mascota y los ajustes son componentes raíz distintos y se eligen por la
 * query: así la ventana de ajustes no instancia la máquina de estados, no se
 * suscribe al atajo global y no abre el micrófono. Un router con hash habría
 * servido bajo `file://`, pero arrastraba una ruta y un outlet para dos
 * pantallas que nunca conviven.
 *
 * `bootstrapApplication` engancha el componente al elemento que coincide con su
 * selector, y `index.html` solo trae `<app-root>`. Cuando la ventana es la de
 * ajustes hay que crear el host: sin él, Angular arranca y no dibuja nada, sin
 * lanzar ningún error.
 */
const isSettings = new URLSearchParams(location.search).has('settings');
const selector = isSettings ? 'app-settings' : 'app-root';

if (!document.querySelector(selector)) {
  document.querySelector('app-root')?.remove();
  document.body.append(document.createElement(selector));
}

bootstrapApplication(isSettings ? Settings : App, appConfig).catch((error) => console.error(error));
