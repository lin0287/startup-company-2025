// Premium (paid) features on a website's Subscriptions feature lower its Satisfaction via
// Helpers.CalculateSubscriptionDissatisfaction (3.2 per premium feature + 1.1 per $ of monthly price).
// This mod scales that penalty down by SUBSCRIPTION_DISSATISFACTION_MULTIPLIER (half by default).
const SUBSCRIPTION_DISSATISFACTION_MULTIPLIER = 0.5;

// Same formula as the game's own (dest/game.min.js), with the multiplier applied before rounding
// so we don't compound rounding error by halving an already-rounded value.
function calculateSubscriptionDissatisfaction(instance) {
	const premiumPenalty = 3.2 * instance.premiumFeatures.length;
	const pricePenalty = 1.1 * instance.pricePerMonth;
	return 0 == premiumPenalty ? 0 : Math.round((premiumPenalty + pricePenalty) * SUBSCRIPTION_DISSATISFACTION_MULTIPLIER);
}

function patchSubscriptionDissatisfaction() {
	if (Helpers.CalculateSubscriptionDissatisfaction.subscriptionSatisfactionModPatched) return;
	Helpers.CalculateSubscriptionDissatisfaction = calculateSubscriptionDissatisfaction;
	Helpers.CalculateSubscriptionDissatisfaction.subscriptionSatisfactionModPatched = true;
}
patchSubscriptionDissatisfaction();

// The game stores the computed value on the feature instance (instance.dissatisfaction) and only
// recalculates it when the player edits the subscription, so features saved before this mod was active
// still carry the old, full-strength penalty. Recompute them once on load; because the value is derived
// from the formula (not halved in place), running this repeatedly is safe.
function refreshExistingSubscriptions(settings) {
	if (null == settings || null == settings.featureInstances) return;

	const subscriptions = settings.featureInstances.filter(instance => instance.featureName == FeatureNames.Subscriptions && instance.premiumFeatures);
	let changed = false;
	for (const instance of subscriptions) {
		const dissatisfaction = calculateSubscriptionDissatisfaction(instance);
		if (instance.dissatisfaction == dissatisfaction) continue;
		instance.dissatisfaction = dissatisfaction;
		changed = true;
	}

	if (changed) Helpers.RunBackgroundWorker(null, null, true);
}

exports.refreshExistingSubscriptions = refreshExistingSubscriptions;
