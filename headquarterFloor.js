// 1 Sequel Plaza, Uptown is the Headquarter building (BuildingNames.Headquarter, address string "headquarter_address").
// It ships with 3 floors. Each floor is drawn from its own set of background tiles (Headquarter1_0 ... Headquarter3_95)
// in assets/buildings.json and has its own entry in Building.gridOffset, so a floor needs both to exist.
// This mod adds EXTRA_HEADQUARTER_FLOORS more floors on top of the original three.
const EXTRA_HEADQUARTER_FLOORS = 9;

// There is no artwork for the new floors, so they reuse the tiles and grid offset of this existing floor (1-based).
// Floor 3 is a plain middle office floor, so stacking a copy of it looks natural.
const TEMPLATE_FLOOR = 3;

// Floors the game ships with; anything above this was added by the mod.
const ORIGINAL_HEADQUARTER_FLOORS = 3;

function getHeadquarter() {
	return Buildings.find(building => building.name == BuildingNames.Headquarter);
}

// The floor selector, floor switching and rent upgrade logic all read building.floors / building.gridOffset,
// and GoToBuilding clones the entry from Buildings on every load, so editing it once is enough for new and
// existing saves. Workstations is only the building's advertised capacity (desks are placed by the player), so it
// is scaled per floor to keep the building card honest. Rent and price are deliberately left alone.
function addHeadquarterFloors() {
	const headquarter = getHeadquarter();
	if (headquarter.floors > ORIGINAL_HEADQUARTER_FLOORS) return;

	const workstationsPerFloor = headquarter.workstations / headquarter.floors;
	const templateOffset = headquarter.gridOffset[TEMPLATE_FLOOR - 1];
	for (let i = 0; i < EXTRA_HEADQUARTER_FLOORS; i++) headquarter.gridOffset.push(Object.assign({}, templateOffset));
	headquarter.floors += EXTRA_HEADQUARTER_FLOORS;
	headquarter.workstations = Math.round(workstationsPerFloor * headquarter.floors);
}
addHeadquarterFloors();

// The building backgrounds are looked up as "<name><floor>_<tile>" in the buildings sprite sheet, so each new
// floor needs its tile names registered as aliases of the template floor's frames. The sheet is created by the
// game's asset loader, which can finish after mods are loaded, so this runs right before a floor is drawn.
// createjs has no public API for adding animations to a built sprite sheet, hence the _data/_animations access.
function aliasFloorTiles(spriteSheet) {
	const templatePrefix = `${BuildingNames.Headquarter}${TEMPLATE_FLOOR}_`;
	const templateTiles = spriteSheet._animations.filter(name => name.startsWith(templatePrefix));

	for (let floor = ORIGINAL_HEADQUARTER_FLOORS + 1; floor <= getHeadquarter().floors; floor++) {
		for (const templateTile of templateTiles) {
			const tile = `${BuildingNames.Headquarter}${floor}_${templateTile.substring(templatePrefix.length)}`;
			if (spriteSheet._data[tile]) continue;
			spriteSheet._data[tile] = Object.assign({}, spriteSheet._data[templateTile], { name: tile });
			spriteSheet._animations.push(tile);
		}
	}
}

function patchSetupIsodom() {
	if (setupIsodom.headquarterFloorModPatched) return;
	const original = setupIsodom;
	setupIsodom = function(building, floor) {
		if (building.name == BuildingNames.Headquarter) aliasFloorTiles(Game.conductor.config.backgroundSpriteSheet);
		return original(building, floor);
	};
	setupIsodom.headquarterFloorModPatched = true;
}
patchSetupIsodom();
