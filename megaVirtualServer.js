// FastClouds' virtual server catalogue tops out at "Ultra" (ServerNames.LargeVirtualServer, 15,000 CU/day -
// see the ServerNames/Servers data in dest/game.min.js). This adds a "Mega" tier above it with 10x Ultra's CU.
// Price and hardware requirements scale by the same 10x factor, matching how the game's own (deprecated)
// cluster tiers scale off LargeVirtualServer - e.g. LargeVirtualCluster is exactly 48x Ultra's CU and price.
//
// Mods run require()'d directly into the same JS realm dest/game.min.js declared its globals in (see
// start.js), so the tier is registered by mutating the game's own already-loaded ServerNames/Servers data -
// the hosting page (productHosting controller) is entirely data-driven off Servers, so it needs no further
// changes. hostingOverageBilling.js's own `Servers.find` call confirms these are shared globals read by both
// the main thread and the background worker (each with its own copy), so - like that mod's data patches -
// this needs to run both at require() time and via onBackgroundWorkerStart.
const MEGA_VIRTUAL_SERVER = "MegaVirtualServer";
const SCALE = 10;

function registerMegaVirtualServer() {
	if (ServerNames.MegaVirtualServer) return;
	ServerNames.MegaVirtualServer = MEGA_VIRTUAL_SERVER;

	const ultra = Servers.find(s => s.name == ServerNames.LargeVirtualServer);
	const requirements = {};
	Object.keys(ultra.requirements).forEach(component => {
		requirements[component] = ultra.requirements[component] * SCALE;
	});

	Servers.push({
		name: MEGA_VIRTUAL_SERVER,
		employeeLevel: ultra.employeeLevel,
		requirements,
		computeUnit: ultra.computeUnit * SCALE,
		pricePerDay: ultra.pricePerDay * SCALE
	});
}
registerMegaVirtualServer();

exports.onBackgroundWorkerStart = registerMegaVirtualServer;

// Language is reassigned by the game's own language-loading routine at some point after mods are require()'d
// (see hrDirectorRole.js), so this has to run per-refresh rather than at require() time. GetLocalized
// lowercases the server's name to look up its string, hence "megavirtualserver".
exports.refreshLanguageStrings = () => {
	if (typeof Language == "undefined" || Language.megavirtualserver) return;
	Language.megavirtualserver = "FastClouds Mega® Cloud Server";
	if (typeof EnglishLanguage != "undefined") {
		EnglishLanguage.megavirtualserver = Language.megavirtualserver;
	}
};
