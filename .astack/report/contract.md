# Delivery contract

One vehicle, official current DVSA lookup, standard MCP Apps UI and headless fallback.
Compact plate/details/latest result/recorded expiry; expanded chart/timeline/details;
original defects and units; linked exact-wording/adverse-mileage observations;
selected record in host context; follow-up through the host conversation.

Accuracy acceptance: unordered equal timestamps, same-day separate tests, explicit absent
readings/details, converted mixed units with basis, no inferred repairs/verdicts.
Runtime acceptance: explicit sample vs real errors, server secrets only, bounded requests,
token/cache reuse, upstream pacing/retries/cooldowns, public request protection.
UI acceptance: packaged resource, light/dark, mobile, keyboard/table alternative,
host context reset, display mode and selected-record message.

External evidence gates: live DVSA needs issued credentials; actual ChatGPT needs a signed-in
account with custom MCP access. Hosted protocol checks do not satisfy those gates.
Public distribution additionally needs verified publisher/domain and review approval.
