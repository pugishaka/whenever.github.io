import type { RouteType } from './src/appRoutes.js';
import { getRoutes } from './src/appRoutes.js';
import { stompPath } from '@sysce/stomp';
import { uvPath } from '@titaniumnetwork-dev/ultraviolet';
import { createBareServer } from '@tomphttp/bare-server-node';
import react from '@vitejs/plugin-react-swc';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { ConfigEnv } from 'vite';
import { defineConfig, loadEnv } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import svgr from 'vite-plugin-svgr';

// https://vitejs.dev/config/
export default function viteConfig({ mode }: ConfigEnv) {
	Object.assign(process.env, loadEnv(mode, process.cwd()));
	process.env.VITE_PUBLIC_PATH ??= '';

	const require = createRequire(import.meta.url);

	for (const required of [
		'VITE_ROUTER',
		'VITE_SUPPORT_EMAIL',
		'VITE_HAT_BADGE',
		'VITE_DEFAULT_PROXY',
		'VITE_TN_DISCORD_URL',
		'VITE_HU_DISCORD_URL',
		'VITE_BARE_APIS',
		'VITE_RH_API',
		'VITE_DB_API',
		'VITE_THEATRE_CDN',
	])
		if (!(required in process.env))
			throw new TypeError(`Missing environment variable: ${required}`);

	const routes = getRoutes(
		process.env.VITE_ROUTER as RouteType,
		process.env.VITE_PUBLIC_PATH
	);

	return defineConfig({
		build: {
			sourcemap: true,
			rollupOptions: {
				plugins: [
					{
						name: 'copy index.html to all the hot routes',
						async generateBundle(options, bundle) {
							const index = bundle['index.html'];

							for (const file of routes)
								bundle[file.file] = {
									...index,
									fileName: file.file,
								};
						},
					},
				],
			},
		},
		plugins: [
			{
				name: 'serve index.html for all the hot routes',
				configureServer(server) {
					server.middlewares.use((req, _res, next) => {
						let url = req.url;
						const search = url.indexOf('?');
						if (search !== -1) url = url.slice(0, search);
						if (routes.some((route) => route.path === url))
							req.url = '/index.html';
						next();
					});
				},
			},
			{
				name: 'bare server',
				configureServer(server) {
					const bare = createBareServer('/bare/', { blockLocal: false });
					server.middlewares.use((req, res, next) => {
						if (bare.shouldRoute(req)) bare.routeRequest(req, res);
						else next();
					});

					// there can only be one ws server listening on the upgrade event
					server.ws.close();

					server.httpServer.on('upgrade', (req, socket, head) => {
						if (bare.shouldRoute(req)) bare.routeUpgrade(req, socket, head);
						else socket.end();
					});
				},
			},
			react(),
			svgr(),
			viteStaticCopy({
				targets: [
					{
						src: uvPath,
						dest: '',
						rename: 'uv',
						overwrite: false,
					},
					{
						src: stompPath,
						dest: '',
						rename: 'stomp',
					},
					{
						src: resolve(require.resolve('@ruffle-rs/ruffle'), '..'),
						dest: '',
						rename: 'ruffle',
					},
				],
			}),
		],
	});
}