// Virtual servers are capped at Configuration.MAX_CU_FROM_VIRTUAL_SERVERS (150,000 CU). Once a player's
// products pass it, the hosting page disables "Add instance" and the FastClouds CEO mail tells them to
// rent a hosting building. Real cloud providers (AWS etc.) have no such ceiling, so this mod removes it.
//
// The cap is read live in three places, all comparing against this one constant:
//   - the hosting page controller (disables the add button, shows the "Maximum virtual CU reached" banner)
//   - the FastCloudsMail event in the main thread
//   - the same FastCloudsMail event in the background worker (which has its own copy of Configuration)
// Infinity makes every one of those comparisons false, so no other code needs patching.
function removeVirtualCuLimit() {
	Configuration.MAX_CU_FROM_VIRTUAL_SERVERS = Infinity;
}
removeVirtualCuLimit();

// The game serializes this with toString() and evals it inside the worker, so it must be an arrow
// function that references nothing from this module's scope.
exports.onBackgroundWorkerStart = () => {
	Configuration.MAX_CU_FROM_VIRTUAL_SERVERS = Infinity;
};

exports.removeVirtualCuLimit = removeVirtualCuLimit;
